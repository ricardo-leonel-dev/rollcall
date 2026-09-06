# Requirements — Guardian-scoped 10-minute conflict validation for citations

Context: this feature replaces the superseded `citation_date_overlap_validation` (#14). The model is
no longer "two pending citations for the same enrollment on overlapping date ranges" — it's "two
pending citations for the same **representative** on the same date whose `time` values are within
10 minutes of each other". The representative (guardian) is the scarce resource: two students can
share a guardian and two staff from different courses can cite the same guardian without seeing each
other, but the guardian can't be in two places at once. To make that work, the `citations` table
itself has to grow a `guardian_id` column (so the conflict check doesn't have to JOIN back through
`enrollments` on every read, and historical citations don't get retroactively rewritten when an
enrollment's guardian changes), and the `date_from`/`date_to` window collapses into a single
`date` (the multi-day window was a side-effect of the old per-enrollment model and is meaningless
when the conflict key is the guardian's agenda). `time` becomes `NOT NULL` — a citation without a
time is uncit-able. Closed citations still never block. The 409 response is privacy-redacted for
course-scoped callers (teachers, block inspectors): they only see `date` and `time`, never the
student, guardian, or course names. The 409 shape and middleware forwarding were already wired in
#14 (`HttpError.conflict`, `errorMiddleware` generic branch) and are reused as-is — this feature
only changes what the helper checks and what it returns.

Acceptance-criterion mapping (every bullet from the feature description is satisfied by at least one
`R<n>` below):

- "Conflict is on `guardian_id`, `date`, and `time` proximity (10 minutes)" → **R11, R15**
- "Same representative, same date, time diff >= 10 minutes is fine; same date, same time is not"
  → **R11** (strict `< 600` seconds)
- "Conflict check is institution-wide, ignoring `req.courseIds`" → **R15**
- "`update()` doesn't conflict with itself" → **R14**
- "Closed citations never block" → **R16**
- "Create/update requires `time`" → **R7, R8**
- "Create/update requires an enrollment with a non-null `guardian_id`" → **R9, R10**
- "Single `date` column replaces `dateFrom`/`dateTo`" → **R2, R4, R6**
- "`time` is backfilled to `07:55` and then `NOT NULL`" → **R3**
- "`citations.guardian_id` is added, backfilled from `enrollments.guardian_id`, set on insert, not
  re-resolved from the enrollment on update" → **R1, R9, R10, R13**
- "Historical rows with `guardian_id IS NULL` neither block nor are blocked" → **R17**
- "409 payload is redacted for course-scoped callers (date + time only)" → **R12, R18**

## Schema — migration `23_citation_guardian_conflict.sql`

### Guardian column

## R1

WHEN the migration runs, the system SHALL add to `citations` a nullable `guardian_id INTEGER` column
with a foreign key to `guardians(id)`, and SHALL backfill it for every existing row by copying
`enrollments.guardian_id` of that row's enrollment; rows whose enrollment has `guardian_id IS NULL`
remain with `citations.guardian_id IS NULL` after the backfill.

### Single date column

## R2

WHEN the migration runs, the system SHALL add to `citations` a nullable `date DATE` column and
SHALL backfill it for every existing row by copying that row's current `date_from` value (the
collapsed-date decision; `date_to` is dropped — see R4).

### Time becomes NOT NULL

## R3

WHEN the migration runs, the system SHALL set `citations.time = '07:55'` for every row where
`time IS NULL` first, and THEN `ALTER COLUMN time SET NOT NULL` (without a `DEFAULT`) — the
backfill must precede the `NOT NULL` constraint so no row is rejected by it.

### Drop the old range columns

## R4

WHEN the migration completes, the system SHALL have dropped `citations.date_from` and
`citations.date_to` (R2's new `date` column carries the value forward) and the schema SHALL contain
no column named `date_from` or `date_to`.

### Index for the conflict query

## R5

WHEN the migration completes, the system SHALL have created the index
`idx_citations_guardian_date` on `citations(guardian_id, date) WHERE status = 'pending' AND
deleted_at IS NULL` (partial index — the conflict query always carries those two predicates, and
excluding non-pending/deleted rows keeps it small).

### Supabase variant

## R5a

The system SHALL ship a companion migration file `23_citation_guardian_conflict_supabase.sql` with
the same logic as `23_citation_guardian_conflict.sql` but with every `citations`/`enrollments`/
`guardians` reference schema-qualified as `attendance.<table>`, matching the existing
`*_supabase.sql` convention (`postgres/09_*_supabase.sql`,
`postgres/08_user_courses_academic_year_supabase.sql`,
`postgres/09_inspector_apoyo_general_supabase.sql`).

## API shape

## R6

The system SHALL expose a single `date` field on every citation read and write (in place of the
legacy `dateFrom`/`dateTo`) — `POST /api/citations`, `PUT /api/citations/:id`,
`GET /api/citations?enrollment_id=...`, `GET /api/citations?course_id=...&academic_year_id=...`, and
the conflict `409` payload — and SHALL NOT include `dateFrom` or `dateTo` in any of those response
bodies after this feature ships.

## Create — input validation

## R7

WHEN `POST /api/citations` is sent with a body whose `time` field is missing, empty, or otherwise
falsy, the system SHALL respond `400` and SHALL NOT create any `citations` or
`citation_citation_reasons` row.

## R8

WHEN `POST /api/citations` is sent with a body whose `date` field is missing, malformed, or
otherwise falsy, the system SHALL respond `400` and SHALL NOT create any `citations` or
`citation_citation_reasons` row.

## R9

WHEN `POST /api/citations` is sent for an `enrollmentId` whose current `enrollments.guardian_id`
is `NULL` (no representative on file for that enrollment), the system SHALL respond `400` and
SHALL NOT create any `citations` row, even when the rest of the body would otherwise validate.

## Update — input validation

## R10

WHEN `PUT /api/citations/:id` is sent with a body whose `time` field is explicitly set to an
empty string or `null` (not merely omitted), the system SHALL respond `400` and SHALL NOT modify
any row. (Omitting `time` keeps the citation's current `time` — that's not "missing".)

## R11

WHEN `PUT /api/citations/:id` is sent for a citation whose stored `citations.guardian_id IS NULL`
(i.e. a historical row that predates the new rule and was never updated to carry a
representative), the system SHALL respond `400` and SHALL NOT modify any row.

## Conflict rule

## R12

WHEN `POST /api/citations` is sent with a body that would otherwise succeed per R7–R9 and the
existing `citations_crud_and_attachments` R10 pre-conditions, and there exists another
non-deleted `citations` row in the same institution with `status = 'pending'`, the same
`guardian_id`, the same `date`, and a `time` whose absolute difference from the request's `time` is
**strictly less than 600 seconds (10 minutes)**, the system SHALL respond `409` and SHALL NOT
create any `citations` or `citation_citation_reasons` row.

## R13

WHEN `PUT /api/citations/:id` is sent with a body whose effective `date` and `time` (computed
the same way `citations_crud_and_attachments`' R15 computes the legacy date fields — `data.X ??
currentX`) satisfy R12's conditions against any **other** (`id` different from the target
citation's own `id`) non-deleted, `pending` citation in the same institution, the system SHALL
respond `409` and SHALL NOT modify any row.

## R14

WHERE `PUT /api/citations/:id` keeps the target citation's own current `date` and `time`
unchanged (whether the request body omits them or supplies the same values), the system SHALL
exclude the target citation's own `id` from R13's check, so that updating an unrelated field
(e.g. `observations`, `reasonIds`) without touching the scheduling fields is never rejected as
conflicting with itself.

## R15

The system SHALL scope R12 and R13 by `citations.institution_id = $institutionId` only — the
check SHALL NOT filter by `req.courseIds`, so that two conflicting citations may live in
different courses and the same caller still gets a `409`.

## R16

IF every existing citation matching R12's (or R13's) `guardian_id` + `date` + time-proximity
conditions has `status = 'closed'` THEN the system SHALL NOT respond `409` for that reason and
SHALL proceed with `create` (or `update`) exactly as specified.

## R17

WHERE an existing `citations` row has `guardian_id IS NULL` (a historical row with no
representative), that row SHALL be excluded from R12/R13's `guardian_id` predicate by SQL `NULL`
semantics and therefore neither blocks nor is blocked by new citations — historical rows are
inert against the new rule. (R11 separately forbids updating those rows, so they can never
become the focal citation of a `PUT` either.)

## 409 payload — privacy redaction

## R18

WHEN R12 or R13 fires a `409`, the system SHALL attach to the thrown error a `conflict` object
whose keys depend on `req.courseIds`:

- WHERE `req.courseIds === null` (rector, admin, "inspector general", or any superadmin operating
  on an institution), the object SHALL include `id`, `date`, `time`, `studentName`,
  `guardianName`, `guardianPhone`, and `courseName`.
- WHERE `req.courseIds` is a non-null array (course-scoped callers: teacher, "inspector de
  bloque"), the object SHALL include only `id`, `date`, and `time`; `studentName`,
  `guardianName`, `guardianPhone`, and `courseName` SHALL NOT be present in the JSON response.

(`id` is included in both variants — it's a serial number that doesn't disclose a person, and
the frontend needs it to correlate the conflict with the row that already exists in the list.)

## Build

## R19

WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit
code `0`, introducing no new TypeScript errors attributable to `src/entities/Citation.ts`,
`src/services/citation.service.ts`, or the new migration files.

## Manual verification

## R20

WHEN the implementation of R1–R18 is complete, the system SHALL be verified by a manual smoke test
documented in `progress/impl_citation_guardian_conflict_validation.md`, covering at minimum:
(i) the migration runs cleanly and the post-condition SELECTs return the expected values (sample
inspect of the backfilled rows, `time IS NOT NULL`, `date_from`/`date_to` columns gone, the
`idx_citations_guardian_date` partial index present); (ii) `POST /api/citations` with no `time` →
`400`, no row created; (iii) `POST` with no `date` → `400`; (iv) `POST` for an enrollment whose
`enrollments.guardian_id IS NULL` → `400`; (v) `POST` for an enrollment with a guardian where
another `pending` citation at same `guardian_id`+`date`+`time = 07:55` already exists → `409`
with the full `conflict` object (courseIds null); (vi) the same `POST` but `courseIds` is a
single-element array → `409` whose `conflict` contains only `id`, `date`, `time`; (vii) `POST`
same guardian + same date but `time` exactly 10 minutes after the existing one (e.g. existing
`07:55`, new `08:05`) → `201`; (viii) `POST` same guardian + same date but `time` 9 minutes after
(e.g. `07:55` and `08:04`) → `409`; (ix) `POST` same guardian but different `date` → `201`;
(x) `POST` same guardian + same `date` + same `time` but the existing one is `closed` → `201`;
(xi) `POST` with a guardian from a **different** institution → `201` (institution scope); (xii)
`PUT` on citation A to a time that conflicts with a different `pending` citation B for the same
guardian → `409`; (xiii) `PUT` on A keeping `date` and `time` unchanged but changing
`observations` → `200` (R14 self-exclusion); (xiv) `PUT` on a historical row with
`guardian_id IS NULL` → `400` (R11); (xv) `POST` and `PUT` request/response bodies use `date`,
never `dateFrom`/`dateTo` (R6). Each case's actual request/response SHALL be captured verbatim in
that file's Traceability section.
