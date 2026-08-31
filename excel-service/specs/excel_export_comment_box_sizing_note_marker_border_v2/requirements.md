# Requirements — Excel export: comment box sizing + note marker border

Scope: `excel-service` only (this repo), `processCourse` (`export.go`). Two
already-agreed problems, both confirmed against the vendored
`github.com/xuri/excelize/v2@v2.10.1`:

1. **Comment box too small, no autofit.** `f.AddComment(base,
   excelize.Comment{Cell: cellRef, Author: "Sistema", Paragraph: [...]})` is
   called today with `Width`/`Height` left unset, which excelize defaults to
   a fixed `140x60` px box (`prepareFormCtrlOptions` in the vendored
   `vml.go`) regardless of how much text the joined `"Nota: "`/
   `"Justificación: "` note actually contains. No data is lost — the text is
   fully present in `xl/commentsN.xml` either way — but a long note is
   visually clipped inside that fixed box in Excel until a user manually
   resizes it.
2. **No visual way to tell an F/AT/J cell has a note.** Excel's built-in
   comment-triangle indicator is a fixed red triangle, not configurable via
   OOXML/excelize, and is not visually distinguishable against `styleF`'s red
   fill (`FFC7CE`). Appending a marker character to the cell's text value
   (e.g. `"F*"`) is explicitly out of scope — COUNTIF-based totals elsewhere
   in the template depend on the cell holding exactly `"F"`/`"AT"`/`"J"`.

Both fixes are scoped to the existing `cd.registros` loop inside
`processCourse`, the same call site the sibling feature
`excel_comment_missing_for_unjustified_absence` (feature 2, already `done`)
fixed for VML `<v:shape>` id collisions (`dedupeCommentShapeIDs`). That fix
must keep working unmodified — see R11.

Per the DB schema and the existing code in `processCourse`, `displayType` is
only ever `"F"`, `"AT"`, `"J"` (the last from a `justified` override), or the
default present-day fallback `"A"`/`styleP` written in the separate
`diasDelRango` loop, which never calls `AddComment`. "F/AT/J cells" below
always refers to the three cases in the `switch displayType` block; `styleP`
cells are never in scope for R7-R10.

## R1
WHEN the system adds a comment to a cell (i.e. `reg.notes` and/or
`reg.justificationReason` combine into a non-empty `parts` list, exactly as
today), the system SHALL set that comment's `Width` and `Height` fields to
values computed from the combined comment text, instead of leaving them
unset.

## R2
The system SHALL compute a comment box `Width`, in pixels, that is never
less than 140 regardless of the comment text's length.

## R3
The system SHALL compute a comment box `Width`, in pixels, that is never
greater than 220 regardless of the comment text's length.

## R4
The system SHALL compute a comment box `Height`, in pixels, that is never
less than 60 regardless of the comment text's length.

## R5
The system SHALL compute a comment box `Height`, in pixels, that is never
greater than 300 regardless of the comment text's length.

## R6
WHEN two comments are added within the same course export whose combined
note text differs enough to produce different computed `Height` values, the
system SHALL emit different `<x:Anchor>` geometry strings for their VML
shapes in the resulting `xl/drawings/vmlDrawingN.vml` — i.e. the two
comment boxes are not rendered at an identical size.

## R7
WHEN a cell is written with `displayType` `"F"`, `"AT"`, or `"J"` (per the
existing `switch displayType` block) AND that cell has a non-empty combined
note (per R1), the system SHALL apply a cell style whose border list
includes, in addition to the template-sampled border entries already used
for that `displayType`'s style, a diagonal border entry with `Type:
"diagonalUp"`, `Style: 6`, and `Color: "000000"`.

## R8
IF a cell is written with `displayType` `"F"`, `"AT"`, or `"J"` AND that
cell has no note (both `reg.notes` and `reg.justificationReason` are empty)
THEN the system SHALL apply that `displayType`'s existing style
(`styleF`/`styleAT`/`styleJ`) unchanged, without a diagonal border entry.

## R9
The system SHALL write the same cell text value for a given `displayType`
(`"F"`, `"AT"`, or `"J"`) via `SetCellValue` regardless of whether that
cell has a note — note presence SHALL NOT change the value written to the
cell.

## R10
The system SHALL apply the diagonal border entry described in R7 only to
cells styled `styleF`/`styleAT`/`styleJ` (or their noted variants) — never
to a cell styled `styleP` (the default "present" fallback written in the
`diasDelRango` loop).

## R11
IF a course sheet has two or more comment-bearing F/AT/J cells (per R1)
THEN the system SHALL continue to produce a distinct, non-colliding `id`
attribute for every `<v:shape>` in that sheet's
`xl/drawings/vmlDrawingN.vml` (i.e. `dedupeCommentShapeIDs`, added by the
sibling feature `excel_comment_missing_for_unjustified_absence`, continues
to run and succeed unmodified with the new per-comment `Width`/`Height`
and the new noted-cell styles in place).
