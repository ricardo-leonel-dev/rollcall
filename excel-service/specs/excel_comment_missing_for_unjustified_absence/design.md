# Design — Excel comment missing for unjustified ("F") absence

See `docs/architecture.md` (single-package layout, "don't hold the template in
memory" rule, error-handling convention) and `docs/conventions.md` (naming
table, "generic/infra function -> English camelCase", zip/XML-surgery idiom
already established by `mergeWorkbooks`/`stripExternalLinks`) for the baseline
this design builds on. This feature only touches `export.go` — no new file,
no new dependency (no `excelize` version bump, no fork/vendor patch — see
"Discarded alternatives" below), no change to `main.go`/`db.go`/`names.go`,
and no change to the attendance-query SQL (comment *content* logic in the
`cd.registros` loop is already correct and untouched — see R1-R3 which
describe existing, already-correct behavior kept as regression coverage).

## Investigation trail (how the root cause was confirmed)

1. Read `export.go`'s comment-writing block (`processCourse`, the
   `f.AddComment` call inside the `cd.registros` loop): it is not
   type-conditional — `parts`/`AddComment` fire identically for "F", "AT",
   and "J" records whenever `reg.notes`/`reg.justificationReason` is
   non-empty. Static reading alone does not explain the reported symptom.
2. Read the SQL query in the `GET /export/excel` handler: `notes` is
   `COALESCE`d and selected unconditionally for every `a.type`; no
   type-specific filtering exists there either.
3. Built a synthetic `processCourse` call (roster + 2-3 `absenceRecord`s
   mixing "F"/"AT"/"J", all with `notes`/`justificationReason` set) against
   the real `plantilla_asistencia.xlsx`, then inspected the resulting
   `.xlsx`'s zip entries directly.
4. `xl/comments1.xml` was correct in every case: each expected `ref`/text
   pair was present, F included, structurally identical to AT/J. This rules
   out the comment-content code path (R1-R3) as the defect.
5. `xl/drawings/vmlDrawing1.vml` showed **every** `<v:shape>` sharing the
   literal same `id="_x0000_s1025"` attribute. Traced this to vendored
   `github.com/xuri/excelize/v2@v2.10.1`'s `vml.go`, `addDrawingVML`
   (~line 926): `shape := xlsxShape{ID: "_x0000_s1025", ...}` is hardcoded,
   not derived from a counter, for every shape appended to a sheet's VML
   drawing. `excelize.Comment` (the public struct `AddComment` accepts) has
   no `ID`/similar field — there is no supported way to pass a unique id
   through the public API.
6. This is a genuine, verifiable defect independent of any single manual
   repro: OOXML/VML `<v:shape>` `id` values are meant to be unique within
   their drawing part, and real Excel's legacy-drawing object model is known
   to only keep one working note indicator per duplicated `id` when a sheet
   has 2+ comment shapes. It also matches the reported pattern: absences are
   processed `ORDER BY roster_number, date`, so on a sheet with an "F" and a
   later "AT"/"J", the "F" comment is written (and thus loses the `id`
   collision) first.

## Files to touch

| File | Change |
|---|---|
| `export.go` | Add a `reVMLShapeID` regexp and a `dedupeCommentShapeIDs(zipPath string) error` helper, next to `mergeWorkbooks`/`stripExternalLinks` (same "raw zip/XML surgery on our own generated output" section). Call it once from `processCourse`, right after `f.SaveAs(tempPath)` succeeds and `f.Close()` runs, before returning. |

## New/changed signatures

```go
var reVMLShapeID = regexp.MustCompile(`id="_x0000_s\d+"`)

// dedupeCommentShapeIDs rewrites the id attribute of every <v:shape> found in
// zipPath's xl/drawings/vmlDrawing*.vml parts so each comment shape on a given
// sheet gets a unique, sequential id starting at 1025 (matching the id Excel
// itself uses for the first manually-added comment on a sheet). excelize's
// AddComment hardcodes id="_x0000_s1025" for every shape it appends (see
// addDrawingVML in the vendored excelize v2.10.1's vml.go), so any sheet with
// 2+ comments ends up with duplicate ids, which real Excel's VML/legacy-drawing
// object model does not tolerate (R4). No-ops (returns nil without rewriting
// the zip) if the file has no vmlDrawing part, i.e. the course had zero
// comments.
func dedupeCommentShapeIDs(zipPath string) error {
	entries, err := readZipEntries(zipPath)
	if err != nil {
		return err
	}
	changed := false
	for i, e := range entries {
		if !strings.HasPrefix(e.name, "xl/drawings/vmlDrawing") || !strings.HasSuffix(e.name, ".vml") {
			continue
		}
		next := 1025
		entries[i].content = reVMLShapeID.ReplaceAllFunc(e.content, func([]byte) []byte {
			id := fmt.Sprintf(`id="_x0000_s%d"`, next)
			next++
			return []byte(id)
		})
		changed = true
	}
	if !changed {
		return nil
	}
	return writeZipEntries(zipPath, entries)
}
```

