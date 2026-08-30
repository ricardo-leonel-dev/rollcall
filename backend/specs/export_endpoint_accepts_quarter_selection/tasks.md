# Tasks — Export endpoint accepts quarter selection

- [x] T1 (R3, R4) Add `quarter.service.ts#findByIdForActiveYear(institutionId, quarterId)`: resolve
      the institution's active academic year via the existing `findActiveAcademicYear` (404 'No hay
      año lectivo activo' if none), then `repo().findOne({ where: { id: quarterId, academicYearId:
      ay.id, institutionId, deletedAt: IsNull() } })`, throwing `Object.assign(new Error('Trimestre
      no encontrado'), { status: 404 })` if not found. Return the found `Quarter`.
- [x] T2 (R2) In `export.controller.ts`, parse the optional `quarter_id` query parameter: if present,
      `parseInt` it and respond 400 (`'quarter_id debe ser un entero positivo'`) without calling the
      service when it is `NaN` or `<= 0`. Leave `quarterId` as `undefined` when the parameter is
      absent.
- [x] T3 (R1, R6, R7) Extend `export.service.ts#exportExcel`'s signature with an optional trailing
      `quarterId?: number` parameter. When `quarterId === undefined`, build the `excel-service` URL
      exactly as today (R1). When defined, call `quarter.service.ts#findByIdForActiveYear` (T1) and
      append `&quarter_sequence=<sequence_number>&quarter_name=<encodeURIComponent(name)>` to the URL
      (R6), keeping every existing parameter (`institution_id`, `course_ids`, `academic_year_id`,
      `date_from`, `date_to`, `signers`) unchanged (R7).
- [x] T4 (R5) In `export.service.ts#exportExcel`, after resolving the quarter via T1, compare
      `quarter.academicYearId` against the `academicYearId` parameter already passed into
      `exportExcel`; if they differ, throw `Object.assign(new Error('Trimestre no encontrado'),
      { status: 404 })` before building the `excel-service` URL.
- [x] T5 (R2, R3, R4, R5, R6, R7) In `export.controller.ts`, pass the parsed `quarterId` (from T2) as
      the new trailing argument to `svc.exportExcel(...)`, alongside the existing
      `institutionId`/`courseIds`/`academicYearId`/`dateFrom`/`dateTo`/`signers` arguments.
- [x] T6 (R1-R7) Run `pnpm run build` (Level 1 verification per `docs/verification.md`) and a manual
      smoke test against a running stack (Level 2/3, `docker compose up --build` from the repo root):
      - `GET /api/export/excel` with the existing required parameters and no `quarter_id` — confirm
        the request/response is unchanged from current behavior and the exported file still opens
        (R1).
      - `GET /api/export/excel?...&quarter_id=abc` (non-numeric) and `&quarter_id=0` — confirm 400
        each time (R2).
      - `GET /api/export/excel?...&quarter_id=<id from a different institution>` and
        `&quarter_id=<id belonging to a soft-deleted quarter>` — confirm 404 each time (R4).
      - Against an institution with no active academic year, `GET /api/export/excel?...&quarter_id=1`
        — confirm 404 (R3).
      - `GET /api/export/excel?...&quarter_id=<valid id>&academic_year_id=<a different year's id>` —
        confirm 404 (R5).
      - `GET /api/export/excel?...&quarter_id=<valid id belonging to the requested academic_year_id>`
        — confirm 200, and (via request logging or a temporary `console.log` removed before commit)
        confirm the outgoing `excel-service` URL includes `quarter_sequence` and `quarter_name`
        matching the quarter's `sequence_number`/`name` (R6, R7).
      Document the manual requests/responses exercised for each `R<n>` in
      `progress/impl_export_endpoint_accepts_quarter_selection.md`'s Traceability section, per
      `docs/specs.md` (no automated test framework exists yet in this project — see
      `docs/verification.md`).
