# Collaborative Kanban Board

A real-time collaborative Kanban board. Several users can view and edit the same board at once, and changes made by others appear without a page reload.




---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Server state / optimistic updates | TanStack Query v5 |
| Drag and drop | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| URL state | React Router (`useSearchParams`) |
| Styling / UI | Tailwind CSS v4, Radix UI Dialog (drawer + modal), sonner (toasts) |
| Backend | Node.js, TypeScript, Express 5 |
| Database | PostgreSQL 16 via Prisma |
| Validation | zod |
| Real-time | Server-Sent Events (`GET /api/events`) + native `EventSource` |

## Project structure

```
.
├── docker-compose.yml        # local PostgreSQL
├── server/                   # Express API
│   ├── prisma/               # schema, migrations, seed
│   └── src/
│       ├── routes/           # board, tasks, events
│       ├── services/         # all DB logic (taskService.ts)
│       ├── realtime/         # SSE broker (broker.ts)
│       └── middleware/       # failure simulation, latency, errors, client id
└── Frontend/                 # React app
    └── src/
        ├── lib/sync.ts       # optimistic update + realtime reconciliation engine
        ├── hooks/            # useBoard, useRealtime, useTaskActions, useUrlState, useTheme
        └── components/       # Board, TaskCard, TaskDrawer, CreateTaskDialog, Toolbar, ...
```

---

## How to install and run

**Prerequisites:** Node.js 20+ and Docker (for PostgreSQL). If you have your own Postgres, skip step 1 and set `DATABASE_URL` instead.

```bash
# 1. Start PostgreSQL (from the repo root)
docker compose up -d

# 2. Backend: http://localhost:4000
cd server
cp .env.example .env
npm install
npm run db:migrate        # create tables
npm run db:seed           # optional: sample tasks
npm run dev

# 3. Frontend: http://localhost:5173 (in a second terminal)
cd Frontend
npm install
npm run dev
```

Open http://localhost:5173 in **two browser windows** to see real-time collaboration.

> On npm 11+, install scripts must be approved once: `npm approve-scripts prisma @prisma/client @prisma/engines esbuild` (server) and `npm approve-scripts esbuild` (Frontend), then `npm rebuild`.

### Environment variables

**server/.env**

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | – | PostgreSQL connection string |
| `PORT` | `4000` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origins (comma-separated, `*` for any) |
| `FAIL_RATE` | `0` (`.env.example`: `0.1`) | Probability (0–1) that a write request fails with `503`, to exercise rollback |
| `FAIL_METHODS` | `POST,PATCH,DELETE` | HTTP methods eligible for simulated failure |
| `LATENCY_MS` | `0` (`.env.example`: `300`) | Artificial delay per request, so optimistic UI is visible |

A single request can force the outcome with the header `X-Simulate-Failure: always` or `X-Simulate-Failure: never`.

**Frontend/.env** (optional)

| Variable | Description |
|---|---|
| `VITE_API_URL` | API base URL. Leave empty locally (Vite proxies `/api` to `:4000`); set it to the backend URL in production. |

### Scripts

| Where | Command | What it does |
|---|---|---|
| server | `npm run dev` / `build` / `start` | Dev server (watch) / compile / run compiled |
| server | `npm run db:migrate` / `db:seed` / `db:reset` | Prisma migrations / sample data / reset DB |
| Frontend | `npm run dev` / `build` / `preview` | Dev server / production build / serve build |
| Frontend | `npm test` | Unit tests for the sync engine and position logic (Vitest) |

