import type { Board, Task, TaskFields, TaskPatch } from "../lib/types";
import { request } from "./client";

export type CreateTaskInput = TaskFields & { id?: string; position?: number };

export const fetchBoard = () => request<Board>("/api/board");

export const createTask = (input: CreateTaskInput) =>
  request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) });

export const updateTask = (id: string, patch: TaskPatch) =>
  request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteTask = (id: string) => request<void>(`/api/tasks/${id}`, { method: "DELETE" });
