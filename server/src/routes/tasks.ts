import { Router } from "express";
import { CreateTaskSchema, DeleteQuerySchema, IdParamSchema, UpdateTaskSchema } from "../lib/schemas.js";
import { toTaskDTO } from "../lib/task.js";
import { broker } from "../realtime/broker.js";
import { createTask, deleteTask, updateTask, type WriteResult } from "../services/taskService.js";

export const tasksRouter = Router();

/** Broadcast side effects of a column rebalance (other tasks whose position changed). */
function publishRebalanced(result: WriteResult, origin: string | null) {
  for (const t of result.rebalanced) broker.publish({ type: "task.updated", task: toTaskDTO(t) }, origin);
}

/** POST /api/tasks */
tasksRouter.post("/", async (req, res) => {
  const input = CreateTaskSchema.parse(req.body);
  const result = await createTask(input);
  const task = toTaskDTO(result.task);

  broker.publish({ type: "task.created", task }, res.locals.clientId);
  publishRebalanced(result, res.locals.clientId);
  res.status(201).json(task);
});

/** PATCH /api/tasks/:id  (body may include `version` for optimistic concurrency) */
tasksRouter.patch("/:id", async (req, res) => {
  const { id } = IdParamSchema.parse(req.params);
  const input = UpdateTaskSchema.parse(req.body);
  const result = await updateTask(id, input);
  const task = toTaskDTO(result.task);

  broker.publish({ type: "task.updated", task }, res.locals.clientId);
  publishRebalanced(result, res.locals.clientId);
  res.json(task);
});

/** DELETE /api/tasks/:id  (optional `?version=` for optimistic concurrency) */
tasksRouter.delete("/:id", async (req, res) => {
  const { id } = IdParamSchema.parse(req.params);
  const { version } = DeleteQuerySchema.parse(req.query);
  const deleted = await deleteTask(id, version);

  broker.publish({ type: "task.deleted", id: deleted.id, version: deleted.version }, res.locals.clientId);
  res.status(204).end();
});
