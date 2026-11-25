import type { QueryClient } from "@tanstack/react-query";
import { CLIENT_ID } from "./clientId";
import { POSITION_GAP } from "./position";
import type { Board, BoardEvent, Status, Task, TaskPatch } from "./types";

export const BOARD_KEY = ["board"] as const;

/** Last thing the SERVER told us about a task. `task: null` = deleted (tombstone). */
type Known = { version: number; task: Task | null };
type Listener = () => void;

const FLASH_MS = 1600;

/**
 * Keeps the TanStack Query board cache consistent while optimistic updates and realtime
 * events race each other.
 *
 * Two views are tracked:
 *   - `known`   – the latest server copy of every task (from GET /board, mutation
 *                 responses and SSE events). Only ever moves FORWARD in `version`.
 *   - the cache – what the user sees = `known` + local optimistic changes.
 *
 * Rules:
 *   1. A task with an in-flight mutation is "pending". Realtime events for a pending task
 *      update `known` but do NOT touch the cache, so the user's optimistic change is never
 *      overwritten mid-flight.
 *   2. When the last mutation for a task settles (success OR failure) the task is reconciled:
 *      cache ← known. On success `known` holds the server response (or a newer event); on
 *      failure it still holds the pre-mutation server state (plus any remote changes that
 *      arrived meanwhile). That IS the rollback, and it never clobbers other users' edits.
 *   3. Events/responses whose `version` is not newer than what we know are dropped, so
 *      out-of-order or duplicate messages (including echoes of our own writes) are harmless.
 *   4. A full refetch rebuilds `known`, replays events that arrived while it was in flight,
 *      and keeps the local copy of pending tasks.
 */
class SyncEngine {
  private qc: QueryClient | null = null;
  private known = new Map<string, Known>();
  private pending = new Map<string, number>();
  private flashing = new Set<string>();
  private fetchBuffer: BoardEvent[] | null = null;
  private listeners = new Set<Listener>();

  attach(qc: QueryClient) {
    this.qc = qc;
  }

  // ---------------------------------------------------------------- subscriptions (React)
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  private emit() {
    for (const l of this.listeners) l();
  }
  isPending = (id: string) => this.pending.has(id);
  isFlashing = (id: string) => this.flashing.has(id);

  // ---------------------------------------------------------------- mutation lifecycle
  /** Mark a task as having an in-flight mutation. Call BEFORE applying the optimistic change. */
  begin(id: string) {
    this.pending.set(id, (this.pending.get(id) ?? 0) + 1);
    this.emit();
  }

  /** Mutation settled. When no more are in flight for this task, show the server truth. */
  end(id: string) {
    const left = (this.pending.get(id) ?? 1) - 1;
    if (left > 0) {
      this.pending.set(id, left);
      return;
    }
    this.pending.delete(id);
    this.reconcile(id);
    this.emit();
  }

  /** Server accepted a write and returned the stored task. */
  confirm(task: Task) {
    this.record(task);
  }

  /** Server confirmed the task is gone (deleted by us, or 404). */
  confirmDeleted(id: string, version = Number.MAX_SAFE_INTEGER) {
    this.recordDeleted(id, version);
  }

  // ---------------------------------------------------------------- realtime
  handleEvent(event: BoardEvent) {
    this.fetchBuffer?.push(event);

    const id = event.type === "task.deleted" ? event.id : event.task.id;
    const changed =
      event.type === "task.deleted" ? this.recordDeleted(event.id, event.version) : this.record(event.task);

    if (!changed || this.pending.has(id)) return; // stale, or we're mid-mutation (rule 1)
    this.reconcile(id);
    if (event.type !== "task.deleted" && event.clientId !== CLIENT_ID) this.flash(id);
  }

  // ---------------------------------------------------------------- full fetch
  beginFetch() {
    this.fetchBuffer = [];
  }
  abortFetch() {
    this.fetchBuffer = null;
  }
  completeFetch(board: Board): Board {
    const buffered = this.fetchBuffer ?? [];
    this.fetchBuffer = null;

    this.known = new Map(board.tasks.map((t) => [t.id, { version: t.version, task: t }]));
    // Events that arrived while the request was in flight may be newer than the response.
    for (const e of buffered) {
      if (e.type === "task.deleted") this.recordDeleted(e.id, e.version);
      else this.record(e.task);
    }

    const local = new Map((this.board()?.tasks ?? []).map((t) => [t.id, t]));
    const tasks: Task[] = [];
    for (const [id, k] of this.known) if (k.task && !this.pending.has(id)) tasks.push(k.task);
    for (const id of this.pending.keys()) {
      const t = local.get(id);
      if (t) tasks.push(t); // keep optimistic copy (rule 4)
    }
    return { ...board, tasks };
  }

  // ---------------------------------------------------------------- local (optimistic) cache ops
  getLocal(id: string) {
    return this.board()?.tasks.find((t) => t.id === id);
  }
  insertLocal(task: Task) {
    this.setTasks((ts) => (ts.some((t) => t.id === task.id) ? ts.map((t) => (t.id === task.id ? task : t)) : [...ts, task]));
  }
  applyLocal(id: string, patch: TaskPatch) {
    const updatedAt = new Date().toISOString();
    this.setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch, updatedAt } : t)));
  }
  removeLocal(id: string) {
    this.setTasks((ts) => ts.filter((t) => t.id !== id));
  }
  /** A position after the last task of a column. */
  endPosition(status: Status) {
    const positions = (this.board()?.tasks ?? []).filter((t) => t.status === status).map((t) => t.position);
    return positions.length ? Math.max(...positions) + POSITION_GAP : POSITION_GAP;
  }

  // ---------------------------------------------------------------- internals
  private board() {
    return this.qc?.getQueryData<Board>(BOARD_KEY);
  }
  private setTasks(fn: (tasks: Task[]) => Task[]) {
    this.qc?.setQueryData<Board>(BOARD_KEY, (b) => (b ? { ...b, tasks: fn(b.tasks) } : b));
  }

  /** Make the cache show the server's version of a task. */
  private reconcile(id: string) {
    const k = this.known.get(id);
    if (k?.task) this.insertLocal(k.task);
    else this.removeLocal(id);
  }

  /** Returns true if this is newer than anything we knew. */
  private record(task: Task): boolean {
    const k = this.known.get(task.id);
    if (k && k.version >= task.version) return false;
    this.known.set(task.id, { version: task.version, task });
    return true;
  }
  private recordDeleted(id: string, version: number): boolean {
    const k = this.known.get(id);
    if (k && (k.task === null || k.version > version)) return false;
    this.known.set(id, { version, task: null });
    return true;
  }

  private flash(id: string) {
    this.flashing.add(id);
    this.emit();
    setTimeout(() => {
      this.flashing.delete(id);
      this.emit();
    }, FLASH_MS);
  }

  /** Test helper. */
  reset() {
    this.known.clear();
    this.pending.clear();
    this.flashing.clear();
    this.fetchBuffer = null;
  }
}

export const sync = new SyncEngine();
