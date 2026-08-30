# Implementer handoff — feature 1 (`export_selects_the_correct_trimester_sheet`)

## Outcome

Feature implemented end-to-end against the spec at
`specs/export_selects_the_correct_trimester_sheet/{requirements,design,tasks}.md`.
Default behavior is byte-identical to pre-feature (no params -> keep sheet 0,
delete the rest). All eight requirements R1..R8 are satisfied and exercised by
the new `tests` (see R→test table below).

## Files changed

| File | Change |
|---|---|
| `export.go` | Added `trimesterSheetCount` const, `trimesterOrdinalNames` map, `resolveTrimesterSheetIndex`, and `selectAndKeepSheet` helper. Changed `processCourse` signature to accept `sheetIndex int` (inserted after `sheetName`); refactored its deletion/dedup block to call `selectAndKeepSheet`. Wired the resolver into `exportExcelHandler`'s existing early-validation block (returns 400 on error, before any DB call or template copy). Updated the single `processCourse` call site to pass `sheetIndex`. |
| `export_test.go` | New file. Table-driven test for `resolveTrimesterSheetIndex` (T6), synthetic in-memory `*excelize.File` tests for `selectAndKeepSheet` (T7 keeps only the selected sheet; T8 returns non-nil error on out-of-range `sheetIndex`). No real `plantilla_asistencia.xlsx` fixture required. |
| `specs/export_selects_the_correct_trimester_sheet/tasks.md` | All 9 tasks marked `[x]`. |

No new dependencies, no changes to `main.go`/`db.go`/`names.go`, no change to
attendance-query SQL.

## Scope (vs. design)

- T1, T2, T3, T5, T6, T8: implemented exactly as the design prescribes.
- T4: refactored into the `selectAndKeepSheet(f, sheetIndex) (string, error)`
  helper that the design's T7 footnote explicitly invited ("refactor that block
  into a small helper if needed so it's callable from both `processCourse` and
  the test without a real file on disk"). R8's "close f + remove temp file +
  return error" cleanup stays in `processCourse` at the call site; the helper
  only returns the error so the caller can do the cleanup.
- T7: synthetic workbook built via `excelize.NewFile()` + `SetSheetName("Sheet1",
  "1ER TRIMESTRE")` + two `NewSheet` calls. Note: `DeleteSheet("Sheet1")` on the
  default active sheet in this excelize v2.10.1 build is a silent no-op, so the
  rename-then-append approach is the smallest change that produces the
  required document order `["1ER TRIMESTRE", "2DO TRIMESTRE", "3ER TRIMESTRE"]`.
- No other behaviors in `processCourse` were modified — byte-identical output
  for the no-params case (R1).

## R → test traceability

| Requirement | Test |
|---|---|
| R1 (neither param -> position 0, byte-identical default) | `TestResolveTrimesterSheetIndex/both_empty_->_position_0_(R1)` in `export_test.go` |
| R2 (quarter_sequence selects by position; wins over quarter_name) | `TestResolveTrimesterSheetIndex/quarter_sequence=2_->_position_1_(R2)`, `.../quarter_sequence_wins_over_quarter_name_(R2)` |
| R3 (quarter_sequence not parseable -> error) | `TestResolveTrimesterSheetIndex/quarter_sequence=abc_->_error_(R3)` |
| R4 (quarter_sequence out of 1..3 -> error) | `TestResolveTrimesterSheetIndex/quarter_sequence=0_->_error_(R4)`, `.../quarter_sequence=4_->_error_(R4)` |
| R5 (quarter_name first-word match selects by position) | `TestResolveTrimesterSheetIndex/quarter_name=Tercer_Trimestre_->_position_2_(R5)` |
| R6 (quarter_name first word unrecognized -> error) | `TestResolveTrimesterSheetIndex/quarter_name=Cuarto_Trimestre_->_error_(R6)` |
| R7 (delete every non-selected sheet) | `TestSelectAndKeepSheet_KeepsSelectedSheetOnly` — synthetic 3-sheet workbook, after `selectAndKeepSheet(f, 1)` the workbook's `GetSheetList()` is exactly `["2DO TRIMESTRE"]` |
| R8 (selected position >= actual sheet count -> error, no panic) | `TestSelectAndKeepSheet_OutOfRangeReturnsError` — `selectAndKeepSheet(f, 3)` on the same 3-sheet workbook returns a non-nil error mentioning the actual template sheet count |

Every R<n> in `requirements.md` maps to at least one concrete, currently-
passing test.

## Verification

```
$ gofmt -l .         # (empty)
$ go vet ./...       # (empty)
$ go build ./...     # (ok)
$ go test -v ./...
=== RUN   TestResolveTrimesterSheetIndex
=== RUN   TestResolveTrimesterSheetIndex/both_empty_->_position_0_(R1)
=== RUN   TestResolveTrimesterSheetIndex/quarter_sequence=2_->_position_1_(R2)
=== RUN   TestResolveTrimesterSheetIndex/quarter_sequence_wins_over_quarter_name_(R2)
=== RUN   TestResolveTrimesterSheetIndex/quarter_sequence=abc_->_error_(R3)
=== RUN   TestResolveTrimesterSheetIndex/quarter_sequence=0_->_error_(R4)
=== RUN   TestResolveTrimesterSheetIndex/quarter_sequence=4_->_error_(R4)
=== RUN   TestResolveTrimesterSheetIndex/quarter_name=Tercer_Trimestre_->_position_2_(R5)
=== RUN   TestResolveTrimesterSheetIndex/quarter_name=Cuarto_Trimestre_->_error_(R6)
--- PASS: TestResolveTrimesterSheetIndex (0.00s)
=== RUN   TestSelectAndKeepSheet_KeepsSelectedSheetOnly
--- PASS: TestSelectAndKeepSheet_KeepsSelectedSheetOnly (0.00s)
=== RUN   TestSelectAndKeepSheet_OutOfRangeReturnsError
--- PASS: TestSelectAndKeepSheet_OutOfRangeReturnsError (0.00s)
PASS
ok      excel-service 0.005s
```

`./init.sh` exits `[OK] Environment ready`. The two `[WARN]` lines it prints are
expected per `docs/verification.md` (no `verify_command` configured) and the
Supabase mirror env vars being unset — both are non-fatal and pre-existing.
