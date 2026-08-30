# Tasks — Relax quarter naming and count constraints

- [x] T1 (R1, R2, R3, R4) Add `../postgres/18_quarters_relax_constraints.sql` (monorepo-root
      `postgres/`, sibling to `backend/` — same directory as `17_quarters.sql`): `ALTER TABLE
      quarters DROP CONSTRAINT IF EXISTS quarters_name_check;`, `ALTER TABLE quarters DROP
      CONSTRAINT IF EXISTS quarters_sequence_number_check;`, and `ALTER TABLE quarters ALTER COLUMN
      name TYPE VARCHAR(60);`, per `design.md`'s exact snippet. Leave both `UNIQUE` constraints
      untouched.
- [x] T2 (R6, R7) Add `quarter.service.ts#assertValidName` (trim, reject empty, reject
      >60 chars) and remove `QUARTER_NAMES`/`QuarterName` as an exported validation source.
- [x] T3 (R11) Add `quarter.service.ts#assertValidSequenceNumber` (positive integer check).
- [x] T4 (R9) Add `quarter.service.ts#nextSequenceNumber(em, academicYearId)` (max existing
      `sequenceNumber` + 1, or 1 if none).
- [x] T5 (R5, R8, R9, R10, R12, R13, R14) Rewrite `quarter.service.ts#create` to run inside a
      transaction: validate `name` via T2, resolve `sequenceNumber` via `data.sequenceNumber ??
      nextSequenceNumber(...)` validated via T3 when explicit, keep the existing
      `assertWithinAcademicYear`/`assertNoOverlap` calls unchanged, then save. Rely on the DB
      `UNIQUE` constraints + `errorMiddleware`'s existing 409 mapping for R8/R12 (no new explicit
      pre-check).
- [x] T6 (R15, R16, R17, R18, R19) Extend `quarter.service.ts#update` to accept and whitelist
      `name` (via T2) and `sequenceNumber` (via T3) alongside the existing
      `startDate`/`endDate`/`description` fields, leaving R17/R18's conflict case to the DB
      `UNIQUE` constraints exactly like `create`.
- [x] T7 (R20, R22, R23) Add `quarter.service.ts#remove(institutionId, id)`: look up the quarter
      scoped to `institutionId` + the active academic year + `deletedAt IS NULL` (404 if missing),
      then set `deletedAt`/`isActive` together, mirroring `student.service.ts#remove`'s shape.
- [x] T8 (R24) Update `seedQuarters` to use its own local literal
      `['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre']` array instead of the removed
      `QUARTER_NAMES` export (same 3 rows, same `sequence_number` 1/2/3 — behavior unchanged).
- [x] T9 (R20, R21, R22) Add `DELETE /:id` to `src/controllers/quarter.controller.ts`,
      `requirePermission('academic_years', 'delete')`, calling `svc.remove` and responding `204`.
- [x] T10 (R1-R24) Run `pnpm run build` (Level 1 verification per `docs/verification.md`) and a
      manual smoke test against a running stack (Level 2/3):
      - Confirm the migration applies cleanly against an existing `quarters` table populated by
        feature 1 (`docker compose up --build` re-applies `postgres/*.sql` on a fresh volume, or
        apply `18_quarters_relax_constraints.sql` manually via `psql` against a volume that already
        ran `17_quarters.sql`).
      - `POST /api/quarters` with a non-trimester `name` (e.g. "Primer Semestre") and no
        `sequenceNumber` — confirm 201 and an auto-assigned `sequenceNumber` (R5, R9).
      - `POST /api/quarters` a 4th, 5th period for the same academic year with non-overlapping
        dates — confirm 201 each time, no count cap (R13, R14).
      - `POST /api/quarters` with an empty `name`, a >60-char `name`, a non-integer
        `sequenceNumber`, a duplicate `name`, and a duplicate `sequenceNumber` — confirm 400/400/
        400/409/409 respectively (R6, R7, R11, R8, R12).
      - `PUT /api/quarters/:id` on one of the seeded default quarters (e.g. rename "Primer
        Trimestre" to "Primer Bimestre" and change its `sequenceNumber`) — confirm 200 and the
        change persists (R15, R16, R19).
      - `DELETE /api/quarters/:id` on an existing quarter — confirm 204, `deleted_at`/`is_active`
        set, and it no longer appears in `GET /api/quarters` (R20, R23). Repeat against an
        already-deleted/non-existent id — confirm 404 (R22). Repeat as a role without `delete`
        permission on `academic_years` — confirm 403 (R21).
      Document the manual requests/responses exercised for each `R<n>` in
      `progress/impl_relax_quarter_naming_and_count_constraints.md`'s Traceability section, per
      `docs/specs.md` (no automated test framework exists yet in this project — see
      `docs/verification.md`).
