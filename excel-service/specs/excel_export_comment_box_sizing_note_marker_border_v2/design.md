# Design — Excel export: comment box sizing + note marker border

See `docs/architecture.md` (single-package layout, error-handling
convention, "don't hold the template in memory" rule) and
`docs/conventions.md` (naming table — generic/infra helpers are English
`camelCase`; domain/template code stays Spanish; comments only for
non-obvious *why*) for the baseline this design builds on. This feature
touches only `export.go` — no new file, no new dependency, no
`main.go`/`db.go`/`names.go` change, no SQL change. It builds directly on
top of the sibling feature `excel_comment_missing_for_unjustified_absence`
(`dedupeCommentShapeIDs`, already `done`) without modifying it.

## Investigation trail (grounding the pixel/behavior claims below)

1. `excelize.Comment` (`xmlComments.go`, vendored v2.10.1) has `Width
   uint`/`Height uint` fields alongside `Cell`/`Author`/`Text`/`Paragraph`.
   `processCourse`'s existing `f.AddComment` call never sets them.
2. `AddComment` (`vml.go`) forwards `opts.Width`/`opts.Height` into
   `FormControl.Width`/`Height`, and `prepareFormCtrlOptions` defaults each
   to `140`/`60` (pixels) only when the caller left them at the zero value —
   confirming today's actual default box size and that these are the two
   fields to set going forward.
3. `addDrawingVML` (`vml.go`) computes each VML shape's `<x:Anchor>` (an
   `x:ClientData` child, `vmlDrawing.go`'s `xClientData.Anchor`) from
   `f.positionObjectPixels(sheet, col, row, int(Width), int(Height), ...)`
   — this is the actual grid-relative geometry Excel uses to size/position
   the comment box; the hardcoded `width:108pt;height:59.25pt` string in the
   shape's inline `style` attribute is an unrelated legacy fallback that
   does **not** vary with `Width`/`Height` and is not a meaningful signal to
   test against (confirmed by reading `addDrawingVML`'s `style` literal,
   which never references `opts.FormControl.Width/Height`). Any test
   asserting the effect of `Width`/`Height` must read `<x:Anchor>`, not the
   `style` attribute.
4. `xl/commentsN.xml` (`xlsxComment`/`xlsxText`) has no `Width`/`Height`
   concept at all — box size is a VML-only, per-shape concern. This mirrors
   the sibling feature's finding that comment *content* and VML *shape*
   geometry are two independently-serialized things.
5. `excelize.Style.Border` (`xmlStyles.go`) is `[]Border{Type, Color,
   Style}`; `processCourse` already samples `templateBorder` once from the
   template's first attendance cell and reuses that slice literal across
   `styleF`/`styleAT`/`styleJ`/`styleP`'s `NewStyle` calls today — a new
   noted-cell style must not mutate that shared slice in place (see
   `appendDiagonalBorder` below).

## Files to touch

| File | Change |
|---|---|
| `export.go` | Add a `commentBoxSize` pure sizing helper + constants; add a `diagonalNoteBorder` var and `appendDiagonalBorder` helper; build 3 additional "noted" cell styles in `processCourse`; reorder the `cd.registros` loop body so note presence is known before the style is chosen; thread `commentBoxSize`'s result into the existing `f.AddComment` call. Add `"unicode/utf8"` to the import block (not currently imported). |

## New/changed signatures

Add near `dedupeCommentShapeIDs` (same "raw output shaping" section of the
file), a new section header:

