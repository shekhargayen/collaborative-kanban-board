import { Router } from "express";
import { CreateTaskSchema, DeleteQuerySchema, IdParamSchema, UpdateTaskSchema } from "../lib/schemas.js";
import { toTaskDTO } from "../lib/task.js";
import { createTask, deleteTask, updateTask } from "../services/taskService.js";

// Realtime events are recorded by the service inside the write transaction (see realtime/events.ts).
export const tasksRouter = Router();

/** POST /api/tasks */
tasksRouter.post("/", async (req, res) => {
  const input = CreateTaskSchema.parse(req.body);
  const task = await createTask(input, res.locals.clientId);
  res.status(201).json(toTaskDTO(task));
});

/** PATCH /api/tasks/:id  (body may include `version` for optimistic concurrency) */
tasksRouter.patch("/:id", async (req, res) => {
  const { id } = IdParamSchema.parse(req.params);
  const input = UpdateTaskSchema.parse(req.body);
  const task = await updateTask(id, input, res.locals.clientId);
  res.json(toTaskDTO(task));
});

/** DELETE /api/tasks/:id  (optional `?version=` for optimistic concurrency) */
tasksRouter.delete("/:id", async (req, res) => {
  const { id } = IdParamSchema.parse(req.params);
  const { version } = DeleteQuerySchema.parse(req.query);
  await deleteTask(id, version, res.locals.clientId);
  res.status(204).end();
});
