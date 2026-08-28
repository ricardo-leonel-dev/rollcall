# Tasks — API: Configure academic quarters (trimestres) per academic year

- [x] T1 (R1) Add `../postgres/17_quarters.sql` (monorepo-root `postgres/`, sibling to `backend/` —
      **not** `backend/postgres/`): `CREATE TABLE quarters` with the columns/constraints
      in `design.md` (`SET search_path TO attendance, public;` convention, `institution_id` FK,
      `sequence_number` `SMALLINT` with its own `CHECK`, `is_active`, `CHECK` on `name`,
      `UNIQUE(academic_year_id, name)`, `UNIQUE(academic_year_id, sequence_number)`, indexes on
      `academic_year_id` and `institution_id`), plus the backfill `INSERT ... ON CONFLICT DO
      NOTHING` (copying `institution_id`/`sequence_number` per `design.md`'s exact snippet) for
      pre-existing academic years.
- [x] T2 (R1) Add `src/entities/Quarter.ts` per `design.md`'s shape (including `institutionId`,
      `sequenceNumber`, `isActive`).
- [x] T3 (R2, R3, R17, R18) Add `src/services/quarter.service.ts`'s internal helpers:
      `seedQuarters(em, academicYearId)` (inserts the 3 fixed rows with `institutionId` copied from
      the academic year and `sequenceNumber` 1/2/3), `cascadeSoftDeleteQuarters(em, academicYearId)`
      (sets `deletedAt` **and** `isActive = false` together), and
      `assertQuartersFitAcademicYearRange(em, academicYearId, startDate, endDate)`.
- [x] T4 (R4, R5, R19) Add `quarter.service.ts#findActiveAcademicYear` and
      `#findAllForActiveYear` (ordered by `sequence_number ASC`).
- [x] T5 (R1, R2, R6, R7, R8, R9, R10, R11, R12) Add `quarter.service.ts#create`, including the
      `QUARTER_NAMES` validation, deriving `institutionId` from the resolved active academic year
      and `sequenceNumber` from the fixed name→order mapping (never read from the request body —
      see `design.md`'s discarded alternative #4), the containment check, and the overlap check
      (relies on the DB `UNIQUE` constraint + `errorMiddleware`'s existing 409 mapping for R12 — no
      explicit pre-check needed).
- [x] T6 (R13, R14, R15, R16) Add `quarter.service.ts#update`, whitelisting
      `startDate`/`endDate`/`description` only, reusing the containment/overlap checks from T5.
- [x] T7 (R2) Wire `seedQuarters` into `academic-year.service.ts#create`'s existing transaction.
- [x] T8 (R17, R18) Wire `assertQuartersFitAcademicYearRange` into `academic-year.service.ts#update`,
      only when `startDate`/`endDate` are present in the incoming data and differ from the current
      row's values.
- [x] T9 (R3) Wire `cascadeSoftDeleteQuarters` into `academic-year.service.ts#remove`'s existing
      transaction, alongside the enrollment cascade.
- [x] T10 (R4, R5, R6, R7, R8, R9, R12, R13, R14, R19) Add
      `src/controllers/quarter.controller.ts` (`GET /`, `POST /`, `PUT /:id`, permission resource
      `academic_years`, `requireInstitution`).
- [x] T11 (R4, R5, R6, R7, R8, R9, R12, R13, R14, R19) Mount the new router at `/api/quarters` in
      `src/routes/index.ts`.
- [x] T12 (R1–R19) Run `pnpm run build` (Level 1 verification per `docs/verification.md`) and a
      manual smoke test against a running stack (Level 2/3): create an academic year (confirm 3
      quarters appear, in Primer/Segundo/Tercer order per R19, each with `is_active: true` and the
      institution's own `institution_id`), `GET`/`POST`/`PUT` `/api/quarters` covering each status
      code in R4–R16, narrow an academic year's dates to trigger R17's 409, then widen them back and
      confirm R18's 200. Document the manual requests/responses exercised for each `R<n>` in
      `progress/impl_api_configure_academic_quarters_trimestres_per_academic_year.md`'s
      Traceability section, per `docs/specs.md` (no automated test framework exists yet in this
      project — see `docs/verification.md`).
