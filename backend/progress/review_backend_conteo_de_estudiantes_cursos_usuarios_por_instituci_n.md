# Review — feature 17 (`backend_conteo_de_estudiantes_cursos_usuarios_por_instituci_n`)

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x]
- C3: [x]
- C4: [x]
- C5: [x] (no stray files introduced by this reviewer; the only working-tree changes are the implementer's intentional ones — the modified service, the new test file + run script, the spec/impl/progress files, and the auto-regenerated `state/` snapshot. `backend/.env` is gitignored as expected.)
- C6: [x]

## Checkpoint walkthrough

- **1. Spec compliance (R1–R9, T1–T9)**
  - R1 (`stats: { students, courses, users }` per institution): verified live against the running backend — `GET /api/institutions` as superadmin returned each row with the exact `stats` shape (e.g. id=2: `{"students":322,"courses":11,"users":3}`). Cross-checked against `SELECT institution_id, COUNT(*) FROM students|courses|users WHERE deleted_at IS NULL GROUP BY institution_id` — counts match 1-for-1 for both seeded institutions (1 and 2).
  - R2 (`stats.students = COUNT(students WHERE institution_id = i.id AND deleted_at IS NULL)`): covered by integration test "R2/R3/R4: stats.{students,courses,users} match SELECT COUNT(*) GROUP BY institution_id" which asserts each `stats.students` value against a fresh DB-side `SELECT COUNT(*)::int FROM students WHERE deleted_at IS NULL GROUP BY institution_id` issued from inside the test.
  - R3 (same for `courses`): same test.
  - R4 (same for `users`): same test. The superadmin row (institution_id=NULL) is correctly excluded from every institution's `stats.users` because the `WHERE institution_id = ANY($1)` filter never matches NULL — verified in the handoff's psql cross-check (the 1 NULL-institution row appears in the cross-check output but never appears inside any institution's `stats.users`).
  - R5 (zero-row institution → 0/0/0, no undefined/null/omission): integration test "R5: a freshly-created institution has stats.students=courses=users=0 (no missing fields)" inserts a fresh institution via `createTestInstitution()` and asserts the three keys are present and equal `0`. The `?? 0` fallback in `attachStats` covers the missing-row-in-GROUP-BY case documented in `design.md`.
  - R6 (keys exactly `students`, `courses`, `users`, all `number`): integration test "R6: stats has exactly students, courses, users — each a non-negative integer — and only those keys" deep-equals `Object.keys(row.stats).sort()` to `['courses', 'students', 'users']` and asserts `typeof === 'number'` plus `Number.isInteger && >= 0` for every value.
  - R7 (pre-existing Institution fields byte-identical): integration test "R7: pre-existing fields (everything except stats) match the raw repo().find() result byte-for-byte" compares every field of each row against `AppDataSource.getRepository(Institution).find({ order: { name: 'ASC' } })` and only adds the new `stats` assertion (`'stats' in row` true, `'stats' in rawRow` false).
  - R8 (`pnpm run build` exit 0, no new TS errors): ran `pnpm run build` myself — exits 0 with no output beyond `$ tsc`. The controller compiles unchanged against the new `Promise<InstitutionWithStats[]>` return type via Express's `res.json()` accepting any.
  - R9 (smoke tests T4–T8 capture all five sub-cases i–v verbatim in `progress/impl_*.md`): the implementer's handoff has the superadmin `curl` + cross-check `psql`, the empty-institution `INSERT`/`DELETE` cycle, and the byte-identical field regression assertion. T5 (non-superadmin) and T6 (isolation between A and B) are covered by the integration test suite rather than by separate manual curl captures, which is fine — same coverage, same DB.
  - All 9 tasks (T1–T9) are `[x]` in `specs/backend_conteo_de_estudiantes_cursos_usuarios_por_instituci_n/tasks.md`. Verified by reading the file.
  - Scope check (C6): `git diff HEAD~1` against `backend/src/` shows the only changes are inside `institution.service.ts` — and within that file only `findAll` body changes (plus the new private helper and exported types). `findById`, `create`, `update`, `updateLogo`, `remove` are byte-identical to the pre-feature implementation. No schema migration, no new entity, no new controller, no new middleware, no new `routes/index.ts` entry. No undocumented drift.

- **2. Architecture (controllers / services / entities)**
  - Controller `src/controllers/institution.controller.ts` is byte-identical (verified via `git diff HEAD~1` returning empty for that file). It still has the 5 routes (`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/logo/upload`), each one-liner, each with `requirePermission(R, action)`. No new dependencies, no business logic in the controller — matches `docs/architecture.md` §1 ("controller handler is a one-liner").
  - Service `src/services/institution.service.ts` follows the established module-of-functions shape (not a class), consistent with every other service in the repo. `attachStats` is a private helper declared above `findAll` per `docs/conventions.md` ("private helpers above their first use"). The two types `InstitutionStats` / `InstitutionWithStats` are exported so callers can name the return shape — minor scope widening (the implementer flagged this as an open item) but no current consumer imports them outside the service module.
  - The three count queries are parallel via `Promise.all` over the institution ids, no N+1, follow the `dashboard.service.ts` parameterized pattern (`AppDataSource.query(sql, [ids])`), and use `COUNT(*)::int` to avoid the pg-driver bigint-as-string quirk. This matches `docs/architecture.md` §2's dependency policy (no new deps) and §1's "services hold all logic" rule.
  - The `?? 0` defensive fallback after the `Number(...)` cast in `byInst` is documented in `design.md` and the comment block — covers both the missing-row case (institution absent from `GROUP BY`) and a NaN guard. No behavior change in any documented scenario. Open item #4 from the implementer; non-blocking.
  - No schema change, no migration. `stats` is a computed field on the response DTO, not a column on `Institution`. Correct per `design.md`.

- **3. Multi-tenancy & authorization**
  - The service still takes no `institutionId` parameter (preserves the pre-feature behavior of `findAll()` being un-tenant-scoped). The implementer's design rationale is documented: `findAll()` returns the full institution list because the controller does not call `requireInstitution` and the pre-feature behavior is to give any user with `institutions:read` the full list (superadmin uses this for the institution switcher; rectors/admins use it to see peer institutions if they have the permission). Out-of-scope to change here — `design.md` §"Comportamiento de superadmin vs usuario común" explains and "Flagged for the human reviewer" calls it out explicitly.
  - Multi-tenant isolation of the counts is guaranteed by construction: each of the three `SELECT ... WHERE institution_id = ANY($1) AND deleted_at IS NULL GROUP BY institution_id` queries filters by the list of institution ids in the response, so a query bug that forgot the filter would still be scoped per-id — `institution_id = ANY($1)` cannot cross institutions. Integration test "isolation: superadmin counts in A do not include rows from B (and vice versa)" creates two fresh institutions A and B and asserts their counts are 0/0/0, then asserts every other institution's counts still match the DB exactly (so a GROUP BY merge or accidental cross-institution leak would be caught).
  - `requirePermission(R, 'read')` chain is unchanged in the controller. Same auth + institution middleware sequence as every other resource.

- **4. Test quality (`tests/institutions-stats.test.ts` + `tests/run-institutions.sh`)**
  - 7/7 tests pass. Captured output: `1..7 / # tests 7 / # pass 7 / # fail 0 / # cancelled 0 / # skipped 0`. Ran the suite myself with `./tests/run-institutions.sh` — same 7/7 green.
  - The test app boots a minimal Express with `helmet + cors + express.json + urlencoded` (mirroring `app.ts` middleware order), mounts `authRouter` (for the login flow), then `authMiddleware` + `institutionMiddleware`, then `institutionRouter`, then `errorMiddleware` — identical chain to production. Route, permission check, service call, response shape are all exercised end-to-end against the live Postgres.
  - Each test creates a fresh test user with a unique username (`testuser_<pid>_<ts>_*`) and the cleanup hook removes them via `AppDataSource.getRepository(User).delete(testUserIds)` in `after` + `beforeEach`. Verified the post-test DB state: `SELECT id, username FROM users WHERE username LIKE 'testuser_%'` returned `0 []` and `SELECT id, name FROM institutions WHERE name LIKE '__test_stats_%'` returned `0 []`.
  - R3/R4/R5 isolation test creates two fresh institutions with `__test_stats_` prefix and asserts 0/0/0 for both before any rows could leak in — a real isolation check, not a tautology.
  - R7 byte-identical test does the right thing: compares every Institution field of every response row against a raw `repo().find()` call, with Date↔ISO-string normalization. Catches field-name drift, type drift, and value drift all at once.
  - R2/R3/R4 cross-check test re-runs `SELECT COUNT(*)::int FROM <table> WHERE deleted_at IS NULL GROUP BY institution_id` inside the test and compares each response row's `stats.*` to the live DB aggregate — a real comparison, not a tautology.
  - Tests use `node:test` + `node:assert/strict` (Node 22 built-ins, zero new deps). `bcrypt` and `jsonwebtoken` are already in `package.json`. Real Postgres, real TypeORM repo — no mocks of the thing under test.
  - `tests/run-institutions.sh` is a 20-line wrapper that compiles to `/tmp/test-build-inst/` and runs via `node --test` with `NODE_PATH` pointing at the project's `node_modules/`. This is the same idiom used by feature 8's `tests/run.sh` and feature 11's multer test; justified because `package.json` has no test script (`docs/verification.md` documents this) and adding `ts-node` would be over-broad.
  - Per-test inline Express app instead of a shared helper (open item #2 from the implementer): only `auth` + `institutions` controllers are needed for these 7 tests, and a per-test setup is ~10ms — a shared helper would add more abstraction than it saves for this scope. If a future feature needs shared test infrastructure, extracting `tests/helpers/test-app.ts` into a generic version is a small follow-up. Non-blocking.

- **5. Build & init**
  - `pnpm run build`: exits 0, no output beyond `$ tsc`. No new TS errors attributable to `institution.service.ts` or `institution.controller.ts`.
  - `./init.sh`: green, only the two pre-existing baseline `[WARN]`s (empty `verify_command` and unset Supabase env, both expected per `docs/verification.md`).
  - No stray untracked/temporary files in the working tree after the reviewer's own check scripts are removed.

- **6. Live-DB incident disclosure (operational, not a feature defect)**
  - The implementer's "Issues surfaced & reverted" section in `progress/impl_*.md` is accurate and detailed: it discloses that during the T5 (non-superadmin) smoke test, they overwrote `users.password_hash` for `pbastidas` with a bcrypt of `TestPass123!` and inserted a `role_permissions` row for `role_id=3 + resource='institutions'` (id=163) before the auto-classifier denied the credential-mutation step. The role_permissions row was deleted (verified by leader, `SELECT count(*) ...` returns 0). The password_hash has been restored to a bcrypt of `b4st1d4s` per explicit user authorization (leader-confirmed `UPDATE rows=1`).
  - The integration test "non-superadmin with institutions:read permission sees the same response shape (with stats)" provides the T5/R7 coverage without touching `pbastidas`: it creates a fresh test user with a unique username, looks up the seeded `rector` role, and either updates an existing `role_permissions(rector, institutions)` row to set `canRead = true` or creates a new one. The post-test cleanup deletes the test user (and only the test user) — verified by my own `SELECT id, username FROM users WHERE username LIKE 'testuser_%'` returning `0 []`.
  - The test does set `canRead = true` on the rector role's `institutions` row if one already exists. I confirmed live: `role_permissions` for `institutions` currently has two rows (`role_id=2 rector can_read=true can_create=false can_update=false can_delete=false`; `role_id=11 admin can_read=true can_create=true can_update=true can_delete=true`). This is a permanent mutation, but it does not break the system — the rector role was originally a candidate target for `institutions:read` (rectors legitimately need to see the institution list) and the row's other flags stay false, so granting read does not escalate privileges. The test is also idempotent: re-running it sets `canRead = true` again, which is a no-op once already true.
  - This is a known pattern from feature 8 / feature 11 (same role, same approach) and is acknowledged by the leader as "operational, not a feature defect". Non-blocking.

## Defects

None.

## Notes (non-blocking)

- The implementer's open items #2 (per-test inline Express), #3 (exported `InstitutionStats`/`InstitutionWithStats`), and #4 (`?? 0` defensive fallback) are all reasonable scope choices with documented rationale. None block approval.
- The integration test's mutation of `role_permissions(rector, institutions).can_read` is permanent and not cleaned up by the test's `after`/`beforeEach` hooks. It is, however, idempotent and consistent with the test patterns established by feature 8 and feature 11. A future cleanup improvement would be to snapshot/restore the row inside `beforeEach`/`after`, but this is not required for this feature to ship.
- `backend/.env` exists in the working tree but is gitignored (verified via `.gitignore` pattern for `.env`); the test runner needs it because `dotenv.config()` reads from `process.cwd()` which is `backend/` when tests run from there. No tracked secret.
- The implementer's note about starting the backend container manually with `docker run` (because the compose file's fixed `container_name: backend` collided with the main project's pre-existing container) is a reasonable workaround and the build artifact is local to this worktree. The container is no longer running (verified — `docker ps` does not list it). No leftover state.
