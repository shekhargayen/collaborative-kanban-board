import { useMutation } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, describeError } from "../api/client";
import * as api from "../api/tasks";
import { newId } from "../lib/clientId";
import { sync } from "../lib/sync";
import type { Task, TaskFields, TaskPatch } from "../lib/types";

type Actions = {
  create: (fields: TaskFields) => void;
  update: (id: string, patch: TaskPatch) => void;
  remove: (id: string) => void;
};

const TaskActionsContext = createContext<Actions | null>(null);

const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

function notifyError(title: string, err: unknown, retry?: () => void) {
  toast.error(title, {
    description: `${describeError(err)} Your change was reverted.`,
    action: retry ? { label: "Retry", onClick: retry } : undefined,
  });
}

/**
 * Optimistic create / update / delete.
 *
 * Each action: (1) marks the task pending, (2) applies the change to the cache synchronously,
 * (3) fires the request. The mutation's onSettled calls `sync.end`, which reconciles the task
 * with the latest server state: that is the success path and the rollback path at once.
 *
 * Lives in a provider at the app root so callbacks still run after e.g. the drawer unmounts.
 */
export function TaskActionsProvider({ children }: { children: ReactNode }) {
  const actionsRef = useRef<Actions | null>(null);

  const createMut = useMutation({
    mutationFn: (task: Task) =>
      api.createTask({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        assignee: task.assignee,
        status: task.status,
        position: task.position,
      }),
    onSuccess: (task) => sync.confirm(task),
    onError: (err, task) =>
      notifyError(`Couldn't create "${task.title}"`, err, () =>
        actionsRef.current?.create({
          title: task.title,
          description: task.description,
          priority: task.priority,
          assignee: task.assignee,
          status: task.status,
        }),
      ),
    onSettled: (_data, _err, task) => sync.end(task.id),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; patch: TaskPatch; label: string }) => api.updateTask(v.id, v.patch),
    onSuccess: (task) => sync.confirm(task),
    onError: (err, v) => {
      if (isNotFound(err)) {
        sync.confirmDeleted(v.id);
        toast.error(`"${v.label}" was deleted by another user`);
        return;
      }
      notifyError(`Couldn't update "${v.label}"`, err, () => actionsRef.current?.update(v.id, v.patch));
    },
    onSettled: (_data, _err, v) => sync.end(v.id),
  });

  const deleteMut = useMutation({
    mutationFn: (v: { id: string; label: string }) => api.deleteTask(v.id),
    onSuccess: (_data, v) => sync.confirmDeleted(v.id),
    onError: (err, v) => {
      if (isNotFound(err)) {
        sync.confirmDeleted(v.id); // already gone: that's what we wanted
        return;
      }
      notifyError(`Couldn't delete "${v.label}"`, err, () => actionsRef.current?.remove(v.id));
    },
    onSettled: (_data, _err, v) => sync.end(v.id),
  });

  const { mutate: createTask } = createMut;
  const { mutate: updateTask } = updateMut;
  const { mutate: deleteTask } = deleteMut;

  const actions = useMemo<Actions>(
    () => ({
      create(fields) {
        const now = new Date().toISOString();
        const task: Task = {
          ...fields,
          id: newId(), // client-generated id → no temp-id swapping later
          position: sync.endPosition(fields.status),
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
        sync.begin(task.id);
        sync.insertLocal(task);
        createTask(task);
      },
      update(id, patch) {
        const current = sync.getLocal(id);
        if (!current) return;
        const full = { ...patch };
        // Changing column without a position (drawer) → append to the end of the new column.
        if (full.status && full.status !== current.status && full.position === undefined) {
          full.position = sync.endPosition(full.status);
        }
        sync.begin(id);
        sync.applyLocal(id, full);
        updateTask({ id, patch: full, label: current.title });
      },
      remove(id) {
        const current = sync.getLocal(id);
        if (!current) return;
        sync.begin(id);
        sync.removeLocal(id);
        deleteTask({ id, label: current.title });
      },
    }),
    [createTask, updateTask, deleteTask],
  );
  actionsRef.current = actions;

  return <TaskActionsContext.Provider value={actions}>{children}</TaskActionsContext.Provider>;
}

export function useTaskActions() {
  const ctx = useContext(TaskActionsContext);
  if (!ctx) throw new Error("useTaskActions must be used inside <TaskActionsProvider>");
  return ctx;
}
