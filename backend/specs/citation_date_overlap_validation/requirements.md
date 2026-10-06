# Requirements — Validate overlapping scheduled date ranges when creating or editing citations

Context: feature `citations_crud_and_attachments` (feature #10, `done`) implemented
`create`/`update` in `src/services/citation.service.ts` with an `assertDateOrder` check that only
verifies a single citation's own `dateFrom <= dateTo` — it never checks the new/edited date range
against *other* citations already scheduled for the same `enrollmentId`. Two `pending` citations for
the same student can therefore be scheduled on overlapping dates today, which is confusing for staff
managing an inspector's calendar. This feature adds that cross-citation check to `create` and
`update`, rejecting the request with `409` and enough detail (the conflicting citation's dates/time
plus the shared student/guardian names) for a caller to render a clear message — see
`design.md`'s "Discarded alternatives" for why this is an application-level check, not a DB
constraint, and why `time` is not part of the overlap comparison. The frontend counterpart
(`citation_overlap_conflict_ui`, `attendance_frontend` feature #25, still `pending` as of this
writing) consumes the `409` response shape defined here (R3).

Acceptance-criterion mapping (every bullet from the feature description is satisfied by at least one
`R<n>` below):
- "create() and update() reject an overlapping date range for the same enrollment with a 409
  response including the conflicting citation's dates/time/student/representative" → **R2, R3, R6,
  R7**
- "Closed citations (closed_at set) do not block new overlapping ranges" → **R4**
- "Non-overlapping ranges for the same enrollment are unaffected" → **R9, R10**

## Overlap definition

## R1
The system SHALL consider a candidate date range (`dateFrom`, `dateTo`) to overlap an existing
citation's range (`existingDateFrom`, `existingDateTo`) when `dateFrom <= existingDateTo` AND
`dateTo >= existingDateFrom` (inclusive on both ends; the `time` field is not part of this
comparison — see `design.md`'s discarded alternatives for why).

## API — `POST /api/citations`

## R2
WHEN `POST /api/citations` is sent with a body that would otherwise succeed per
`citations_crud_and_attachments`' R10 (in-scope `enrollmentId`, `dateFrom <= dateTo`, valid
`reasonIds`), and its date range overlaps (per R1) at least one other non-deleted citation with
`status = 'pending'` for the same `enrollmentId`, the system SHALL respond `409` and SHALL NOT
create any `citations` or `citation_citation_reasons` row.

## R3
WHEN R2's `409` response is sent, the system SHALL include in the JSON body a `conflict` object
with the overlapping citation's `id`, `dateFrom`, `dateTo`, `time`, and the shared enrollment's
`studentName`, `guardianName`, and `guardianPhone`.

## R4
IF every existing citation for the given `enrollmentId` whose date range overlaps (per R1) the
requested one has `status = 'closed'` THEN the system SHALL NOT respond `409` for that reason and
SHALL proceed to create the citation exactly as specified by `citations_crud_and_attachments`' R10.

## R5
IF more than one non-deleted, `pending` citation for the same `enrollmentId` overlaps (per R1) the
requested date range THEN the system SHALL report exactly one of them in R3's `conflict` object,
choosing the one with the earliest `dateFrom` (ties broken by lowest `id`).

## API — `PUT /api/citations/:id`

## R6
WHEN `PUT /api/citations/:id` is sent with a body that results (per `citations_crud_and_attachments`'
R15/R16) in an effective `dateFrom`/`dateTo` — regardless of whether the request body includes
`dateFrom`/`dateTo` or leaves them at the citation's current values — that overlaps (per R1) at
least one *other* (`id` different from the target citation's own `id`), non-deleted, `pending`
citation for the same `enrollmentId`, the system SHALL respond `409` with the same `conflict` shape
as R3 and SHALL NOT modify any row.

## R7
WHERE `PUT /api/citations/:id`'s target citation's own current date range would, by itself, satisfy
R1's overlap condition against its own unmodified values, the system SHALL exclude that citation's
own `id` from R6's check, so that updating an unrelated field (e.g. `observations`) without changing
`dateFrom`/`dateTo` is never rejected as conflicting with itself.

## R8
IF every other citation for the given `enrollmentId` whose date range overlaps (per R1) the
`PUT` request's effective range has `status = 'closed'` THEN the system SHALL NOT respond `409` for
that reason and SHALL proceed to update the citation exactly as specified by
`citations_crud_and_attachments`' R15.

## Non-overlapping case is unaffected

## R9
IF a `POST /api/citations` request's date range does not overlap (per R1) any non-deleted, `pending`
citation for the same `enrollmentId` THEN this feature SHALL NOT change the response status, body
shape, or any other behavior of `citations_crud_and_attachments`' R10.

## R10
IF a `PUT /api/citations/:id` request's effective date range does not overlap (per R1) any other
non-deleted, `pending` citation for the same `enrollmentId` THEN this feature SHALL NOT change the
response status, body shape, or any other behavior of `citations_crud_and_attachments`' R15.

## Error response wiring

## R11
The system SHALL modify `src/middleware/error.middleware.ts` so that when a thrown `Error` reaching
its generic (non-Multer, non-duplicate-key, non-foreign-key) branch carries an own `conflict`
property, the JSON response body SHALL include that value under a `conflict` key alongside the
existing `error` key, without changing the response's status code or the existing `error` message
behavior for errors that do not carry a `conflict` property.

## Build

## R12
WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit code
`0`, introducing no new TypeScript errors attributable to `src/services/citation.service.ts` or
`src/middleware/error.middleware.ts`.

## Manual verification

## R13
WHEN the implementation of R2–R8 is complete, the system SHALL be verified by a manual smoke test
documented in `progress/impl_citation_date_overlap_validation.md`, covering at minimum: (i)
`POST /api/citations` for an `enrollmentId` with an existing `pending` citation on an overlapping
range → `409` with the expected `conflict` shape, no row created; (ii) the same overlapping
`POST`, but the existing citation is `closed` → `201`, row created normally; (iii) `PUT` on a
citation to move its dates onto a range that overlaps a *different* `pending` citation for the same
enrollment → `409`, no modification; (iv) `PUT` on a citation changing only `observations` (dates
unchanged) → `200`, not rejected as self-conflicting; (v) a fully non-overlapping `POST`/`PUT` →
succeeds exactly as before this feature. Each case's actual request/response SHALL be captured
verbatim in that file's Traceability section.
