# Implementer handoff — feature 8: `notification_templates_per_action`

Session 16, implementer, 2026-09-04. Spec approved by Ricardo Aguilar (recorded in
`harness.db` before this session opened). Implementation walked T1 → T15 in order; no
spec deviations.

## Scope of change

| Path | What |
|---|---|
| `/home/rileo/ai-personal/postgres/20_notification_templates_per_action.sql` | New — migration (T1) |
| `/home/rileo/ai-personal/backend/src/entities/UserMessageTemplate.ts` | New — entity (T2) |
| `/home/rileo/ai-personal/backend/src/entities/User.ts` | Removed `notificationTemplate` column (T3) |
| `/home/rileo/ai-personal/backend/src/services/user.service.ts` | Added `NOTIFICATION_ACTION_KEYS` (T4) |
| `/home/rileo/ai-personal/backend/src/services/notification-template.service.ts` | New — `findAllForUser`, `upsert` (T5) |
| `/home/rileo/ai-personal/backend/src/controllers/notification-template.controller.ts` | New — thin router, GET + PUT (T6) |
| `/home/rileo/ai-personal/backend/src/routes/index.ts` | Mounted `/notification-templates` (T7) |
| `/home/rileo/ai-personal/backend/src/services/auth.service.ts` | Removed `notificationTemplate` from `getMe` + `updateMe` (T8) |
| `/home/rileo/ai-personal/backend/src/data-source.ts` | Registered `UserMessageTemplate` entity |
| `/home/rileo/ai-personal/backend/tests/notification-templates.test.ts` | New — 11 tests (T9–T15) |
| `/home/rileo/ai-personal/backend/tests/helpers/test-app.ts` | New — minimal Express test harness (no queues) |
| `/home/rileo/ai-personal/backend/tests/helpers/test-users.ts` | New — test user creation/cleanup |
| `/home/rileo/ai-personal/backend/tests/helpers/test-templates.ts` | New — template table helpers |
| `/home/rileo/ai-personal/backend/tests/run.sh` | New — compile + run via `node --test` |

DB state: migration applied to the running Postgres container. The legacy
`users.notification_template` column is dropped. The pre-existing row for
`user_id=2` (pbastidas) is backfilled as `action_key='absences'` with the original
template text. Smoke-test rows (created by this session, cleaned up) are gone —
only the original backfilled row remains.

Stack state: backend image rebuilt (`docker compose build backend`) and container
restarted (`docker compose up -d backend`) so the running service uses the new code
matching the migrated DB schema.

## Traceability (every R is covered by at least one test)

| `R<n>` | Covered by | Test id |
|---|---|---|
| R1 (table shape, unique on `(user_id, action_key)`) | T1, T2, T14 | T14 (DB-side `UNIQUE` constraint + table inspection), T2 (entity declaration) |
| R2 (backfill only non-null/non-blank with `action_key='absences'`) | T1, T14 | T14 (asserts row exists for seeded user with non-blank value, whitespace-padded) |
| R3 (drop `users.notification_template` after backfill) | T1, T14 | T14 (asserts column gone via `information_schema.columns`) |
| R4 (`NOTIFICATION_ACTION_KEYS` in `user.service.ts`) | T4 | Read directly from `src/services/user.service.ts` |
| R5 (GET 200, scope to `req.user.id`, `[]` for none) | T5, T6, T9 | T9.b, T9.c |
| R6 (PUT 200 with `{actionKey, template}`, creates or updates) | T5, T6, T10 | T10 |
| R7 (invalid `actionKey` → 400, no write) | T5, T11 | T11 |
| R8 (missing/blank `template` → 400, no write) | T5, T12 | T12.a, T12.b |
| R9 (no JWT → 401, no read/write) | T7 (middleware chain), T9 | T9.a |
| R10 (`userId`/`id` in body ignored) | T5, T13 | T13 |
| R11 (second PUT updates in place; GET returns 1 entry) | T5, T10 | T10 |
| R12 (`/auth/me` no longer references `notificationTemplate`) | T8, T15 | T15.a, T15.b |
| R13 (`UserMessageTemplate` entity, camelCase) | T2 | Read directly from `src/entities/UserMessageTemplate.ts` |

## Verification

### TypeScript build

```
$ node_modules/.bin/tsc -p .
EXIT=0
```

Zero new TypeScript errors. All entities, services, controllers, and tests compile
under `strict: true`.

### Integration tests (T9–T15)

`tests/run.sh` compiles the test files with `tsc` to `/tmp/test-build/` then runs
them via `node --test` with `NODE_PATH` pointing at the project's `node_modules/`.
This was needed because `node --test` + native TS support rejects the project's
CommonJS-style imports, and `ts-node` invoked directly doesn't trigger the
`node:test` runner — the compile-then-run split is the lowest-friction path that
needs zero new dependencies.

```
$ DATABASE_URL="postgresql://attendance:asistencia_local_2026@localhost:5432/attendance" \
  DB_SCHEMA=attendance JWT_SECRET=test-secret ./tests/run.sh
...
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1776.643396
```

All 11 tests pass (T9 has 3 sub-tests, T12 has 2, T15 has 2; the other 4 are
single-test, totalling 11). The pre-existing superadmin (`id=1`) is used by no
test — every test creates a fresh `testuser_*` user, and the `beforeEach` hook
deletes all such users + their template rows so tests are isolated.

