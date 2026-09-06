# Requirements — Citation attachments retrieval

Context: feature `citations_crud_and_attachments` (feature #10, already `done`) implemented
`citation_attachments` upload (`POST /api/citations/:id/attachments`) and delete
(`DELETE /api/citations/:id/attachments/:attachmentId`), but the two read paths that return citation
data — `findByEnrollment` (pending-detection mode, `GET /api/citations?enrollment_id=<id>`) and
`findRoster` (roster mode, `GET /api/citations?course_id=<id>&academic_year_id=<id>`) — never select
`citation_attachments` rows at all, so a citation's uploaded evidence is invisible to any caller of
these two endpoints even though the rows exist in the database. `justification.service.ts`'s
`findAll` already solves the equivalent problem for `justification_attachments` via a correlated
`json_agg` subquery in the same `SELECT`; this feature mirrors that pattern for citations. No new
endpoint, no schema change, and no change to the upload/delete behavior itself is in scope — see
`design.md`'s "Discarded alternatives" for why a dedicated `GET .../attachments` endpoint is not
added here.

## API — `GET /api/citations` (pending-detection mode: `enrollment_id`)

## R1
WHEN an authenticated, authorized user sends `GET /api/citations?enrollment_id=<id>`, the system
SHALL include, on each citation object in the response, an `attachments` field containing a JSON
array of that citation's `citation_attachments` rows ordered by `createdAt` ascending, each entry
including `id`, `fileName`, `originalName`, `mimeType`, `createdAt`, and `url`.

## R2
IF a citation in R1's response has zero `citation_attachments` rows THEN its `attachments` field
SHALL be an empty array (`[]`), never `null` and never omitted from the object.

## API — `GET /api/citations` (roster mode: `course_id` + `academic_year_id`)

## R3
WHEN an authenticated, authorized user sends `GET /api/citations?course_id=<id>&academic_year_id=<id>`,
the system SHALL include, on each citation object within each roster row's `citations` array, an
`attachments` field with the same content and ordering described in R1.

## R4
IF a citation within R3's roster response has zero `citation_attachments` rows THEN its `attachments`
field SHALL be an empty array (`[]`), never `null` and never omitted from the object.

## Response shape stability

## R5
The system SHALL NOT remove, rename, or change the value of any field already returned by
`findByEnrollment`/`findRoster` before this feature (`id`, `dateFrom`, `dateTo`, `time`, `status`,
`observations`, `closedAt`, `closedByUserId`, `createdByUserId`, `createdAt`, `reasonIds`, and, for
roster mode, `enrollmentId`, `rosterNumber`, `studentName`, `guardianId`, `guardianName`,
`guardianPhone`, `whatsappLink`) — `attachments` is added as a new field only.

## Attachment upload/delete unaffected

## R6
WHEN `POST /api/citations/:id/attachments` is sent with valid files for a citation in scope, the
system SHALL continue to store each file under `uploads/citaciones`, create a matching
`citation_attachments` row per file, and respond `201` with the created attachment records
(including `url`), exactly as before this feature.

## R7
WHEN `DELETE /api/citations/:id/attachments/:attachmentId` is sent for an attachment that belongs to
the given citation, the system SHALL continue to delete the `citation_attachments` row, remove the
underlying file from `uploads/citaciones`, and respond `204`, exactly as before this feature.

## Read-after-write consistency

## R8
WHEN an attachment has been added to a citation via `POST /api/citations/:id/attachments`, a
subsequent `GET /api/citations` request (either pending-detection or roster mode) that includes that
citation SHALL list the new attachment in its `attachments` array.

## R9
WHEN an attachment has been removed from a citation via
`DELETE /api/citations/:id/attachments/:attachmentId`, a subsequent `GET /api/citations` request
(either pending-detection or roster mode) that includes that citation SHALL NOT list the removed
attachment in its `attachments` array.
