# Requirements — Citation reasons (motivos) schema + CRUD

Context: this is the groundwork for a new "citaciones" (citations/summons) module. It creates the
full DB schema for the module in one migration (`citation_reasons`, `citations`,
`citation_citation_reasons`, `citation_attachments`) so the schema isn't split across migrations —
but this feature only implements the CRUD API for `citation_reasons` (the institution-configurable
"motivos" a citation can be issued for). The other three tables exist after this feature's
migration but have no service/controller/routes yet; that is feature
`citations_crud_and_attachments` (feature #10), which depends on this migration having landed.

## Schema (migration)

## R1
The system SHALL provide a Postgres migration file that creates, if they do not already exist, all
four tables: `citation_reasons`, `citations`, `citation_citation_reasons`, and
`citation_attachments`.

## R2
The system SHALL define `citation_reasons` with columns `id` (serial primary key), `institution_id`
(integer, `NOT NULL`, references `institutions(id)`), `name` (`varchar`, `NOT NULL`), `severity`
(`varchar`, `NOT NULL`, `CHECK (severity IN ('low', 'medium', 'high'))`), `description` (`text`,
nullable), `is_active` (`boolean`, `NOT NULL`, default `true`), `deleted_at` (`timestamptz`,
nullable), `created_at`/`updated_at` (`timestamptz`, `NOT NULL`, default `now()`), and a
`UNIQUE(institution_id, name)` constraint.

## R3
The system SHALL define `citations` with columns `id` (serial primary key), `institution_id`
(integer, `NOT NULL`, references `institutions(id)`), `enrollment_id` (integer, `NOT NULL`,
references `enrollments(id)`), `date_from`/`date_to` (`date`, `NOT NULL`), `time` (`time`,
nullable), `status` (`varchar`, `NOT NULL`, default `'pending'`, `CHECK (status IN ('pending',
'closed'))`), `observations` (`text`, nullable), `closed_at` (`timestamptz`, nullable),
`closed_by_user_id`/`created_by_user_id` (integer, nullable, reference `users(id)`), `is_active`
(`boolean`, `NOT NULL`, default `true`), `deleted_at` (`timestamptz`, nullable), and
`created_at`/`updated_at` (`timestamptz`, `NOT NULL`, default `now()`).

## R4
The system SHALL define `citation_citation_reasons` with columns `id` (serial primary key),
`citation_id` (integer, `NOT NULL`, references `citations(id)`), `citation_reason_id` (integer,
`NOT NULL`, references `citation_reasons(id)`), `created_at` (`timestamptz`, `NOT NULL`, default
`now()`), and a `UNIQUE(citation_id, citation_reason_id)` constraint.

## R5
The system SHALL define `citation_attachments` with columns `id` (serial primary key),
`citation_id` (integer, `NOT NULL`, references `citations(id)`), `file_name`/`original_name`
(`varchar`, `NOT NULL`), `mime_type` (`varchar`, `NOT NULL`), and `created_at` (`timestamptz`,
`NOT NULL`, default `now()`).

## R6
The system SHALL define TypeORM entities `CitationReason`, `Citation`, `CitationCitationReason`,
and `CitationAttachment`, each mapped to its matching table with camelCase properties per
`docs/conventions.md`'s entity-naming convention, and SHALL register all four in
`src/data-source.ts`'s `entities` array.

## API — `GET /api/citation-reasons`

## R7
WHEN an authenticated, authorized user sends `GET /api/citation-reasons`, the system SHALL respond
`200` with a JSON array of that user's institution's non-deleted (`deleted_at IS NULL`) citation
reasons, ordered by `name` ascending.

## API — `POST /api/citation-reasons`

## R8
WHEN an authenticated, authorized user sends `POST /api/citation-reasons` with a non-blank `name`,
a `severity` in `('low', 'medium', 'high')`, and an optional `description`, the system SHALL create
a new, active citation reason scoped to `req.institutionId` and SHALL respond `201` with the
created record.

## R9
IF `POST /api/citation-reasons` is sent with a missing, non-string, or blank (after trimming)
`name` THEN the system SHALL respond `400` and SHALL NOT create any `citation_reasons` row.

## R10
IF `POST /api/citation-reasons` is sent with a `severity` that is not one of `'low'`, `'medium'`,
or `'high'` THEN the system SHALL respond `400` and SHALL NOT create any `citation_reasons` row.

## R11
IF `POST /api/citation-reasons` is sent with a `name` that already belongs to a non-deleted
citation reason in the same institution THEN the system SHALL respond `409` and SHALL NOT create a
duplicate row.

## API — `PUT /api/citation-reasons/:id`

## R12
WHEN an authenticated, authorized user sends `PUT /api/citation-reasons/:id` with a valid partial
body (`name`, `severity`, and/or `description`) for a non-deleted citation reason belonging to
their own institution, the system SHALL update only the provided fields and SHALL respond `200`
with the updated record.

## R13
IF `PUT /api/citation-reasons/:id` targets an `id` that does not exist, is already soft-deleted, or
belongs to a different institution than the caller's THEN the system SHALL respond `404` and SHALL
NOT modify any row.

## API — `DELETE /api/citation-reasons/:id`

## R14
WHEN an authenticated, authorized user sends `DELETE /api/citation-reasons/:id` for a non-deleted
citation reason belonging to their own institution, the system SHALL set that row's `deleted_at` to
the current time and `is_active` to `false` (never a hard delete) and SHALL respond `204`.

## R15
IF `DELETE /api/citation-reasons/:id` targets an `id` that does not exist, is already soft-deleted,
or belongs to a different institution than the caller's THEN the system SHALL respond `404` and
SHALL NOT modify any row.

## Auth / permissions

## R16
IF any `/api/citation-reasons` request is sent without a valid JWT THEN the system SHALL respond
`401` and SHALL NOT read or write any `citation_reasons` row.

## R17
IF the caller's role has no `role_permissions` row for resource `citation-reasons`, or has one that
does not grant the requested action, THEN the system SHALL respond `403` and SHALL NOT read or
write any `citation_reasons` row (except superadmin, which bypasses `role_permissions` entirely per
the existing `requirePermission` convention).

## R18
WHERE the caller's role is `admin`, `rector`, or `superadmin`, the system SHALL grant full CRUD
(`read`, `create`, `update`, `delete`) permission on resource `citation-reasons`, seeded via
`role_permissions` rows created by the migration.

## R19
The system SHALL NOT seed any `role_permissions` row for resource `citation-reasons` for any role
other than `admin`, `rector`, and `superadmin` (in particular: `inspector`, `teacher`, and
`readonly` get no row, and therefore no access, per R17).

## Wiring / build

## R20
The system SHALL mount the citation-reasons router at `/api/citation-reasons` in
`src/routes/index.ts`, inside the standard authenticated block (after `authMiddleware` and
`institutionMiddleware`, alongside every other resource router).

## R21
The system SHALL compile with zero new TypeScript errors introduced by this feature (`pnpm run
build` exits `0`).
