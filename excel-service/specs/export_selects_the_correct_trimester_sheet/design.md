# Design — Export selects the correct trimester sheet

See `docs/architecture.md` (single-package layout, error-handling convention,
"never hold the template in memory" rule) and `docs/conventions.md` (naming table,
comment policy) for the baseline this design builds on. This feature only touches
`export.go` — no new file, no new dependency, no change to `main.go`/`db.go`/
`names.go`, and no change to the attendance-query SQL (`date_from`/`date_to`
filtering stays exactly as it is today; nothing in this feature reads or writes
those query strings).

## Files to touch

| File | Change |
|---|---|
| `export.go` | Add a `trimesterSheetCount` constant and a `trimesterOrdinalNames` map near `processCourse` (mirrors how `ordinalWords`/`reGradeOrdinal` are grouped near `gradoDesdeAbreviado`, per `docs/conventions.md`'s "grouped near first use" rule). Add a new pure function that resolves the two query params into a 0-based sheet position. Change `processCourse`'s signature to accept that resolved position. Change `exportExcelHandler` to parse the two new query params and call the resolver as part of its existing early-validation block. |

## New/changed signatures

```go
const trimesterSheetCount = 3

// trimesterOrdinalNames maps quarter_name's leading ordinal word (uppercased) to
// a 0-based template sheet position. Bridges the backend's Quarter.name vocabulary
// ("Primer Trimestre", "Segundo Trimestre", "Tercer Trimestre") to the template's
// own sheet-name vocabulary ("1ER TRIMESTRE", "2DO TRIMESTRE", "3ER TRIMESTRE") —
// the two never share a common substring, so this mapping is required, not
// incidental. See "Discarded alternatives" #2.
var trimesterOrdinalNames = map[string]int{
	"PRIMER": 0, "PRIMERO": 0,
	"SEGUNDO": 1,
	"TERCER": 2, "TERCERO": 2,
}

// resolveTrimesterSheetIndex resolves quarter_sequence/quarter_name (raw query
// string values, "" when absent) into a 0-based position in the template's
// GetSheetList() document order. Returns 0 (default: first sheet, position 0)
// when neither is supplied, preserving pre-feature behavior. quarter_sequence
// always takes precedence over quarter_name when both are supplied (R2).
func resolveTrimesterSheetIndex(quarterSequenceRaw, quarterNameRaw string) (int, error) {
	// R1: neither supplied -> position 0, unchanged from before this feature.
	// R2/R3/R4: quarter_sequence supplied -> parse, range-check 1..trimesterSheetCount.
	// R5/R6: quarter_sequence absent, quarter_name supplied -> map first word via
	//        trimesterOrdinalNames.
}
```

`processCourse` gains one new parameter, inserted after `sheetName` (its existing
position for "which sheet identity to end up with" concerns) and before
`diasDelRango`:

```go
func processCourse(plantillaPath, outputDir, ts string, cd courseData, sheetName string, sheetIndex int, diasDelRango []time.Time, signers []Signer) (string, error)
```

Inside `processCourse`, the existing block:

```go
for _, extra := range f.GetSheetList()[1:] {
    f.DeleteSheet(extra)
}
...
base := f.GetSheetList()[0]
```

becomes (R7, R8):

```go
sheetList := f.GetSheetList()
if sheetIndex >= len(sheetList) {
    f.Close()
    os.Remove(tempPath)
    return "", fmt.Errorf("template has %d sheet(s), expected at least %d", len(sheetList), sheetIndex+1)
}
base := sheetList[sheetIndex]
for _, name := range sheetList {
    if name == base {
        continue
    }
    f.DeleteSheet(name)
}
```

The caller (`exportExcelHandler`) computes `sheetIndex` once via
`resolveTrimesterSheetIndex`, before the course loop, and passes the same value
into every `processCourse` call in the request — the requested period does not
vary per course within one export.

`exportExcelHandler`'s existing early-validation block (where `course_ids` and
`date_from`/`date_to` are already parsed and rejected with 400 before any DB
call) gains:

```go
sheetIndex, err := resolveTrimesterSheetIndex(q.Get("quarter_sequence"), q.Get("quarter_name"))
if err != nil {
    http.Error(w, err.Error(), http.StatusBadRequest)
    return
}
```

placed alongside the existing `parseCourseIDs`/date-parsing checks, so an invalid
quarter parameter is rejected before any Postgres query or template copy — same
ordering principle the handler already applies to `course_ids`/`date_from`/
`date_to` (R3, R4, R6).

## Why position, not sheet name or `sheetId`

Reading the template's `xl/workbook.xml` directly confirms the 3 sheets are
declared as `<sheet name="1ER TRIMESTRE" sheetId="5" .../>`, `<sheet name="2DO
TRIMESTRE" sheetId="4" .../>`, `<sheet name="3ER TRIMESTRE" sheetId="6" .../>`, in
that document order — `sheetId` is *not* monotonic with position (5, 4, 6), so
`quarter_sequence` must map to **position** in `GetSheetList()` (which follows
document order), never to `sheetId` or to a name-string comparison against
`quarter_sequence`.

