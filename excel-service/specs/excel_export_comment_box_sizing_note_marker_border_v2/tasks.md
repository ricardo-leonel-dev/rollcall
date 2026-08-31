# Tasks — Excel export: comment box sizing + note marker border

- [x] T1 (R1, R2, R3, R4, R5) In `export.go`, add the `commentMinWidth`/
      `commentMaxWidth`/`commentMinHeight`/`commentMaxHeight`/
      `commentWrapCharsPerLine`/`commentLineHeightPx` constants and the pure
      `commentBoxSize(text string) (width, height uint)` helper, in a new
      `// ── commentBoxSize ──` section near `dedupeCommentShapeIDs`, per
      `design.md`'s exact implementation. Add `"unicode/utf8"` to the import
      block.

- [x] T2 (R7, R8, R10) In `export.go`, add the `diagonalNoteBorder` var and
      `appendDiagonalBorder(base []excelize.Border) []excelize.Border`
      helper next to `commentBoxSize`, per `design.md`.

- [x] T3 (R7, R8, R10) In `processCourse`, after the existing
      `styleF`/`styleAT`/`styleJ`/`styleP` construction, build `styleFNote`/
      `styleATNote`/`styleJNote` from `appendDiagonalBorder(templateBorder)`
      (same `Fill`/`Alignment` as each style's non-noted counterpart). Do
      not add a noted variant for `styleP`.

- [x] T4 (R1, R6, R7, R8, R9, R10) In the `cd.registros` loop, reorder the
      body so `parts`/`hasNote` are computed right after
      `f.SetCellValue(base, cellRef, displayType)` and before the `switch
      displayType` style selection; branch each `case` on `hasNote` to pick
      the noted vs. non-noted style; keep `SetCellValue` unconditional and
      unchanged (R9). Thread `commentBoxSize(text)`'s result into the
      existing `f.AddComment` call's `Width`/`Height` fields, per
      `design.md`'s exact code.

- [x] T5 (R2, R3, R4, R5) In `export_test.go`, add a table-driven unit test
      for `commentBoxSize` covering: a short single-word note, a note whose
      single line exceeds `commentWrapCharsPerLine`, a note with an
      explicit `\n` (both `Nota:`/`Justificación:` lines present), and a
      very long multi-line note. Assert every case's `width`/`height` fall
      within `[commentMinWidth, commentMaxWidth]`/`[commentMinHeight,
      commentMaxHeight]`, and that the long-multi-line case's `height` is
      strictly greater than the short-note case's `height`.

- [x] T6 (R1, R6) In `export_test.go`, add a `processCourse`-level test
      with two comment-bearing records on the same sheet — a short note and
      a long multi-line note chosen (via a direct `commentBoxSize` check in
      the test setup) to produce different `Height` values. Read back
      `xl/drawings/vmlDrawingN.vml`, extract each shape's
      `<x:Anchor>...</x:Anchor>` content in document order via regexp, and
      assert the two anchor strings differ. Do not assert against the
      shape's `style` attribute (per `design.md`'s investigation trail,
      it's a fixed literal unrelated to `Width`/`Height`).

- [x] T7 (R7, R8, R9, R10) In `export_test.go`, add a `processCourse`-level
      test with: an F record with a note, an F record without a note, an AT
      record with a note, a J record with a note, and at least one roster
      student with no absence record (exercising the `styleP` fallback
      path). For each written cell, resolve its style
      (`f.GetCellStyle`/`f.GetStyle`) and assert: the noted F/AT/J cells'
      `Border` includes an entry with `Type == "diagonalUp"`; the
      non-noted F cell and the `styleP` cell do not. Also assert
      `f.GetCellValue` for the noted-F and non-noted-F cells are both
      exactly `"F"` (R9).

- [x] T8 (R11) Re-run (or lightly extend with an explicit R11-tagged
      comment/assertion) the existing
      `TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs` test to confirm it
      still passes unmodified with T1-T4's changes in place — i.e. 3
      distinct `<v:shape>` `id` attributes are still produced for a sheet
      with 3 comment-bearing F/AT/J cells now carrying the new `Width`/
      `Height`/border logic.

- [x] T9 Run `gofmt -l .` and `go vet ./...` (both must print nothing), and
      `go build ./...` and `go test ./...` (both must pass), per
      `docs/verification.md` Level 1. Record the R-to-test traceability
      mapping in `progress/impl_<feature>.md`.
