# Kanban API (server)

Node.js + TypeScript + Express + PostgreSQL (Prisma) + zod + Server-Sent Events.

## Run locally

```bash
# 1. Start Postgres (from repo root)
docker compose up -d

# 2. Install, migrate, seed (from /server)
cp .env.example .env
npm install
npm run db:migrate     # applies prisma/migrations
npm run db:seed        # sample tasks

# 3. Start the API (http://localhost:4000)
npm run dev
```

## Environment

| Var | Default | Meaning |
|---|---|---|
| `PORT` | 4000 | HTTP port |
| `CLIENT_ORIGIN` | http://localhost:5173 | Allowed CORS origins (comma-separated, `*` = any) |
| `DATABASE_URL` | – | Postgres connection string |
| `FAIL_RATE` | 0 | Probability (0..1) that an eligible request fails with 503 |
| `FAIL_METHODS` | POST,PATCH,DELETE | Methods eligible for simulated failure |
| `LATENCY_MS` | 0 | Artificial delay on every API request |

Per request, the header `X-Simulate-Failure: always | never` forces the outcome.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/board` | `{ columns, tasks }`, tasks sorted by status then position |
| POST | `/api/tasks` | Create. Optional client-generated `id` (UUID) and `position` (omit → end of column) |
| PATCH | `/api/tasks/:id` | Partial update. Optional `version` → 409 if it is stale |
| DELETE | `/api/tasks/:id` | 204. Optional `?version=` |
| GET | `/api/events` | SSE stream |
| GET | `/api/health` | Liveness + DB check |

Send `X-Client-Id: <random id per tab>` on writes; it is echoed in the event as `clientId`.

### Events (`GET /api/events`)

```
id: <serverId>-<seq>
data: {"type":"task.created"|"task.updated", "task":{...}, "clientId":"...", "eventId":"...", "ts":"..."}
data: {"type":"task.deleted", "id":"...", "version":3, "clientId":"...", ...}
```

Control messages (no `id`): `{"type":"connected"}`, and `{"type":"resync"}` = refetch the board.
On reconnect the browser sends `Last-Event-ID`; missed events are replayed from a 1000-event buffer.

### Design notes

- **Fractional positions**: a drag sends one PATCH with `position = midpoint(prev, next)`. When neighbours get closer than `1e-6`,
  the server renumbers the column and broadcasts `task.updated` for each moved task.
- **Versioning**: every write increments `version`. Updates are compare-and-swap on `(id, version)`, so concurrent writes can't
  silently clobber each other. Clients use `version` to drop stale realtime events.
- **Errors**: `{ error, message, details? }`. 400 validation, 404 not found, 409 conflict (`details.task` = current server copy),
  503 simulated failure.
