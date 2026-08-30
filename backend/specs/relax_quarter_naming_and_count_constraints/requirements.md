# Requirements — Relax quarter naming and count constraints

Scope: backend-only (this repo). Removes the DB-level and service-level restriction that forces
every academic year to have exactly three quarters named "Primer/Segundo/Tercer Trimestre"
(`postgres/17_quarters.sql`, `src/services/quarter.service.ts`), so an institution can instead use
semesters, bimesters, or any other period count/naming. Builds on the `quarters` table and
`/api/quarters` resource added by `api_configure_academic_quarters_trimestres_per_academic_year`
(feature 1, already `done`) — this feature relaxes that implementation, it does not replace it.
Frontend changes (a separate project/repo) are out of scope, same as feature 1.

## Schema

## R1
The system SHALL NOT enforce a CHECK constraint restricting `quarters.name` to the values "Primer
Trimestre", "Segundo Trimestre", "Tercer Trimestre".

## R2
The system SHALL NOT enforce a CHECK constraint restricting `quarters.sequence_number` to the range
1 through 3.

## R3
The system SHALL continue to enforce `UNIQUE(academic_year_id, name)` on the `quarters` table.

## R4
The system SHALL continue to enforce `UNIQUE(academic_year_id, sequence_number)` on the `quarters`
table.

## Creating a period with an arbitrary name

## R5
WHEN `POST /api/quarters` is called by a user whose role has `create` permission on the
`academic_years` resource, with a non-empty `name` (after trimming whitespace) of at most 60
characters that is not one of the three fixed trimester names, and no other validation in this
document fails, the system SHALL create a quarter row with that `name` and respond with HTTP 201.

## R6
IF the `name` supplied to `POST /api/quarters` is empty or consists only of whitespace THEN the
system SHALL respond with HTTP 400 and SHALL NOT create the quarter.

## R7
IF the `name` supplied to `POST /api/quarters` is longer than 60 characters THEN the system SHALL
respond with HTTP 400 and SHALL NOT create the quarter.

## R8
IF `POST /api/quarters` is called with a `name` that collides with an existing non-deleted quarter
of the same academic year THEN the system SHALL respond with HTTP 409 and SHALL NOT create a second
row.

## Creating a period without a fixed count cap

## R9
WHEN `POST /api/quarters` is called without a `sequenceNumber` field, the system SHALL assign the
new quarter a `sequenceNumber` equal to one plus the highest `sequence_number` among the target
academic year's existing non-deleted quarters, or `1` if it has none.

## R10
WHEN `POST /api/quarters` is called with an explicit `sequenceNumber` field, the system SHALL create
the quarter with that `sequenceNumber` instead of auto-assigning one.

## R11
IF the `sequenceNumber` supplied to `POST /api/quarters` is not a positive integer THEN the system
SHALL respond with HTTP 400 and SHALL NOT create the quarter.

## R12
IF `POST /api/quarters` is called with a `sequenceNumber` that collides with an existing non-deleted
quarter's `sequenceNumber` for the same academic year THEN the system SHALL respond with HTTP 409
and SHALL NOT create a second row.

## R13
WHEN `POST /api/quarters` is called for an academic year that already has three non-deleted
quarters, with a `name` and `sequenceNumber` that satisfy R5–R12 and dates that satisfy R14, the
system SHALL create a fourth (or further) quarter row and respond with HTTP 201.

## Date-range validation stays generic for N periods

## R14
IF the `start_date`/`end_date` supplied to `POST /api/quarters` overlap the date range of another
non-deleted quarter of the same academic year (that already has both dates set) THEN the system
SHALL respond with HTTP 400 and SHALL NOT create the quarter, regardless of how many quarters
already exist for that academic year.

## Renaming and resequencing an existing period

## R15
WHEN `PUT /api/quarters/:id` is called by a user whose role has `update` permission on the
`academic_years` resource, targeting an existing non-deleted quarter of the requesting
institution's currently active academic year, with a `name` that satisfies R6–R8, the system SHALL
update the quarter's `name` and respond with HTTP 200.

## R16
WHEN `PUT /api/quarters/:id` is called with a `sequenceNumber` that satisfies R11–R12, the system
SHALL update the targeted quarter's `sequenceNumber` and respond with HTTP 200.

## R17
IF the `name` supplied to `PUT /api/quarters/:id` collides with another non-deleted quarter of the
same academic year THEN the system SHALL respond with HTTP 409 and SHALL NOT modify the quarter.

## R18
IF the `sequenceNumber` supplied to `PUT /api/quarters/:id` collides with another non-deleted
quarter's `sequenceNumber` for the same academic year THEN the system SHALL respond with HTTP 409
and SHALL NOT modify the quarter.

## R19
WHEN `PUT /api/quarters/:id` targets a quarter that was created by `seedQuarters` (one of the three
default trimester rows), the system SHALL allow changing its `name` and `sequenceNumber` under the
same rules as any other quarter, with no special-casing based on how the row was created.

## Deleting a period

## R20
WHEN `DELETE /api/quarters/:id` is called by a user whose role has `delete` permission on the
`academic_years` resource, targeting an existing non-deleted quarter of the requesting
institution's currently active academic year, the system SHALL set `deleted_at` to the current
timestamp and `is_active` to `false` on that quarter and respond with HTTP 204.

## R21
IF `DELETE /api/quarters/:id` is called by a user whose role lacks `delete` permission on the
`academic_years` resource THEN the system SHALL respond with HTTP 403 and SHALL NOT modify the
quarter.

## R22
IF `DELETE /api/quarters/:id` targets a quarter that does not exist, is already soft-deleted, or
does not belong to the requesting institution's currently active academic year THEN the system
SHALL respond with HTTP 404 and SHALL NOT modify any row.

## R23
WHEN a quarter has been soft-deleted via `DELETE /api/quarters/:id`, the system SHALL exclude it
from subsequent `GET /api/quarters` responses.

## Default seeding is unchanged, and stays editable

## R24
WHEN a new academic year is created, the system SHALL continue to seed exactly three quarter rows
named "Primer Trimestre" (`sequence_number = 1`), "Segundo Trimestre" (`sequence_number = 2`), and
"Tercer Trimestre" (`sequence_number = 3`), unchanged from the existing `seedQuarters` behavior.
