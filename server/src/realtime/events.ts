import { Prisma, type BoardEvent as EventRow } from "@prisma/client";
import { prisma } from "../db.js";
import type { TaskDTO } from "../lib/task.js";

export type BoardEventPayload =
  | { type: "task.created"; task: TaskDTO }
  | { type: "task.updated"; task: TaskDTO }
  | { type: "task.deleted"; id: string; version: number };

export const NOTIFY_CHANNEL = "board_events";
const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Append events inside the SAME transaction as the task write, so an event exists if and only if
 * the write committed. pg_notify is delivered on commit, waking every listening server instance.
 *
 * Callers hold a transaction-level advisory lock (see taskService), so writes are serialized and
 * `seq` values become visible in order: a reader that has seen seq N will never later find N-1.
 */
export async function recordEvents(tx: Prisma.TransactionClient, events: BoardEventPayload[], clientId: string | null) {
  if (events.length === 0) return;
  await tx.boardEvent.createMany({
    data: events.map((e) => ({ type: e.type, payload: e as unknown as Prisma.InputJsonValue, clientId })),
  });
  await tx.$executeRawUnsafe(`SELECT pg_notify('${NOTIFY_CHANNEL}', '')`);
  // Occasionally trim old events (clients further behind than this simply resync).
  if (Math.random() < 0.02) {
    await tx.boardEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
  }
}

export function eventsAfter(seq: number, take: number) {
  return prisma.boardEvent.findMany({ where: { seq: { gt: BigInt(seq) } }, orderBy: { seq: "asc" }, take });
}

export async function seqBounds(): Promise<{ min: number | null; max: number }> {
  const agg = await prisma.boardEvent.aggregate({ _min: { seq: true }, _max: { seq: true } });
  return { min: agg._min.seq === null ? null : Number(agg._min.seq), max: Number(agg._max.seq ?? 0) };
}

/** SSE frame. `id` = seq, so the browser sends it back as Last-Event-ID on reconnect. */
export function toFrame(row: EventRow) {
  const data = {
    ...(row.payload as Record<string, unknown>),
    eventId: String(row.seq),
    clientId: row.clientId,
    ts: row.createdAt.toISOString(),
  };
  return `id: ${row.seq}\ndata: ${JSON.stringify(data)}\n\n`;
}
