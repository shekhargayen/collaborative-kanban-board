import type { RequestHandler } from "express";
import { broker } from "../realtime/broker.js";

/** GET /api/events → Server-Sent Events stream of task.created / task.updated / task.deleted */
export const eventsHandler: RequestHandler = (req, res) => {
  broker.subscribe(req, res);
};
