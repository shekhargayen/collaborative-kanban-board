import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useIsFlashing, useIsPending } from "../hooks/useSyncState";
import { cx } from "../lib/cx";
import type { Task } from "../lib/types";
import { Avatar, PriorityBadge, Spinner } from "./ui";

type CardProps = { task: Task; overlay?: boolean; onOpen?: (id: string) => void };

export function TaskCard({ task, overlay, onOpen }: CardProps) {
  const pending = useIsPending(task.id);
  const flashing = useIsFlashing(task.id);

  return (
    <div
      onClick={() => onOpen?.(task.id)}
      className={cx(
        "cursor-grab select-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-600 hover:shadow active:cursor-grabbing",
        overlay && "rotate-2 cursor-grabbing shadow-xl ring-2 ring-indigo-400",
        flashing && "animate-flash",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug text-slate-900 dark:text-slate-100 break-words">{task.title}</h3>
        {pending && <Spinner className="mt-0.5" />}
      </div>
      {task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400 break-words">{task.description}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <PriorityBadge priority={task.priority} />
        {task.assignee ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span className="truncate">{task.assignee}</span>
            <Avatar name={task.assignee} />
          </span>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">Unassigned</span>
        )}
      </div>
    </div>
  );
}

export function SortableTaskCard({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx("touch-manipulation rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable task"
      aria-label={task.title}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}
