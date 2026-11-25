export const STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  status: Status; // column the task belongs to
  position: number; // order within the column (fractional index)
  version: number; // incremented by the server on every write
  createdAt: string;
  updatedAt: string; // ISO timestamp
};

export type Column = { id: Status; title: string };
export type Board = { columns: Column[]; tasks: Task[] };

/** The user-editable fields of a task. */
export type TaskFields = Pick<Task, "title" | "description" | "priority" | "assignee" | "status">;
export type TaskPatch = Partial<TaskFields> & { position?: number };

export const DEFAULT_COLUMNS: Column[] = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "Todo" },
  { id: "in_progress", title: "In Progress" },
  { id: "done", title: "Done" },
];

export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };

export const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);
export const isPriority = (v: unknown): v is Priority => PRIORITIES.includes(v as Priority);

/** Messages on the SSE stream. */
type EventMeta = { eventId: string; clientId: string | null; ts: string };
export type BoardEvent =
  | ({ type: "task.created"; task: Task } & EventMeta)
  | ({ type: "task.updated"; task: Task } & EventMeta)
  | ({ type: "task.deleted"; id: string; version: number } & EventMeta);
export type StreamMessage = BoardEvent | { type: "connected"; serverId: string } | { type: "resync" };
