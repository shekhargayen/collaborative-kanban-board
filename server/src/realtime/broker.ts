import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { TaskDTO } from "../lib/task.js";

export type BoardEvent =
  | { type: "task.created"; task: TaskDTO }
  | { type: "task.updated"; task: TaskDTO }
  | { type: "task.deleted"; id: string; version: number };

type StoredEvent = { seq: number; id: string; payload: string };

const HEARTBEAT_MS = 25_000;
const BUFFER_SIZE = 1000;
const RETRY_MS = 3000;

/**
 * In-memory Server-Sent Events broker.
 *
 * - Every published event gets an id `<bootId>-<seq>` so the browser's EventSource
 *   sends it back as `Last-Event-ID` when it reconnects.
 * - Recent events are kept in a ring buffer; on reconnect we replay what was missed.
 *   If we can't (server restarted, or the gap is too old) we tell the client to `resync`
 *   (refetch the board).
 * - `clientId` of the request that caused the change is included so a tab can ignore
 *   its own echoes.
 */
class EventBroker {
  private readonly bootId = randomUUID().slice(0, 8);
  private seq = 0;
  private buffer: StoredEvent[] = [];
  private clients = new Set<Response>();

  get clientCount() {
    return this.clients.size;
  }

  publish(event: BoardEvent, originClientId: string | null) {
    const seq = ++this.seq;
    const id = `${this.bootId}-${seq}`;
    const payload = JSON.stringify({ ...event, eventId: id, clientId: originClientId, ts: new Date().toISOString() });
    this.buffer.push({ seq, id, payload });
    if (this.buffer.length > BUFFER_SIZE) this.buffer.shift();

    const frame = `id: ${id}\ndata: ${payload}\n\n`;
    for (const res of this.clients) res.write(frame);
  }

  subscribe(req: Request, res: Response) {
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering (nginx / some PaaS)
    });
    res.flushHeaders();
    res.write(`retry: ${RETRY_MS}\n\n`);

    const lastEventId =
      (req.get("last-event-id") ?? (typeof req.query.lastEventId === "string" ? req.query.lastEventId : "")) || null;

    this.sendControl(res, { type: "connected", serverId: this.bootId });
    if (lastEventId) this.replay(res, lastEventId);

    this.clients.add(res);
    const heartbeat = setInterval(() => res.write(`: ping\n\n`), HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }

  /** Close every open stream (used on shutdown). */
  closeAll() {
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  private replay(res: Response, lastEventId: string) {
    const [boot, seqStr] = lastEventId.split("-");
    const lastSeq = Number(seqStr);
    const oldest = this.buffer[0]?.seq ?? this.seq + 1;

    const canReplay = boot === this.bootId && Number.isInteger(lastSeq) && lastSeq <= this.seq && lastSeq >= oldest - 1;
    if (!canReplay) {
      this.sendControl(res, { type: "resync" });
      return;
    }
    for (const e of this.buffer) {
      if (e.seq > lastSeq) res.write(`id: ${e.id}\ndata: ${e.payload}\n\n`);
    }
  }

  /** Control messages carry no `id`, so they don't move the client's Last-Event-ID. */
  private sendControl(res: Response, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

export const broker = new EventBroker();
