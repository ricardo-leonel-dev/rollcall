# Requirements — Export selects the correct trimester sheet

Scope: `excel-service` only (this repo). `GET /export/excel` (`exportExcelHandler`,
`export.go`) currently ignores which academic period was requested: `processCourse`
always deletes every template sheet except `f.GetSheetList()[0]` and always treats
that first sheet as `base`. The template (`plantilla_asistencia.xlsx`) ships exactly
3 sheets, in this fixed document order (confirmed by reading `xl/workbook.xml`
directly): `"1ER TRIMESTRE"`, `"2DO TRIMESTRE"`, `"3ER TRIMESTRE"`. This order does
**not** follow each sheet's internal `sheetId` — it follows position in the
`<sheets>` list, which is what `excelize.GetSheetList()` returns.

This feature adds two optional query parameters, `quarter_sequence` and
`quarter_name`, so the caller (the sibling `attendance_backend` project's own
feature `export_endpoint_accepts_quarter_selection`, which forwards a resolved
`Quarter` row's `sequence_number`/`name`) can select which of the 3 sheets survives
and gets populated, instead of always the first one.

Scoping note: this feature assumes the template's current, fixed 3-trimester
structure (`sequence_number` 1/2/3 mapping directly to sheet position 1/2/3 in
document order). It does not need to handle an arbitrary number of periods — that
would only become relevant if the sibling backend feature
`relax_quarter_naming_and_count_constraints` (`spec_ready`, not yet implemented)
ships and additionally starts sending sequence numbers outside 1..3; that is
explicitly out of scope here.

## Default / backward-compatible behavior

## R1
WHERE neither the `quarter_sequence` nor the `quarter_name` query parameter is
supplied on `GET /export/excel`, the system SHALL select the template's first
sheet in document order (position 0 of `GetSheetList()`) as the sheet to keep and
populate, identical to the behavior before this feature.

## Selecting by `quarter_sequence`

## R2
WHEN the `quarter_sequence` query parameter is supplied and parses as an integer
between 1 and 3 inclusive, the system SHALL select the template's sheet at
position (`quarter_sequence` - 1) in document order as the sheet to keep and
populate, regardless of whether `quarter_name` is also supplied.

## R3
IF the `quarter_sequence` query parameter is supplied and does not parse as an
integer THEN the system SHALL respond with HTTP 400 and SHALL NOT query the
database or open the template for any course in the request.

## R4
IF the `quarter_sequence` query parameter is supplied, parses as an integer, but
that integer is less than 1 or greater than 3 THEN the system SHALL respond with
HTTP 400 and SHALL NOT query the database or open the template for any course in
the request.

## Selecting by `quarter_name` (only when `quarter_sequence` is absent)

## R5
WHERE the `quarter_sequence` query parameter is not supplied and the
`quarter_name` query parameter is supplied, the system SHALL select the sheet to
keep and populate by matching `quarter_name`'s first word, case-insensitively and
with leading/trailing whitespace trimmed, against a fixed mapping (`"PRIMER"` /
`"PRIMERO"` -> sheet position 0, `"SEGUNDO"` -> sheet position 1, `"TERCER"` /
`"TERCERO"` -> sheet position 2).

## R6
IF the `quarter_sequence` query parameter is not supplied, the `quarter_name`
query parameter is supplied, and its first word does not match any entry of the
mapping in R5 THEN the system SHALL respond with HTTP 400 and SHALL NOT query the
database or open the template for any course in the request.

## Cleanup of non-selected sheets

## R7
The system SHALL delete every template sheet other than the one selected per
R1, R2, or R5, for every course processed in the request — the same cleanup
guarantee the service already provided when it always kept only the first sheet,
now generalized to whichever sheet was actually selected.

## Template/deployment mismatch

## R8
IF the sheet position selected per R2 or R5 is greater than or equal to the
number of sheets the template file actually contains when a course's temporary
copy is opened THEN the system SHALL respond with HTTP 500, SHALL NOT leave that
course's temporary file behind, and SHALL stop processing the remaining courses
in the request.
