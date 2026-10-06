# Tasks — Citation attachments retrieval

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists the
file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition. The
implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]` without
a documented, reviewer-accepted justification in `progress/impl_citation_attachments_retrieval.md`.

This project has no automated test framework (`docs/verification.md`) — traceability here is
satisfied the same way it was for feature #10: a `pnpm run build` pass plus a manual smoke test
against the real API, with verbatim request/response captured in
`progress/impl_citation_attachments_retrieval.md`.

- [ ] T1 (R1, R2, R5) Edit `src/services/citation.service.ts`'s `CITATION_FIELDS_SQL` constant to add
      the `attachments` correlated `json_agg` subquery (`id`, `fileName`, `originalName`, `mimeType`,
      `createdAt`, ordered by `createdAt` ascending) exactly as shown in `design.md`'s
      "`CITATION_FIELDS_SQL` (new)" section, then update `findByEnrollment` to capture the query
      result into `rows` and `.map()` each row to attach a `url` per attachment via the existing
      `attachmentUrl` helper, exactly as shown in `design.md`'s "`findByEnrollment` (new)" section.

- [ ] T2 (R3, R4, R5) Edit `findRoster` in the same file to add the same `attachments` subquery inside
      the nested per-citation `json_build_object(...)`, then `.map()` each roster row's `citations`
      array (and each citation's nested `attachments` array) to attach `url` the same way, exactly as
      shown in `design.md`'s "`findRoster` (new)" section.

- [ ] T3 (R6) Confirm no code change is needed in `addAttachments` (`citation.service.ts`) or the
      `POST /:id/attachments` route (`citation.controller.ts`) — re-read both after T1/T2 to verify
      neither was accidentally touched.

- [ ] T4 (R7) Confirm no code change is needed in `removeAttachment` (`citation.service.ts`) or the
      `DELETE /:id/attachments/:attachmentId` route (`citation.controller.ts`) — re-read both after
      T1/T2 to verify neither was accidentally touched.

- [ ] T5 (R1–R9) Run `pnpm run build` (or `node_modules/.bin/tsc -p .` if `pnpm` isn't available).
      Done: exits `0` with no new TypeScript errors attributable to T1/T2.

- [ ] T6 (R1, R2, R8, R9) Manual smoke test, pending-detection mode: pick (or create) a citation with
      zero attachments, `GET /api/citations?enrollment_id=<id>` → its `attachments` field is `[]`;
      `POST /api/citations/:id/attachments` with 2 valid files → `201`; immediately re-run the same
      `GET` → `attachments` now has 2 entries in ascending `createdAt` order, each with `id`,
      `fileName`, `originalName`, `mimeType`, `createdAt`, and a `url` that resolves under
      `/api/uploads/citaciones/`; `DELETE /api/citations/:id/attachments/:attachmentId` for one of
      them → `204`; re-run the same `GET` → `attachments` now has 1 entry, the deleted one absent.
      Capture verbatim request/response in `progress/impl_citation_attachments_retrieval.md`.

- [ ] T7 (R3, R4, R8, R9) Manual smoke test, roster mode: for the same course/academic year containing
      the enrollment from T6, `GET /api/citations?course_id=<id>&academic_year_id=<id>` → the roster
      row for that enrollment has a `citations` array whose matching citation object carries the same
      `attachments` content and ordering observed in T6 (1 entry, matching `id`/`fileName`/`url`); a
      citation with zero attachments elsewhere in the same roster response shows `attachments: []`.
      Capture verbatim request/response.

- [ ] T8 (R5) Regression check: diff a `GET` response captured before T1/T2 (or reconstruct expected
      values from `design.md`'s "old" field list) against the post-change response for the same
      citation — confirm `id`, `dateFrom`, `dateTo`, `time`, `status`, `observations`, `closedAt`,
      `closedByUserId`, `createdByUserId`, `createdAt`, `reasonIds` (and, for roster mode,
      `enrollmentId`/`rosterNumber`/`studentName`/`guardianId`/`guardianName`/`guardianPhone`/
      `whatsappLink`) are unchanged — only `attachments` was added. Capture the comparison.

- [ ] T9 (R6, R7) Regression smoke test: repeat feature #10's own attachment smoke tests (T15 in
      `specs/citations_crud_and_attachments/tasks.md`) — zero files → `400`; disallowed MIME type →
      rejected, no row created; 6 files → rejected, no row created; delete of an attachment belonging
      to a *different* citation → `404` — to confirm upload/delete validation and status codes are
      byte-for-byte unchanged by this feature. Capture verbatim request/response.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1, T6 |
| R2 | T1, T6 |
| R3 | T2, T7 |
| R4 | T2, T7 |
| R5 | T1, T2, T8 |
| R6 | T3, T9 |
| R7 | T4, T9 |
| R8 | T6, T7 |
| R9 | T6, T7 |
