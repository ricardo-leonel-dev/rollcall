# Tasks — Validate overlapping scheduled date ranges when creating or editing citations

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists the
file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition. The
implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]` without
a documented, reviewer-accepted justification in
`progress/impl_citation_date_overlap_validation.md`.

This project has no automated test framework (`docs/verification.md`) — traceability here is
satisfied the same way it was for features #7/#9/#10: a `pnpm run build` pass plus a manual smoke
test against the real API, with verbatim request/response captured in
`progress/impl_citation_date_overlap_validation.md`.

- [ ] T1 (R1, R3, R5) Add the `assertNoOverlap` helper to `src/services/citation.service.ts` exactly
      as shown in `design.md`'s "`assertNoOverlap`" section (raw `AppDataSource.query` joining
      `v_enrollments_detail`, `status = 'pending'`, `deleted_at IS NULL`, inclusive date overlap,
      `ORDER BY date_from ASC, id ASC LIMIT 1`, optional `excludeId`).

- [ ] T2 (R2, R4) Call `assertNoOverlap` from `create`, right after `assertEnrollmentInScope` and
      before `assertReasonIds`, per `design.md`'s "Validation order" section.

- [ ] T3 (R6, R7, R8) Call `assertNoOverlap` from `update`, right after computing
      `nextDateFrom`/`nextDateTo` and `assertDateOrder`, passing the target citation's own `id` as
      `excludeId`, before `assertReasonIds`.

- [ ] T4 (R11) Modify `src/middleware/error.middleware.ts`'s generic (final) `Error` branch to
      forward an own `conflict` property from the thrown error into the JSON response body, exactly
      as shown in `design.md`'s "`error.middleware.ts` — forwarding `conflict`" section. Widen the
      local `HttpError` interface with an optional `conflict?: unknown` field.

- [ ] T5 (R12) Run `pnpm run build` (or `node_modules/.bin/tsc -p .` if `pnpm` isn't available).
      Done: exits `0` with no new TypeScript errors attributable to `citation.service.ts` or
      `error.middleware.ts`.

- [ ] T6 (R13, R2, R3) Manual smoke test, `POST /api/citations` overlap: create a `pending` citation
      for an enrollment on `[dateFrom, dateTo]`, then `POST` a second citation for the same
      `enrollmentId` on an overlapping range → `409` with a `conflict` object containing the first
      citation's `id`/`dateFrom`/`dateTo`/`time`/`studentName`/`guardianName`/`guardianPhone`; confirm
      via a subsequent `GET` that no second row was created. Capture verbatim request/response.

- [ ] T7 (R13, R4) Manual smoke test, closed citations don't block: close the first citation
      (`PUT /:id/close`), then repeat T6's overlapping `POST` → `201`, row created normally, no
      `conflict`. Capture verbatim request/response.

- [ ] T8 (R13, R6) Manual smoke test, `PUT` overlap: create two non-overlapping `pending` citations
      (A and B) for the same enrollment, then `PUT` citation A's dates onto a range overlapping B →
      `409` with `conflict` describing B; confirm via `GET` that A's dates are unchanged. Capture
      verbatim request/response.

- [ ] T9 (R13, R7) Manual smoke test, self-exclusion: `PUT` citation A changing only `observations`
      (no `dateFrom`/`dateTo` in the body) → `200`, not rejected as conflicting with itself. Capture
      verbatim request/response.

- [ ] T10 (R13, R9, R10) Manual smoke test, non-overlapping case unaffected: `POST` a citation for a
      date range that does not overlap any existing `pending` citation for that enrollment → `201`
      exactly as before this feature; `PUT` an existing citation to a non-overlapping range → `200`
      exactly as before. Capture verbatim request/response.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1, T6, T7, T8, T10 |
| R2 | T2, T6 |
| R3 | T1, T6 |
| R4 | T2, T7 |
| R5 | T1 |
| R6 | T3, T8 |
| R7 | T3, T9 |
| R8 | T3, T7 |
| R9 | T10 |
| R10 | T10 |
| R11 | T4 |
| R12 | T5 |
| R13 | T6, T7, T8, T9, T10 |
