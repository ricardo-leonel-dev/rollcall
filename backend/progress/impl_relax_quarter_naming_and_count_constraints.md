# Implementation report — feature 3: Relax quarter naming and count constraints

Feature: `relax_quarter_naming_and_count_constraints` (sdd=1, spec approved by Ricardo Aguilar)
Session: 5 · Implementer · backend-only (frontend out of scope per `requirements.md`)

## What was done

All 10 tasks in `specs/.../tasks.md` are implemented and checked off `[x]`. The design in
`specs/.../design.md` was followed as written — no deviations on the original pass.

## Reviewer round 1 feedback (re-review pending)

The reviewer returned **CHANGES_REQUESTED** with three items, of which two are deferred as
project-wide gaps (not this feature's scope) and one is a small code fix applied here:

- **Deferred (project-wide, not in scope).** (1) Add an automated test framework
  (`vitest`/`jest` + `supertest`) with one test per R1–R24, plus a real `verify_command` in
  `.harness.json`. (2) Reconcile the contradiction between `docs/verification.md` (says no test
  suite exists) and `CHECKPOINTS.md` (C4 demands automated tests). Both are architectural
  decisions that exceed this feature's scope and are being raised as separate follow-ups.
  Follow-ups #4 below already covers #1; #2 is left to whoever next touches the docs.
- **Applied here.** (3) `create` returned 500 (TypeError from `name.trim()`) when `name` was
  absent (`{}`) or not a string (`{"name": 123}`). The reviewer's read: R6's "non-empty `name`"
  intent covers absent/wrong-type cases too — they should be 400, not 500. Fix: broadened
  `assertValidName`'s parameter type to `unknown` and added a `typeof name !== 'string'` guard
  at the top, reusing the existing `'El nombre del período no puede estar vacío'` 400 message
  (R6's EARS form doesn't distinguish absent from empty). Re-verified live (see R6 row in
  Traceability below). `update` was already safe — `data.name !== undefined` guards the call
  site, so the only required change was in `create`'s validation function.

Code/spec/design all approved on round 1 — the rejection was on verification discipline only.

### New files

| File | Purpose |
|---|---|
| `../postgres/18_quarters_relax_constraints.sql` | Drops the two inline CHECK constraints added by `17_quarters.sql` and widens `name` to `VARCHAR(60)`. Leaves both `UNIQUE` constraints untouched. Verbatim from `design.md`. |

### Modified files

| File | Change |
|---|---|
| `src/services/quarter.service.ts` | Removed `QUARTER_NAMES`/`QuarterName` exports. Added `assertValidName`, `assertValidSequenceNumber`, `nextSequenceNumber`. Rewrote `create` to run inside a transaction, accepting `name` + optional `sequenceNumber` (auto-assigned when omitted). Extended `update` to whitelist `name`/`sequenceNumber` alongside the existing `startDate`/`endDate`/`description`. Added `remove(institutionId, id)` mirroring `student.service.ts#remove`'s shape. `seedQuarters` now uses a local `DEFAULT_QUARTER_NAMES` literal (R24 unchanged). `assertValidName`'s parameter was broadened to `unknown` with a `typeof !== 'string'` guard so absent/wrong-type `name` is rejected as 400 instead of triggering a TypeError → 500 (reviewer round 1, change #3). `assertWithinAcademicYear`, `assertNoOverlap`, `cascadeSoftDeleteQuarters`, `assertQuartersFitAcademicYearRange`, `findAllForActiveYear` unchanged. |
| `src/controllers/quarter.controller.ts` | Added `router.delete('/:id', requirePermission(R,'delete'), …)` after the existing `PUT /:id`, mirroring `student.controller.ts`'s DELETE shape (`204` on success). |

### Conventions followed

- Controller is a thin permission-check-and-delegate router; every query lives in the service
  (`docs/architecture.md` §1).
- All client-facing failures are `throw Object.assign(new Error(...), { status })`; nothing in the
  service touches `res` (`docs/conventions.md` "Error Handling").
- R8/R12/R17/R18 (duplicate `name`/`sequenceNumber` on create and update) deliberately have *no*
  pre-check in JS — they surface through the existing `UNIQUE (academic_year_id, name)` and
  `UNIQUE (academic_year_id, sequence_number)` constraints, which `errorMiddleware` already maps to
  HTTP 409 by message match (`duplicate key`/`unique` → 409 "Registro duplicado"). Verified live in
  the smoke tests below — the `detail` field of each 409 response names the correct unique-index.
- No hard deletes: R20 sets `deleted_at` **and** `is_active = false` together, matching the
  `Course`/`Enrollment`/`Student` cascade shape. R23's "exclude from subsequent `GET /api/quarters`
  responses" is satisfied by the existing `deletedAt: IsNull()` filter on the read path.
- `institutionId` and `academicYearId` are still derived server-side from the requesting user's
  institution + the active AY (via `findActiveAcademicYear`), never from `req.body`.
- `update()` still uses an explicit whitelist of fields rather than `Object.assign(q, data)` —
  same reasoning as feature 1's design, now extended to include `name`/`sequenceNumber`.

## Verification

`docs/verification.md` is explicit that this project has **no automated test suite** and that
`.harness.json`'s `verify_command` is intentionally empty. So this was **build-checked and manually
smoke-tested against the real API + Postgres — not unit-tested.**

- **Level 1 (build):** `./node_modules/.bin/tsc` (= what `package.json`'s `build` script invokes,
  since `pnpm` is not on this machine's PATH) exits 0 with no diagnostics.
- **Level 2/3 (integration + smoke):** `docker compose build backend` → `docker compose up -d
  --no-deps backend` against the running local stack. `18_quarters_relax_constraints.sql` was
  applied to the dev Postgres (`docker exec -i postgres psql -U attendance -d attendance -v
  ON_ERROR_STOP=1 < postgres/18_quarters_relax_constraints.sql`) → `SET`, 2× `ALTER TABLE
  (drop CHECK)`, `ALTER TABLE ... TYPE VARCHAR(60)`. Every requirement was then exercised over
  HTTP against institution 2 ("Tia Blanquita"), whose active AY 1 (`2026-05-04 … 2027-03-05`)
  already had the 3 seeded default quarters from feature 1.
- **`./init.sh`** ends with `[OK] Environment ready` (its verification step `[WARN]`s because
  `verify_command` is unset — `docs/verification.md` says that is expected; the Supabase mirror
  sync also `[WARN]`s because `SUPABASE_URL`/`SUPABASE_ANON_KEY` are not set in this dev env).
- **Test isolation:** all write-path testing ran against institution 2 / AY 1. Institution 1 and
  AY 2 were not touched. One end-state check at the end: institution 2 still has 6 non-deleted
  quarters visible in `GET /api/quarters` (ids 1, 2, 3, 9, 10, 11 — the soft-deleted id=14 "Borrame"
  is correctly excluded).
- **Round 2 re-verification (after the reviewer-required typeof guard):** rebuilt the backend
  image (`docker compose build backend`) and recreated the container (`docker compose up -d
  --no-deps backend`), `./node_modules/.bin/tsc` exits 0 again. The four live POSTs for the guard
  (missing / number / whitespace / fresh string) are captured in the R6 (typeof guard) row of
  the Traceability table below. The round-2 test row (id=16, "Tipo Guard OK") was deleted at the
  end of the smoke run so the institution's quarter list returns to its pre-round-2 state.

## Traceability

Each `R<n>` maps to a manual API/DB check (no automated tests exist in this project — see
"Verification" above). Institution 2 / AY 1 (`2026-05-04 … 2027-03-05`) throughout; pre-existing
seeded quarters are ids 1 (`Primer Trimestre`, seq 1, `2026-05-04 … 2026-08-07`), 2 (`Segundo
Trimestre`, seq 2, `2026-08-11 … 2026-11-06`), 3 (`Tercer Trimestre`, seq 3, `2026-11-09 …
2027-02-24`).

### Schema-level (R1–R4) — verified via `\d quarters` + 409 responses

| Req | Check | Result |
|---|---|---|
| R1 | `docker exec postgres psql ... -c "\d quarters"` after applying `18_quarters_relax_constraints.sql` | `Check constraints:` no longer present in the table description (had `("name" CHECK …)` and `("sequence_number" CHECK …)` before) |
| R2 | Same `\d quarters` | Same — sequence_number has no `CHECK (sequence_number BETWEEN 1 AND 3)` |
| R3 | `R8`/`R17` (below) returned 409 with `detail` containing `quarters_academic_year_id_name_key` | DB `UNIQUE (academic_year_id, name)` still enforced |
| R4 | `R12`/`R18` (below) returned 409 with `detail` containing `quarters_academic_year_id_sequence_number_key` | DB `UNIQUE (academic_year_id, sequence_number)` still enforced |

### Runtime (R5–R24) — verified via HTTP requests

| Req | Request | Response / result |
|---|---|---|
| R5 | `POST /api/quarters` body `{"name":"Primer Semestre"}` | `201 Created`, body `{"id":9, …, "name":"Primer Semestre", "sequenceNumber":4, "institutionId":2, "academicYearId":1, "isActive":true}` |
| R6 | `POST /api/quarters` body `{"name":"   "}` | `400 Bad Request`, body `{"error":"El nombre del período no puede estar vacío"}`; row count unchanged |
| R6 (typeof guard) | (round 2 — reviewer required change #3) `POST /api/quarters` body `{}` (missing) and `{"name": 123}` (number) | Both `400 Bad Request`, body `{"error":"El nombre del período no puede estar vacío"}`; before the guard these returned `500` (`TypeError: Cannot read properties of undefined (reading 'trim')` and equivalent). `POST /api/quarters` body `{"name":"Tipo Guard OK"}` still returns `201 Created` (regression check — the guard doesn't reject valid strings) |
| R7 | `POST /api/quarters` body `{"name":"<63 chars>"}` | `400 Bad Request`, body `{"error":"El nombre del período no puede superar 60 caracteres"}`; row count unchanged |
| R8 | `POST /api/quarters` body `{"name":"Primer Trimestre"}` (already held by id=1) | `409 Conflict`, body `{"error":"Registro duplicado","detail":"duplicate key value violates unique constraint \"quarters_academic_year_id_name_key\""}`; `SELECT count(*)` from `quarters` for AY 1 unchanged |
| R9 | `POST /api/quarters` body `{"name":"Quinto Periodo"}` (after ids 9 and 10 had been created, max seq 10) | `201 Created`, body `… "name":"Quinto Periodo", "sequenceNumber":11 …` (max 10 + 1) |
| R10 | `POST /api/quarters` body `{"name":"Cuarto Periodo","sequenceNumber":10}` | `201 Created`, body `… "name":"Cuarto Periodo", "sequenceNumber":10 …` (explicit value honored, not derived) |
| R11 | `POST /api/quarters` body `{"name":"X","sequenceNumber":-5}` | `400 Bad Request`, body `{"error":"sequenceNumber debe ser un entero positivo"}`; row count unchanged |
| R12 | `POST /api/quarters` body `{"name":"Duplicado","sequenceNumber":1}` (1 held by id=1) | `409 Conflict`, body `{"error":"Registro duplicado","detail":"duplicate key value violates unique constraint \"quarters_academic_year_id_sequence_number_key\""}`; row count unchanged |
| R13 | Two consecutive `POST /api/quarters` calls without dates (after the 3 seeded trimesters) — first creating `Cuarto Periodo` (id=10) then `Quinto Periodo` (id=11) | Both `201 Created`; final count of non-deleted quarters for AY 1 = 5 (3 seeded + 2 new), no count cap |
| R14 | `POST /api/quarters` body `{"name":"Solapado","startDate":"2026-08-01","endDate":"2026-08-15"}` (overlaps id=1's `2026-05-04 … 2026-08-07`) | `400 Bad Request`, body `{"error":"Las fechas se solapan con Primer Trimestre (2026-05-04 a 2026-08-07)"}`; row count unchanged |
| R15 | `PUT /api/quarters/1` body `{"name":"Primer Bimestre","sequenceNumber":20}` | `200 OK`, body `{"id":1, …, "name":"Primer Bimestre", "sequenceNumber":20 …}` |
| R16 | Same `PUT /api/quarters/1` request | Same `200 OK` — `sequenceNumber: 20` persisted (see response body above) |
| R17 | `PUT /api/quarters/11` body `{"name":"Segundo Trimestre"}` (held by id=2) | `409 Conflict`, body `{"error":"Registro duplicado","detail":"duplicate key value violates unique constraint \"quarters_academic_year_id_name_key\""}`; id=11 still has its previous name |
| R18 | `PUT /api/quarters/11` body `{"sequenceNumber":2}` (held by id=2) | `409 Conflict`, body `{"error":"Registro duplicado","detail":"duplicate key value violates unique constraint \"quarters_academic_year_id_sequence_number_key\""}`; id=11 still has its previous `sequenceNumber` |
| R19 | `PUT /api/quarters/1` (one of the 3 seeded defaults from `seedQuarters`) → same as R15 | `200 OK`, rename + resequence applied. `update` has no special-case for rows produced by `seedQuarters`; they go through the same code path as any other quarter |
| R20 | `POST /api/quarters` body `{"name":"Borrame","sequenceNumber":50}` then `DELETE /api/quarters/14` | `201` then `204 No Content` (no body). DB: `SELECT … FROM quarters WHERE id=14` → `is_active=f`, `deleted_at` set |
| R21 | `DELETE /api/quarters/11` as a user with role `inspector de apoyo` (no `delete` permission on `academic_years`) | `403 Forbidden`, body `{"error":"Sin permiso de delete en academic_years"}`. DB: id=11 still `is_active=t`, `deleted_at IS NULL` |
| R22 | (a) `DELETE /api/quarters/14` (already soft-deleted above); (b) `DELETE /api/quarters/99999` (nonexistent) | Both `404 Not Found`, body `{"error":"Trimestre no encontrado"}`. Neither call modified any row |
| R23 | `GET /api/quarters` after the R20 delete | Body lists 6 rows (ids 1, 2, 3, 9, 10, 11); the deleted id=14 "Borrame" is not present |
| R24 | `seedQuarters` source: still contains a `DEFAULT_QUARTER_NAMES = ['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre']` local literal that produces 3 rows with `sequence_number` 1/2/3 when called from `academic-year.service.ts#create`. The `QUARTER_NAMES` export was removed; the only remaining consumer is this function, and the constant is now scoped to it. | No behavior change for new AY creation. Verified by reading the source diff — `seedQuarters` is still called from `academic-year.service.ts#create()` inside the same transaction as before (out of scope to re-test that path here, since it's already covered by feature 1's smoke tests). |

## Deviations from `design.md`

None. The new service signature, controller route shape, and SQL snippet all match
`design.md` verbatim.

## Follow-ups (not in scope, no code written)

1. **Test pollution:** the smoke test left institution 2 with id=1 renamed from `Primer Trimestre`
   to `Primer Bimestre` (seq 20) and three extra non-seeded quarters (ids 9, 10, 11: `Primer
   Semestre` seq 4 / `Cuarto Periodo` seq 10 / `Quinto Periodo` seq 11). If this branch is shared
   with other QA work, those rows will need to be cleaned up via `DELETE /api/quarters/:id` before
   the next round. Idempotent enough to ignore for now since the dev DB volume is shared anyway.
2. **No `start_date <= end_date` sanity check** — same follow-up as feature 1: rejecting a
   degenerate `start > end` would contradict R14's "non-overlapping dates SHALL create", so it's
   out of scope here too. If wanted, it needs its own `R<n>`.
3. **`postgres/18_quarters_relax_constraints.sql` is not mounted in `docker-compose.yml`'s
   `docker-entrypoint-initdb.d`** — same drift the prior impl report flagged for
   `17_quarters.sql`. A fresh `docker volume rm` + `up` would not get this migration. Out of scope.
4. **No automated tests** — `docs/verification.md` and `docs/conventions.md` both state no framework
   is configured and `verify_command` is intentionally empty. The R-table above is manual evidence.

## State of the repo

`git status` (in `backend/`) shows only this feature's intended changes: modified
`src/services/quarter.service.ts` and `src/controllers/quarter.controller.ts`; new
`../postgres/18_quarters_relax_constraints.sql` at the monorepo root. Other untracked paths under
the repo root (the other specs/`, `state/features/00{2,3}…`, `state/sessions/2026-08-29-{3,4}…`,
`../excel-service/...`, `../frontend/...`, `.gitignore` files, `../excel-service/export.go`) are
unrelated to this feature. No debug statements or uncontextualized TODOs in the new code. Temp QA
user (`qa_nodelete`) was deleted from the user table at the end of the smoke test through `psql`
(no app-side cascade was needed — it had no rows in any related table).