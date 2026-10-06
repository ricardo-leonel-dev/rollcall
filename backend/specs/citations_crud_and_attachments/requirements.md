# Requirements — Citations CRUD, attachments, and pending-detection

Context: feature `citation_reasons_management` (feature #9) creates the full "citaciones" schema in
one migration — `citation_reasons`, `citations`, `citation_citation_reasons`, `citation_attachments`
— and defines/registers all four matching TypeORM entities (`CitationReason`, `Citation`,
`CitationCitationReason`, `CitationAttachment`), but only implements a service/controller for
`citation_reasons`. This feature is the operational API built on top of that schema: CRUD for
`citations` themselves, their many-to-many link to `citation_reasons`, file attachments, a
roster-shaped listing (for a course/year "citaciones" screen), and a pending-citation lookup for a
single enrollment (used before creating a new citation, to warn about an existing open one). Feature
#9 must already be implemented (its entities and tables present) before this feature's code can
compile or run — see `design.md`'s "Dependency on feature #9" section.

## API — `GET /api/citations` (roster mode: `course_id` + `academic_year_id`)

## R1
WHEN an authenticated, authorized user sends `GET /api/citations?course_id=<id>&academic_year_id=<id>`,
the system SHALL respond `200` with one row per non-deleted enrollment in that course and academic
year (scoped to the caller's institution, and — when `req.courseIds` is non-null — only if `course_id`
is included in it), each row including `enrollmentId`, `rosterNumber`, `studentName`, `guardianId`,
`guardianName`, `guardianPhone`, and `whatsappLink`.

## R2
WHEN responding to R1's request, the system SHALL include on each roster row a `citations` field
containing a JSON array of that enrollment's non-deleted citations ordered by `dateFrom` descending,
each with `id`, `dateFrom`, `dateTo`, `time`, `status`, `observations`, `closedAt`,
`closedByUserId`, `createdByUserId`, `createdAt`, and `reasonIds` (array of linked
`citation_reason` ids).

## R3
IF `GET /api/citations` is sent with `course_id` but without `academic_year_id` THEN the system
SHALL respond `400` and SHALL NOT query any enrollment or citation row.

## R4
IF `GET /api/citations`'s `course_id` does not belong to the caller's institution, or (when
`req.courseIds` is non-null) is not included in it, THEN the system SHALL respond `404`.

## API — `GET /api/citations` (pending-detection mode: `enrollment_id`)

## R5
WHEN an authenticated, authorized user sends `GET /api/citations?enrollment_id=<id>` (without
`course_id`), the system SHALL respond `200` with a flat JSON array of that enrollment's non-deleted
citations (same per-citation fields as R2, without roster context), ordered by `dateFrom` descending.

## R6
WHERE a `status` query parameter (`pending` or `closed`) is additionally provided in pending-detection
mode, the system SHALL filter the R5 response to only citations with that `status`.

## R7
IF `status` is provided with a value other than `pending` or `closed` THEN the system SHALL respond
`400` and SHALL NOT query any citation row.

## R8
IF pending-detection mode's `enrollment_id` does not belong to the caller's institution, or (when
`req.courseIds` is non-null) its course is not included in it, THEN the system SHALL respond `404`.

## R9
IF `GET /api/citations` is sent with neither `course_id` nor `enrollment_id` THEN the system SHALL
respond `400` and SHALL NOT query any enrollment or citation row.

## API — `POST /api/citations`

## R10
WHEN an authenticated, authorized user sends `POST /api/citations` with an in-scope `enrollmentId`,
`dateFrom` <= `dateTo`, an optional `time`/`observations`, and a non-empty `reasonIds` array of
citation-reason ids that all exist, are non-deleted, and belong to the caller's institution, the
system SHALL create a new citation with `status` `pending` and `createdByUserId` set to the caller,
link every given `reasonId` to it, and respond `201` with the created record.

## R11
IF `POST /api/citations`'s `dateFrom` is after its `dateTo` THEN the system SHALL respond `400` and
SHALL NOT create any `citations` or `citation_citation_reasons` row.

## R12
IF `POST /api/citations`'s `reasonIds` is missing or empty THEN the system SHALL respond `400` and
SHALL NOT create any `citations` row.

## R13
IF any id in `POST /api/citations`'s `reasonIds` does not exist, is soft-deleted, or belongs to a
different institution than the caller's THEN the system SHALL respond `404` and SHALL NOT create any
`citations` or `citation_citation_reasons` row.

## R14
IF `POST /api/citations`'s `enrollmentId` does not exist, belongs to a different institution than the
caller's, or (when `req.courseIds` is non-null) its course is not included in it, THEN the system
SHALL respond `404` and SHALL NOT create any `citations` row.

## API — `PUT /api/citations/:id`

## R15
WHEN an authenticated, authorized user sends `PUT /api/citations/:id` with a valid partial body
(any of `dateFrom`, `dateTo`, `time`, `observations`, `reasonIds`) for a non-deleted citation owned
by the caller's institution (and, when `req.courseIds` is non-null, within scope), the system SHALL
update only the provided fields — fully replacing the citation's reason links when `reasonIds` is
provided — and SHALL respond `200` with the updated record.

## R16
IF a `PUT /api/citations/:id` request results in an effective `dateFrom` later than the effective
`dateTo` (considering any provided override against the citation's existing values) THEN the system
SHALL respond `400` and SHALL NOT modify any row.

## R17
IF `PUT /api/citations/:id` targets an `id` that does not exist, is already soft-deleted, or is out
of the caller's institution/`courseIds` scope THEN the system SHALL respond `404` and SHALL NOT
modify any row.

## API — `PUT /api/citations/:id/close`

## R18
WHEN an authenticated, authorized user sends `PUT /api/citations/:id/close` for a `pending` citation
in scope, the system SHALL set `status` to `closed`, `closedAt` to the current time, and
`closedByUserId` to the caller, and SHALL respond `200` with the updated record.

## R19
IF `PUT /api/citations/:id/close` targets a citation whose `status` is already `closed` THEN the
system SHALL respond `409` and SHALL NOT modify any row.

## R20
IF `PUT /api/citations/:id/close` targets an `id` that does not exist, is already soft-deleted, or is
out of the caller's institution/`courseIds` scope THEN the system SHALL respond `404`.

## API — `DELETE /api/citations/:id`

## R21
WHEN an authenticated, authorized user sends `DELETE /api/citations/:id` for a non-deleted citation
in scope, the system SHALL set that row's `deletedAt` to the current time and `isActive` to `false`
(never a hard delete) and SHALL respond `204`.

## R22
IF `DELETE /api/citations/:id` targets an `id` that does not exist, is already soft-deleted, or is
out of the caller's institution/`courseIds` scope THEN the system SHALL respond `404` and SHALL NOT
modify any row.

## API — Attachments

## R23
WHEN an authenticated, authorized user sends `POST /api/citations/:id/attachments` with 1 to 5 files,
each within the allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`,
`application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) and each at most 8MB, for
a citation in scope, the system SHALL store each file under `uploads/citaciones`, create a matching
`citation_attachments` row per file, and respond `201` with the created attachment records (each
including a `url`).

## R24
IF `POST /api/citations/:id/attachments` is sent with zero files THEN the system SHALL respond `400`
and SHALL NOT create any `citation_attachments` row.

## R25
IF any file in `POST /api/citations/:id/attachments` exceeds 8MB, the request exceeds 5 files, or any
file's MIME type is not in R23's allowed list, THEN the system SHALL reject the request and SHALL NOT
create any `citation_attachments` row.

## R26
WHEN an authenticated, authorized user sends `DELETE /api/citations/:id/attachments/:attachmentId`
for an attachment that belongs to that citation, the system SHALL delete the `citation_attachments`
row, remove the underlying file from `uploads/citaciones`, and respond `204`.

## R27
IF `DELETE /api/citations/:id/attachments/:attachmentId`'s `attachmentId` does not belong to the
given citation `id` THEN the system SHALL respond `404` and SHALL NOT delete any row or file.

## Auth / permissions

## R28
IF any `/api/citations` request is sent without a valid JWT THEN the system SHALL respond `401` and
SHALL NOT read or write any `citations`, `citation_citation_reasons`, or `citation_attachments` row.

## R29
IF the caller's role has no `role_permissions` row for resource `citaciones`, or has one that does
not grant the requested action, THEN the system SHALL respond `403` and SHALL NOT read or write any
`citations`, `citation_citation_reasons`, or `citation_attachments` row (except superadmin, which
bypasses `role_permissions` entirely per the existing `requirePermission` convention).

## R30
WHERE the caller's role is `admin`, `rector`, `superadmin`, `inspector de apoyo`, or
`inspector general`, the system SHALL grant full CRUD (`read`, `create`, `update`, `delete`)
permission on resource `citaciones`, seeded via `role_permissions` rows created by this feature's
migration.

## R31
The system SHALL NOT seed any `role_permissions` row for resource `citaciones` for any role other
than the five listed in R30 (in particular: `teacher` and `readonly` get no row, and therefore no
access, per R29).

## Wiring / build

## R32
The system SHALL add `'citations'` to the `MODULE_KEYS` whitelist in `src/services/user.service.ts`.

## R33
The system SHALL mount the citations router at `/api/citations` in `src/routes/index.ts`, inside the
standard authenticated block (after `authMiddleware` and `institutionMiddleware`, alongside every
other resource router).

## R34
The system SHALL create the `uploads/citaciones` directory on startup (`src/app.ts`'s bootstrap),
mirroring the existing `uploads/justifications` bootstrap.

## R35
The system SHALL compile with zero new TypeScript errors introduced by this feature (`pnpm run
build` exits `0`).

## R36
The system SHALL add `'citation-reasons'` to the `MODULE_KEYS` whitelist in
`src/services/user.service.ts`, alongside the `'citations'` entry added by R32, so the frontend can
register and grant the citation-reasons admin module per user (this module key was not added when
feature #9 shipped the citation-reasons REST API, but the frontend admin tab for managing citation
reasons depends on it being present in the whitelist to enroll users into the module via
`user_modules`).
