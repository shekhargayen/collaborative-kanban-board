# Collaborative Kanban Board

A real-time collaborative Kanban board. Several users can view and edit the same board at once, and changes made by others appear without a page reload.

**Stack:** React 18 + TypeScript + Vite · TanStack Query · dnd-kit · Tailwind CSS · Node.js + Express · PostgreSQL + Prisma · Server-Sent Events

## Contents

1. [How to install and run the project](#1-how-to-install-and-run-the-project)
2. [What is complete and what is not](#2-what-is-complete-and-what-is-not)
3. [How I handled optimistic updates and rollback](#3-how-i-handled-optimistic-updates-and-rollback)
4. [How I handled real-time events without overwriting local changes](#4-how-i-handled-real-time-events-without-overwriting-local-changes)
5. [Which coding agents I used](#5-which-coding-agents-i-used)
6. [Reference: tech stack, project structure, API, configuration](#reference)

---

## 1. How to install and run the project

### Prerequisites

- **Node.js 20+** (developed on Node 24)
- **Docker** to run PostgreSQL locally. Or use any PostgreSQL 14+ database and set `DATABASE_URL` yourself.

### Steps

```bash
# 1. Clone and start PostgreSQL (from the repo root)
git clone <repo-url>
cd <repo-folder>
docker compose up -d

# 2. Backend: http://localhost:4000
cd server
cp .env.example .env      # defaults point at the docker-compose database
npm install
npm run db:migrate        # create the tables
npm run db:seed           # optional: load sample tasks
npm run dev

# 3. Frontend: http://localhost:5173 (in a second terminal)
cd Frontend
npm install
npm run dev
```

Open **http://localhost:5173** in **two browser windows** side by side to see real-time collaboration.

> **npm 11+ only:** install scripts must be approved once.
> In `server/`: `npm approve-scripts prisma @prisma/client @prisma/engines esbuild && npm rebuild`
> In `Frontend/`: `npm approve-scripts esbuild && npm rebuild`

### Deploy (Vercel + any PostgreSQL)

The repo deploys as **two Vercel projects** from the same GitHub repository. The database used here is a free **Aiven PostgreSQL** service; any PostgreSQL works.

**1. Backend** (Vercel → Add New → Project → import the repo)

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Framework Preset | Other (build settings come from [`server/vercel.json`](server/vercel.json)) |
| Environment variables | `DATABASE_URL` = Postgres URI (with `?sslmode=require` for managed databases) · `CLIENT_ORIGIN` = `*` (default) or the frontend URL · `FAIL_RATE` = `0.1` |

The build runs `prisma generate && prisma migrate deploy`, so tables are created automatically. The function region should be close to the database (Settings → Functions → Region).

**2. Frontend** (another new project from the same repo)

| Setting | Value |
|---|---|
| Root Directory | `Frontend` |
| Framework Preset | Vite |
| Environment variables | `VITE_API_URL` = backend URL, e.g. `https://kanban-api.vercel.app` |

To restrict CORS, set `CLIENT_ORIGIN` on the backend to the frontend URL and redeploy. Environment variable changes only apply after a redeploy.

### Run the tests

```bash
cd Frontend
npm test
```

### Things to try

| Try this | What you should see |
|---|---|
| Drag a card in window A | It moves instantly in A, then appears in window B and briefly highlights there. |
| Keep making changes | With `FAIL_RATE=0.1` (the default in `.env.example`), about 1 in 10 writes fails on purpose. The card jumps back and a red toast offers **Retry**. |
| Search or filter, then refresh | Search text and filters are restored from the URL. |
| Open the same task in both windows, edit the title in A and save | B updates the title unless that field was being edited there; then B shows a conflict warning. |

---

## 2. What is complete and what is not

### Complete

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Board | ✅ | Fetched from `GET /api/board`, grouped into Backlog / Todo / In Progress / Done; create, edit and delete. |
| 2 | Drag and drop | ✅ | Move between columns and reorder within a column (mouse, touch and keyboard). Persisted with one `PATCH { status, position }`. |
| 3 | Search and filters | ✅ | Title search, priority filter and assignee filter (including "Unassigned"), all combined. |
| 4 | Task details | ✅ | Clicking a card opens a side drawer to edit title, description, priority, assignee and status, or delete the task. |
| 5 | Optimistic updates | ✅ | Every create, update, move and delete shows instantly; on failure it rolls back with an error toast and a **Retry** action. |
| 6 | Real-time collaboration | ✅ | SSE stream; reconnects automatically and replays missed events. |
| 7 | URL state | ✅ | `?q=&priority=&assignee=` survive a refresh. The open task (`?task=<id>`) is in the URL too. |
| – | Backend API | ✅ | All five endpoints, PostgreSQL, validation, configurable random failures (`FAIL_RATE`). |

**Extras:** live connection indicator, edit-conflict warning in the drawer, highlight on cards changed by other users, dark/light theme toggle, loading skeleton and error state, unit tests for the sync engine.

### Not complete / known limitations

- **No authentication.** Assignee is a free-text name and every visitor sees the same board.
- **Drag and drop is last-write-wins.** Moves don't send `version`, so if two people move the same card at the same moment, the later request wins. Every client still ends up showing the server's final state.
- **Filters are single-select.** One priority and one assignee at a time.
- **No end-to-end tests.** Only the sync engine and positioning logic have unit tests; the API was tested manually with curl.

---

## 3. How I handled optimistic updates and rollback

The logic is in [`Frontend/src/lib/sync.ts`](Frontend/src/lib/sync.ts) and is used by [`Frontend/src/hooks/useTaskActions.tsx`](Frontend/src/hooks/useTaskActions.tsx).

### Two views of every task

1. **`known`**: the latest copy the **server** has confirmed, from `GET /board`, mutation responses and SSE events. It only moves forward in `version`.
2. **The TanStack Query cache**: what the **user sees**, equal to `known` plus any local optimistic changes.

### What every action does (create / edit / move / delete)

1. **Mark the task as pending** (an in-flight counter per task id).
2. **Apply the change to the cache immediately, synchronously.** The UI updates at once, and a dropped card never flickers back to its old place.
3. **Send the request** through a TanStack Query mutation.
4. **On success**, store the server's response in `known`.
5. **On error**, show a toast ("Couldn't update …, your change was reverted") with a **Retry** button.
6. **When the last request for that task finishes**, successful or not, set the cache back to `known`.

Step 6 handles both success and rollback. After a failure, `known` still holds the server state from before the change, **plus any changes other users made in the meantime**. So a rollback only undoes *your* change. It never erases someone else's edit, which restoring a snapshot of the whole board would.

### Supporting details

- **Client-generated UUIDs for new tasks.** The optimistic card already has its real id, so nothing needs swapping when the server answers.
- **Fractional positions.** A dropped card gets the midpoint between its new neighbours (e.g. `1500` between `1000` and `2000`), so a move changes one row. Neighbours come from the *full* column, so tasks hidden by filters keep their order. If two positions get closer than `1e-6`, the server renumbers the column and broadcasts the changes.
- **A `404` on update or delete** means another user deleted the task, so it's removed locally instead of restored.
- **Simulated failures** (`FAIL_RATE`) are rejected before the database is touched, so a failed request never partly applies.

---

## 4. How I handled real-time events without overwriting local changes

Events arrive on `GET /api/events` ([`Frontend/src/hooks/useRealtime.ts`](Frontend/src/hooks/useRealtime.ts)) and pass through the same sync engine as the mutations.

1. **Tasks being saved are protected.** If a task has a request in flight, an incoming event only updates `known`; what the user sees is left alone. When the request finishes, the task switches to the newest server state, which includes both our change and the other user's.
2. **Old and duplicate events are ignored, using `version`.** An event is applied only if its `version` is newer than what we already know, so out-of-order messages and echoes of our own writes do nothing.
3. **Deleted tasks stay deleted.** A delete is remembered (a "tombstone"), so a late update event can't bring the task back.
4. **Refetching the board doesn't overwrite local changes.** When the whole board is reloaded (after connecting, or when the server asks for a `resync`), events that arrive during the request are buffered and re-applied on top of the response. Tasks still being saved keep their optimistic copy.
5. **Missed events are replayed after a reconnect.** Every event is stored in a `board_events` table and its `seq` is the SSE event id. On reconnect the browser sends `Last-Event-ID` and the server streams everything after it, straight from the database. If it can't (the database was reset, or events older than 24 hours were trimmed), it sends `resync` and the client reloads the board.
6. **Each browser tab has its own `X-Client-Id`.** The server includes it on the events that request caused. It's used to highlight only *other people's* changes; correctness doesn't depend on it, because the version check already handles our own echoes.
7. **Editing in the drawer.** The drawer edits a local draft. When an update from another user arrives:
   - fields you haven't touched take the new value;
   - fields you have edited keep your value and are flagged ("Another user changed the title while you were editing"), with a **Use their version** button.

   Saving sends **only the fields you changed**, so other users' edits to other fields are kept.

### How the server delivers events (works on serverless)

On Vercel the API runs as many short-lived function instances, so events can't live in one server's memory. Instead:

1. **Each write records its events in the same database transaction.** An event exists if and only if the change was saved. A board-wide Postgres advisory lock makes writes commit one at a time, so event numbers (`seq`) appear in order and a reader never skips one.
2. **Postgres `NOTIFY` wakes every instance.** Each instance that has users connected keeps one `LISTEN` connection, and every open stream on it immediately fetches the events after its own cursor. If `LISTEN` is unavailable, streams check for new events every 2 seconds instead.
3. **Streams end on purpose before Vercel's time limit** (`SSE_MAX_MS`, 55 s on Vercel). The browser reconnects within a second with `Last-Event-ID` and continues where it left off.

Tested locally with two server instances: a change saved on one reached a user connected to the other in about 60 ms, and 40 simultaneous writes split across both instances arrived in order with no gaps or duplicates.

These rules are covered by unit tests in [`Frontend/src/lib/sync.test.ts`](Frontend/src/lib/sync.test.ts), for example *"does not overwrite an optimistic change while the mutation is in flight"* and *"rolls back a failed mutation to the latest server state (keeping remote changes)"*.

---

## 5. Which coding agents I used

**Claude Code** (Anthropic) was used throughout:

- analysing the brief and choosing the tech stack and database;
- writing the unit tests and running manual API / SSE checks;
- writing this README.

Design decisions (stack, build order, features) were reviewed and directed by me.

---

## Reference

### Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Server state / optimistic updates | TanStack Query v5 |
| Drag and drop | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| URL state | React Router (`useSearchParams`) |
| Styling / UI | Tailwind CSS v4, Radix UI Dialog (drawer + modal), sonner (toasts) |
| Backend | Node.js, TypeScript, Express 5 |
| Database | PostgreSQL via Prisma |
| Validation | zod |
| Real-time | Server-Sent Events (`GET /api/events`) + native `EventSource` |

### Project structure

```
.
├── docker-compose.yml        # local PostgreSQL
├── server/                   # Express API
│   ├── api/index.ts          # Vercel serverless entry point
│   ├── prisma/               # schema, migrations, seed
│   └── src/
│       ├── routes/           # board, tasks, events
│       ├── services/         # all DB logic (taskService.ts)
│       ├── realtime/         # event log, LISTEN/NOTIFY, SSE stream
│       └── middleware/       # failure simulation, latency, errors, client id
└── Frontend/                 # React app
    └── src/
        ├── lib/sync.ts       # optimistic update + real-time reconciliation
        ├── hooks/            # useBoard, useRealtime, useTaskActions, useUrlState, useTheme
        └── components/       # Board, TaskCard, TaskDrawer, CreateTaskDialog, Toolbar, ...
```

### API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/board` | `{ columns, tasks }`; tasks sorted by column, then position |
| `POST` | `/api/tasks` | Create a task. Accepts an optional client-generated `id` (UUID) and `position`. |
| `PATCH` | `/api/tasks/:id` | Partial update (title, description, priority, assignee, status, position). Optional `version` → `409` if stale. |
| `DELETE` | `/api/tasks/:id` | Delete → `204` |
| `GET` | `/api/events` | SSE stream of `task.created`, `task.updated`, `task.deleted` |

Besides the fields in the brief, every task has a server-managed **`version`** that goes up on each write. Writes are compare-and-swap on `(id, version)` inside a transaction. Errors use the shape `{ error, message, details? }`: `400` validation, `404` not found, `409` conflict, `503` simulated failure.

### Environment variables

**`server/.env`**

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | – | PostgreSQL connection string |
| `PORT` | `4000` | API port |
| `CLIENT_ORIGIN` | `*` | Allowed CORS origins, comma-separated. `*` = any (safe: the API uses no cookies); wildcards like `https://*.vercel.app` work |
| `FAIL_RATE` | `0` (`.env.example`: `0.1`) | Probability (0–1) that a write fails with `503`, to test rollback |
| `FAIL_METHODS` | `POST,PATCH,DELETE` | HTTP methods that may fail |
| `LATENCY_MS` | `0` (`.env.example`: `300`) | Artificial delay per request, so optimistic UI is visible |
| `SSE_MAX_MS` | `0` (`55000` on Vercel) | End each event stream after this many ms; the browser reconnects without losing events |
| `EVENT_POLL_MS` | `2000` | Fallback check for new events if Postgres `LISTEN` is unavailable |
| `DB_POOL_SIZE` | `5` | Max database connections per server instance |
| `DATABASE_CA_CERT` | – | Optional PEM certificate to verify the database's TLS certificate |

A single request can force the outcome with the header `X-Simulate-Failure: always` or `X-Simulate-Failure: never`.

**`Frontend/.env`** (optional)

| Variable | Description |
|---|---|
| `VITE_API_URL` | API base URL. Leave empty locally (Vite proxies `/api` to port 4000); set it to the backend URL in production. |

### Scripts

| Where | Command | What it does |
|---|---|---|
| server | `npm run dev` / `build` / `start` | Dev server (watch) / compile / run compiled build |
| server | `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations / load sample data / reset the database |
| Frontend | `npm run dev` / `build` / `preview` | Dev server / production build / serve the build |
| Frontend | `npm test` | Unit tests (Vitest) |
