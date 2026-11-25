import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { clientId } from "./middleware/clientId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { failureSimulation } from "./middleware/failureSimulation.js";
import { latency } from "./middleware/latency.js";
import { streamCount } from "./realtime/stream.js";
import { boardRouter } from "./routes/board.js";
import { eventsHandler } from "./routes/events.js";
import { tasksRouter } from "./routes/tasks.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: (origin, cb) =>
        cb(null, !origin || config.clientOrigins.includes("*") || config.clientOrigins.includes(origin)),
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Client-Id", "X-Simulate-Failure", "Last-Event-ID"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(clientId);

  // Not affected by latency / failure simulation.
  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", sseClients: streamCount() });
  });
  app.get("/api/events", eventsHandler);

  // Everything below may be delayed / randomly fail.
  app.use("/api", latency, failureSimulation);
  app.use("/api/board", boardRouter);
  app.use("/api/tasks", tasksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
