# Requirements — Excel comment missing for unjustified ("F") absence

Scope: `excel-service` only (this repo). `processCourse` (`export.go`) already
writes a per-cell hover comment (`f.AddComment`) generically for any
`absenceRecord` whose `notes` or `justificationReason` is non-empty, regardless
of `reg.typ`/`displayType` — that generic call site is not type-conditional and
does not need to change.

Root cause (confirmed by direct investigation — see `design.md`): the vendored
`excelize` v2.10.1 (`vml.go`'s `addDrawingVML`) hardcodes
`id: "_x0000_s1025"` for **every** `<v:shape>` it appends to a sheet's VML
drawing part (`xl/drawings/vmlDrawingN.vml`). A sheet with only zero or one
comment never has a collision and works by accident; a sheet with **two or
more** comment-bearing cells (the normal case for a real course/date range —
e.g. one "F" absence with notes and at least one "AT"/"J" absence with notes)
ends up with multiple `<v:shape>` elements sharing the exact same `id`
attribute, which real Excel's VML/legacy-drawing object model does not
tolerate: only one shape per duplicated `id` keeps a working, hoverable note
when the file is opened. Because absences are queried `ORDER BY roster_number,
date` and written to the sheet in that order, whichever comment is written
**first** on a sheet with 2+ comments is the one most consistently affected —
which is what was observed and reported as "F is missing, AT/J work."

Confirmed empirically: `xl/comments1.xml` (the plain-text comment content,
read back via `excelize.GetComments`) is **not** affected — it already lists
every comment correctly regardless of type, both before and after this fix.
Only the `id` attributes inside `xl/drawings/vmlDrawingN.vml` are broken. This
is why a test built purely against `GetComments`/`comments1.xml` cannot detect
this defect or its fix — see `design.md`'s discarded alternative #3.

## R1
The system SHALL add a cell comment for every `absenceRecord` whose `notes`
field is non-empty, containing the text `"Nota: <notes>"`, independent of the
record's `typ`/`displayType` value ("F", "AT", or "J" all behave identically).

## R2
WHEN an `absenceRecord`'s `notes` and `justificationReason` are both
non-empty, the system SHALL produce a single comment on that record's cell
whose text is `"Nota: <notes>"` followed by a newline followed by
`"Justificación: <justificationReason>"`, in that order.

## R3
IF an `absenceRecord`'s `notes` and `justificationReason` are both empty THEN
the system SHALL NOT add a comment shape for that record's cell.

## R4
WHEN a course sheet ends up with two or more comment-bearing cells (per R1),
the system SHALL write that sheet's VML drawing part
(`xl/drawings/vmlDrawingN.vml`) such that every `<v:shape>` element has a
distinct `id` attribute — no two shapes on the same sheet share an `id`.

## R5
WHILE fixing shape `id` uniqueness per R4, the system SHALL leave every
comment's cell reference (`ref` in `xl/commentsN.xml`) and text content
unchanged — the fix touches only the `id` attribute of VML shapes, never
comment placement or content.
