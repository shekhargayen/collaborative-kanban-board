import type { RequestHandler } from "express";
import { streamEvents } from "../realtime/stream.js";

/** GET /api/events → Server-Sent Events stream of task.created / task.updated / task.deleted */
export const eventsHandler: RequestHandler = (req, res) => streamEvents(req, res);
