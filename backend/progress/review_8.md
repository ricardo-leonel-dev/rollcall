# Review — feature 8 (`notification_templates_per_action`)

**Verdict:** APPROVED

## Checkpoint walkthrough

- **1. Spec compliance (R1–R13, T1–T15)**
  - R1 table shape with `UNIQUE(user_id, action_key)` and FK to `users(id)`: verified live in the running DB via `\d user_message_templates` (constraint `user_message_templates_user_id_action_key_key` + FK `user_message_templates_user_id_fkey`).
  - R2 backfill: pre-existing `pbastidas` (id=2) row is present in `user_message_templates` with `action_key='absences'` and the original Spanish template text (preserved verbatim, since the WHERE clause trims but the INSERT copies the original column value). T14 proves this end-to-end with a fresh test user + whitespace-padded template.
  - R3 drop: `users.notification_template` is gone from `\d users`.
  - R4 `NOTIFICATION_ACTION_KEYS`: present at `src/services/user.service.ts:26`, exports `['absences', 'citations']`, placed next to `MODULE_KEYS`.
  - R5 GET 200 / empty list / scoped: T9.b (200, `[]`) + T9.c (other users' rows not returned).
  - R6 PUT create+update: T10.
  - R7 invalid actionKey → 400, no write: T11.
  - R8 missing/blank template → 400, no write: T12.a, T12.b.
  - R9 no JWT → 401: T9.a.
  - R10 userId/id ignored: T13 (row created for `a.id`, not `b.id`, even when body includes `userId: b.id, id: b.id`). Controller at `src/controllers/notification-template.controller.ts:11` passes only `req.user!.id` to the service — `req.body.userId`/`req.body.id` are never read.
  - R11 second PUT updates in place: T10 (subsequent GET returns exactly one entry).
  - R12 /auth/me no longer references notificationTemplate: T15.a (response key absent) + T15.b (body field silently ignored, persisted `users.notification_template` value unchanged).
  - R13 `UserMessageTemplate` entity with camelCase: `src/entities/UserMessageTemplate.ts` exposes `userId`/`actionKey`/`template`/`createdAt`/`updatedAt`, mapped via `@Column({ name: '...' })` to snake_case, with `@Unique(['userId', 'actionKey'])` matching the SQL constraint.
  - All 15 tasks (T1–T15) have a matching diff and a passing test.
  - Scope check: the additional `UserMessageTemplate` registration in `src/data-source.ts:21,59` is the standard step required for any new TypeORM entity (without it the repo throws `EntityMetadataNotFoundError`); the test helpers (`test-app.ts`, `test-users.ts`, `test-templates.ts`, `run.sh`) are minimal and necessary — no feature creep.

- **2. Architecture (controllers / services / entities)**
  - Controller (`src/controllers/notification-template.controller.ts`) is a 14-line router with no `AppDataSource` calls and no business logic — only `auth`-style delegation, matching `auth.controller.ts` (`GET/PUT /api/auth/me`).
  - Service (`src/services/notification-template.service.ts`) holds all logic and is a flat list of plain `async function`s (no class), consistent with every other service in the repo.
  - Entity naming follows `docs/conventions.md`: `PascalCase.ts` file, singular class name, `@Entity('user_message_templates')` mapping, camelCase TS properties over snake_case DB columns.
  - Mounted in the standard authenticated block of `src/routes/index.ts` (after `authMiddleware` + `institutionMiddleware`, alongside every other resource router).

- **3. Error handling**
  - Both 400 paths in the service use `throw Object.assign(new Error('<message>'), { status: 400 })` (`src/services/notification-template.service.ts:14,17`), matching the `MODULE_KEYS` `setModules` precedent at `src/services/user.service.ts:184`. No `res.*` calls in the service, no inline `res.status(400).json(...)` in the controller.

- **4. Security (R9, R10)**
  - 401 path: `src/middleware/auth.middleware.ts:26-28` returns `{ error: 'Token requerido' }` when `Authorization` is missing or doesn't start with `Bearer ` — this is the exact middleware mounted in front of the new route in `src/routes/index.ts:36-37` and in the test app (`tests/helpers/test-app.ts:25-27`). T9.a exercises it.
  - Row identity: the controller passes `req.user!.id` positionally to the service; the service signature is `upsert(userId: number, actionKey: unknown, template: unknown)`. `grep "req\.body\.userId\|req\.body\.id\|body\.userId\|body\.id"` against the service and controller returns zero hits — the body-supplied `userId`/`id` fields are never read at any layer.
  - T13 explicitly proves the body fields are ignored.

- **5. Migration correctness (`postgres/20_notification_templates_per_action.sql`)**
  - `SET search_path TO attendance, public;` at the top — correct.
  - `user_message_templates` table created with the right shape: `SERIAL PRIMARY KEY`, `INTEGER NOT NULL REFERENCES users(id)`, `VARCHAR(50) NOT NULL`, `TEXT NOT NULL`, `TIMESTAMPTZ DEFAULT NOW()` for both timestamps, and the `UNIQUE(user_id, action_key)` constraint.
  - Index `idx_user_message_templates_user` on `user_id` — correct.
  - Backfill `INSERT ... SELECT` with `WHERE notification_template IS NOT NULL AND trim(notification_template) <> ''` and `ON CONFLICT (user_id, action_key) DO NOTHING` — correct (R2 wording preserved verbatim, ON CONFLICT makes re-runs idempotent).
  - `ALTER TABLE users DROP COLUMN IF EXISTS notification_template` at the end — correct.
  - Migration applied to the running Postgres container; verified live via `docker compose exec postgres psql`.

- **6. Test quality**
  - `tests/helpers/test-app.ts` mounts `authMiddleware` + `institutionMiddleware` + `errorMiddleware` in the exact same order as the production `src/routes/index.ts:36-38`. The doc-string rationale (avoiding the BullMQ queue connection that fails to resolve `redis` from outside the docker network) is honest and the auth flow exercised by these tests is identical to production.
  - T14 re-adds `notification_template` at start (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) and again at end (idempotent restore). Verified re-runnable: ran `tests/run.sh` twice in a row, both runs produced `# pass 11`.
  - T9 covers 401, empty-list, and cross-user isolation — all three sub-cases present.
  - T10 covers first PUT (create) and second PUT (update in place, GET returns 1 entry).
  - T11, T12 (a/b), T13, T15 (a/b) match the spec.
  - Tests use `node:test` + `node:assert/strict` (Node 22 built-ins, zero new deps) and `bcrypt` + `jsonwebtoken` (already in `package.json`). They hit the real Postgres via a live `AppDataSource` — no mocks of the thing under test.
  - The `tests/run.sh` wrapper compiles to `/tmp/test-build/` then runs via `node --test`. This is a justified workaround given that `package.json` has no test script (`docs/verification.md` already says so) and adding `ts-node` just for tests would be over-broad; the wrapper uses only `tsc` + `node` already on disk.

- **7. Re-run verification**
  - `node_modules/.bin/tsc -p .` exits 0.
  - `DATABASE_URL=postgresql://attendance:asistencia_local_2026@localhost:5432/attendance DB_SCHEMA=attendance JWT_SECRET=… ./tests/run.sh` reports `1..11 / # tests 11 / # pass 11 / # fail 0`.
  - `./init.sh` finishes green (`[OK] Environment ready`).
  - `grep -RIn "notificationTemplate\|notification_template" src/ postgres/ tests/ progress/` matches:
    - `src/routes/index.ts:25,58` — the `notificationTemplateRouter` variable name (router import + mount). This is per the spec's `design.md` and is the standard pattern used by every other resource router in this file. Not a leftover property reference.
    - `postgres/20_notification_templates_per_action.sql` — the migration itself (backfill source + DROP COLUMN).
    - `tests/notification-templates.test.ts` — test fixtures that re-add the column for T14/T15 re-runnability and the T15.b request body used to prove the field is silently ignored.
    - `tests/helpers/test-app.ts:10,27` — the router import + mount in the test app.
    - `progress/impl_8.md` — narrative.
    - `grep "\.notificationTemplate\|notificationTemplate:"` against `src/` returns **zero** hits: no remaining `user.notificationTemplate` property access anywhere in the production code path. `grep "notification_template"` against `src/` also returns zero hits.

## Defects

None.

## Notes (non-blocking)

- The implementer's notes mention a smoke test against the running backend that produced a Spanish "Acción inválida" message via `curl` — the same message originates from the service throw at `src/services/notification-template.service.ts:14`. Confirmed consistent.
- `tests/run.sh` requires the harness runner to pass `DATABASE_URL` pointing at `localhost:5432` (not `postgres:5432`), because the test app runs on the host, not inside the docker network. The implementer's claim that they ran with this URL is consistent with the `[OK]` test pass I reproduced. This is a constraint of running tests directly outside docker, not a defect in the test code itself; the docker-compose path the backend normally uses is unaffected.
- The `notificationTemplateRouter` import in `src/routes/index.ts` matches `design.md`'s explicit snippet exactly, so the substring match of "notificationTemplate" in `src/` is intentional (a router variable name) and not a leftover property reference.