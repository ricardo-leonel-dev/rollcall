# Tasks — Excel comment missing for unjustified ("F") absence

- [x] T1 (R4) Add `reVMLShapeID` (package-level `regexp.MustCompile`) and the
      `dedupeCommentShapeIDs(zipPath string) error` helper to `export.go`, in
      the "ZIP utilities"/zip-XML-surgery section near `mergeWorkbooks` and
      `stripExternalLinks`, per `design.md`'s exact implementation.
- [x] T2 (R4, R5) In `processCourse`, call `dedupeCommentShapeIDs(tempPath)`
      right after `f.SaveAs(tempPath)` succeeds and `f.Close()` runs, before
      `return tempPath, nil`; on a non-nil error, `os.Remove(tempPath)` and
      return `"", err`, matching every other error path already in
      `processCourse`.
- [x] T3 (R1, R3) In `export_test.go`, add a test that builds a synthetic
      `courseData` (2-student roster) with `processCourse` invoked against the
      real `plantilla_asistencia.xlsx`, containing: one "F"-type
      `absenceRecord` with non-empty `notes` and no `justificationReason`, and
      one "AT"-type `absenceRecord` with both fields empty. Unzip the result
      and assert: (a) `xl/comments1.xml` contains a `<comment>` for the F
      record's cell whose text is `"Nota: <notes>"` (R1); (b) no `<v:shape>`/
      no comment entry exists for the AT record's cell, since both its fields
      are empty (R3).
- [x] T4 (R1, R2, R4, R5) In `export_test.go`, add a test with three
      `absenceRecord`s on the same sheet — one "F" with `notes` only, one
      "AT" with `notes` only, one "J" with both `notes` and
      `justificationReason` set — run `processCourse`, and assert:
      - every expected cell (`ref` in `xl/comments1.xml`) has a comment
        (F and AT: `"Nota: <notes>"`; J: `"Nota: <notes>\nJustificación:
        <justificationReason>"`, in that order) (R1, R2);
      - parsing `xl/drawings/vmlDrawing1.vml` for all `id="_x0000_s\d+"`
        occurrences yields exactly 3 values, all distinct (R4);
      - the `xl/comments1.xml` cell `ref`s and text from this test are
        unaffected by the `id` rewrite (i.e. match what T3/plain content
        expectations would already predict without the fix) (R5).
- [x] T5 (R4) In `export_test.go`, add a unit test for
      `dedupeCommentShapeIDs` in isolation: write a minimal zip to a temp file
      containing a hand-crafted `xl/drawings/vmlDrawing1.vml` entry with 3
      `<v:shape id="_x0000_s1025" .../>` occurrences (duplicate on purpose),
      run `dedupeCommentShapeIDs` on it, re-read the entry, and assert the 3
      `id` values are now distinct and the `<v:shapetype id="_x0000_t202">`
      element (different prefix) is unchanged.
- [x] T6 Run `gofmt -l .` and `go vet ./...` and confirm both print nothing;
      run `go build ./...` and `go test ./...` and confirm they pass, per
      `docs/verification.md` Level 1.
