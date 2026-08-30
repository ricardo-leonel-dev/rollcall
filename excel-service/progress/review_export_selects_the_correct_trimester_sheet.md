# Review — feature 1 `export_selects_the_correct_trimester_sheet`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, all four docs present and non-template; `./init.sh` exits 0 with `[OK] Environment ready`.
- C2: [x] — only feature 1 is `in_progress` (DB-enforced); session 3 is the current open one and matches the live implementer work.
- C3: [x] — only `export.go` and the new `export_test.go` were touched. No new dependencies (`go.mod`/`go.sum` untouched — verified via `git diff`). `main.go`/`db.go`/`names.go` untouched. Attendance-query SQL strings (lines 872-875, 880-903, 919-929) unchanged. No stray prints/TODOs.
- C4: [x] — `export_test.go` exists and exercises the new behavior; `go build ./...`, `gofmt -l .`, `go vet ./...`, `go test ./...` all run clean (see Verification Results).
- C5: [x] (provisional for this review) — no stray temp files; session will be closed via `log-out` after this review.
- C6: [x] — `specs/export_selects_the_correct_trimester_sheet/{requirements,design,tasks}.md` all exist; every R1..R8 maps to a concrete, currently-passing test (see R→test traceability below); every T1..T9 is `[x]` in `tasks.md`.

## Required Changes (if applicable)

None.

## Strengths

