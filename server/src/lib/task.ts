import type { Task as TaskRow } from "@prisma/client";
import type { TaskPriority, TaskStatus } from "./constants.js";

/** Public Task shape returned by the API (matches the assignment's Task type + version). */
export type TaskDTO = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  assignee: string;
  status: TaskStatus;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export function toTaskDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    assignee: row.assignee,
    status: row.status,
    position: row.position,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
