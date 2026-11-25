import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { CLIENT_ID } from "./clientId";
import { computePosition } from "./position";
import { BOARD_KEY, sync } from "./sync";
import type { Board, BoardEvent, Task } from "./types";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Task",
  description: "",
  priority: "medium",
  assignee: "",
  status: "todo",
  position: 1000,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const meta = { eventId: "x", clientId: "other-user", ts: "" };
const updated = (t: Task): BoardEvent => ({ type: "task.updated", task: t, ...meta });

let qc: QueryClient;
const cached = (id = "t1") => qc.getQueryData<Board>(BOARD_KEY)?.tasks.find((t) => t.id === id);

function load(tasks: Task[]) {
  sync.beginFetch();
  qc.setQueryData(BOARD_KEY, sync.completeFetch({ columns: [], tasks }));
}

beforeEach(() => {
  qc = new QueryClient();
  sync.reset();
  sync.attach(qc);
  load([task()]);
});

describe("sync engine", () => {
  it("applies remote events to idle tasks", () => {
    sync.handleEvent(updated(task({ title: "Remote", version: 2 })));
    expect(cached()?.title).toBe("Remote");
  });

  it("ignores stale / duplicate events", () => {
    sync.handleEvent(updated(task({ title: "v3", version: 3 })));
    sync.handleEvent(updated(task({ title: "v2", version: 2 })));
    expect(cached()?.title).toBe("v3");
  });

  it("does not overwrite an optimistic change while the mutation is in flight", () => {
    sync.begin("t1");
    sync.applyLocal("t1", { status: "done" });
    sync.handleEvent(updated(task({ title: "Renamed by Bob", version: 2 })));
    expect(cached()?.status).toBe("done");
    expect(cached()?.title).toBe("Task");

    // Server applies our PATCH on top of Bob's rename.
    sync.confirm(task({ title: "Renamed by Bob", status: "done", version: 3 }));
    sync.end("t1");
    expect(cached()).toMatchObject({ title: "Renamed by Bob", status: "done", version: 3 });
  });

  it("rolls back a failed mutation to the latest server state (keeping remote changes)", () => {
    sync.begin("t1");
    sync.applyLocal("t1", { status: "done" });
    sync.handleEvent(updated(task({ title: "Renamed by Bob", version: 2 })));
    sync.end("t1"); // request failed: no confirm
    expect(cached()).toMatchObject({ status: "todo", title: "Renamed by Bob" });
  });

  it("rolls back a failed create and a failed delete", () => {
    const fresh = task({ id: "new", version: 0 });
    sync.begin("new");
    sync.insertLocal(fresh);
    sync.end("new");
    expect(cached("new")).toBeUndefined();

    sync.begin("t1");
    sync.removeLocal("t1");
    expect(cached()).toBeUndefined();
    sync.end("t1");
    expect(cached()?.title).toBe("Task");
  });

  it("a remote delete wins over a pending update once it settles", () => {
    sync.begin("t1");
    sync.applyLocal("t1", { title: "Mine" });
    sync.handleEvent({ type: "task.deleted", id: "t1", version: 1, ...meta });
    expect(cached()?.title).toBe("Mine");
    sync.end("t1");
    expect(cached()).toBeUndefined();
  });

  it("refetch keeps pending optimistic tasks and replays events received during the fetch", () => {
    sync.begin("t1");
    sync.applyLocal("t1", { status: "done" });
    sync.beginFetch();
    sync.handleEvent({ type: "task.created", task: task({ id: "t2", version: 1 }), ...meta, clientId: CLIENT_ID });
    const board = sync.completeFetch({ columns: [], tasks: [task()] });
    expect(board.tasks.find((t) => t.id === "t1")?.status).toBe("done");
    expect(board.tasks.some((t) => t.id === "t2")).toBe(true);
  });
});

describe("computePosition", () => {
  const col = [task({ id: "a", position: 1000 }), task({ id: "b", position: 2000 }), task({ id: "c", position: 3000 })];
  it("places between neighbours", () => expect(computePosition(col, "a", "b")).toBe(1500));
  it("places at the top", () => expect(computePosition(col, undefined, "a")).toBe(0));
  it("places at the end", () => expect(computePosition(col, "c")).toBe(4000));
  it("respects hidden tasks: after visible prev 'a' even if 'b' is filtered out", () =>
    expect(computePosition(col, "a", "c")).toBe(1500));
  it("empty column", () => expect(computePosition([])).toBe(1000));
});