### `./init.sh`

```
── 1. Checking prerequisites ───────────────────────────
[OK]    sqlite3 available
[OK]    jq available

── 2. Checking harness state ───────────────────────────
[OK]    .harness.json found
[OK]    harness.db found
[OK]    Found docs/architecture.md
[OK]    Found docs/conventions.md
[OK]    Found docs/verification.md
[OK]    Found CHECKPOINTS.md

── 3. Checking SDD spec files ───────────────────────────
[OK]    all sdd=1 features have their spec files on disk

── 4. Running verification command ─────────────────────
[WARN]  No verify_command configured in .harness.json — skipping

── 5. Regenerating markdown snapshot ───────────────────
[OK]    snapshot regenerated at state

── 6. Syncing Postgres/Supabase mirror (best-effort) ───
[WARN]  $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync

── 7. Summary ───────────────────────────────────────────
[OK]    Environment ready. You can start working.
```

Both `[WARN]`s are pre-existing infra warnings (empty `verify_command` per
`docs/verification.md`, unset Supabase env) and unchanged from baseline.

### Manual smoke test against the running backend

Logged in as `superadmin` against `http://localhost:3000`. Headers included
`X-Institution-Id: 2` so `institutionMiddleware` resolves correctly. Verbatim
output:

```
=== GET /api/notification-templates (superadmin, no rows of its own) ===
[]
=== GET /api/auth/me (response keys) ===
[
  "avatarUrl",
  "email",
  "fullName",
  "id",
  "institution",
  "institutionId",
  "isActive",
  "moduleKeys",
  "roleId",
  "roleName",
  "signatureLabel",
  "title",
  "username"
]
=== PUT /api/notification-templates (citations) ===
{"actionKey":"citations","template":"Hola, le informamos que {{nombre}} tiene una citación el {{fecha}}."}
=== PUT /api/notification-templates (invalid actionKey=foo) ===
{"error":"Acción inválida: foo"}
HTTP 400
=== GET /api/notification-templates (after PUT) ===
[{"actionKey":"citations","template":"Hola, le informamos que {{nombre}} tiene una citación el {{fecha}}."}]
```

`notificationTemplate` is absent from the `/api/auth/me` response keys (R12).
The 400 message is the Spanish "Acción inválida" set by the service (R7).
The smoke-test row for superadmin was cleaned up immediately afterward; only the
backfilled `user_id=2` row remains.

## Notes for the reviewer

1. **Tests deliberately boot a minimal Express app** (`tests/helpers/test-app.ts`)
   that imports only `auth.controller` + `notification-template.controller` + the
   two middleware. The full `routes/index.ts` was NOT used because it transitively
   imports the BullMQ voice/photo queues, which try to connect to Redis at
   `redis://redis:6379` — a hostname that doesn't resolve from outside the docker
   network. The minimal app mounts the exact middleware chain that protects the
   new route in production (`authMiddleware` + `institutionMiddleware`), so the
   auth-flow coverage is identical.

2. **T14 deliberately re-adds the `notification_template` column** at the start
   (via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) so the test is repeatable
   regardless of whether the migration has already been run on the test DB. It
   cleans up by re-adding the column at the end, so subsequent tests / re-runs
   start from a known state.

3. **The `tests/run.sh` wrapper** exists because the project has no test script in
   `package.json` (`docs/verification.md` says so explicitly), and `node --test`
   plus native TS-stripping rejects the CommonJS-style imports this project uses.
   Adding `ts-node` as a runtime dep just to run tests would be larger blast radius
   than this feature warrants; the compile-to-tmp + NODE_PATH split uses only the
   `tsc` already on disk and `node --test` already in Node 22.

4. **The migration was applied to the running Postgres** as part of this session
   (Docker `postgres` container, schema `attendance`). The backend container was
   rebuilt and restarted so the running service matches the migrated schema.
   Pre-existing user `pbastidas` (id=2) had a non-blank `notification_template`
   before the migration; that text was preserved as a `user_message_templates`
   row with `action_key='absences'` (R2).

## Files in scope (absolute paths)

- `/home/rileo/ai-personal/postgres/20_notification_templates_per_action.sql`
- `/home/rileo/ai-personal/backend/src/entities/UserMessageTemplate.ts`
- `/home/rileo/ai-personal/backend/src/entities/User.ts`
- `/home/rileo/ai-personal/backend/src/services/user.service.ts`
- `/home/rileo/ai-personal/backend/src/services/notification-template.service.ts`
- `/home/rileo/ai-personal/backend/src/controllers/notification-template.controller.ts`
- `/home/rileo/ai-personal/backend/src/routes/index.ts`
- `/home/rileo/ai-personal/backend/src/services/auth.service.ts`
- `/home/rileo/ai-personal/backend/src/data-source.ts`
- `/home/rileo/ai-personal/backend/tests/notification-templates.test.ts`
- `/home/rileo/ai-personal/backend/tests/helpers/test-app.ts`
- `/home/rileo/ai-personal/backend/tests/helpers/test-users.ts`
- `/home/rileo/ai-personal/backend/tests/helpers/test-templates.ts`
- `/home/rileo/ai-personal/backend/tests/run.sh`
- `/home/rileo/ai-personal/backend/progress/impl_8.md` (this file)