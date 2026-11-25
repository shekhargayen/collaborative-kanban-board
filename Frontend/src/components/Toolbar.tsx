import { UNASSIGNED, useFilters } from "../hooks/useUrlState";
import { cx } from "../lib/cx";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "../lib/types";
import { Button, inputClass, SearchIcon } from "./ui";

export function Toolbar({ assignees, visible, total }: { assignees: string[]; visible: number; total: number }) {
  const { filters, setFilters, clearFilters, active } = useFilters();

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
      <label className="relative w-full sm:w-72">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
          placeholder="Search tasks by title…"
          aria-label="Search tasks by title"
          className={cx(inputClass, "pl-9")}
        />
      </label>

      <select
        value={filters.priority}
        onChange={(e) => setFilters({ priority: e.target.value as Priority | "" })}
        aria-label="Filter by priority"
        className={cx(inputClass, "sm:w-auto sm:min-w-40", filters.priority && "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15")}
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>

      <select
        value={filters.assignee}
        onChange={(e) => setFilters({ assignee: e.target.value })}
        aria-label="Filter by assignee"
        className={cx(inputClass, "sm:w-auto sm:min-w-40", filters.assignee && "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15")}
      >
        <option value="">All assignees</option>
        <option value={UNASSIGNED}>Unassigned</option>
        {/* Keep a filter from the URL selectable even if no task currently has that assignee. */}
        {[...new Set([...assignees, ...(filters.assignee && filters.assignee !== UNASSIGNED ? [filters.assignee] : [])])]
          .sort((a, b) => a.localeCompare(b))
          .map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
      </select>

      {active && (
        <>
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing {visible} of {total}
          </span>
        </>
      )}
    </div>
  );
}