---

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/board` | `{ columns, tasks }`; tasks sorted by column, then position |
| `POST` | `/api/tasks` | Create a task. Accepts an optional client-generated `id` (UUID) and `position`. |
| `PATCH` | `/api/tasks/:id` | Partial update (any of title, description, priority, assignee, status, position). Optional `version` returns `409` if stale. |
| `DELETE` | `/api/tasks/:id` | Delete → `204` |
| `GET` | `/api/events` | SSE stream of `task.created`, `task.updated`, `task.deleted` |

Every task carries a server-managed **`version`**, incremented on each write, in addition to the fields in the brief. Writes are compare-and-swap on `(id, version)` in a transaction. Errors use the shape `{ error, message, details? }`: `400` validation, `404` not found, `409` conflict, `503` simulated failure.

---

## What is complete and what is not

### Complete

- **Board:** fetch from the API, tasks grouped into Backlog / Todo / In Progress / Done; create, edit and delete.
- **Drag and drop:** move between columns and reorder within a column (mouse, touch and keyboard); persisted with a single `PATCH { status, position }`.
- **Search and filters:** title search plus priority and assignee filters (including "Unassigned"), all combined.
- **Task details:** clicking a card opens a side drawer to edit title, description, priority, assignee and status, or delete the task.
- **Optimistic updates:** every create, update, move and delete shows instantly; on failure it rolls back and shows an error toast with a **Retry** action.
- **Real-time collaboration:** SSE stream, automatic reconnect with replay of missed events; changes from other users briefly highlight the card.
- **URL state:** `?q=&priority=&assignee=` survive a refresh. The open task (`?task=<id>`) is also kept in the URL, so links can be shared.
- **Extras:** live connection indicator, edit-conflict warning in the drawer, dark/light theme toggle, loading skeleton and error state, unit tests for the sync engine.

### Not complete / known limitations

- **No authentication.** Assignee is a free-text name and every visitor sees the same board.
- **Single backend instance.** The SSE broker and its replay buffer are in memory. Running several instances would need a shared channel such as Postgres `LISTEN/NOTIFY` or Redis pub/sub.
- **Drag-and-drop is last-write-wins.** Moves don't send `version`, so two people moving the same card at the same moment both "win" in order. The board still converges to the server's final state.
- **Filters are single-select.** One priority and one assignee at a time.
- **No end-to-end tests.** Only the sync engine and positioning logic have unit tests; the API was tested manually with curl.

---

## How optimistic updates and rollback work

The core is [`Frontend/src/lib/sync.ts`](Frontend/src/lib/sync.ts), used by [`useTaskActions.tsx`](Frontend/src/hooks/useTaskActions.tsx).

The client keeps **two views** of every task:

1. **`known`**: the latest copy the server has confirmed, from `GET /board`, mutation responses and SSE events. It only moves forward in `version`.
2. **The TanStack Query cache**: what the user sees, equal to `known` plus local optimistic changes.

Every action (create / update / move / delete) does this:

1. **Mark the task as pending** (an in-flight counter per task id).
2. **Apply the change to the cache synchronously.** The UI updates instantly; a dropped card never flickers back.
3. **Send the request** through a TanStack Query mutation.
4. **On success**, store the server's response in `known`.
5. **On error**, show a toast ("Couldn't update …, your change was reverted") with a Retry button.
6. **When the last request for that task settles**, successful or not, set the cache to `known`.

Step 6 handles both success and rollback. After a failure, `known` still holds the pre-change server state **plus any changes other users made in the meantime**. So a rollback only reverts *your* change; it never wipes out someone else's edit the way restoring a whole-board snapshot would.

Other details:

- **Client-generated UUIDs for new tasks.** The optimistic card already has its real id, so there's no temporary-id swap.
- **Fractional positions.** A dropped card gets the midpoint of its new neighbours' positions (e.g. `1500` between `1000` and `2000`), so a move updates one row. Neighbours are taken from the *full* column, so tasks hidden by filters keep their order. When gaps get too small (< `1e-6`) the server renumbers the column and broadcasts the changes.
- **A `404` on update or delete** (another user deleted the task) removes it locally instead of restoring it.
- **Simulated failures** (`FAIL_RATE`) are rejected before the database is touched, so a failed request never partially applies.

## How real-time events avoid overwriting local changes

Events arrive on `GET /api/events` ([`useRealtime.ts`](Frontend/src/hooks/useRealtime.ts)) and pass through the same sync engine.

1. **Pending tasks are protected.** If a task has an in-flight request, the event only updates `known`; the cache, and so the user's optimistic state, is left alone. When the request settles, the task is reconciled to the newest server state, which then includes both our write and the other user's.
2. **Stale and duplicate events are dropped by `version`.** An event is applied only if its `version` is newer than what we already know. Out-of-order messages and echoes of our own writes are harmless.
3. **Deletes leave tombstones.** A late `task.updated` can't bring back a deleted task.
4. **Refetches don't clobber either.** When the board is refetched (first connect or `resync`), events that arrive during the request are buffered and replayed on top of the response, and pending tasks keep their optimistic copy.
5. **Missed events are replayed.** Each event has an id `<serverId>-<seq>`. On reconnect the browser sends `Last-Event-ID` and the server replays from a 1,000-event buffer. If it can't (server restarted, or the gap is too old) it sends `resync` and the client refetches the board.
6. **Each tab has its own `X-Client-Id`.** The server echoes it on events. It is used to highlight only *other users'* changes; correctness doesn't depend on it, because the version check already handles our own echoes.
7. **Editing in the drawer.** The drawer edits a local draft. When a remote update arrives:
   - fields the user hasn't touched take the new value;
   - fields the user has edited keep the local value and are flagged ("Another user changed the title while you were editing", with a *Use their version* button).

   Saving sends **only the changed fields**, so other users' edits to other fields are preserved.

These rules are covered by unit tests in [`Frontend/src/lib/sync.test.ts`](Frontend/src/lib/sync.test.ts), for example "does not overwrite an optimistic change while the mutation is in flight" and "rolls back a failed mutation to the latest server state (keeping remote changes)".

---

## Coding agents used

**Claude Code** (Anthropic) was used throughout:

- analysing the brief and choosing the tech stack and database;
- writing the unit tests and running manual API / SSE checks;
- writing this README.

Design decisions (stack, build order, features) were reviewed and directed by me.
