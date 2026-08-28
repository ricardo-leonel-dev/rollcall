# Requirements — API: Configure academic quarters (trimestres) per academic year

Scope: backend-only. Adds a `quarters` table and a `/api/quarters` resource so each academic year
has exactly three fixed quarters (Primer/Segundo/Tercer Trimestre) whose date ranges can be
configured, validated against their parent academic year, and kept consistent when the academic
year's own dates change. This is the API layer the frontend's quarter-configuration screen depends
on (frontend work is out of scope).

## Schema

## R1
The system SHALL persist quarters in a `quarters` table with columns `id`, `academic_year_id`
(`NOT NULL`, foreign key to `academic_years.id`), `institution_id` (`NOT NULL`, foreign key to
`institutions.id`), `name`, `sequence_number`, `start_date`, `end_date`, `description`, `is_active`,
`created_at`, `updated_at`, and `deleted_at`.

## Provisioning (fixed set of 3 quarters per academic year)

## R2
WHEN a new academic year is created, the system SHALL create exactly three quarter rows for it,
associated with the new academic year's own `institution_id`, each with `is_active = true` and
`start_date`/`end_date` initially `NULL`: "Primer Trimestre" with `sequence_number = 1`, "Segundo
Trimestre" with `sequence_number = 2`, and "Tercer Trimestre" with `sequence_number = 3`.

## R3
WHEN an academic year is soft-deleted, the system SHALL soft-delete (`deleted_at` set to the
current timestamp) and set `is_active = false` on every non-deleted quarter belonging to it.

## Reading quarters

## R4
WHEN `GET /api/quarters` is called by a user whose role has `read` permission on the
`academic_years` resource, the system SHALL return the non-soft-deleted quarters belonging to the
requesting institution's currently active academic year (`academic_years.is_active = true AND
academic_years.deleted_at IS NULL`).

## R5
IF the requesting institution has no active academic year THEN `GET /api/quarters` SHALL respond
with HTTP 404 and SHALL NOT return quarter data.

## Creating a quarter

## R6
WHEN `POST /api/quarters` is called by a user whose role has `create` permission on the
`academic_years` resource, with a `name` matching one of the three fixed quarter names and dates
that satisfy R10 and R11, the system SHALL create a quarter row associated with the requesting
institution's currently active academic year and respond with HTTP 201.

## R7
IF `POST /api/quarters` is called by a user whose role lacks `create` permission on the
`academic_years` resource THEN the system SHALL respond with HTTP 403 and SHALL NOT create a
quarter.

## R8
IF the requesting institution has no active academic year THEN `POST /api/quarters` SHALL respond
with HTTP 404 and SHALL NOT create a quarter.

## R9
IF the `name` supplied to `POST /api/quarters` is not one of "Primer Trimestre", "Segundo
Trimestre", "Tercer Trimestre" THEN the system SHALL respond with HTTP 400 and SHALL NOT create the
quarter.

## R10
IF the `start_date`/`end_date` supplied to `POST /api/quarters` fall outside the target academic
year's own `start_date`/`end_date` range (when the academic year has both dates set) THEN the
system SHALL respond with HTTP 400 and SHALL NOT create the quarter.

## R11
IF the `start_date`/`end_date` supplied to `POST /api/quarters` overlap the date range of another
non-deleted quarter of the same academic year (that already has both dates set) THEN the system
SHALL respond with HTTP 400 and SHALL NOT create the quarter.

## R12
IF `POST /api/quarters` is called with a `name` that already has a non-deleted quarter row for the
same academic year THEN the system SHALL respond with HTTP 409 and SHALL NOT create a second row.

## Updating a quarter

## R13
WHEN `PUT /api/quarters/:id` is called by a user whose role has `update` permission on the
`academic_years` resource, targeting an existing non-deleted quarter of the requesting
institution's currently active academic year, with dates that satisfy R15 and R16, the system SHALL
update the quarter's `start_date`, `end_date`, and/or `description` and respond with HTTP 200.

## R14
IF `PUT /api/quarters/:id` targets a quarter that does not exist, is soft-deleted, or does not
belong to the requesting institution THEN the system SHALL respond with HTTP 404 and SHALL NOT
modify any row.

## R15
IF the `start_date`/`end_date` supplied to `PUT /api/quarters/:id` fall outside the target
quarter's academic year's own `start_date`/`end_date` range (when the academic year has both dates
set) THEN the system SHALL respond with HTTP 400 and SHALL NOT modify the quarter.

## R16
IF the `start_date`/`end_date` supplied to `PUT /api/quarters/:id` overlap the date range of
another non-deleted quarter of the same academic year (that already has both dates set) THEN the
system SHALL respond with HTTP 400 and SHALL NOT modify the quarter.

## Keeping quarters consistent when the academic year's own dates change

## R17
IF updating an academic year's `start_date`/`end_date` (via `PUT /api/academic-years/:id`) would
leave any of its existing non-deleted quarters that already have both `start_date` and `end_date`
set outside the proposed new range THEN the system SHALL reject the academic year update with HTTP
409, SHALL NOT persist the new dates, and SHALL NOT modify any quarter.

## R18
WHEN an academic year's `start_date`/`end_date` are updated and every existing non-deleted,
fully-dated quarter of that academic year remains within the proposed new range, the system SHALL
persist the academic year's new dates unchanged from today's `PUT /api/academic-years/:id`
behavior.

## Ordering

## R19
WHEN `GET /api/quarters` returns quarters, the system SHALL order them by `sequence_number`
ascending (Primer Trimestre, Segundo Trimestre, Tercer Trimestre).
