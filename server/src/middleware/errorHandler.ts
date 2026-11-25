import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: "NotFound", message: `Route ${req.method} ${req.path} not found` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    res.status(400).json({ error: "ValidationError", message: "Invalid request", details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "NotFound", message: "Task not found" });
      return;
    }
    if (err.code === "P2002") {
      res.status(409).json({ error: "Conflict", message: "A task with this id already exists" });
      return;
    }
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "InvalidJson", message: "Request body is not valid JSON" });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "InternalError", message: "Something went wrong" });
};
