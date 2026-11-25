import type { Task } from "./types";

export const POSITION_GAP = 1000;

/**
 * Fractional indexing. Given the full column (sorted by position, WITHOUT the moved task)
 * and the ids of the visible neighbours where the task was dropped, return a position that
 * puts the task right after `prevId` (or right before `nextId`).
 *
 * Using the full column (not just the visible/filtered one) means hidden tasks keep their order.
 */
export function computePosition(column: Task[], prevId?: string, nextId?: string): number {
  if (prevId) {
    const i = column.findIndex((t) => t.id === prevId);
    if (i >= 0) {
      const after = column[i + 1];
      return after ? (column[i].position + after.position) / 2 : column[i].position + POSITION_GAP;
    }
  }
  if (nextId) {
    const i = column.findIndex((t) => t.id === nextId);
    if (i >= 0) {
      const before = column[i - 1];
      return before ? (before.position + column[i].position) / 2 : column[i].position - POSITION_GAP;
    }
  }
  const last = column[column.length - 1];
  return last ? last.position + POSITION_GAP : POSITION_GAP;
}

export const byPosition = (a: Task, b: Task) => a.position - b.position || a.id.localeCompare(b.id);
