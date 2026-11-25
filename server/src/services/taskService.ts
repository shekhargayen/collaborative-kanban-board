import { Prisma, type Task } from "@prisma/client";
import { prisma } from "../db.js";
import { MIN_POSITION_GAP, POSITION_GAP, type TaskStatus } from "../lib/constants.js";
import { HttpError, notFound } from "../lib/errors.js";
import type { CreateTaskInput, UpdateTaskInput } from "../lib/schemas.js";
import { toTaskDTO } from "../lib/task.js";

type Tx = Prisma.TransactionClient;

/** Result of a write: the task itself plus other tasks whose position changed (column rebalance). */
export type WriteResult = { task: Task; rebalanced: Task[] };

const conflict = (current: Task) =>
  new HttpError(409, "Conflict", "Task was modified by another user", { task: toTaskDTO(current) });

export function listTasks() {
  return prisma.task.findMany({ orderBy: [{ status: "asc" }, { position: "asc" }] });
}

async function endOfColumn(tx: Tx, status: TaskStatus) {
  const last = await tx.task.findFirst({
    where: { status },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + POSITION_GAP;
}

/**
 * Fractional indexing: clients drop a task between neighbours using the midpoint of
 * their positions, so a move only touches ONE row. After many moves into the same slot
 * the gap shrinks; when it gets below MIN_POSITION_GAP we renumber the whole column.
 */
async function rebalanceIfNeeded(tx: Tx, task: Task): Promise<WriteResult> {
  const base = { status: task.status, id: { not: task.id } };
  const prev = await tx.task.findFirst({
    where: { ...base, position: { lte: task.position } },
    orderBy: { position: "desc" },
  });
  const next = await tx.task.findFirst({
    where: { ...base, position: { gte: task.position } },
    orderBy: { position: "asc" },
  });
  const tooClose = (n: Task | null) => n !== null && Math.abs(n.position - task.position) < MIN_POSITION_GAP;
  if (!tooClose(prev) && !tooClose(next)) return { task, rebalanced: [] };

  const column = await tx.task.findMany({
    where: { status: task.status },
    orderBy: [{ position: "asc" }, { updatedAt: "asc" }],
  });

  let moved = task;
  const rebalanced: Task[] = [];
  for (const [i, row] of column.entries()) {
    const target = (i + 1) * POSITION_GAP;
    if (row.position === target) continue;
    const updated = await tx.task.update({
      where: { id: row.id },
      data: { position: target, version: { increment: 1 } },
    });
    if (updated.id === task.id) moved = updated;
    else rebalanced.push(updated);
  }
  return { task: moved, rebalanced };
}

export async function createTask(input: CreateTaskInput): Promise<WriteResult> {
  return prisma.$transaction(async (tx) => {
    const position = input.position ?? (await endOfColumn(tx, input.status));
    const task = await tx.task.create({ data: { ...input, position } });
    return rebalanceIfNeeded(tx, task);
  });
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<WriteResult> {
  const { version: expectedVersion, ...patch } = input;

  return prisma.$transaction(async (tx) => {
    const current = await tx.task.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (expectedVersion !== undefined && expectedVersion !== current.version) throw conflict(current);

    const data: Prisma.TaskUpdateManyMutationInput = { ...patch };
    // Moving to another column without an explicit position → append to the end.
    if (patch.status && patch.status !== current.status && patch.position === undefined) {
      data.position = await endOfColumn(tx, patch.status);
    }

    // Compare-and-swap on version so concurrent writers can't silently clobber each other.
    const { count } = await tx.task.updateMany({
      where: { id, version: current.version },
      data: { ...data, version: { increment: 1 }, updatedAt: new Date() },
    });
    if (count === 0) {
      const latest = await tx.task.findUnique({ where: { id } });
      throw latest ? conflict(latest) : notFound();
    }

    const task = await tx.task.findUniqueOrThrow({ where: { id } });
    if (patch.position === undefined && data.position === undefined) return { task, rebalanced: [] };
    return rebalanceIfNeeded(tx, task);
  });
}

export async function deleteTask(id: string, expectedVersion?: number): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.task.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (expectedVersion !== undefined && expectedVersion !== current.version) throw conflict(current);

    const { count } = await tx.task.deleteMany({ where: { id, version: current.version } });
    if (count === 0) {
      const latest = await tx.task.findUnique({ where: { id } });
      throw latest ? conflict(latest) : notFound();
    }
    return current;
  });
}