- **Pure resolver extraction.** `resolveTrimesterSheetIndex(quarterSequenceRaw, quarterNameRaw string)` takes raw query strings exactly as `q.Get(...)` returns them and is fully unit-testable with zero I/O — no plumbing of pre-parsed integers needed.
- **`selectAndKeepSheet` extraction (per design's T7 footnote).** Pulling the "read `GetSheetList()` once + bounds check + delete all non-base" block into a helper made both R7's logic and R8's bounds-check reachable from tests without the real 183 KB `plantilla_asistencia.xlsx` fixture on disk.
- **R8 cleanup is correct and consistent with the surrounding pattern.** On `selectAndKeepSheet` error, `processCourse` calls `f.Close()` then `os.Remove(tempPath)` and returns the error — matching the existing per-error-path cleanup idiom already used at lines 621-623, 628-630, 652-655, etc. The `os.Remove` error is intentionally swallowed, same as every other cleanup call in this function.
- **400-before-I/O discipline.** The new resolver call is placed in `exportExcelHandler`'s existing early-validation block (right after `parseCourseIDs`, before any Postgres query at line 872 or template copy inside `processCourse`), so R3/R4/R6's "no DB, no template" guarantee is structurally enforced.
- **`GetSheetList()` is read once.** `selectAndKeepSheet` calls `f.GetSheetList()` exactly once, uses the snapshot for the bounds check AND for the deletion loop, so there is no double-fetch race and the deletion loop sees the original document order — the pre-feature code happened to read it twice, but the new code is strictly safer.
- **Naming & placement match conventions.** `trimesterSheetCount`/`trimesterOrdinalNames` are placed near `processCourse` (not hoisted), and the new identifiers are English camelCase for generic/infra functions, consistent with `parseCourseIDs`, `mergeWorkbooks`, etc.

## Findings

No critical or major findings.

Minor (non-blocking, noted for completeness):

1. **`design.md` minor doc drift, not a code issue.** The pseudocode comment at `design.md:36` reads *"Returns 3 (default: first sheet, position 0) when neither is supplied"* — this is a typo in the design ("3" should read "0"); the implementation correctly returns `0, nil` for R1 and the resolver test for R1 passes against that. Not a code finding; if the doc is touched again for unrelated reasons, fix the wording to "Returns 0".

## R → test traceability (verified by reading the test file directly, not from the implementer's claim)

| R   | What it requires                                                                                  | Where it's exercised                                                                                  |
|-----|---------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| R1  | Neither param -> position 0, byte-identical default                                               | `TestResolveTrimesterSheetIndex/both_empty_->_position_0_(R1)` (sub-test PASS)                        |
| R2  | `quarter_sequence` valid -> selects by position; wins over `quarter_name`                         | `.../quarter_sequence=2_->_position_1_(R2)` and `.../quarter_sequence_wins_over_quarter_name_(R2)`    |
| R3  | `quarter_sequence` not parseable as int -> error                                                  | `.../quarter_sequence=abc_->_error_(R3)`                                                              |
| R4  | `quarter_sequence` int but <1 or >3 -> error                                                      | `.../quarter_sequence=0_->_error_(R4)` and `.../quarter_sequence=4_->_error_(R4)`                     |
| R5  | `quarter_sequence` absent + `quarter_name` first word matches mapping -> selects that position    | `.../quarter_name=Tercer_Trimestre_->_position_2_(R5)`                                                |
| R6  | `quarter_name` first word unrecognized -> error                                                   | `.../quarter_name=Cuarto_Trimestre_->_error_(R6)`                                                     |
| R7  | Every template sheet other than the selected one is deleted                                       | `TestSelectAndKeepSheet_KeepsSelectedSheetOnly` (synthetic 3-sheet workbook -> `["2DO TRIMESTRE"]`)   |
| R8  | Selected position >= actual sheet count -> non-nil error, no panic                                | `TestSelectAndKeepSheet_OutOfRangeReturnsError` (`sheetIndex=3` on 3-sheet workbook, error returned) |

## Code-level correctness checks (R→implementation, read directly from `export.go`)

- **R1 byte-identical default** — when `sheetIndex=0`, `selectAndKeepSheet` iterates the snapshot, skipping `base := sheetList[0]` and deleting every other name; semantically equivalent to the pre-feature `f.GetSheetList()[1:]` loop + `base := f.GetSheetList()[0]`. The single-fetch snapshot is strictly safer than the original double-fetch.
- **R2/R3/R4 sequence wins** — `resolveTrimesterSheetIndex` returns as soon as `quarterSequenceRaw != ""`; `quarter_name` is never inspected when `quarter_sequence` is present (`export.go:555-564`). Range check uses `n < 1 || n > trimesterSheetCount`.
- **R5/R6 name lookup** — `quarterNameRaw` is uppercased + trimmed; first word is sliced on the first space or tab (`strings.IndexAny(first, " \t")`); looked up in `trimesterOrdinalNames`. Returns error when the first word is missing from the map.
- **R8 cleanup path inside `processCourse`** (`export.go:611-616`) — `f.Close()` runs, `os.Remove(tempPath)` runs, returns the helper's non-nil error. Caller (`exportExcelHandler:967-973`) re-runs `os.Remove` on previously-created temp files for other courses and returns 500, so the request stops processing further courses as required.
- **400-before-I/O** — `resolveTrimesterSheetIndex(q.Get(...), q.Get(...))` is at `export.go:844`, before the first DB call at line 872 and before any `processCourse` invocation at line 966. ✓
- **Resolver raw-string signature** — caller passes `q.Get("quarter_sequence")` and `q.Get("quarter_name")` directly at line 844, exactly as the design requires.
- **Scope discipline** — `git diff main.go db.go names.go go.mod go.sum` produces no output. ✓

## Verification Results

```
$ gofmt -l .
(empty)

$ go vet ./...
(empty)

$ go build ./...
(ok)

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
    --- PASS: TestResolveTrimesterSheetIndex/both_empty_->_position_0_(R1) (0.00s)
    --- PASS: TestResolveTrimesterSheetIndex/quarter_sequence=2_->_position_1_(R2) (0.00s)
    --- PASS: TestResolveTrimesterSheetIndex/quarter_sequence_wins_over_quarter_name_(R2) (0.00s)
    --- PASS: TestResolveTrimesterSheetIndex/quarter_sequence=abc_->_error_(R3) (0.00s)
    --- PASS: TestResolveTrimesterSheetIndex/quarter_sequence=0_->_error_(R4) (0.00s)
    --- PASS: TestResolveTrimesterSheetIndex/quarter_sequence=4_->_error_(R4) (0.00s)
    --- PASS: TestResolveTrimesterSheetIndex/quarter_name=Tercer_Trimestre_->_position_2_(R5) (0.00s)
    --- PASS: TestResolveTrimesterSheetIndex/quarter_name=Cuarto_Trimestre_->_error_(R6) (0.00s)
=== RUN   TestSelectAndKeepSheet_KeepsSelectedSheetOnly
--- PASS: TestSelectAndKeepSheet_KeepsSelectedSheetOnly (0.00s)
=== RUN   TestSelectAndKeepSheet_OutOfRangeReturnsError
--- PASS: TestSelectAndKeepSheet_OutOfRangeReturnsError (0.00s)
PASS
ok      excel-service (cached)

$ ./init.sh
[OK] Environment ready.
(two expected [WARN] lines: no verify_command configured in .harness.json; Supabase mirror env unset — both pre-existing and non-fatal per docs/verification.md)
```

## Recommendation

Approve as-is. The implementation matches the spec end-to-end: R1..R8 are all satisfied and each is anchored to a concrete, currently-passing test in `export_test.go`. Scope discipline is clean (no changes outside `export.go` + the new `export_test.go`, no new dependencies, no attendance-query SQL changes). Verification commands all green. The only finding is a cosmetic typo in `design.md`'s pseudocode comment ("Returns 3" should read "Returns 0"), which does not affect behavior, the tests, or any doc consumer — flagged for the next time that file is touched, not as a blocker.
