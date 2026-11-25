import { Router } from "express";
import { COLUMNS } from "../lib/constants.js";
import { toTaskDTO } from "../lib/task.js";
import { listTasks } from "../services/taskService.js";

export const boardRouter = Router();

/** GET /api/board → { columns, tasks } (tasks ordered by column, then position) */
boardRouter.get("/", async (_req, res) => {
  const tasks = await listTasks();
  res.json({ columns: COLUMNS, tasks: tasks.map(toTaskDTO) });
});