## Error/status mapping (matches `docs/architecture.md`'s existing convention)

| Condition | Status | Requirement |
|---|---|---|
| Neither param supplied | n/a (defaults to first sheet) | R1 |
| `quarter_sequence` supplied, valid, in range | n/a (selects that sheet) | R2 |
| `quarter_sequence` supplied, not an integer | 400 | R3 |
| `quarter_sequence` supplied, integer, out of `1..3` | 400 | R4 |
| `quarter_sequence` absent, `quarter_name` supplied and recognized | n/a (selects that sheet) | R5 |
| `quarter_sequence` absent, `quarter_name` supplied, unrecognized | 400 | R6 |
| Resolved position >= actual sheet count in a course's template copy | 500 | R8 |

R8's 500 (rather than 400) matches `docs/architecture.md`'s existing split: input
the *caller* controls and can get wrong is 400; a mismatch between the validated
input and the *deployed template file itself* is a server-side/deployment problem,
same bucket as today's "500 for template/DB failures."

## Tests

No test suite exists yet (`docs/verification.md`); this feature adds the first
one alongside `export.go`, in a new `export_test.go`. `resolveTrimesterSheetIndex`
takes no DB/HTTP/file-system input, so it is unit-testable exactly like
`names.go`'s pure helpers today (`docs/conventions.md` names them as "the obvious
first candidate" — this function is equally pure and just as easy). The
sheet-selection-and-deletion behavior inside `processCourse` (R7, R8) is tested
without needing the real 183 KB `plantilla_asistencia.xlsx` fixture on disk: a
test builds a minimal synthetic `*excelize.File` in memory via
`excelize.NewFile()` + `NewSheet`/`DeleteSheet`, naming its sheets `"1ER
TRIMESTRE"`, `"2DO TRIMESTRE"`, `"3ER TRIMESTRE"` to mirror the real template's
document order, then exercises the same selection-and-delete logic against it.

## Discarded alternatives

1. **Read the real template's sheet count at request time (an extra
   `excelize.OpenFile(plantillaPath)` before the course loop) instead of a
   hardcoded `trimesterSheetCount = 3` constant.** Rejected: this codebase
   already hardcodes other fixed structural facts about this exact template as
   package-level constants near their first use (`filaInicialNomina`/
   `filaFinalNomina`, `monthNames`) rather than reading them back out of the file
   at request time — `trimesterSheetCount` is consistent with that existing
   convention, and avoids an extra full-file open/parse on every request purely
   to validate a range that R8 already catches defensively per-course if it's
   ever wrong.
2. **Match `quarter_name` directly against the template's own sheet-name strings
   (`"1ER TRIMESTRE"`, etc.) instead of introducing `trimesterOrdinalNames`.**
   Rejected: the backend forwards `quarter_name` as the `Quarter` row's own
   `name` column, which per the sibling `attendance_backend` feature
   (`api_configure_academic_quarters_trimestres_per_academic_year`) is Spanish
   text like `"Primer Trimestre"`/`"Segundo Trimestre"`/`"Tercer Trimestre"` —
   confirmed by reading that project's own spec files. That string never
   equals, and shares no reliable substring with, the template's sheet-name
   text. A direct string match would never succeed for any real caller; an
   explicit ordinal-word mapping is required to bridge the two vocabularies.
3. **Cross-validate `quarter_sequence` against `quarter_name` when both are
   supplied, rejecting with 400 if they'd resolve to different positions.**
   Rejected: R2 already gives `quarter_sequence` unconditional precedence, and
   the sibling backend feature's own design derives both parameters from the
   same resolved `Quarter` row before sending them (see that project's
   `specs/export_endpoint_accepts_quarter_selection/design.md`), so a legitimate
   caller can never produce a mismatch. Adding a second lookup through
   `trimesterOrdinalNames` purely to detect an inconsistency real callers can't
   generate adds complexity without a corresponding caller-facing benefit.
4. **Default an invalid/out-of-range `quarter_sequence`/unrecognized
   `quarter_name` to the first sheet instead of 400 (R3, R4, R6).** Rejected:
   silently falling back would generate an export labeled/populated for a
   different period than the one the caller explicitly asked for, which is
   worse than a clear, immediate 400 — and matches `docs/architecture.md`'s
   already-stated policy of 400 for "bad/missing query params."

## Non-goals

- No change to how attendance rows are queried or filtered (`date_from`/
  `date_to`, `course_ids`, `institution_id`, `academic_year_id` all stay exactly
  as they are today) — this feature only changes *which template sheet survives
  and gets written to*, never *which data gets written into it*.
- No support for period counts other than 3, or for `quarter_sequence`/
  `quarter_name` vocabularies beyond Primer/Segundo/Tercer — out of scope per
  this feature's description; would need revisiting only if/when the sibling
  `relax_quarter_naming_and_count_constraints` backend feature ships.
