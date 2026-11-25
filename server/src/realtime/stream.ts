import type { Request, Response } from "express";
import { config } from "../config.js";
import { eventsAfter, seqBounds, toFrame } from "./events.js";
import { notifier } from "./notifier.js";

const RETRY_MS = 1000;
const HEARTBEAT_MS = 20_000;
const BATCH = 500;

const openStreams = new Set<Response>();
export const streamCount = () => openStreams.size;
export function closeAllStreams() {
  for (const res of openStreams) res.end();
  openStreams.clear();
}

/**
 * GET /api/events: Server-Sent Events.
 *
 * Each stream keeps its own cursor (last `seq` sent) and reads the `board_events` table:
 *  - on connect it replays everything after `Last-Event-ID` (or starts at the head);
 *  - it wakes on Postgres NOTIFY (instant) or every EVENT_POLL_MS (fallback).
 * Because the source of truth is the database, it works the same with one long-running server
 * or many short-lived serverless instances. On Vercel the stream ends itself after SSE_MAX_MS;
 * the browser reconnects with Last-Event-ID and continues without gaps.
 */
export async function streamEvents(req: Request, res: Response) {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`retry: ${RETRY_MS}\n\n`);

  const control = (data: Record<string, unknown>) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let closed = false;
  let wake: (() => void) | null = null;
  const stop = () => {
    closed = true;
    wake?.();
  };
  req.on("close", stop);
  openStreams.add(res);
  const unsubscribe = notifier.subscribe(() => wake?.());

  try {
    const { min, max } = await seqBounds();
    const raw = req.get("last-event-id") ?? (typeof req.query.lastEventId === "string" ? req.query.lastEventId : "");
    let cursor = max;
    if (/^\d+$/.test(raw)) {
      const last = Number(raw);
      const gapTooOld = min !== null && last < min - 1;
      if (last > max || gapTooOld) control({ type: "resync" }); // DB reset or events trimmed
      else cursor = last;
    } else if (raw) {
      control({ type: "resync" }); // id from an older server format
    }
    control({ type: "connected", lastSeq: max });

    const deadline = config.sseMaxMs > 0 ? Date.now() + config.sseMaxMs : Infinity;
    let lastWrite = Date.now();

    while (!closed && Date.now() < deadline) {
      const rows = await eventsAfter(cursor, BATCH);
      for (const row of rows) {
        res.write(toFrame(row));
        cursor = Number(row.seq);
        lastWrite = Date.now();
      }
      if (rows.length === BATCH) continue; // more to catch up on

      if (Date.now() - lastWrite >= HEARTBEAT_MS) {
        res.write(": ping\n\n");
        lastWrite = Date.now();
      }
      const waitMs = Math.min(config.eventPollMs, deadline - Date.now());
      if (waitMs <= 0 || closed) break;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, waitMs);
        wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      wake = null;
    }
  } catch (err) {
    console.error("Event stream error:", err);
  } finally {
    unsubscribe();
    openStreams.delete(res);
    if (!res.writableEnded) res.end(); // client reconnects and resumes from its Last-Event-ID
  }
}