`processCourse`'s tail changes from:

```go
	f.Close()
	return tempPath, nil
}
```

to:

```go
	f.Close()
	if err := dedupeCommentShapeIDs(tempPath); err != nil {
		os.Remove(tempPath)
		return "", err
	}
	return tempPath, nil
}
```

— matching this function's existing convention (every prior error path in
`processCourse` removes `tempPath` before returning the error).

Note on scope: this call site is per-course, before `mergeWorkbooks`. Each
`processCourse` output always has its own single `xl/drawings/vmlDrawing1.vml`
(the "1" numbering only becomes "2", "3", ... once `mergeWorkbooks` copies a
course's files into the merged workbook — see its `sheetNum := i + 2` and the
`comments1.xml`/`vmlDrawing1.vml` -> `commentsN.xml`/`vmlDrawingN.vml` rename).
VML shape `id` uniqueness only needs to hold **within one drawing part**
(i.e. within one sheet) — not across sheets — so deduping once per course,
before merge, is sufficient; `mergeWorkbooks` does not need any change.

## Regex correctness note

`reVMLShapeID` matches `id="_x0000_s\d+"` — the `_x0000_s` prefix is specific
to `<v:shape>` elements. The sheet's single, shared `<v:shapetype
id="_x0000_t202">` uses the `_x0000_t` prefix (a different, intentionally
shared/reused id referenced by every shape's `type="#_x0000_t202"` attribute)
and is untouched by this regex — confirmed by inspecting real generated
output (see "Investigation trail" step 3-5); renumbering it would be both
unnecessary and wrong (it needs to stay a single shared value, not become
unique per shape).

## Tests

Per `docs/verification.md`, `export_test.go` already exists (added by the
sibling feature `export_selects_the_correct_trimester_sheet`) and this feature
extends it, following its established pattern of building a synthetic
`courseData`/`*excelize.File` rather than depending on network/DB state.
Unlike that feature's pure-function tests, this one needs to call
`processCourse` itself (the defect lives in the zip/XML `processCourse`
produces, not in a pure helper), using the real `plantilla_asistencia.xlsx`
fixture already present in the repo root (confirmed present and already used
as the production template — no new fixture needed).

Critically, per R4/R5 and the "Investigation trail," a regression test for
this defect **must** inspect `xl/drawings/vmlDrawingN.vml`'s raw `id="..."`
attributes directly (e.g. via `regexp.FindAllString`/similar over the zip
entry's bytes) — asserting only through `excelize.GetComments`/
`xl/commentsN.xml` content would pass even with the bug present, since that
part was never broken (see "Discarded alternatives" #3).

## Discarded alternatives

1. **Vendor/fork a patched copy of `excelize`'s `addDrawingVML` to generate a
   unique id itself, instead of a local post-processing pass in `export.go`.**
   Rejected: `docs/architecture.md` treats adding a dependency as "a
   deliberate choice, not a default"; maintaining a forked/patched copy of a
   third-party module is a heavier, easier-to-silently-lose fix than that (a
   future `go get -u` of `excelize` would drop the patch with no compile-time
   signal). A small, local, testable helper using this codebase's own
   already-established zip/XML-surgery idiom (`mergeWorkbooks`,
   `stripExternalLinks`) is self-contained and shows up in `git blame`/code
   review the same way those two already do.
2. **Bump `github.com/xuri/excelize/v2` to a newer release, hoping the
   upstream hardcoded id was fixed since v2.10.1.** Rejected: unverified
   during this spec-drafting session (no changelog/issue-tracker read
   performed as part of this investigation), and `docs/architecture.md`
   already frames dependency changes as deliberate rather than exploratory;
   a version bump also risks unrelated behavior changes across ~940 lines of
   `excelize` usage in this service, for a fix whose correctness this spec
   cannot independently verify without actually reading that release's
   source. The local fix is fully verifiable today, in this repo, against
   the currently-pinned version.
3. **Write the regression test using only `excelize.GetComments`/
   `xl/commentsN.xml` content, not raw VML `id` inspection.** Rejected: per
   the "Investigation trail," `xl/commentsN.xml` is not where the defect
   lives — every comment already appears there correctly, with or without
   this fix. A test scoped to that file would pass unconditionally and give
   false confidence; it would not actually cover R4 and could not have
   caught this defect in the first place.

## Non-goals

- No change to *which* absence records get a comment, or to comment text
  content/formatting (R1-R3 describe existing, already-correct behavior that
  this feature must not regress — see R5).
- No change to `mergeWorkbooks`'s handling of `commentsN.xml`/
  `vmlDrawingN.vml` for multi-course exports — per-course dedup before merge
  is sufficient, as explained above.
- No change to comment *visual* properties (fill color, size, author) —
  out of scope; the defect and fix are both about `id` uniqueness only.
