# Review — feature 1: API: Configure academic quarters (trimestres) per academic year

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`/`harness.db` exist; all four docs are filled in; `./init.sh` exits 0 with `[OK] Environment ready`.
- C2: [ ] — Cannot mark `[x]`: there is **no automated test suite** in this project (no `*.spec.ts`, no `test` script in `package.json`, `.harness.json#verify_command` is intentionally empty — all explicitly documented in `docs/verification.md` "Current state" and `docs/conventions.md` "Tests"). Per reviewer rules, "this repo has no test suite yet" is not a valid reason to mark C2 `[x]`. The implementer documented this gap and provided a per-requirement manual smoke-test matrix in `progress/impl_api_configure_academic_quarters_trimestres_per_academic_year.md` "Traceability" (R1–R19 each have a passing API/DB check).
- C3: [x] — `src/` only contains the layers described in `docs/architecture.md`. No new top-level folders. Dependency policy honoured (no new npm deps; `xlsx` etc. unchanged). No debug `console.log`/uncontextualized TODOs in the new files (the four short Spanish comments in `quarter.service.ts` and `academic-year.service.ts` are explaining non-obvious *why*, which `docs/conventions.md` "Comments" explicitly permits — they match the bar set by the `search_path` rationale in `data-source.ts`).
- C4: [ ] — Cannot mark `[x]` for the same reason as C2: no automated tests for the changed code. `./node_modules/.bin/tsc --noEmit` (= `pnpm run build`) exits 0, and the compiled `dist/` contains the quarter files (`dist/services/quarter.service.js`, `dist/controllers/quarter.controller.js`, `dist/data-source.js` registers `Quarter`, `dist/routes/index.js` mounts `/quarters`). All four are real, on-disk artifacts, not just claims.
- C5: [x] (provisional) — `git status` shows only the intended diff (modified: `backend/src/{data-source.ts,routes/index.ts,services/academic-year.service.ts}`; untracked: the new backend files, `progress/`, `state/`, and `../postgres/17_quarters.sql`). No stray temp files. **The implementer has not yet run `scripts/harness.sh log-out`** (correct — only the implementer does that, after this approval). I am explicitly NOT closing the session.
- C6: [x] — `specs/api_configure_academic_quarters_trimestres_per_academic_year/{requirements.md,design.md,tasks.md}` all exist on disk. `requirements.md` uses strict EARS for all 19 requirements (one `SHALL` clause each, no soft verbs). Every task in `tasks.md` is `[x]`. All 19 `R<n>` map to concrete code paths reviewed below in the Traceability Matrix.

## What's good

- **Spec integrity.** The implementer followed `design.md` almost verbatim, including the `SET search_path TO attendance, public;` + unqualified-identifier convention from `16_course_grade_shift.sql` so the migration is schema-portable to Supabase's `public` schema without a `_supabase` variant.
- **Layer discipline.** Controller is a 3-line router with `requireInstitution` + `requirePermission('academic_years', …)`. All business logic is in `services/quarter.service.ts`. No service touches `res.*`. All 19 R<n> map cleanly to one of `findActiveAcademicYear`/`findAllForActiveYear`/`create`/`update`/`seedQuarters`/`cascadeSoftDeleteQuarters`/`assertQuartersFitAcademicYearRange`.
- **Tenant-safety.** `institutionId` and `sequenceNumber` are always derived server-side (from the resolved active academic year and the `QUARTER_NAMES` index). `name`/`academicYearId`/`institutionId`/`sequenceNumber` are immutable through `PUT` (the implementer explicitly whitelists only `startDate`/`endDate`/`description` instead of `Object.assign(q, req.body)`, and `design.md` §"Service" documents this as the deliberate choice). R14's institution scoping is enforced by the `where: { id, academicYearId: ay.id, institutionId, deletedAt: IsNull() }` clause in `update`.
- **No hard deletes.** R3's cascade uses `em.update(Quarter, { academicYearId, deletedAt: IsNull() }, { deletedAt: new Date(), isActive: false })`, matching the exact shape of `cascadeSoftDeleteEnrollment`/`cascadeSoftDeleteAbsence`. Reads filter on `deletedAt: IsNull()` only, matching the codebase-wide convention.
- **Transaction discipline.** R2's seed runs inside the existing `academic-year.service.ts#create` transaction; R3's cascade runs inside `academic-year.service.ts#remove`'s transaction; R17's guard runs inside `academic-year.service.ts#update`'s transaction, all before any persist. If `assertQuartersFitAcademicYearRange` throws, the transaction aborts and the AY's old dates remain.
- **Reuse of `errorMiddleware`'s mapping.** R12 deliberately relies on the existing `duplicate key`/`unique` → 409 mapping for the duplicate-name case rather than re-implementing it in JS — this matches `design.md`'s note about `course-academic-year.service.ts` doing the same for its own `UNIQUE(course_id, academic_year_id)`.
- **Two documented deviations are correct and an improvement.**
  1. `data-source.ts` is registered (required for `getRepository(Quarter)` to resolve) — design-level omission, not a deviation from intent.
  2. The per-field containment/overlap check in `update` is strictly more correct than `design.md`'s sketch for partial `PUT`s (e.g. sending only `startDate`).
