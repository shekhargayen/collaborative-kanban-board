import type { ConnectionState } from "../hooks/useRealtime";
import type { Theme } from "../hooks/useTheme";
import { cx } from "../lib/cx";
import { ThemeToggle } from "./ThemeToggle";
import { Button, PlusIcon } from "./ui";

const CONNECTION: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  connecting: { label: "Connecting…", dot: "bg-slate-400 animate-pulse", text: "text-slate-500 dark:text-slate-400" },
  reconnecting: { label: "Reconnecting…", dot: "bg-amber-500 animate-pulse", text: "text-amber-700 dark:text-amber-300" },
};

type HeaderProps = { connection: ConnectionState; onNewTask: () => void; theme: Theme; onToggleTheme: () => void };

export function Header({ connection, onNewTask, theme, onToggleTheme }: HeaderProps) {
  const c = CONNECTION[connection];
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <svg viewBox="0 0 32 32" className="size-5" fill="currentColor" aria-hidden>
            <rect x="5" y="6" width="6" height="20" rx="2" />
            <rect x="13" y="6" width="6" height="14" rx="2" />
            <rect x="21" y="6" width="6" height="9" rx="2" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Kanban Board</h1>
        <span
          className={cx("hidden items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium sm:inline-flex", c.text)}
          title="Realtime connection"
          aria-live="polite"
        >
          <span className={cx("size-2 rounded-full", c.dot)} />
          {c.label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <Button variant="primary" onClick={onNewTask}>
          <PlusIcon />
          <span>New task</span>
        </Button>
      </div>
    </header>
  );
}
