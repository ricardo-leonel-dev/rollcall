# Requirements — Export endpoint accepts quarter selection

Scope: backend-only (this repo). `GET /api/export/excel` (`src/controllers/export.controller.ts`,
`src/services/export.service.ts`) currently forwards only `institution_id`, `course_ids`,
`academic_year_id`, `date_from`, `date_to` (and optional `signers`) to `excel-service`, which is why
the generated report always uses the template's first sheet regardless of the requested period. This
feature adds an optional `quarter_id` query parameter that, when supplied, is validated and forwarded
to `excel-service` as the period indicator so it can select the matching template sheet (see the
`excel-service` project's own pending feature `export_selects_the_correct_trimester_sheet`, which
consumes the parameters this feature sends).

This feature is scoped against the **current** `quarters` model as implemented by
`api_configure_academic_quarters_trimestres_per_academic_year` (feature 1, `done`): every academic
year has exactly three quarter rows (`id`, `academic_year_id`, `institution_id`, `name`,
`sequence_number`, `start_date`/`end_date` nullable, `deleted_at`/`is_active`), scoped to the
institution's currently *active* academic year via `quarter.service.ts#findActiveAcademicYear`. It
does **not** assume the changes proposed by the sibling feature
`relax_quarter_naming_and_count_constraints` (`spec_ready`, not yet implemented) — arbitrary period
counts/names are out of scope here.

## Backward compatibility

## R1
WHERE the `quarter_id` query parameter is not supplied on `GET /api/export/excel`, the system SHALL
send the request to `excel-service` with exactly the same query parameters as before this feature
(no `quarter_sequence` or `quarter_name` parameter added).

## Validating the `quarter_id` format

## R2
IF the `quarter_id` query parameter is supplied on `GET /api/export/excel` and is not a positive
integer THEN the system SHALL respond with HTTP 400 and SHALL NOT call `excel-service`.

## Resolving `quarter_id` against the requesting institution

## R3
IF the `quarter_id` query parameter is supplied as a positive integer and the requesting institution
has no active academic year THEN the system SHALL respond with HTTP 404 and SHALL NOT call
`excel-service`.

## R4
IF the `quarter_id` query parameter is supplied as a positive integer and does not match the `id` of
any non-deleted quarter belonging to the requesting institution's active academic year THEN the
system SHALL respond with HTTP 404 and SHALL NOT call `excel-service`.

## R5
IF the `quarter_id` query parameter resolves to a non-deleted quarter of the requesting institution's
active academic year, but that quarter's `academic_year_id` differs from the `academic_year_id` query
parameter supplied on the same request, THEN the system SHALL respond with HTTP 404 and SHALL NOT
call `excel-service`.

## Forwarding the resolved period to excel-service

## R6
WHEN the `quarter_id` query parameter resolves to a non-deleted quarter of the requesting
institution's active academic year whose `academic_year_id` matches the `academic_year_id` query
parameter of the same request, the system SHALL include that quarter's `sequence_number` as
`quarter_sequence` and its `name` (URL-encoded) as `quarter_name` in the request sent to
`excel-service`, in addition to the parameters described in R7.

## R7
WHEN `quarter_id` is supplied and resolves successfully per R6, the system SHALL still include
`institution_id`, `course_ids`, `academic_year_id`, `date_from`, `date_to` (and `signers`, when
present) in the request sent to `excel-service`, unchanged from current behavior.
