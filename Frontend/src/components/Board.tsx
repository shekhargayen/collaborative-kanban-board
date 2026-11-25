import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { matchesFilters, type Filters } from "../hooks/useUrlState";
import { useTaskActions } from "../hooks/useTaskActions";
import { cx } from "../lib/cx";
import { byPosition, computePosition } from "../lib/position";
import { isStatus, STATUSES, type Column, type Status, type Task } from "../lib/types";
import { SortableTaskCard, TaskCard } from "./TaskCard";
import { PlusIcon } from "./ui";

type Items = Record<Status, string[]>;

const COLUMN_ACCENT: Record<Status, string> = {
  backlog: "bg-slate-400",
  todo: "bg-sky-500",
  in_progress: "bg-amber-500",
  done: "bg-emerald-500",
};

type BoardProps = {
  columns: Column[];
  tasks: Task[];
  filters: Filters;
  onOpenTask: (id: string) => void;
  onAddTask: (status: Status) => void;
};

export function Board({ columns, tasks, filters, onOpenTask, onAddTask }: BoardProps) {
  const { update } = useTaskActions();

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const sorted = useMemo(() => {
    const out = Object.fromEntries(STATUSES.map((s) => [s, [] as Task[]])) as Record<Status, Task[]>;
    for (const t of tasks) out[t.status]?.push(t);
    for (const s of STATUSES) out[s].sort(byPosition);
    return out;
  }, [tasks]);
  const visible = useMemo(
    () => Object.fromEntries(STATUSES.map((s) => [s, sorted[s].filter((t) => matchesFilters(t, filters)).map((t) => t.id)])) as Items,
    [sorted, filters],
  );

  // While dragging we render from a local copy of the id lists so cards can move between columns live.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragItems, setDragItemsState] = useState<Items | null>(null);
  const dragRef = useRef<Items | null>(null);
  const settlingRef = useRef(false);
  const setDragItems = (v: Items | null) => {
    dragRef.current = v;
    setDragItemsState(v);
  };
  const items = dragItems ?? visible;

  // After a drop, keep the drag layout until the optimistic update reaches the cache (no flicker).
  useLayoutEffect(() => {
    if (settlingRef.current) {
      settlingRef.current = false;
      setDragItems(null);
    }
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: UniqueIdentifier, source: Items): Status | undefined =>
    isStatus(id) ? id : STATUSES.find((s) => source[s].includes(String(id)));

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setDragItems(visible);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const cur = dragRef.current;
    if (!over || !cur) return;
    const from = findContainer(active.id, cur);
    const to = findContainer(over.id, cur);
    if (!from || !to || from === to) return;

    const id = String(active.id);
    const toItems = cur[to].filter((x) => x !== id);
    let index = toItems.length;
    if (!isStatus(over.id)) {
      const overIndex = toItems.indexOf(String(over.id));
      const translated = active.rect.current.translated;
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
      if (overIndex >= 0) index = overIndex + (below ? 1 : 0);
    }
    toItems.splice(index, 0, id);
    setDragItems({ ...cur, [from]: cur[from].filter((x) => x !== id), [to]: toItems });
  };

  const resetDrag = () => {
    setActiveId(null);
    setDragItems(null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const cur = dragRef.current;
    const id = String(active.id);
    const task = byId.get(id);
    setActiveId(null);
    if (!over || !cur || !task) return resetDrag();

    const container = findContainer(id, cur);
    const overContainer = findContainer(over.id, cur);
    if (!container || !overContainer) return resetDrag();

    let column = cur[container];
    if (container === overContainer && !isStatus(over.id)) {
      const oldIndex = column.indexOf(id);
      const newIndex = column.indexOf(String(over.id));
      if (oldIndex !== newIndex) column = arrayMove(column, oldIndex, newIndex);
    }
    const idx = column.indexOf(id);
    const prevId = column[idx - 1];
    const nextId = column[idx + 1];

    // Dropped where it started → nothing to do.
    if (container === task.status) {
      const orig = visible[task.status];
      const oi = orig.indexOf(id);
      if (orig[oi - 1] === prevId && orig[oi + 1] === nextId) return resetDrag();
    }

    const position = computePosition(sorted[container].filter((t) => t.id !== id), prevId, nextId);
    setDragItems({ ...cur, [container]: column });
    settlingRef.current = true;
    update(id, container === task.status ? { position } : { status: container, position });
  };

  const activeTask = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={resetDrag}
    >
      <div className="flex h-full snap-x gap-4 overflow-x-auto px-4 pb-4 sm:px-6">
        {columns.map((col) => (
          <BoardColumn
            key={col.id}
            column={col}
            ids={items[col.id] ?? []}
            byId={byId}
            total={sorted[col.id]?.length ?? 0}
            onOpenTask={onOpenTask}
            onAdd={() => onAddTask(col.id)}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

type ColumnProps = {
  column: Column;
  ids: string[];
  byId: Map<string, Task>;
  total: number;
  onOpenTask: (id: string) => void;
  onAdd: () => void;
};

function BoardColumn({ column, ids, byId, total, onOpenTask, onAdd }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const tasks = ids.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t));
  const filtered = tasks.length !== total;

  return (
    <section className="flex max-h-full w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl bg-slate-200/60 dark:bg-slate-900/70 sm:w-80">
      <header className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span className={cx("size-2 rounded-full", COLUMN_ACCENT[column.id])} />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.title}</h2>
          <span className="rounded-full bg-white/70 dark:bg-slate-700/70 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {filtered ? `${tasks.length} / ${total}` : total}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
          aria-label={`Add task to ${column.title}`}
        >
          <PlusIcon />
        </button>
      </header>

      <SortableContext id={column.id} items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cx(
            "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2 transition-colors",
            isOver && "bg-indigo-100/60 dark:bg-indigo-500/15",
          )}
        >
          {tasks.map((t) => (
            <SortableTaskCard key={t.id} task={t} onOpen={onOpenTask} />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 py-6 text-xs text-slate-400 dark:text-slate-500">
              {filtered ? "No matching tasks" : "Drop tasks here"}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
