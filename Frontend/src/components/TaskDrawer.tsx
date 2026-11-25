import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useTaskActions } from "../hooks/useTaskActions";
import type { Task, TaskFields, TaskPatch } from "../lib/types";
import { FIELD_KEYS, FIELD_LABEL, pickFields, TaskForm } from "./TaskForm";
import { Button, CloseIcon } from "./ui";

type Props = { task: Task | undefined; onClose: () => void; assignees: string[] };

export function TaskDrawer({ task, onClose, assignees }: Props) {
  return (
    <Dialog.Root open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-900/30 dark:bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md animate-slide-in flex-col bg-white dark:bg-slate-900 shadow-2xl focus:outline-none"
        >
          {task && <Editor key={task.id} task={task} assignees={assignees} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type EditState = { base: TaskFields; draft: TaskFields; conflicts: Array<keyof TaskFields> };

/**
 * Edits a local draft. When the task changes underneath us (realtime event from another user):
 *  - fields the user has NOT touched take the new remote value,
 *  - fields the user HAS edited keep the local value and are flagged as conflicts.
 * Saving sends only the changed fields (PATCH), so other users' edits to other fields survive.
 */
function Editor({ task, assignees, onClose }: { task: Task; assignees: string[]; onClose: () => void }) {
  const { update, remove } = useTaskActions();
  const [state, setState] = useState<EditState>(() => {
    const f = pickFields(task);
    return { base: f, draft: f, conflicts: [] };
  });
  const [titleError, setTitleError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const incoming = pickFields(task);
    setState((s) => {
      if (FIELD_KEYS.every((k) => s.base[k] === incoming[k])) return s;
      const draft = { ...s.draft };
      const conflicts = new Set(s.conflicts);
      for (const k of FIELD_KEYS) {
        if (incoming[k] === s.base[k]) continue; // not changed remotely
        if (s.draft[k] === s.base[k]) (draft as Record<string, unknown>)[k] = incoming[k]; // untouched → take remote
        else if (s.draft[k] !== incoming[k]) conflicts.add(k); // both changed differently
        else conflicts.delete(k);
      }
      return { base: incoming, draft, conflicts: [...conflicts] };
    });
  }, [task]);

  const dirtyKeys = FIELD_KEYS.filter((k) => state.draft[k] !== state.base[k]);
  const conflicts = state.conflicts.filter((k) => dirtyKeys.includes(k));

  const save = () => {
    const title = state.draft.title.trim();
    if (!title) return setTitleError("Title is required");
    const patch: TaskPatch = {};
    for (const k of dirtyKeys) (patch as Record<string, unknown>)[k] = k === "title" ? title : k === "assignee" ? state.draft.assignee.trim() : state.draft[k];
    if (Object.keys(patch).length) update(task.id, patch);
    onClose();
  };

  const discardMine = () =>
    setState((s) => {
      const draft = { ...s.draft };
      for (const k of s.conflicts) (draft as Record<string, unknown>)[k] = s.base[k];
      return { ...s, draft, conflicts: [] };
    });

  const doDelete = () => {
    if (!confirmDelete) return setConfirmDelete(true);
    onClose();
    remove(task.id);
  };

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 px-5 py-4">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{task.title}</Dialog.Title>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Updated {new Date(task.updatedAt).toLocaleString()}</p>
        </div>
        <Dialog.Close className="rounded-md p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Close">
          <CloseIcon />
        </Dialog.Close>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {conflicts.length > 0 && (
          <div role="alert" className="mb-4 rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/15 p-3 text-sm text-amber-800 dark:text-amber-200">
            Another user changed the {conflicts.map((k) => FIELD_LABEL[k]).join(", ")} while you were editing. Saving will overwrite their change.
            <button type="button" onClick={discardMine} className="ml-1 font-medium underline">
              Use their version
            </button>
          </div>
        )}
        <TaskForm
          value={state.draft}
          onChange={(draft) => {
            setTitleError(undefined);
            setState((s) => ({ ...s, draft }));
          }}
          assignees={assignees}
          conflicts={conflicts}
          titleError={titleError}
        />
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
        <Button variant="danger" onClick={doDelete} onBlur={() => setConfirmDelete(false)}>
          {confirmDelete ? "Click again to delete" : "Delete"}
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={dirtyKeys.length === 0}>
            Save changes
          </Button>
        </div>
      </footer>
    </form>
  );
}