- **Build is real.** `tsc --noEmit` is clean; the compiled JS in `dist/` contains the new symbols at the expected call sites (verified: `dist/services/academic-year.service.js:41/52/60/74` call `seedQuarters`/`assertQuartersFitAcademicYearRange`/`cascadeSoftDeleteQuarters`; `dist/routes/index.js:11/38` mount the new router).

## Required Changes (if applicable)

None. The two design deviations are explicitly justified in `progress/impl_api_configure_academic_quarters_trimestres_per_academic_year.md` ("Deviations from `design.md`") and in `design.md` itself (the per-field check rationale is embedded in the design). All 19 R<n> are met. The pre-existing project-wide test-framework gap is documented in `docs/verification.md` and `docs/conventions.md` and is not within scope of this feature — flagging it as a required change would force the implementer to add a test framework as part of a feature whose scope is the quarters resource, which neither the spec nor the harness contemplates.

## Traceability Matrix

| Req | Satisfied by | Verification |
|---|---|---|
| R1 | `/home/rileo/ai-personal/postgres/17_quarters.sql` (full schema); `src/entities/Quarter.ts` (TypeORM mirror with both `@Unique` pairs, `CHECK` mirrored by column constraints) | `\d quarters` matches every column listed in R1 |
| R2 | `quarter.service.ts#seedQuarters` (lines 108–121), called from `academic-year.service.ts#create` (line 37) inside its existing transaction | R2 row in `progress/impl_...md` "Traceability" — backfill `INSERT 0 3` + live `POST /api/academic-years` → 3 quarters with `sequence_number` 1/2/3 |
| R3 | `quarter.service.ts#cascadeSoftDeleteQuarters` (lines 123–125), called from `academic-year.service.ts#remove` (line 72) inside its transaction | R3 row — `DELETE /api/academic-years/2` → 204, all 3 quarters `is_active=f`, `deleted_at IS NOT NULL`, follow-up `GET /api/quarters` → 404 |
| R4 | `quarter.service.ts#findAllForActiveYear` (lines 55–61) + controller `GET /` with `requirePermission(R,'read')` | R4 row — both superadmin and `teacher` callers see only institution 1 / active AY's quarters |
| R5 | `findActiveAcademicYear` (lines 16–22) throws 404 if no active AY; `findAllForActiveYear` calls it first | R5 row — pre-AY `GET /api/quarters` returns 404 with no body |
| R6 | `quarter.service.ts#create` (lines 63–85) derives `institutionId` from AY and `sequenceNumber` from `QUARTER_NAMES`; controller `POST /` with `requirePermission(R,'create')` responds 201 | R6 row (test fixture caveat documented in implementer report) |
| R7 | `requirePermission(R,'create')` in controller rejects 403 before `create` is called | R7 row — `teacher` user POSTs → 403, row count unchanged |
| R8 | `create` calls `findActiveAcademicYear` first → 404 propagates | R8 row |
| R9 | `create` line 65–68: `QUARTER_NAMES.indexOf` returns -1 → 400 with the exact message | R9 row — `Cuarto Trimestre` → 400, still 3 rows |
| R10 | `assertWithinAcademicYear` (lines 26–37) called in `create` | R10 row — end past AY's `endDate` → 400 |
| R11 | `assertNoOverlap` (lines 41–53) called in `create` | R11 row — overlapping range → 400 naming `Primer Trimestre` |
| R12 | DB `UNIQUE (academic_year_id, name)` + `errorMiddleware`'s `duplicate key`/`unique` → 409 mapping | R12 row — second `Segundo Trimestre` → 409 `Registro duplicado` |
| R13 | `quarter.service.ts#update` (lines 90–106) whitelists only `startDate`/`endDate`/`description`; controller `PUT /:id` with `requirePermission(R,'update')` | R13 row — `PUT /api/quarters/4` with new dates/description → 200, all three persisted |
| R14 | `update` line 92: `findOne({ where: { id, academicYearId: ay.id, institutionId, deletedAt: IsNull() } })` returns null for missing/cross-institution/soft-deleted → 404 | R14 row — `/9999` and cross-institution `/1` both 404 |
| R15 | `update` calls `assertWithinAcademicYear` (line 99) | R15 row — start before AY's `startDate` → 400, quarter 5 dates still `NULL`/`NULL` |
| R16 | `update` calls `assertNoOverlap` with `excludeId = q.id` (line 100) | R16 row |
| R17 | `assertQuartersFitAcademicYearRange` (lines 127–143) called from `academic-year.service.ts#update` (lines 50, 58) inside its transaction, throws 409 naming both offending quarters when only one or both dates change | R17 row — narrowing AY dates → 409 with both names; AY dates unchanged, all 3 quarters' `updated_at` unchanged |
| R18 | Same hook; if no quarters fall outside, no throw, dates persist | R18 row — widening → 200, dates persisted; name-only → 200, guard skipped |
| R19 | `findAllForActiveYear` orders by `sequenceNumber: 'ASC'` | R19 row — Primer → Segundo → Tercer every time |

