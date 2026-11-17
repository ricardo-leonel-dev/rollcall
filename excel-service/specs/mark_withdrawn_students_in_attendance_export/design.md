# Design — Mark withdrawn students in the attendance export

Conventions: `docs/architecture.md` (flat `package main`, raw SQL via `pgxpool`, errors converted to HTTP
only in `exportExcelHandler`) and `docs/conventions.md` (Spanish names for template/domain helpers). No
new dependency, no migration, no HTTP contract change.

## Data source

- `student_withdrawals` (migration 29, `attendance` schema via the pool's `search_path`): `enrollment_id`,
  `withdrawal_date DATE NOT NULL`, `reverted_at TIMESTAMPTZ` (NULL = active). At most one active row per
  enrollment (`uq_student_withdrawals_active_enrollment`), so a `LEFT JOIN` on `reverted_at IS NULL` never
  duplicates rows.
- `student_withdrawals.stats_visibility` (migration 30): `VARCHAR(20) NOT NULL DEFAULT 'until_withdrawal'`,
  `CHECK IN ('until_withdrawal','until_quarter_start','whole_year')` (H1).
- `quarters` (migration 17): `academic_year_id`, `start_date DATE` / `end_date DATE` (nullable),
  `deleted_at`.

Source of truth for R1: `../backend/src/services/enrollment-withdrawal.ts` `visibleRecordSql` (read-only;
this service never imports it, it mirrors its SQL).

## Where the last visible day is computed: SQL, then pure Go filtering

The last visible day is selected by both queries as a column, with the same `CASE`/`COALESCE` as the
backend; Go receives two dates per row and does all filtering/blanking in pure, unit-testable functions.

Why: the quarter lookup is the only part that needs data this service does not otherwise load, and it is
the part most likely to drift if re-implemented; keeping it as a near-literal copy of the backend's SQL
makes the mirror reviewable line by line against `visibleRecordSql`. Everything with branching on dates
(R2, R4, the mark) stays in Go, where it is covered by table tests. The SQL part (R1, R5) is covered by the
Level 2 smoke, since this project has no DB test harness. See "Discarded alternatives" a, b.

## Files to touch

| File | Change |
|---|---|
| `export.go` | one struct + fields, one shared SQL fragment, two query edits, one pure filter, one pure formatter, two edits inside `processCourse`, one call in `exportExcelHandler` |
| `export_test.go` | new tests (see `tasks.md`) |

Estimated production diff: ~80 lines.

## Structs

```go
// retiro is the active withdrawal of an enrollment.
type retiro struct {
	fecha            time.Time  // withdrawal_date, used by the mark (R3)
	ultimoDiaVisible *time.Time // last visible day (R1); nil = whole_year, never visible
}

// visibleEl reports whether day d is on or before the last visible day.
func (r *retiro) visibleEl(d time.Time) bool

type absenceRecord struct {
	// ...existing fields...
	retiro *retiro // nil if the enrollment has no active withdrawal
}

type rosterStudent struct {
	studentName  string
	rosterNumber *int
	retiro       *retiro // nil if the enrollment has no active withdrawal
}
```

`visibleEl`: `r.ultimoDiaVisible != nil && !d.After(*r.ultimoDiaVisible)`.

Scanning: scan into two locals `fechaRetiro, ultimoVisible *time.Time`; set `retiro` only when
`fechaRetiro != nil` (the `LEFT JOIN` matched). `ultimoVisible` is then nil only for `whole_year`
(`withdrawal_date` is `NOT NULL`, so the backend's outer `COALESCE(..., TRUE)` never fires for a matched row).

## Queries (in `exportExcelHandler`)

One package-level constant holds the select fragment, used by both queries so they cannot drift:

```go
// retiroColumnasSQL mirrors visibleRecordSql in
// backend/src/services/enrollment-withdrawal.ts. Requires alias m for enrollments
// and w for the LEFT JOINed active withdrawal.
const retiroColumnasSQL = `
  w.withdrawal_date,
  CASE w.stats_visibility
    WHEN 'whole_year' THEN NULL
    WHEN 'until_quarter_start' THEN COALESCE((
      SELECT q.start_date - 1 FROM quarters q
       WHERE q.academic_year_id = m.academic_year_id AND q.deleted_at IS NULL
         AND q.start_date <= w.withdrawal_date AND q.end_date >= w.withdrawal_date
       ORDER BY q.start_date ASC LIMIT 1), w.withdrawal_date)
    ELSE w.withdrawal_date
  END AS ultimo_dia_visible`
```

Both queries add:

```sql
LEFT JOIN student_withdrawals w
       ON w.enrollment_id = m.id AND w.reverted_at IS NULL
```

- Absence query: append `, ` + `retiroColumnasSQL` after `justification_reason`; scan the two extra dates.
- Roster query: `SELECT e.name, m.roster_number, ` + `retiroColumnasSQL`; scan the two extra dates.
  `ORDER BY` unchanged. No `WHERE` change in either query (see "Discarded alternatives" b).
- `DATE - 1` yields `DATE` in Postgres; pgx scans it into `*time.Time` like `withdrawal_date`.
- Mirror notes (S2): the backend reaches `academic_year_id` through `JOIN enrollments e_`; here `m` already
  is the enrollment. Quarters with NULL dates never satisfy the `<=`/`>=` and fall back, as in the backend.

## New pure helpers (in `export.go`, next to `escribirNomina`)

```go
// filtrarRetirados drops the roster entries whose withdrawal has no last
// visible day or one before desde (R2), and every absence dated after its
// enrollment's last visible day (R4).
func filtrarRetirados(cd courseData, desde time.Time) courseData

// nombreConRetiro returns the name cell text: the plain name, or
// "<name> (RETIRADO dd/mm/yyyy)" with the withdrawal date when the student has
// an active withdrawal (R3).
func nombreConRetiro(est rosterStudent) string
```

- `filtrarRetirados` returns a copy with new `roster`/`registros` slices (does not mutate the input's
  backing arrays). Keep: roster entry when `retiro == nil || retiro.visibleEl(desde)`; absence when
  `retiro == nil || retiro.visibleEl(rec.date)`. Order of both slices is kept. `whole_year` falls out of
  both rules because `visibleEl` is always false.
- Dates: `time.Parse("2006-01-02", ...)`, pgx `DATE` scans and `diasHabiles` all produce UTC midnight
  values, so `Before`/`After` compare calendar days. If an implementer finds a non-UTC value, normalise
  with `time.Date(y, m, d, 0, 0, 0, 0, time.UTC)` rather than comparing formatted strings.
- `nombreConRetiro` format: `est.studentName + " (RETIRADO " + est.retiro.fecha.Format("02/01/2006") + ")"`.

## Handler wiring

In `exportExcelHandler`, after both queries fill `cd` and before `courses = append(courses, cd)`:
`cd = filtrarRetirados(cd, fDesde)`. Every course in a multi-course export is filtered independently.

## `processCourse` edits

1. `escribirNomina` is **unchanged**: it writes the plain name, so `getStudentRowMap`/`matchName` keep
   matching absences by the stored name (the mark would otherwise add words to the key).
2. Presence fill loop (`for _, est := range cd.roster`): inside the per-day loop, after the existing
   `marcadas` check, when `est.retiro != nil && !est.retiro.visibleEl(diaHabil)`:
   `f.SetCellValue(base, cellRef, "")`, mark it in `marcadas`, `continue` (no `styleP`). This overwrites the
   template's pre-filled `A` (the template has a literal `A` in every day cell of rows 11–40, and BV counts
   it), so a blank is required, not just "don't write" (R4a).
3. After the presence loop and before `SetSheetName`: for each `idx, est` in `cd.roster` with
   `est.retiro != nil` and `filaInicialNomina+idx <= filaFinalNomina`, write `nombreConRetiro(est)` to
   column B of row `filaInicialNomina+idx` (the same row `escribirNomina` used).

Absences after the last visible day are already gone from `cd.registros` (filter), so the absence loop
needs no change; this also covers R4c (an omitted student's absences can no longer be fuzzy-matched onto a
sibling's row).

## Error paths

None new. Scan errors on the new columns go through the existing `rows.Scan` error branches (500). A
missing `quarters` table or `stats_visibility` column (backend migrations 17/30 not applied) surfaces as
the existing query-error 500, same as a missing `student_withdrawals` today. The helpers cannot fail.

## Verification

- Unit (`go test ./...`, existing pattern in `export_test.go`): `retiro.visibleEl`, `filtrarRetirados` and
  `nombreConRetiro` table tests with literal dates (a `whole_year` withdrawal is `&retiro{fecha: ...,
  ultimoDiaVisible: nil}`); `processCourse` tests against the real `plantilla_asistencia.xlsx`, choosing
  dates with `probePlantilla` (the template's first sheet covers May–Aug; the September+ dates in
  requirements.md tables are for the pure-function tests only).
- Level 2 smoke (`docs/verification.md`), because R1 and R5 live only in SQL and this project has no DB
  test harness. In a local Postgres, one academic year with quarters Q1 2026-09-01..2026-11-30 and Q2
  2026-12-01..2027-02-28 and one course with:
  (i) `until_withdrawal` withdrawal 2026-10-15 (R1a);
  (ii) `until_quarter_start` withdrawal 2026-10-15 (R1b, last visible 2026-08-31);
  (iii) `until_quarter_start` withdrawal 2026-12-10 with an `F` on 2026-12-03 (R1/R3d/R4e);
  (iv) `until_quarter_start` withdrawal 2027-06-10 outside every quarter (R1d fallback);
  (v) `whole_year` withdrawal 2026-10-15 with in-range absences (R1f, R2f);
  (vi) a reverted `whole_year` + newer active `until_withdrawal` pair (R5b).
  Export ranges 2026-09-01..2026-11-30 and 2026-11-02..2026-12-31; for each student record listed or
  omitted, column A/B text, the first blank day and where (if anywhere) their absences landed. Optionally
  cross-check the last visible day by running `visibleRecordSql`'s predicate for the same rows. Record the
  results in `progress/<name>/impl.md`.

## Discarded alternatives

a. **Compute the last visible day in Go** (load the year's quarters once per export and look up the one
   containing each withdrawal date). Rejected: it re-implements the backend's quarter rule in a second
   language (soft-delete, NULL dates, earliest-start tie-break), so a drift would be silent; the SQL copy is
   reviewable against `visibleRecordSql` line by line and the extra subquery per withdrawn row is
   negligible.
b. **Filter entirely in SQL** (reuse `visibleRecordSql`'s `NOT EXISTS` as a `WHERE` on both queries).
   Rejected: the roster rule (`date_from <= last visible day`) and the absence rule differ, the blanking of
   day cells and the mark still need the dates in Go, and with no DB test harness R2/R4 would be verifiable
   only by manual smoke; in Go they are unit-testable. The extra rows read (withdrawn enrollments of one
   course) are negligible.
c. **Ignore `stats_visibility` and keep the fixed rule** (previous S2: the register shows what happened up
   to the withdrawal date). Rejected by the human (H1): the visibility field exists precisely to decide
   whether withdrawn students are shown.
d. **Mark in the day cells** (write `RETIRADO` in the first day after the withdrawal, or merge the
   remaining day cells). Rejected: day columns are one character wide; there is no free cell when the
   withdrawal is on or after the sheet's last day; merging cells inside the `COUNTIF` ranges (D:BT) risks
   breaking the totals.
e. **Excel comment on the name cell.** Rejected: comments are hidden when the register is printed.
f. **Append the mark in `escribirNomina`.** Rejected: `getStudentRowMap` reads column B back to build
   the match keys, so the extra words (`RETIRADO`, the date) would enter `matchName`'s word-overlap
   scoring.
