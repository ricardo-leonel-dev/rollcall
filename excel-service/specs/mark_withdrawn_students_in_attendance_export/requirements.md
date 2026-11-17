# Requirements — Mark withdrawn students in the attendance export

## Request (verbatim)
Roster query in export.go joins the active student_withdrawals row of each enrollment (LEFT JOIN, reverted_at IS NULL; table created by backend feature 22 student_withdrawal_records, migration 29). Backend #22 is done, so this can start. Open decision for the spec: backend #23 withdrawn_enrollment_hiding added student_withdrawals.stats_visibility (migration 30: until_withdrawal default / until_quarter_start / whole_year); decide whether the export honors it per withdrawal or keeps the fixed rule in the acceptance criteria.

Acceptance criteria from the feature's Notion card (verbatim):
1) A withdrawn student appears in the period containing their withdrawal date and earlier periods, marked 'Retirado' with the date. 2) They are omitted from periods that start after the withdrawal date. 3) Their absences up to the withdrawal date export unchanged. 4) A reverted withdrawal shows no mark. 5) Non-withdrawn students are unchanged.

## Human decisions
- H1 (2026-11-17, Ricardo Aguilar, rejects the previous S2 "ignore `stats_visibility`"), verbatim: "lo que justamente quiero es que cuando exporte no ver a los estudiantes retirados y que el campo de visibilidad me ayude a eso, para eso fue creado, para saber si mostrarlos o no".
  Consequence: the export honors `student_withdrawals.stats_visibility` per withdrawal, mirroring the backend's `visibleRecordSql` (`../backend/src/services/enrollment-withdrawal.ts`). Where this conflicts with the Notion acceptance criteria, H1 wins:
  - Criterion 1 changes: the student appears in a period only if it starts on or before their **last visible day** (R1), not the withdrawal date; a `whole_year` withdrawal never appears.
  - Criterion 2 changes: omitted from periods that start after the **last visible day**.
  - Criterion 3 changes: absences up to the **last visible day** export unchanged; later ones (even if on or before the withdrawal date) are not written.
  - Criteria 4 and 5 are unchanged.
- H2 (2026-11-17, Ricardo Aguilar, confirms S4), verbatim: "en el export de excel quiero que si un estudiante está retirado y tenga la marca de que se puede ver en el periodo actual (trimestre por ejemplo) aparezca en el listado y tenga marcado algo como retirado y del supuesto que mencionas pues quiero la marca y por el momento pongamos la marca sin importar que haya días en blanco como mencionas".
  Consequence: S4 stands as written: every listed withdrawn student carries the mark with the withdrawal date, even when days after the last visible day are blank.

