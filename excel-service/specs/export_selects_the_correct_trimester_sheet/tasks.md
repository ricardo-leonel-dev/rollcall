# Tasks — Export selects the correct trimester sheet

- [x] T1 (R1, R2, R3, R4, R5, R6) Add the `trimesterSheetCount` constant and
      `trimesterOrdinalNames` map to `export.go` (near `processCourse`, mirroring
      how `ordinalWords`/`reGradeOrdinal` sit near `gradoDesdeAbreviado`).
      Implement `resolveTrimesterSheetIndex(quarterSequenceRaw, quarterNameRaw
      string) (int, error)` per `design.md`'s pseudocode: default to position 0
      when both are empty; when `quarter_sequence` is non-empty, parse it and
      range-check 1..`trimesterSheetCount`, taking precedence over
      `quarter_name`; otherwise, when `quarter_name` is non-empty, match its
      trimmed/uppercased first word against `trimesterOrdinalNames`.
- [x] T2 (R1, R2, R5) In `exportExcelHandler`, read `q.Get("quarter_sequence")`
      and `q.Get("quarter_name")` and call `resolveTrimesterSheetIndex` inside
      the handler's existing early-validation block (same place `course_ids`
      and `date_from`/`date_to` are already parsed/rejected, before any
      Postgres query).
- [x] T3 (R3, R4, R6) On an error from `resolveTrimesterSheetIndex`, respond
      with `http.Error(w, err.Error(), http.StatusBadRequest)` and return,
      without querying the database or calling `processCourse` for any course.
- [x] T4 (R2, R7, R8) Change `processCourse`'s signature to accept the resolved
      `sheetIndex int` (inserted after `sheetName`). Replace the
      `f.GetSheetList()[1:]` deletion loop and the `base :=
      f.GetSheetList()[0]` assignment with: read `sheetList :=
      f.GetSheetList()` once, return an error (per R8, cleaning up the temp
      file and closing `f`) if `sheetIndex >= len(sheetList)`, otherwise set
      `base := sheetList[sheetIndex]` and delete every sheet in `sheetList`
      except `base`. (Refactored into a `selectAndKeepSheet` helper so the
      block is callable from both `processCourse` and the test, per T7's
      optional refactor note.)
- [x] T5 (R2, R7) Update every call site of `processCourse` in
      `exportExcelHandler`'s course-processing loop to pass the `sheetIndex`
      computed once in T2, unchanged across all courses in the same request.
- [x] T6 Create `export_test.go`. Add a table-driven test for
      `resolveTrimesterSheetIndex` covering: (a) both params empty ->
      `(0, nil)` (R1); (b) `quarter_sequence="2"`, `quarter_name` empty ->
      `(1, nil)` (R2); (c) `quarter_sequence="2"` together with a mismatched
      `quarter_name` (e.g. `"Primer Trimestre"`) -> `(1, nil)`, proving
      `quarter_sequence` wins (R2); (d) `quarter_sequence="abc"` -> error (R3);
      (e) `quarter_sequence="0"` and `quarter_sequence="4"` -> error (R4);
      (f) `quarter_sequence` empty, `quarter_name="Tercer Trimestre"` ->
      `(2, nil)` (R5); (g) `quarter_sequence` empty,
      `quarter_name="Cuarto Trimestre"` -> error (R6).
- [x] T7 (R7, R8) In `export_test.go`, build a synthetic in-memory
      `*excelize.File` via `excelize.NewFile()` + `NewSheet` renamed/ordered to
      `"1ER TRIMESTRE"`, `"2DO TRIMESTRE"`, `"3ER TRIMESTRE"` (mirroring the
      real template's document order confirmed in `design.md`). Test that
      selecting `sheetIndex=1` leaves exactly `["2DO TRIMESTRE"]` in
      `f.GetSheetList()` after running the selection/deletion logic extracted
      in T4 (refactor that block into a small helper if needed so it's callable
      from both `processCourse` and the test without a real file on disk).
- [x] T8 (R8) In `export_test.go`, test that a `sheetIndex` greater than or
      equal to the synthetic workbook's sheet count returns a non-nil error
      and does not panic.
- [x] T9 Run `gofmt -l .` and `go vet ./...` and confirm both print nothing;
      run `go build ./...` and `go test ./...` and confirm they pass (per
      `docs/verification.md` Level 1, now extended with the new test file).
