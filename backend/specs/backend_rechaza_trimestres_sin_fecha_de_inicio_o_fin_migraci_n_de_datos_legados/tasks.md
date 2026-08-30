# Tasks — Backend rechaza trimestres sin fecha de inicio o fin + migración de datos legados

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists
the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition.
The implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]`
without a documented, reviewer-accepted justification in
`progress/impl_backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados.md`.

Order matters: A0 (migration) goes first as T1, because A1–A6 cannot be enabled in production
until every active quarter has both dates (otherwise the new validation in R3/R4 would refuse
edits to legacy rows). A1/A2 are then a coordinated edit to the controller (T2) and the service
(T3–T4). Verification (T5–T8) follows.

- [x] T1 (R1, R2) Add `postgres/19_quarters_softdelete_legacy_null_dates.sql` (monorepo-root
      `postgres/`, sibling to `17_quarters.sql` and `18_quarters_relax_constraints.sql`),
      matching the design snippet in `design.md`'s "Migration shape" section. Use
      `SET search_path TO attendance, public;` exactly like the existing migrations; do not
      wrap the `UPDATE` in `BEGIN`/`COMMIT` (single-statement `UPDATE` is atomic in Postgres
      by default — same style as 17/18); make it idempotent (a second application against an
      already-migrated DB must produce zero row changes — the `WHERE deleted_at IS NULL`
      clause no longer matches anything). Done: applying the migration against a
      freshly-seeded DB that has (a) at least one active quarter with both dates already set,
      (b) at least one active quarter with one or both dates null, results in (a) unchanged,
      (b) soft-deleted (`deleted_at IS NOT NULL`, `is_active = false`) with `name`,
      `sequence_number`, and `academic_year_id` preserved; and
      `SELECT count(*) FROM quarters WHERE deleted_at IS NULL AND (start_date IS NULL OR
      end_date IS NULL);` returns 0 (R2). Re-apply the script a second time and confirm zero
      rows are affected (idempotence, R1).

- [x] T2 (R3, R4, R5) In `src/controllers/quarter.controller.ts`, add the two pre-call
      presence checks exactly as in `design.md`'s "Controller" section: in the `POST` handler,
      a `req.body.startDate == null || req.body.endDate == null` guard that throws
      `Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 })`
      after `requirePermission` and before `svc.create`; in the `PUT` handler, a
      `req.body.startDate === null || req.body.endDate === null` guard (note: strict `===`,
      so omitted keys are *not* rejected here — that case belongs to the service) with the
      same throw shape, after `requirePermission` and before `svc.update`. Do not touch any
      other handler. Done: `git diff` shows exactly those two new `if` blocks, positioned as
      specified, with no other controller changes.

- [x] T3 (R3, R4, R5) In `src/services/quarter.service.ts`, add a new private helper
      `assertValidDates(range: DateRange): void` directly below the existing
      `assertWithinAcademicYear` / `assertNoOverlap` helpers, matching the shape in
      `design.md`'s "Exact code shape" section — throws
      `Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 })`
      when `range.startDate === null || range.endDate === null`. Done: the file compiles and
      the helper appears exactly once, immediately after `assertNoOverlap`, with no other
      helpers reordered.

- [x] T4 (R3, R4, R5) In `src/services/quarter.service.ts`, call `assertValidDates(range)`
      from `create` (after `assertValidName` and before `assertWithinAcademicYear`) and from
      `update` (after the name/sequenceNumber setters, on the existing post-merge `range`,
      before `assertWithinAcademicYear`), exactly as in `design.md`'s "Exact code shape"
      section. Done: `git diff` shows only T2's controller changes, T3's new helper, and two
      `assertValidDates(range);` lines (one in `create`, one in `update`), positioned as
      specified; `pnpm run build` exits 0 (R9 — covers this task as a precondition).

- [x] T5 (R3, R4, R6, R7) Run `docker compose up --build` against a database that already had
      the migration from T1 applied (so `GET /api/quarters` returns active rows with both
      dates set). Exercise, with a JWT for a role that has `create`/`update`/`read` on
      `academic_years`, against `http://localhost:3000`: (i) `POST /api/quarters` with
      `{"name": "Período sin inicio", "sequenceNumber": 1}` and no `startDate`/`endDate` → 400
      with body containing `El período debe tener fecha de inicio y fecha de fin.`, no row
      created (R3); (ii) `POST /api/quarters` with
      `{"name": "Período sin fin", "sequenceNumber": 1, "startDate": "2026-01-01"}` and no
      `endDate` → 400, no row created (R3); (iii) `POST /api/quarters` with
      `{"name": "Período sin nada", "sequenceNumber": 1}` and neither date → 400, no row
      created (R3); (iv) `PUT /api/quarters/<existing-id>` with `{"startDate": null}` against
      a quarter whose persisted `startDate` is currently set → 400, and a follow-up
      `GET /api/quarters` shows the same row's `startDate` unchanged (R4); (v) `GET
      /api/quarters` → 200 with the same JSON shape as before (no `startDate`/`endDate` keys
      missing or renamed) (R6); (vi) `GET /api/export/excel?academic_year_id=<id>` → 200 with
      a streamed `.xlsx` body (R7). Capture each request/response in
      `progress/impl_backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados.md`'s
      Traceability section, with the exact HTTP status and error message observed for each.

- [x] T6 (R4) Continuing from T5: against a fresh database that has NOT yet had T1's migration
      applied (or against a row seeded directly via `psql` with `start_date = NULL,
      end_date = NULL`), exercise `PUT /api/quarters/<legacy-id>` with `{"name": "Nuevo
      nombre"}` (no `startDate`/`endDate` in the body, the existing row's persisted dates are
      null) → 400 with the R3/R4 message, and the row is unchanged on disk. Done: documented
      in the same progress file's Traceability section, alongside the corresponding
      request/response.

- [x] T7 (R5, R8 non-regression) Re-run the manual smoke tests from
      `progress/impl_relax_quarter_naming_and_count_constraints.md` (cases R5/R6/R14/R15/R16 of
      that feature): a successful `POST /api/quarters` with both dates and a non-empty trimmed
      `name`, a successful `PUT /api/quarters/:id` renaming and changing dates of an existing
      quarter, and a `POST /api/quarters` whose dates overlap another quarter's → 400 overlap.
      All must still pass exactly as they did before this feature. Done: each request/response
      is documented alongside the new cases in the same traceability section, and no behavior
      changed.

- [x] T8 (R9) Run `pnpm run build` and `./init.sh`. Done: `pnpm run build` exits 0 with no new
      TypeScript errors attributable to `quarter.controller.ts` or `quarter.service.ts` (the
      pre-existing infra `[WARN]`s for empty `verify_command` and unset `SUPABASE_URL` are
      unchanged from baseline); `./init.sh` ends with `[OK] Environment ready`. Document the
      build output in the same progress file.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1 |
| R2 | T1 |
| R3 | T2, T3, T4, T5 |
| R4 | T2, T3, T4, T5, T6 |
| R5 | T2, T3, T4, T7 |
| R6 | T5 |
| R7 | T5 |
| R8 | T5, T6, T7 |
| R9 | T4, T8 |
