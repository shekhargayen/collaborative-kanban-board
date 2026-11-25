import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useTaskActions } from "../hooks/useTaskActions";
import type { Status, TaskFields } from "../lib/types";
import { TaskForm } from "./TaskForm";
import { Button, CloseIcon } from "./ui";

type Props = { status: Status | null; onClose: () => void; assignees: string[] };

export function CreateTaskDialog({ status, onClose, assignees }: Props) {
  return (
    <Dialog.Root open={status !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-900/30 dark:bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 animate-pop-in overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl focus:outline-none"
        >
          {status && <CreateForm initialStatus={status} assignees={assignees} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CreateForm({ initialStatus, assignees, onClose }: { initialStatus: Status; assignees: string[]; onClose: () => void }) {
  const { create } = useTaskActions();
  const [value, setValue] = useState<TaskFields>({ title: "", description: "", priority: "medium", assignee: "", status: initialStatus });
  const [titleError, setTitleError] = useState<string>();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const title = value.title.trim();
        if (!title) return setTitleError("Title is required");
        create({ ...value, title, assignee: value.assignee.trim() });
        onClose();
      }}
    >
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
        <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">New task</Dialog.Title>
        <Dialog.Close className="rounded-md p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Close">
          <CloseIcon />
        </Dialog.Close>
      </header>
      <div className="px-5 py-5">
        <TaskForm
          value={value}
          onChange={(v) => {
            setTitleError(undefined);
            setValue(v);
          }}
          assignees={assignees}
          titleError={titleError}
          autoFocusTitle
        />
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Create task</Button>
      </footer>
    </form>
  );
}