## Assumptions
- S1: "Withdrawn" is the backend predicate: the enrollment has a `student_withdrawals` row with `reverted_at IS NULL` (at most one, enforced by `uq_student_withdrawals_active_enrollment`). Reverted rows are ignored entirely.
- S2: (replaced by H1) The last visible day mirrors `visibleRecordSql` exactly, including its edge cases: the quarter lookup uses the enrollment's academic year, skips soft-deleted quarters and quarters with NULL dates, picks the earliest `start_date` when several contain the withdrawal date, and falls back to the withdrawal date when none does (the request says "mirroring the backend exactly").
- S3: "Period" is the requested range `date_from`..`date_to`. "Starts after the last visible day" means `date_from > last visible day`; any range with `date_from <= last visible day` lists the student. The backend `quarter_id` / sheet selection plays no part in this decision.
- S4: **Confirmed by H2:** a listed withdrawn student always carries the mark, in every visibility mode, and it shows the **withdrawal date** (not the last visible day). With `until_quarter_start` this means a row can read `(RETIRADO 15/10/2026)` while its days from the quarter start (e.g. 2026-10-01) onward are already blank; and a range that ends before the last visible day also shows the mark (Notion criterion 1: "...and earlier periods, marked 'Retirado'"). Alternative if rejected: no mark at all, or mark only when the range reaches the last visible day.
- S5: The mark is written into the name cell (column B, merged B:C) as `<name> (RETIRADO dd/mm/yyyy)`, e.g. `PEREZ LOPEZ JUAN (RETIRADO 15/10/2026)`. Uppercase to match the register's style; day-first date as used in Ecuador. No colour or font change.
- S6: The last visible day itself is a school day the student still counts on (inclusive, same as the backend's `date > last visible day` hiding test). Business days of the range **after** it are left blank in that student's row: no `A`, no `F`/`AT`/`J`, no comment. Blank (not "R" or another letter) so the template's `COUNTIF` totals (BU–BY) do not count them.
- S7: Absences dated after the last visible day are not written anywhere in the sheet, including when the student is omitted: they must not be fuzzy-matched by `matchName` onto another student's row (siblings share two surnames).
- S8: Day cells outside the requested range keep today's behavior for every student (the template's own content is left as is); only business days inside the range are blanked by S6.
- S9: An omitted student leaves a gap in the `Nº` column (column A keeps each student's stored `roster_number`, e.g. 1, 2, 3, 5) and the rows below move up one row; nobody is renumbered. This matches the backend's `GET /api/enrollments` (backend #23 S12).
- S10: No HTTP contract change: same endpoint, same query params, same status codes. No migration (this service only reads).

## R1 — Last visible day follows `stats_visibility`
WHEN a course is exported, the system SHALL derive each active withdrawal's last visible day from its `stats_visibility`, exactly as the backend's `visibleRecordSql` does.

Fixture for b–e: the enrollment's academic year has quarters Q1 2026-09-01..2026-11-30 and Q2 2026-12-01..2027-02-28.

| Case | stats_visibility | withdrawal_date | Expected last visible day |
|---|---|---|---|
| a | `until_withdrawal` | 2026-10-15 | 2026-10-15 |
| b | `until_quarter_start` | 2026-10-15 (inside Q1) | 2026-08-31 (Q1 start − 1) |
| c | `until_quarter_start` | 2026-12-01 (= Q2 start) | 2026-11-30 |
| d | `until_quarter_start` | 2027-06-10 (no quarter contains it) | 2027-06-10 (fallback) |
| e | `until_quarter_start` | 2026-10-15, but Q1 soft-deleted (`deleted_at` set) and no other quarter contains it | 2026-10-15 (fallback) |
| f | `whole_year` | any | none: the student is never visible |

## R2 — Withdrawn student listed only in periods that reach the last visible day
WHEN a course is exported, the system SHALL list an enrollment with an active withdrawal in the roster only if it has a last visible day (R1) and `date_from <= last visible day`, and SHALL omit it otherwise.

| Case | Range | Last visible day | Expected |
|---|---|---|---|
| a | 2026-09-01..2026-11-30 | 2026-10-15 | listed |
| b | 2026-09-01..2026-11-30 | 2026-09-01 (= date_from) | listed |
| c | 2026-09-01..2026-11-30 | 2026-11-30 (= date_to) | listed |
| d | 2026-09-01..2026-11-30 | 2026-12-10 (after date_to) | listed |
| e | 2026-09-01..2026-11-30 | 2026-08-31 (before date_from, e.g. R1b) | not in column B; rows below move up one; column A keeps stored numbers with a gap (S9) |
| f | any range | none (`whole_year`, R1f) | omitted, same layout as e |

## R3 — Withdrawal mark on the name cell
WHEN a withdrawn student is listed (R2), the system SHALL write their name cell as `<name> (RETIRADO dd/mm/yyyy)` using the **withdrawal date** (S4).

| Case | Setup | Expected column B |
|---|---|---|
| a | name `PEREZ LOPEZ JUAN`, `until_withdrawal`, withdrawal 2026-10-15, R2a | `PEREZ LOPEZ JUAN (RETIRADO 15/10/2026)` |
| b | same, R2d (range ends before the last visible day) | same text (S4) |
| c | withdrawal 2026-03-05 | date rendered `05/03/2026` (zero-padded) |
| d | `until_quarter_start`, withdrawal 2026-12-10, last visible day 2026-11-30, range 2026-11-02..2026-12-31 | `... (RETIRADO 10/12/2026)` (withdrawal date, not the last visible day) |

## R4 — Nothing recorded after the last visible day
WHILE a student has an active withdrawal, the system SHALL leave blank every business day of the range after the last visible day in that student's row, and SHALL NOT write any absence dated after the last visible day on any row.

| Case | Setup | Expected |
|---|---|---|
| a | listed student, no absences, last visible day mid-range | days on or before it are `A`; days after it are empty strings (template `A` overwritten) |
| b | listed student with an `F` dated after the last visible day (with a note) | that cell is empty, has no comment, no `F` style |
| c | omitted student (R2e or R2f) with in-range absences, and a listed student sharing two words of their name | the listed student's row carries none of those absences |
| d | listed student, `F` dated exactly on the last visible day | cell is `F` (inclusive, S6) |
| e | `until_quarter_start` (R3d setup): `F` dated 2026-12-03, between the last visible day and the withdrawal date | cell is empty; days 2026-12-01..2026-12-31 are blank |

## R5 — Only the active withdrawal counts
IF an enrollment's only withdrawals are reverted (`reverted_at IS NOT NULL`) THEN the system SHALL export it exactly as a non-withdrawn student, whatever their `stats_visibility`: listed, no mark, every business day filled as today.

| Case | Setup | Expected |
|---|---|---|
| a | one reverted `whole_year` withdrawal (the query yields no withdrawal for it) | listed, name without mark, all range days filled as today |
| b | reverted `whole_year` withdrawal plus a newer active `until_withdrawal` one dated 2026-10-15, range 2026-09-01..2026-11-30 | listed and marked `(RETIRADO 15/10/2026)`; the reverted row plays no part (Level 2 smoke against Postgres, design.md "Verification") |

## P1 — Withdrawn student's records up to the last visible day export unchanged
A listed withdrawn student's absences dated on or before the last visible day keep today's value (`F`/`AT`/`J`), style, diagonal note border and comment text (test only).

## P2 — Non-withdrawn students unchanged
A course with no active withdrawal produces the same roster (names, numbers, order) and the same day cells, styles and comments as before this feature (test only).
