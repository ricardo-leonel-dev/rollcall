# Architecture — What does "doing a good job" mean here?

> This document defines the quality bar for this project. The reviewer agent
> evaluates code against this file. If it's not here, it's not a requirement.

## Principles

1. **Layers.** `src/` has four layers plus one cross-cutting concern:
   - `routes/index.ts` — the mount point for every resource router. Applies
     `authMiddleware` (JWT) then `institutionMiddleware` (resolves
     `req.institutionId` / `req.courseIds`) to every route except `/auth` and
     `/health`, then mounts each domain router under `/api/<resource>`. One
     documented exception: the Bull Board queue dashboard
     (`GET /api/admin/queues`, `POST /api/admin/queues-session`) is mounted
     directly in `app.ts`, not through this file — it uses its own cookie/JWT
     auth (`bullBoardCookieAuth` in `controllers/bull-board.ts`) instead of
     the standard `authMiddleware` + `institutionMiddleware` pair, since it's
     a superadmin-only dashboard, not a tenant-scoped resource.
   - `controllers/*.controller.ts` — thin Express `Router`s. Each route
     handler is a one-liner: check permission
     (`requirePermission(resource, action)`), call the matching `services/`
     function, send the result. No business logic here.
   - `services/*.service.ts` — all business logic. Not classes — a module of
     exported `async function`s (`findAll`, `findById`, `create`, `update`,
     `remove`, ...) operating on a lazily-obtained TypeORM repo
     (`const repo = () => AppDataSource.getRepository(X)`), a `QueryBuilder`,
     or a raw `AppDataSource.query(...)` call.
   - `entities/*.ts` — TypeORM `@Entity` classes, one per DB table. DB
     columns are `snake_case` (`@Column({ name: 'id_number' })`), TS
     properties are `camelCase`.
   - Cross-cutting: `middleware/` (auth, institution-scoping, permission
     checks, error mapping — see below), `queues/` + `workers/` (BullMQ
     background jobs), `data-source.ts` (the single `AppDataSource`).
   Don't put business logic in a controller, and don't add a new top-level
   `src/` folder without updating this file first. (Known drift, not a
   sanctioned exception: `controllers/jobs.controller.ts`'s `GET
   /voice-logs` and `PATCH /:jobId/confirm` build filter clauses and call
   `AppDataSource.query()` directly instead of delegating to a
   `services/*.service.ts` function. Don't copy that shape into a new
   controller — extract to a service when touching this file.)
2. **Dependencies.** Express 5, TypeORM 0.3 (Postgres), BullMQ + `ioredis`
   for background jobs, `jsonwebtoken` + `bcrypt` for auth, `multer` for
   uploads, `xlsx` (only in `import.service.ts`, for reading uploaded nómina
   spreadsheets — **not** for generating reports; that's `excel-service`'s
   job, called over HTTP). `class-validator`/`class-transformer` are in
   `package.json` but currently unused in `src/` — don't assume they're
   wired into request validation; there isn't a validation-decorator layer
   today. In production the built app runs under `pm2-runtime ... -i max`
   (Node cluster mode, one process per CPU core).
3. **Error handling.** Centralized in `middleware/error.middleware.ts`.
   Throw errors, don't handle-and-respond inline in a service: the
   established pattern (52 call sites) is
   `throw Object.assign(new Error('Student not found'), { status: 404 })`.
   `errorMiddleware` also auto-maps raw Postgres errors it recognizes by
   message (`duplicate key`/`unique` → 409, `violates foreign key` → 409) —
   don't catch and re-wrap those yourself, let them propagate. Any `Error`
   without a `status` becomes a 500.
4. **State/mutability.** Per-request tenant context (`req.user`,
   `req.institutionId`, `req.courseIds`) is attached by middleware (typed via
   the `Express.Request` augmentation in `auth.middleware.ts`) and read by
   every downstream service call — every service function that touches
   tenant data takes `institutionId`/`courseIds` as explicit parameters (see
   `student.service.ts`), never re-derives them. Rows are **never hard
   deleted**: the convention (12 services) is a `deletedAt: Date | null` +
   `isActive: boolean` pair, set together on delete, filtered with
   `deletedAt IS NULL` / `IsNull()` on every read.

## Data Flow

```
Express route (controllers/*.controller.ts — thin, permission check only)
  -> authMiddleware (verifies JWT, sets req.user)
  -> institutionMiddleware (resolves req.institutionId + req.courseIds;
     superadmin picks institution via X-Institution-Id header, everyone
     else is pinned to their own)
  -> services/*.service.ts (business logic, institutionId/courseIds passed
     explicitly)
  -> TypeORM repo/QueryBuilder or raw AppDataSource.query()
     (schema-qualified via DB_SCHEMA, see data-source.ts's search_path note)
  -> Postgres
  -> errorMiddleware maps any thrown error to an HTTP status
```

Background jobs (voice/photo absence parsing) follow a second path: a
controller enqueues a job onto a BullMQ `Queue` (`queues/*.queue.ts`) backed
by Redis; a `Worker` (`workers/*.worker.ts`, started once per process inside
`bootstrap()` in `app.ts` — so each `pm2` cluster instance runs its own copy
and BullMQ arbitrates which one picks up each job) processes it
asynchronously and writes the result back via a raw insert.

Excel report generation does **not** happen in this service: `export.service.ts`
makes an HTTP call to `excel-service` (`EXCEL_SERVICE_URL`, defaults to
`http://excel-service:8002`) and streams its response back to the client.

## Running the App

- **Development:** `docker compose up --build` from the repo root
  (`ai-personal/`) — the whole stack (postgres, redis, excel-service,
  backend, frontend) runs in Docker. `docker-compose.override.yml` is picked
  up automatically; for this service it sets `NODE_ENV=development` (enables
  TypeORM query logging, see `data-source.ts`) and mounts `./backend/src`
  read-only. The container still runs the compiled `dist/app.js` via
  `pm2-runtime` either way — there is no separate `ts-node-dev` container
  path today even though `package.json` has a `dev` script for running it
  locally outside Docker.
- **Production:** same `Dockerfile`/`docker-compose.yml`, without the
  override — `pm2-runtime dist/app.js -i max` in its own container, **not**
  behind nginx (only the frontend is; see the frontend project's
  `docs/architecture.md`). Reachable on host port `3000`
  (`GET /api/health` is the Docker healthcheck), and from other containers
  on the `ai-stack` network by service name (`backend`, `excel-service`,
  `postgres`, `redis`).

## What NOT to do

- Don't put query/business logic in a controller — controllers only check
  permissions and delegate to `services/`.
- Don't hard-delete a row — always the `deletedAt` + `isActive` pair, and
  filter reads with `deletedAt IS NULL`.
- Don't bypass `institutionMiddleware`'s scoping — every service function
  touching tenant data must take and apply `institutionId`/`courseIds`
  explicitly, not re-derive them or trust a client-supplied value.
- Don't generate `.xlsx` output here — that's `excel-service`'s
  responsibility; call it over HTTP instead (see `export.service.ts`).
- Don't `res.status(...).json(...)` an error directly in a service function
  — `throw Object.assign(new Error(...), { status })` and let
  `errorMiddleware` handle the response.
- Don't add class-based services — this codebase's services are function
  modules, not classes with injected dependencies.
