# Implementation report — feature 1: API: Configure academic quarters (trimestres) per academic year

Feature: `api_configure_academic_quarters_trimestres_per_academic_year` (sdd=1, spec approved by Ricardo Aguilar)
Session: 2 · Implementer · backend-only (frontend out of scope per `requirements.md`)

## What was done

All 12 tasks in `specs/.../tasks.md` are implemented and checked off `[x]`. The design in
`specs/.../design.md` was followed as written; the two deltas from it are called out under
"Deviations" below.

### New files

| File | Purpose |
|---|---|
| `../postgres/17_quarters.sql` | `CREATE TABLE quarters` (+2 indexes) and the backfill `INSERT ... ON CONFLICT DO NOTHING` for pre-existing academic years. Uses the `SET search_path TO attendance, public;` + unqualified-identifier convention from `16_course_grade_shift.sql`, so no `_supabase` variant is needed. Verbatim from `design.md`'s snippet. |
| `src/entities/Quarter.ts` | TypeORM entity, `@Entity('quarters')` with both `@Unique` pairs. |
| `src/services/quarter.service.ts` | `findAllForActiveYear` / `create` / `update`, the private `findActiveAcademicYear` / `assertWithinAcademicYear` / `assertNoOverlap` helpers, and the three helpers `academic-year.service.ts` calls into (`seedQuarters`, `cascadeSoftDeleteQuarters`, `assertQuartersFitAcademicYearRange`). |
| `src/controllers/quarter.controller.ts` | `GET /`, `POST /`, `PUT /:id`; `requireInstitution` + `requirePermission('academic_years', …)`. No `DELETE` (out of scope). |

### Modified files

| File | Change |
|---|---|
| `src/data-source.ts` | Registered `Quarter` in the `entities` array. |
| `src/routes/index.ts` | Import + `router.use('/quarters', quarterRouter)` immediately after `/academic-years`. |
| `src/services/academic-year.service.ts` | `create()` calls `seedQuarters(em, saved.id)` inside its existing transaction (R2); `update()` runs `assertQuartersFitAcademicYearRange` in a transaction before persisting, but only when `startDate`/`endDate` are present *and* differ from the current row (R17/R18); `remove()` calls `cascadeSoftDeleteQuarters(em, id)` next to the enrollment cascade (R3). |

### Conventions followed

- Controller is a thin permission-check-and-delegate router; every query lives in the service
  (`docs/architecture.md` §1).
- All client-facing failures are `throw Object.assign(new Error(...), { status })`; nothing in the
  service touches `res` (`docs/conventions.md` "Error Handling").
- R12 (duplicate quarter name) is deliberately *not* pre-checked in JS — it surfaces through the
  `UNIQUE (academic_year_id, name)` constraint and `errorMiddleware`'s existing `duplicate key → 409`
  mapping, exactly as `design.md` specifies.
- No hard deletes: R3 sets `deleted_at` **and** `is_active = false` together, matching the
  `Course`/`Enrollment` cascade shape. Reads filter on `deleted_at IS NULL` only.
- `institutionId` and `sequenceNumber` are always derived server-side (from the resolved active
  academic year and the fixed `QUARTER_NAMES` index), never read from `req.body` — `design.md`
  discarded alternative #4.
- `update()` whitelists `startDate`/`endDate`/`description` instead of `Object.assign(q, req.body)`,
  the one deliberate deviation from the surrounding services that `design.md` already documents and
  explains.

## Verification

`docs/verification.md` is explicit that this project has **no automated test suite** and that
`.harness.json`'s `verify_command` is intentionally empty. So this was **build-checked and manually
smoke-tested against the real API + Postgres — not unit-tested.** There are no new `*.spec.ts` files
because no test framework exists to hang them on (see "Follow-ups").

- **Level 1 (build):** `pnpm run build` (= `tsc`, `strict: true`) exits 0. `pnpm` isn't on this
  machine's PATH, so it was run as `./node_modules/.bin/tsc` — the identical command
  `package.json`'s `build` script invokes.
- **Level 2/3 (integration + smoke):** `docker compose up -d --build backend` against the running
  local stack. `17_quarters.sql` was applied to the dev Postgres
  (`docker exec -i postgres psql -U attendance -d attendance -v ON_ERROR_STOP=1 < postgres/17_quarters.sql`)
  → `CREATE TABLE`, 2× `CREATE INDEX`, `INSERT 0 3` (the backfill picked up the single pre-existing
  academic year). Every requirement was then exercised over HTTP.