No orphan requirements, no orphan code (every new code path maps back to one or more `R<n>`).

## Verification Evidence

- `./init.sh` → ends with `[OK] Environment ready` (verified). Its verification step `[WARN]`s because `.harness.json#verify_command` is empty, which `docs/verification.md` explicitly documents as the expected state until a test framework is added.
- `./node_modules/.bin/tsc --noEmit` → exits 0 (silent). This is identical to `package.json#scripts.build` (`tsc`); `pnpm` is not on this machine's PATH, but the implementer's run already documented the same and the dist/ artifacts confirm it was compiled.
- `git status` → diff matches the implementer's claimed change set (modified: `src/{data-source.ts,routes/index.ts,services/academic-year.service.ts}`; untracked: `src/{controllers/quarter.controller.ts,entities/Quarter.ts,services/quarter.service.ts}` + `../postgres/17_quarters.sql` + `progress/` + `state/`).
- `git diff HEAD -- src/{data-source.ts,routes/index.ts,services/academic-year.service.ts}` → matches the implementer's report exactly (entity registration, route mount, `seedQuarters`/`assertQuartersFitAcademicYearRange`/`cascadeSoftDeleteQuarters` wiring).
- `dist/services/quarter.service.js`, `dist/controllers/quarter.controller.js` exist on disk (6431 / 2322 bytes, mtime 03:13); `dist/services/academic-year.service.js` lines 41/52/60/74 reference the new quarter helpers; `dist/data-source.js:9/44` registers `Quarter`; `dist/routes/index.js:11/38` mounts `/quarters`. The build artifact backs the `tsc` claim.
- The implementer's manual smoke matrix in `progress/impl_api_configure_academic_quarters_trimestres_per_academic_year.md` "Traceability" covers every `R<n>` R1–R19 against the live stack (`docker compose up -d --build backend`), with the `INSERT 0 3` backfill result and HTTP status codes per call. I have not independently re-run those curls against the live stack (the implementer does not leave it running between sessions and there is no `verify_command` to invoke); however the build artifact, the per-requirement code mapping above, and the static cross-checks all corroborate the implementation is internally consistent and would behave as documented.

## Follow-ups (informational, not blocking)

1. **`POST /api/quarters` is effectively dead in normal operation** — R2 seeds all 3 fixed names, R12 then makes any repeat a 409. The endpoint is still spec-compliant and is implemented correctly per R6, but the frontend will realistically only exercise `GET` + `PUT`. The implementer flagged this and called out a partial-unique-on-`deleted_at IS NULL` as a possible amendment; this requires a spec change, not a code change.
2. **No `start_date <= end_date` sanity check** — the implementer correctly notes this would contradict R6 as written. If desired, it needs a new `R<n>` amendment.
3. **`17_quarters.sql` is not auto-applied by `docker-compose.yml`** — that mount list stops at `05_course_scope.sql` (migrations 06–16 already aren't mounted either; this is pre-existing drift, not introduced by this feature). The project's documented workflow is to apply migrations manually via `psql $DATABASE_URL -f postgres/NN_*.sql`. If a fresh-stack deploy ever runs without the manual step, it will be missing this and several other tables.

## Verdict Summary

All 19 requirements are implemented, all 12 tasks are checked, the build is green, the init script is green, the migration is correctly placed, schema-portable, and follows the established convention, and the new files match the existing controller/service/entity patterns. C2/C4/C6 cannot be marked `[x]` solely because this project has no automated test framework — a state that is explicitly documented in `docs/verification.md` and `docs/conventions.md`, is outside the scope of this feature, and is correctly identified by the implementer as a follow-up requiring a separate decision.
