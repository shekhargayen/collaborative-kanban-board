import { config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { notifier } from "./realtime/notifier.js";
import { closeAllStreams } from "./realtime/stream.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Kanban API listening on http://localhost:${config.port}`);
  console.log(`  FAIL_RATE=${config.failRate}  FAIL_METHODS=${[...config.failMethods].join(",")}  LATENCY_MS=${config.latencyMs}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  closeAllStreams(); // end SSE streams so server.close() can finish
  server.close(async () => {
    await notifier.close();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
