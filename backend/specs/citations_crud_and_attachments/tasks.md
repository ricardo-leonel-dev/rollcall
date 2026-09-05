# Tasks — Citations CRUD, attachments, and pending-detection

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists the
file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition. The
implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]`
without a documented, reviewer-accepted justification in
`progress/impl_citations_crud_and_attachments.md`.

This project has no automated test framework (`docs/verification.md`) — traceability here is
satisfied the same way it was for feature #9: a `pnpm run build` pass plus a manual smoke test
against the real API, with verbatim request/response captured in
`progress/impl_citations_crud_and_attachments.md`.

**Before T1**: confirm feature #9 (`citation_reasons_management`) is `done` — `src/entities/
{Citation,CitationCitationReason,CitationAttachment}.ts` exist on disk, are registered in
`src/data-source.ts`, and the `citations`/`citation_citation_reasons`/`citation_attachments` tables
exist in the running Postgres instance. If not, stop and report the ordering problem
(`scripts/harness.sh append-log ...`) instead of proceeding — see `design.md`'s "Dependency on
feature #9" section.

- [x] T1 (R30, R31) Write `postgres/22_citations_permissions.sql` exactly as shown in `design.md`'s
      "Migration" section: `INSERT INTO role_permissions ... SELECT ... FROM roles WHERE name IN
      ('admin', 'rector', 'superadmin', 'inspector de apoyo', 'inspector general')`. First re-check
      `ls postgres/` for the actual highest-numbered file on disk — if `22_*.sql` is already taken,
      use the next free number and update this file's own references accordingly (see `design.md`'s
      "Migration numbering" note).

- [x] T2 (R1–R27) Add `src/services/citation.service.ts` exactly as shown in `design.md`'s "Service"
      section (`findRoster`, `findByEnrollment`, `create`, `update`, `close`, `remove`,
      `addAttachments`, `removeAttachment` + `assertEnrollmentInScope`/`assertReasonIds`/
      `assertDateOrder`/`findOwned` helpers).

- [x] T3 (R1–R29) Add `src/controllers/citation.controller.ts` exactly as shown in `design.md`'s
      "Controller" section (multer setup identical to `justification.controller.ts`'s except
      directory name, `requireInstitution` + `requirePermission('citaciones', action)` per route).

- [x] T4 (R33) Mount the new router at `/citations` in `src/routes/index.ts`, inside the standard
      authenticated block (after `authMiddleware` + `institutionMiddleware`, alongside the other
      resource routers).

- [x] T5 (R32, R36) Add `'citations'` and `'citation-reasons'` to `MODULE_KEYS` in
      `src/services/user.service.ts`, appended at the end of the array in that order
      (`'citations'` first, then `'citation-reasons'`).

- [x] T6 (R34) Add the `uploads/citaciones` `fs.mkdirSync(..., { recursive: true })` bootstrap in
      `src/app.ts`, next to the existing `justificationsDir` block.

- [x] T7 (R35) Run `pnpm run build` (or `node_modules/.bin/tsc -p .` if `pnpm` isn't available).
      Done: exits `0` with no new TypeScript errors attributable to any file touched by T1–T6.

- [x] T8 (R30, R31) After applying the migration to a running Postgres instance (`docker compose up
      --build` from the repo root, or `psql $DATABASE_URL -f postgres/22_citations_permissions.sql`
      against an already-running instance — after feature #9's own migration has also been applied),
      confirm via `SELECT r.name, rp.can_read, rp.can_create, rp.can_update, rp.can_delete FROM
      role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.resource = 'citaciones'` that
      there is exactly one row per `admin`/`rector`/`superadmin`/`inspector de apoyo`/
      `inspector general` role (all four `can_*` flags `TRUE`) and no row for `teacher` or
      `readonly`. Capture the query output in `progress/impl_citations_crud_and_attachments.md`.

- [x] T9 (R1–R4) Manual smoke test, roster mode: `GET /api/citations?course_id=<id>` (no
      `academic_year_id`) → `400`; `GET /api/citations?course_id=<id>&academic_year_id=<id>` for a
      course with at least one enrollment and one citation → `200` with the roster shape, the
      enrollment's `citations` array containing the expected fields; same request for a `course_id`
      outside the caller's `req.courseIds` (using a course-scoped role/user) → `404`. Capture
      verbatim request/response.

- [x] T10 (R5–R9) Manual smoke test, pending-detection mode: `GET /api/citations?enrollment_id=<id>`
      → `200` flat array; `...&status=pending` and `...&status=closed` → filtered results; `...
      &status=urgente` → `400`; `enrollment_id` outside scope → `404`; `GET /api/citations` with no
      params at all → `400`. Capture verbatim request/response.

- [x] T11 (R10–R14) Manual smoke test, `POST /api/citations`: valid body → `201`, then a roster/
      pending-detection `GET` shows it with `status: 'pending'`; `dateFrom > dateTo` → `400`; empty/
      missing `reasonIds` → `400`; a `reasonIds` entry that doesn't exist (or belongs to another
      institution) → `404`, no row created (verify via `GET`); an out-of-scope `enrollmentId` → `404`.
      Capture verbatim request/response.

- [x] T12 (R15–R17) Manual smoke test, `PUT /api/citations/:id`: change only `observations` → `200`,
      other fields unchanged; provide `reasonIds` → `200`, subsequent `GET` shows the fully replaced
      set; provide a `dateFrom` after the existing `dateTo` (without also updating `dateTo`) → `400`,
      no modification; target a nonexistent/soft-deleted/out-of-scope `id` → `404`. Capture verbatim
      request/response.

- [x] T13 (R18–R20) Manual smoke test, `PUT /api/citations/:id/close`: on a `pending` citation →
      `200`, `status`/`closedAt`/`closedByUserId` set as expected; immediately repeating the same
      call → `409`, no further modification; target a nonexistent/soft-deleted/out-of-scope `id` →
      `404`. Capture verbatim request/response.

- [x] T14 (R21, R22) Manual smoke test, `DELETE /api/citations/:id`: on an in-scope citation → `204`,
      then a `GET` no longer lists it and a DB-level check confirms `deleted_at` is set (not a hard
      delete); repeating the same `DELETE`, or targeting a nonexistent/out-of-scope `id` → `404`.
      Capture verbatim request/response.

- [x] T15 (R23–R27) Manual smoke test, attachments: `POST /:id/attachments` with 1-2 valid files
      (e.g. a small JPG and a PDF) → `201` with `url`s that resolve under `/api/uploads/citaciones/`;
      with zero files → `400`; with a disallowed MIME type (e.g. a `.txt`) → rejected, no row
      created (verify via a subsequent `GET`); with 6 files → rejected, no row created; `DELETE
      /:id/attachments/:attachmentId` for an attachment belonging to a *different* citation → `404`;
      for the correct attachment → `204`, file removed from `uploads/citaciones` on disk and row
      gone from `citation_attachments`. Capture verbatim request/response.

- [x] T16 (R28, R29) Manual smoke test, auth: any `/api/citations` request with no `Authorization`
      header → `401`; a request using a role with no `role_permissions` row for `citaciones` (e.g.
      `teacher`) → `403` on every verb, including the attachment sub-routes. Capture verbatim
      request/response.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T2, T3, T9 |
| R2 | T2, T3, T9 |
| R3 | T2, T3, T9 |
| R4 | T2, T3, T9 |
| R5 | T2, T3, T10 |
| R6 | T2, T3, T10 |
| R7 | T2, T3, T10 |
| R8 | T2, T3, T10 |
| R9 | T3, T10 |
| R10 | T2, T3, T11 |
| R11 | T2, T3, T11 |
| R12 | T2, T3, T11 |
| R13 | T2, T3, T11 |
| R14 | T2, T3, T11 |
| R15 | T2, T3, T12 |
| R16 | T2, T3, T12 |
| R17 | T2, T3, T12 |
| R18 | T2, T3, T13 |
| R19 | T2, T3, T13 |
| R20 | T2, T3, T13 |
| R21 | T2, T3, T14 |
| R22 | T2, T3, T14 |
| R23 | T2, T3, T15 |
| R24 | T3, T15 |
| R25 | T3, T15 |
| R26 | T2, T3, T15 |
| R27 | T2, T3, T15 |
| R28 | T3, T16 |
| R29 | T3, T16 |
| R30 | T1, T8 |
| R31 | T1, T8 |
| R32 | T5 |
| R33 | T4 |
| R34 | T6 |
| R35 | T7 |
| R36 | T5 |