```go
// ── commentBoxSize ────────────────────────────────────────────────────────────

const (
	commentMinWidth  uint = 140 // matches excelize's own unset-Comment default (prepareFormCtrlOptions) — a short note's box is unchanged from today
	commentMaxWidth  uint = 220
	commentMinHeight uint = 60 // matches excelize's own unset-Comment default
	commentMaxHeight uint = 300 // still manually resizable past this in Excel; just caps runaway auto-sizing

	commentWrapCharsPerLine = 28 // approx chars per line at commentMaxWidth in the default VML comment font
	commentLineHeightPx     = 16 // approx px per wrapped line at the default font size
)

// commentBoxSize computes a VML comment box Width/Height (pixels) from the
// comment's combined "Nota: .../Justificación: ..." text, so short notes
// stay compact and long notes get a taller box without manual resizing in
// Excel (R1-R5). Width and Height are each clamped to
// [commentMin*, commentMax*] regardless of text length.
func commentBoxSize(text string) (width, height uint) {
	lines := strings.Split(text, "\n")
	maxLineLen := 0
	wrappedLines := 0
	for _, line := range lines {
		n := utf8.RuneCountInString(line)
		if n > maxLineLen {
			maxLineLen = n
		}
		w := n / commentWrapCharsPerLine
		if n%commentWrapCharsPerLine != 0 || n == 0 {
			w++
		}
		wrappedLines += w
	}
	width = commentMinWidth
	if maxLineLen > commentWrapCharsPerLine {
		width = commentMaxWidth
	}
	height = commentMinHeight
	if wrappedLines > 1 {
		height += uint(wrappedLines-1) * commentLineHeightPx
	}
	if height > commentMaxHeight {
		height = commentMaxHeight
	}
	return width, height
}

// diagonalNoteBorder marks an F/AT/J cell that has an attached note: a thin
// double diagonal line rising from the bottom-left to the top-right corner
// (excelize's diagonalUp), appended to the cell's existing border list.
// Excel's own comment-triangle indicator is a fixed red triangle, not
// configurable via OOXML/excelize, and disappears against styleF's red fill
// — this is the visible "this cell has a note" signal instead (R7). A
// marker character in the cell's text value was explicitly rejected:
// COUNTIF-based totals elsewhere in the template depend on the cell holding
// exactly "F"/"AT"/"J" (R9).
var diagonalNoteBorder = excelize.Border{Type: "diagonalUp", Style: 6, Color: "000000"}

// appendDiagonalBorder returns a new slice with diagonalNoteBorder appended
// to base, without mutating base's backing array. base (templateBorder) is
// reused across every style NewStyle call in processCourse; appending to it
// in place via append(base, ...) would risk a shared-backing-array aliasing
// bug the moment base has spare capacity.
func appendDiagonalBorder(base []excelize.Border) []excelize.Border {
	out := make([]excelize.Border, len(base)+1)
	copy(out, base)
	out[len(base)] = diagonalNoteBorder
	return out
}
```

`processCourse`'s style block (today: `styleF`/`styleAT`/`styleJ`/`styleP`,
lines ~689-692) gains three more styles built from `appendDiagonalBorder
(templateBorder)`, same `Fill`/`Alignment` as their non-noted counterpart:

```go
noteBorder := appendDiagonalBorder(templateBorder)
styleFNote, _ := f.NewStyle(&excelize.Style{Border: noteBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFC7CE"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
styleATNote, _ := f.NewStyle(&excelize.Style{Border: noteBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFEB9C"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
styleJNote, _ := f.NewStyle(&excelize.Style{Border: noteBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"C6EFCE"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
```

`styleP` is untouched — no noted variant exists for it (R10); the
`diasDelRango` loop that uses `styleP` never calls `AddComment` today and
this feature does not change that.

## `cd.registros` loop reordering

Today the loop sets the cell value, picks the style from `displayType`
alone, marks `marcadas`, and only afterward computes `parts`/calls
`AddComment`. Because the style choice must now depend on whether a note
exists, `parts`/`hasNote` need to be computed **before** the
`switch displayType` style selection:

```go
displayType := reg.typ
if reg.justified {
	displayType = "J"
}
cellRef, _ := excelize.CoordinatesToCellName(col, row)
f.SetCellValue(base, cellRef, displayType) // unconditional, same as today — R9

var parts []string
if reg.notes != "" {
	parts = append(parts, "Nota: "+reg.notes)
}
if reg.justificationReason != nil && *reg.justificationReason != "" {
	parts = append(parts, "Justificación: "+*reg.justificationReason)
}
hasNote := len(parts) > 0

switch displayType {
case "F":
	if hasNote {
		f.SetCellStyle(base, cellRef, cellRef, styleFNote)
	} else {
		f.SetCellStyle(base, cellRef, cellRef, styleF)
	}
case "AT":
	if hasNote {
		f.SetCellStyle(base, cellRef, cellRef, styleATNote)
	} else {
		f.SetCellStyle(base, cellRef, cellRef, styleAT)
	}
case "J":
	if hasNote {
		f.SetCellStyle(base, cellRef, cellRef, styleJNote)
	} else {
		f.SetCellStyle(base, cellRef, cellRef, styleJ)
	}
}
marcadas[[2]int{row, col}] = true

if hasNote {
	text := strings.Join(parts, "\n")
	width, height := commentBoxSize(text)
	f.AddComment(base, excelize.Comment{
		Cell:      cellRef,
		Author:    "Sistema",
		Width:     width,
		Height:    height,
		Paragraph: []excelize.RichTextRun{{Text: text}},
	})
}
```

`SetCellValue(base, cellRef, displayType)` stays exactly where it is today,
before any note computation — it never becomes conditional on `hasNote`
(R9). The only new behavior inside the `switch` is picking between a
style's noted/non-noted variant; the `displayType`-to-color mapping itself
is unchanged.

## Tests

Extends `export_test.go` (already exists, added by
`export_selects_the_correct_trimester_sheet`), following its established
pattern: pure-function unit tests where possible, `processCourse`-level
tests against the real `plantilla_asistencia.xlsx` fixture for behavior
that only manifests in the generated zip/XML.