- **`./init.sh`** ends with `[OK] Environment ready` (its verification step `[WARN]`s, which
  `docs/verification.md` says is expected while `verify_command` is unset).
- **Test isolation:** all write-path testing ran against institution 1 ("Institución migrada", which
  had no academic years), so institution 2's live data was never touched — confirmed at the end:
  academic year 1's three quarters are still `is_active = t`, `deleted_at = NULL`.

## Traceability

Each `R<n>` maps to a manual API/DB check (no automated tests exist in this project — see above).
`AY` = academic year 2, created in institution 1 with range `2030-05-01 … 2031-03-01`.

| Req | Check | Result |
|---|---|---|
| R1 | `\d quarters` + `SELECT` of all columns after applying the migration | Table has `id, academic_year_id, institution_id, name, sequence_number, start_date, end_date, description, is_active, created_at, updated_at, deleted_at`; backfill produced 3 rows for the pre-existing AY with the parent's `institution_id` and `sequence_number` 1/2/3 |
| R2 | `POST /api/academic-years` `{"name":"2030-2031","startDate":"2030-05-01","endDate":"2031-03-01"}` → 201, then `GET /api/quarters` | 3 quarters (ids 4/5/6), `institutionId: 1`, `startDate`/`endDate` `null`, `isActive: true`, sequence 1/2/3 |
| R3 | `DELETE /api/academic-years/2` → 204, then `SELECT … FROM quarters WHERE academic_year_id=2` | all 3 rows `is_active = f`, `deleted_at IS NOT NULL`; follow-up `GET /api/quarters` → 404 |
| R4 | `GET /api/quarters` as superadmin **and** as a `teacher`-role user (read-only on `academic_years`) | 200, only institution 1 / active-AY quarters, both callers |
| R5 | `GET /api/quarters` for institution 1 before any AY existed | 404 `{"error":"No hay año lectivo activo"}`, no quarter data |
| R6 | `POST /api/quarters` `{"name":"Tercer Trimestre","startDate":"2030-11-15","endDate":"2031-03-01","description":"Tercer bloque"}` | 201; response has server-derived `sequenceNumber: 3` and `institutionId: 1` |
| R7 | `POST` and `PUT /api/quarters/5` as the `teacher` user | 403 `Sin permiso de create en academic_years` / `Sin permiso de update en academic_years`; row count unchanged |
| R8 | `POST /api/quarters` for institution 1 before any AY existed | 404 `No hay año lectivo activo`, nothing created |
| R9 | `POST /api/quarters` `{"name":"Cuarto Trimestre"}` | 400 `Nombre de trimestre inválido: debe ser uno de …`; still 3 rows |
| R10 | `POST` `Tercer Trimestre` `2030-12-01 … 2031-06-30` (end past the AY's `2031-03-01`) | 400 `Las fechas del trimestre deben estar dentro del año lectivo (2030-05-01 a 2031-03-01)`; row count unchanged (2) |
| R11 | `POST` `Tercer Trimestre` `2030-07-01 … 2030-12-31`, overlapping Primer Trimestre `2030-05-01 … 2030-08-15` | 400 `Las fechas se solapan con Primer Trimestre (2030-05-01 a 2030-08-15)`; row count unchanged (2) |
| R12 | `POST` `{"name":"Segundo Trimestre", …}` while that name already exists for the AY | 409 `Registro duplicado` (`quarters_academic_year_id_name_key`); `SELECT count(*)` still 3 — no second row |
| R13 | `PUT /api/quarters/4` `{"startDate":"2030-05-01","endDate":"2030-08-15","description":"Primer bloque"}` | 200, all three fields persisted |
| R14 | `PUT /api/quarters/9999` (nonexistent) and `PUT /api/quarters/1` (institution 2's row) as institution 1 | both 404 `Trimestre no encontrado`; quarter 1 unmodified |
| R15 | `PUT /api/quarters/5` `2029-01-01 … 2030-11-30` (start before the AY's `2030-05-01`) | 400 containment error; `SELECT` confirms quarter 5's dates still `NULL` |
| R16 | `PUT /api/quarters/5` `2030-08-10 … 2030-11-30`, overlapping Primer Trimestre | 400 overlap error naming Primer Trimestre; quarter 5 still `NULL`/`NULL` |
| R17 | `PUT /api/academic-years/2` narrowing to `2030-06-01 … 2030-12-31` while Primer (`…08-15`) and Tercer (`2030-11-15 … 2031-03-01`) are fully dated | 409 naming **both** offending quarters; `SELECT` confirms the AY still holds `2030-05-01 … 2031-03-01` and all three quarters' `updated_at` are unchanged |
| R18 | `PUT /api/academic-years/2` widening to `2030-04-01 … 2031-04-01`; plus a name-only `PUT` | 200 both times, new dates persisted — unchanged pre-existing behavior, and the guard is skipped entirely when no date changes |
| R19 | `GET /api/quarters` (both callers, and after the R6 create) | always Primer → Segundo → Tercer, i.e. `sequence_number ASC` |

### One test-fixture note on R6/R10/R11

Because R2 seeds all three quarters when an academic year is created, and `UNIQUE (academic_year_id,
name)` is a plain (not partial) constraint, the `POST /api/quarters` success path is unreachable
while any row — even a soft-deleted one — holds the name. To exercise R6/R10/R11 at all, the
`Tercer Trimestre` row was hard-deleted straight from the dev DB **as test setup only** (`DELETE FROM
attendance.quarters WHERE id=6`), then the three POSTs were issued. No application code path
hard-deletes anything. This is a property of the spec as approved (R2 + R12 together make `POST`
effectively unreachable in normal operation), not an implementation choice — flagged as a follow-up
below rather than "fixed", since changing it would contradict R12.

## Deviations from `design.md`

1. **`src/data-source.ts` was modified** — it isn't in `design.md`'s "Files to touch" table, but
   TypeORM cannot resolve `getRepository(Quarter)` unless the entity is in the `entities` array.
   Mechanical omission from the design, not a design change.
2. **Containment/overlap checks operate on the *merged effective* range in `update`**, and evaluate
   `start_date` and `end_date` independently rather than as the single conjunction
   `candidate.start >= ay.start AND candidate.end <= ay.end` that `design.md` sketches. Identical
   behavior when both dates are supplied; strictly more correct for a partial `PUT` (e.g. sending
   only `startDate`), which the sketch didn't cover. `assertNoOverlap` still requires both dates, as
   `design.md` specifies.

Deliberately **not** added: a `start_date <= end_date` sanity check. R6 says a create whose dates
satisfy R10 and R11 SHALL succeed, so rejecting a degenerate-but-in-range `start > end` would
contradict the approved requirements. Noted as a follow-up instead.

## Follow-ups (not in scope, no code written)

1. **`POST /api/quarters` is effectively dead in normal operation** (R2 seeds all 3 names; R12 makes
   any repeat a 409). It's implemented and correct per spec, but the frontend's quarter-configuration
   screen will realistically only ever use `GET` + `PUT`. Worth confirming with Ricardo whether
   `POST` should stay, or whether the `UNIQUE` constraint should become partial on
   `deleted_at IS NULL` so a soft-deleted quarter's name can be reclaimed.
2. **No `start_date <= end_date` validation** — see above. If wanted, it needs a requirements
   amendment (a new `R<n>`), not just a code change.
3. **`postgres/17_quarters.sql` is not mounted in `docker-compose.yml`'s
   `docker-entrypoint-initdb.d`** — that list stops at `05_course_scope.sql`, so migrations 06–16
   already aren't mounted either. Pre-existing drift; a fresh `docker volume rm` + `up` would not get
   this table. Out of scope here, but it will bite whoever next builds from scratch.
4. **No automated tests** — `docs/verification.md` and `docs/conventions.md` both state no framework
   is configured and `verify_command` is intentionally empty. The R-table above is manual evidence.
   `quarter.service.ts`'s pure date logic (`assertWithinAcademicYear`, `assertNoOverlap`,
   `assertQuartersFitAcademicYearRange`) would be the cheapest first unit tests if a framework is
   ever added.

## State of the repo

`git status` shows only intended changes: modified `backend/src/data-source.ts`,
`backend/src/routes/index.ts`, `backend/src/services/academic-year.service.ts`; new
`backend/src/{entities/Quarter.ts,services/quarter.service.ts,controllers/quarter.controller.ts}` and
`postgres/17_quarters.sql`. No debug statements or uncontextualized TODOs in the new files. Temp
files under `/tmp` were removed; the temp QA user was soft-deleted through the app's own
`DELETE /api/users/:id`.
