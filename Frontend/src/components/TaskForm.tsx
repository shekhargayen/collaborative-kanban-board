import { cx } from "../lib/cx";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status, type TaskFields } from "../lib/types";
import { inputClass } from "./ui";

type Props = {
  value: TaskFields;
  onChange: (value: TaskFields) => void;
  assignees: string[];
  /** Fields changed remotely while the user was editing them (highlighted). */
  conflicts?: Array<keyof TaskFields>;
  titleError?: string;
  autoFocusTitle?: boolean;
};

const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";
const conflictClass = "border-amber-400 ring-2 ring-amber-300/50";

export function TaskForm({ value, onChange, assignees, conflicts = [], titleError, autoFocusTitle }: Props) {
  const set = <K extends keyof TaskFields>(k: K, v: TaskFields[K]) => onChange({ ...value, [k]: v });
  const c = (k: keyof TaskFields) => conflicts.includes(k) && conflictClass;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="task-title" className={labelClass}>Title</label>
        <input
          id="task-title"
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          autoFocus={autoFocusTitle}
          maxLength={200}
          placeholder="What needs to be done?"
          className={cx(inputClass, c("title"), titleError && "border-rose-400")}
        />
        {titleError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{titleError}</p>}
      </div>

      <div>
        <label htmlFor="task-description" className={labelClass}>Description</label>
        <textarea
          id="task-description"
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder="Add more details…"
          className={cx(inputClass, "resize-y", c("description"))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="task-status" className={labelClass}>Status</label>
          <select id="task-status" value={value.status} onChange={(e) => set("status", e.target.value as Status)} className={cx(inputClass, c("status"))}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="task-priority" className={labelClass}>Priority</label>
          <select id="task-priority" value={value.priority} onChange={(e) => set("priority", e.target.value as Priority)} className={cx(inputClass, c("priority"))}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="task-assignee" className={labelClass}>Assignee</label>
        <input
          id="task-assignee"
          value={value.assignee}
          onChange={(e) => set("assignee", e.target.value)}
          list="assignee-options"
          maxLength={100}
          placeholder="Unassigned"
          className={cx(inputClass, c("assignee"))}
        />
        <datalist id="assignee-options">
          {assignees.map((a) => <option key={a} value={a} />)}
        </datalist>
      </div>
    </div>
  );
}

export const pickFields = (t: TaskFields): TaskFields => ({
  title: t.title,
  description: t.description,
  priority: t.priority,
  assignee: t.assignee,
  status: t.status,
});

export const FIELD_KEYS: Array<keyof TaskFields> = ["title", "description", "priority", "assignee", "status"];
export const FIELD_LABEL: Record<keyof TaskFields, string> = {
  title: "title",
  description: "description",
  priority: "priority",
  assignee: "assignee",
  status: "status",
};
