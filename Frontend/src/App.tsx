import { useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import { describeError } from "./api/client";
import { Board } from "./components/Board";
import { CreateTaskDialog } from "./components/CreateTaskDialog";
import { Header } from "./components/Header";
import { TaskDrawer } from "./components/TaskDrawer";
import { Toolbar } from "./components/Toolbar";
import { Button } from "./components/ui";
import { useBoard } from "./hooks/useBoard";
import { useRealtime } from "./hooks/useRealtime";
import { useTheme } from "./hooks/useTheme";
import { matchesFilters, useFilters, useSelectedTask } from "./hooks/useUrlState";
import { sync } from "./lib/sync";
import { DEFAULT_COLUMNS, type Status } from "./lib/types";

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const connection = useRealtime();
  const board = useBoard();
  const { filters } = useFilters();
  const { selectedId, open: openTask, close: closeTask } = useSelectedTask();
  const [createStatus, setCreateStatus] = useState<Status | null>(null);

  const tasks = useMemo(() => board.data?.tasks ?? [], [board.data]);
  const columns = board.data?.columns ?? DEFAULT_COLUMNS;
  const assignees = useMemo(
    () => [...new Set(tasks.map((t) => t.assignee.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [tasks],
  );
  const visibleCount = useMemo(() => tasks.filter((t) => matchesFilters(t, filters)).length, [tasks, filters]);
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : undefined;

  // The open task was deleted (by another user, or the URL points to a missing task).
  useEffect(() => {
    if (board.data && selectedId && !selectedTask && !sync.isPending(selectedId)) {
      toast.info("That task no longer exists.");
      closeTask();
    }
  }, [board.data, selectedId, selectedTask, closeTask]);

  return (
    <div className="flex h-full flex-col">
      <Header connection={connection} onNewTask={() => setCreateStatus("backlog")} theme={theme} onToggleTheme={toggleTheme} />
      <Toolbar assignees={assignees} visible={visibleCount} total={tasks.length} />

      <main className="min-h-0 flex-1">
        {board.isPending ? (
          <BoardSkeleton />
        ) : board.isError && !board.data ? (
          <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-6 text-center shadow-sm">
            <p className="font-medium text-slate-900 dark:text-slate-100">Couldn't load the board</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{describeError(board.error)}</p>
            <Button variant="primary" className="mt-4" onClick={() => void board.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <Board columns={columns} tasks={tasks} filters={filters} onOpenTask={openTask} onAddTask={setCreateStatus} />
        )}
      </main>

      <TaskDrawer task={selectedTask} onClose={closeTask} assignees={assignees} />
      <CreateTaskDialog status={createStatus} onClose={() => setCreateStatus(null)} assignees={assignees} />
      <Toaster richColors closeButton position="bottom-right" theme={theme} />
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden px-4 sm:px-6" aria-busy="true" aria-label="Loading board">
      {DEFAULT_COLUMNS.map((c) => (
        <div key={c.id} className="w-80 shrink-0 space-y-2 rounded-2xl bg-slate-200/60 dark:bg-slate-900/70 p-3">
          <div className="h-4 w-24 animate-pulse rounded bg-slate-300 dark:bg-slate-700" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/70 dark:bg-slate-700/70" />
          ))}
        </div>
      ))}
    </div>
  );
}
