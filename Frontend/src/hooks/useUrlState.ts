import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { isPriority, type Priority, type Task } from "../lib/types";

export const UNASSIGNED = "__unassigned";

export type Filters = { q: string; priority: Priority | ""; assignee: string };

/** Search + filters live in the URL (?q=&priority=&assignee=) so a refresh restores them. */
export function useFilters() {
  const [params, setParams] = useSearchParams();

  const filters: Filters = useMemo(() => {
    const p = params.get("priority");
    return { q: params.get("q") ?? "", priority: isPriority(p) ? p : "", assignee: params.get("assignee") ?? "" };
  }, [params]);

  const setFilters = useCallback(
    (patch: Partial<Filters>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const clearFilters = useCallback(() => setFilters({ q: "", priority: "", assignee: "" }), [setFilters]);
  const active = Boolean(filters.q || filters.priority || filters.assignee);

  return { filters, setFilters, clearFilters, active };
}

export function matchesFilters(task: Task, f: Filters): boolean {
  const q = f.q.trim().toLowerCase();
  if (q && !task.title.toLowerCase().includes(q)) return false;
  if (f.priority && task.priority !== f.priority) return false;
  if (f.assignee) {
    if (f.assignee === UNASSIGNED) return task.assignee.trim() === "";
    if (task.assignee !== f.assignee) return false;
  }
  return true;
}

/** Open task (drawer) is kept in `?task=<id>` too, so it survives a refresh / can be shared. */
export function useSelectedTask() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("task");

  const open = useCallback(
    (id: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("task", id);
        return next;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("task");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { selectedId, open, close };
}
