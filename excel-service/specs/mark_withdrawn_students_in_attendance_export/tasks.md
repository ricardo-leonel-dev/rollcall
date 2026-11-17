# Tasks — Mark withdrawn students in the attendance export

All code in `export.go`, all tests in `export_test.go`. Run `go test ./...`, `gofmt -l .`, `go vet ./...`.

- [x] T1 (R1, R2, R4) Add `TestRetiroVisibleEl` (nil `ultimoDiaVisible` → false for any day; day before /
      equal / after a set last visible day → true / true / false) and `TestFiltrarRetirados`
      (table-driven): roster cases R2 a–f (incl. stored roster numbers 1–5 with number 4 dropped in e/f,
      order kept), absence cases R4 b/c/d/e (after the last visible day, omitted student, on the last
      visible day, between last visible day and withdrawal date), R1f (`whole_year`: student and all their
      absences dropped), and R5a (nil `retiro` keeps everything). Then add the `retiro` type, its
      `visibleEl`, the `retiro` fields on `rosterStudent`/`absenceRecord`, and `filtrarRetirados`.
- [x] T2 (R3) Add `TestNombreConRetiro` (cases R3 a, c, d — d uses a `retiro` whose `ultimoDiaVisible`
      differs from `fecha` and expects the withdrawal date — plus nil `retiro` → plain name), then
      `nombreConRetiro`.
- [x] T3 (R1, R5) Add the `retiroColumnasSQL` constant (design.md "Queries"), the `LEFT JOIN
      student_withdrawals w ... reverted_at IS NULL` and the fragment to the absence and roster queries in
      `exportExcelHandler`, scan the two dates into `retiro` (nil when `withdrawal_date` is NULL), and call
      `cd = filtrarRetirados(cd, fDesde)` before appending the course (design.md "Handler wiring").
      Covered by T7's smoke run (no DB test harness).
- [x] T4 (R3, R4) Add `TestProcessCourse_WithdrawnStudent` using `probePlantilla` dates: one withdrawn
      student (last visible day = 2nd of 4 range days, `F` on that day) and one regular student. Assert
      column B of the withdrawn row is `nombreConRetiro(...)` (R3a); days 1–2 are `A`/`F`, days 3–4 are
      `""` and have no comment (R4a, R4d); the regular row is unchanged. Add a row where the last visible
      day is the 2nd day but `fecha` is the 4th (until_quarter_start shape): mark shows the 4th day's date,
      days 3–4 blank (R3d, R4e). Add an R3b row where the last visible day is after the last range day:
      marked, all range days filled. Then implement the two `processCourse` edits (design.md
      "processCourse edits" 2 and 3).
- [x] T5 (P1) Add `TestProcessCourse_WithdrawnStudentKeepsEarlierRecords`: a withdrawn student with a
      noted `F`, an `AT` and a `J` dated on or before the last visible day; assert values, diagonal-border
      styles and comment text match the same records for a non-withdrawn student in the same workbook.
- [x] T6 (P2) Add `TestProcessCourse_NoWithdrawalsUnchanged`: a roster and records with every `retiro`
      nil, run through `filtrarRetirados` and `processCourse`; assert names (column B), numbers (column A),
      every range day cell value/style and comments equal those produced from the same input processed
      without calling `filtrarRetirados` (the pre-feature path).
- [x] T7 (R1, R2, R5) Level 2 smoke per design.md "Verification" (i)–(vi) against a local Postgres,
      covering all three `stats_visibility` values (`until_withdrawal`, `until_quarter_start` with and
      without a containing quarter, `whole_year`); record the course/ids used and the observed cells in
      `progress/mark_withdrawn_students_in_attendance_export/impl.md`.
- [x] T8 Update `docs/verification.md` "Current state": tests exist in `export_test.go` and run with
      `go test ./...` (it still says there is no suite). Do not set `verify_command`.