- **R2-R5 (sizing bounds)**: unit-test `commentBoxSize` directly with a
  table of inputs (empty-ish short text, a text just over
  `commentWrapCharsPerLine`, a very long multi-paragraph text) and assert
  each returned `width`/`height` falls within
  `[commentMinWidth, commentMaxWidth]`/`[commentMinHeight,
  commentMaxHeight]` — no `processCourse`/zip involvement needed, matching
  `docs/conventions.md`'s "pure helpers are the easiest to test" bar.
- **R1, R6 (wiring into `AddComment`)**: run `processCourse` with two
  `absenceRecord`s on the same sheet — one with a short single-word note,
  one with a long multi-line note chosen so `commentBoxSize` returns a
  different `Height` for each (verify this via a direct
  `commentBoxSize` call in the test setup, not a guess) — then read back
  `xl/drawings/vmlDrawingN.vml`, extract each shape's `<x:Anchor>...</x:Anchor>`
  content via regexp (in document order, which matches `cd.registros`
  iteration order), and assert the two strings differ. Per the
  investigation trail, do **not** assert against the shape's `style`
  attribute (`width:...;height:...`) — it is a fixed legacy literal that
  never reflects the `Width`/`Height` actually passed to `AddComment`.
- **R7, R8, R10 (diagonal border only on noted F/AT/J)**: run
  `processCourse` with a 4-record mix (F with note, F without note, AT with
  note, J with note) plus at least one roster student with no absence
  record at all (so the `diasDelRango` fallback loop marks a `styleP`
  cell). For each written cell, read its resolved style via
  `f.GetCellStyle`/`f.GetStyle` (or inspect the saved file's
  `xl/styles.xml` `<border>` entries referenced by that cell's `xf`) and
  assert: noted F/AT/J cells have a `Border` entry with
  `Type == "diagonalUp"`; non-noted F/AT/J cells and the `styleP` cell do
  not.
- **R9 (cell value invariant)**: in the same test as R7/R8, assert
  `f.GetCellValue` for the noted-F and non-noted-F cells are both exactly
  `"F"` (same pattern for AT/J) — note presence must not change the value.
- **R11 (dedupe regression)**: extend `TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs`
  (already covers 3 comment-bearing F/AT/J cells end to end) rather than
  writing a new test — since it already asserts 3 distinct `<v:shape>` `id`
  attributes after this feature's `Width`/`Height`/border changes are in
  place, a passing run of that existing test *is* the regression check;
  only add an assertion (or a short comment) tying the still-passing result
  back to R11 explicitly.

## Discarded alternatives

1. **Append a marker character to the cell's own text value (e.g. `"F*"`)
   for noted cells, instead of a style-only border marker.** Rejected —
   explicitly ruled out by the user during product discussion: COUNTIF-based
   totals elsewhere in the template depend on the cell holding exactly
   `"F"`/`"AT"`/`"J"` (see R9); changing the value would silently break
   those totals for every noted absence.
2. **Use `excelize.Style.Border`'s `diagonalDown` (or both
   `diagonalUp`+`diagonalDown`) instead of `diagonalUp` alone.** Rejected —
   already decided with the user: a single rising bottom-to-top diagonal
   (`diagonalUp`) reads as a deliberate "flagged" corner mark without
   visually competing with the cell's centered `"F"`/`"AT"`/`"J"` text the
   way an X-shaped double-diagonal would.
3. **Compute `Width`/`Height` from a fixed lookup table keyed by
   `len(text)` bucket (e.g. `switch { case len < 20: ...; case len < 60:
   ...}`) instead of a wrap-aware line-count formula.** Rejected — a
   length-only bucket ignores embedded `\n`s (every noted cell already has
   at least one hard newline whenever both `Nota:`/`Justificación:` are
   present), so a short `Nota:` line plus a short `Justificación:` line
   could total under a bucket threshold yet still need 2 lines of vertical
   space; the wrap-aware formula in `commentBoxSize` accounts for both
   explicit newlines and implied wrapping from line length.
4. **Vendor/patch `excelize`'s `addDrawingVML` to size shapes automatically
   from `Paragraph` text, instead of computing `Width`/`Height` locally.**
   Rejected for the same reason the sibling feature rejected patching
   `excelize` for the shape-`id` bug: `docs/architecture.md` treats adding
   a dependency (or a fork/patch of one) as a deliberate choice, not a
   default, and a local, testable, ~30-line pure function is
   self-contained and easy to review, unlike a vendored patch that a future
   `go get -u` could silently drop.

## Non-goals

- No change to *which* records get a comment (still exactly `reg.notes`/
  `reg.justificationReason` non-empty, per the sibling feature's R1-R3,
  untouched here).
- No change to comment text content/formatting, author, or the
  `dedupeCommentShapeIDs` id-numbering scheme itself.
- No change to `styleP`/the `diasDelRango` fallback loop.
- No attempt to pixel-perfectly match a specific font's real character
  metrics — `commentWrapCharsPerLine`/`commentLineHeightPx` are reasonable
  approximations for the default VML comment font, not a text-measurement
  engine; a user can still manually resize a box past `commentMaxHeight`.
