export const STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

/** Board columns in display order. */
export const COLUMNS: ReadonlyArray<{ id: TaskStatus; title: string }> = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "Todo" },
  { id: "in_progress", title: "In Progress" },
  { id: "done", title: "Done" },
];

/** Default spacing between positions when appending / rebalancing. */
export const POSITION_GAP = 1000;
/** If two neighbours get closer than this, the column is renumbered. */
export const MIN_POSITION_GAP = 1e-6;
