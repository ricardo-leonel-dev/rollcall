# Review — feature 002 `excel_comment_missing_for_unjustified_absence`

**Verdict:** APPROVED

## Summary

The implementer added a small, narrowly-scoped post-SaveAs zip/XML surgery helper
(`dedupeCommentShapeIDs`) to `export.go`, wired it into `processCourse`'s tail,
and shipped three new tests in `export_test.go` plus three small helpers
(`intPtr`/`stringPtr`/`probePlantilla`/`findVMLDrawing`). Every requirement is
covered by at least one concrete, currently-passing test; the regression-test
adversarial check confirms T4 actually catches the bug.

## Checkpoints

- C1: [x] — `.harness.json`/`harness.db` exist; `docs/` filled in; `./init.sh` exits 0 with `[OK] Environment ready`.
- C2: [x] — Only feature 002 is `in_progress`; every `done` feature has passing tests (verified via `go test -v ./...`).
- C3: [x] — `export.go` only adds the helper next to `mergeWorkbooks`/`stripExternalLinks` in the existing ZIP-utility section, no new files; no new dependencies (only stdlib + existing `excelize`/`pgxpool`); no `fmt.Println`/`log.Println`/`TODO` matches in changed files (grep returns empty).
- C4: [x] — Tests exist for the changed code; they exercise real behavior against the real `plantilla_asistencia.xlsx` fixture (no mocks of the thing under test); `gofmt -l .`, `go vet ./...`, `go build ./...` all return clean; `go test -v ./...` all PASS.
- C5: [x] — No stray temp files in working tree (only the expected 3 entries: `export.go` + `export_test.go` modified, plus the expected untracked spec/session/progress artifacts). Session still open (reviewer's job is to record verdict; implementer will log-out).
- C6: [x] — `specs/excel_comment_missing_for_unjustified_absence/{requirements.md,design.md,tasks.md}` all exist; requirements use strict EARS format with stable R1..R5 ids; every T1..T6 in `tasks.md` is `[x]` and the code matches; every R1..R5 maps to at least one concrete, currently-passing test (verified directly below).

## Required Changes

None. See findings below for non-blocking notes.

## Findings (sorted by severity)

### 1. Regression-test adversarial check — PASS (BLOCKING CHECK)

With `dedupeCommentShapeIDs(tempPath)` commented out in `processCourse`,
`TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs` fails with the verbatim
message:

```
export_test.go:359: R4: duplicate shape id id="_x0000_s1025" after dedupe
--- FAIL: TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs (0.07s)
FAIL
```

The failure output also dumps the unmodified VML drawing showing all three
`<v:shape>` elements sharing `id="_x0000_s1025"` (and the VML dump shows the
sibling `<v:shapetype id="_x0000_t202">` is correctly left alone). After
restoring the call, `go test -v ./...` returns:

```
=== RUN   TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs
--- PASS: TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs (0.08s)
PASS
ok  	excel-service	(cached)
```

The test is a real guard of the defect.

### 2. R→test traceability — verified directly (not from prose)

| Requirement | Test(s) | Verification |
|---|---|---|
| R1 (F/AT/J: notes non-empty → comment `"Nota: <notes>"`, type-independent) | `TestProcessCourse_FRecordComment_NoCommentForATEmptyFields` (F cell with `Nota: F note`); `TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs` (F + AT cells both carry `Nota: ...` text) | Read assertions: `bytes.Contains(commentsXML, []byte(fmt.Sprintf(`ref="%s"`, fcellRef)))` + `bytes.Contains(commentsXML, []byte(`Nota: F note`))` — match the spec wording. |
| R2 (notes + justificationReason both non-empty → single comment `"Nota: ...\nJustificación: ..."`) | `TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs` — J cell expects `Nota: J note&#xA;Justificación: illness` | Verified directly via a temporary inspection test that the actual `xl/comments1.xml` written by excelize contains `Nota: J note&#xA;Justificación: illness` (newline XML-escaped). Same content as the spec, just XML-escaped; tests dump unmodified `comments1.xml` on failure so a reader can confirm the order. Pragmatic deviation is justified. |
| R3 (notes + justificationReason both empty → no comment shape) | `TestProcessCourse_FRecordComment_NoCommentForATEmptyFields` — AT cell assertion: `bytes.Contains(commentsXML, []byte(fmt.Sprintf(`ref="%s"`, atcellRef)))` must be FALSE | Match the spec wording. |
| R4 (2+ comment-bearing cells → distinct `id`s on every `<v:shape>`) | `TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs` (3 distinct ids via `seen` map, len==3); `TestDedupeCommentShapeIDs_Unit` (hand-crafted 3 duplicates → 3 distinct) | Both checks go beyond "any shape IDs exist" — they verify len==expected and uniqueness. |
| R5 (fix leaves comment content/`ref` unchanged) | `TestProcessCourse_FRecordComment_NoCommentForATEmptyFields` + `TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs` — both assert the exact `<comment ref="..." ...><t>...</t></comment>` text + ref presence | Decoded J text via inspection test matches `"Nota: <notes>\nJustificación: <reason>"` verbatim in that order. |

### 3. Edge cases — all verified

- **Zero comments → no-op**: helper has explicit `if !changed { return nil }`
  early-return when no `xl/drawings/vmlDrawing*.vml` entry exists, so
  `writeZipEntries` is not called. T3 exercises a sheet with exactly one
  comment (no harm — the single `_x0000_s1025` is rewritten to `_x0000_s1025`,
  no observable change). The unit test does not explicitly assert "no-op on
  empty file" but the implementation does the right thing; not a blocker.
- **Multiple sheets with VML drawings**: helper iterates **all** zip entries
  matching `xl/drawings/vmlDrawing*.vml` with `strings.HasPrefix(...) &&
  strings.HasSuffix(...)`, not just one. Each entry has its own `next := 1025`
  counter so uniqueness holds within each sheet's drawing part (per the design
  note — VML shape `id` uniqueness only needs to hold within one drawing part,
  not across sheets). Correct.
- **Only touches `id` attribute**: regex is `id="_x0000_s\d+"` — exclusively
  the `id` of `<v:shape>`. Other attributes (`style`, `fillcolor`, `type`,
  `strokecolor`) are untouched. Sibling `<v:shapetype id="_x0000_t202">` uses a
  different prefix (`_x0000_t`) and is left alone — unit test explicitly
  asserts `id="_x0000_t202"` is preserved.
- **Multi-course / merge path**: `dedupeCommentShapeIDs` runs **per-course**,
  before `mergeWorkbooks` (which renames `vmlDrawing1.vml` →
  `vmlDrawingN.vml` per course but does not touch shape IDs within each
  drawing). Uniqueness within each drawing is preserved by the per-course
  dedupe. Design confirms this is sufficient.

### 4. Conventions + architecture — verified

- Helper follows the zip/XML-surgery idiom of `mergeWorkbooks` and
  `stripExternalLinks`: `readZipEntries` → mutate in-place → `writeZipEntries`
  with the same early-return-on-no-change idiom as `stripExternalLinks`. ✓
- `dedupeCommentShapeIDs` is package-private (lowercase). ✓
- No exported symbols added. ✓
- Comments follow the codebase "comments earn their place" rule — the helper
  has a clear "why" (the `addDrawingVML` hardcoded-id rationale, the
  `_x0000_t202` exclusion) matching the bar set by `db.go`'s `search_path`
  rationale comment. ✓
- `reVMLShapeID` is grouped in a `var (...)` block? Actually it's a single var
  next to the helper that uses it (the convention says "grouped in a `const
  (...)`/`var (...)` block near first use"). The single-var form is fine
  here — it's immediately above the helper, not hoisted to the top of the
  file. Minor stylistic note, not a blocker.

### 5. Non-blocking notes

- **Pragmatic deviation on the J comment test**: the design prescribes the
  literal newline `\n` between "Nota: ..." and "Justificación: ..." but the
  test asserts the XML-escaped `&#xA;`. Verified via direct inspection that
  excelize does in fact XML-escape the embedded newline when writing
  `xl/comments1.xml`. The test failure output dumps the unmodified
  `comments1.xml` so the reviewer can confirm the exact content + order. This
  is a justified, documented deviation (the implementer called it out in the
  handoff) and the test still catches any future regression in either the
  encoded or the decoded form.
- **No explicit "zero-comment no-op" unit test**: the implementation handles
  it correctly via the `changed` flag, but no dedicated unit test asserts it.
  T3 covers the 1-comment case implicitly. Not a blocker for this feature
  (the spec doesn't require an explicit no-op test, and the implementation
  path is trivially obvious), but a reviewer could request it as a follow-up
  if defensiveness is desired.

## Mandatory verification outputs (verbatim, last lines)

```
$ gofmt -l .
(empty)

$ go vet ./...
(empty)

$ go build ./...
(empty / ok)

$ go test -v ./... 2>&1 | tail -30
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
=== RUN   TestDedupeCommentShapeIDs_Unit
--- PASS: TestDedupeCommentShapeIDs_Unit (0.00s)
=== RUN   TestProcessCourse_FRecordComment_NoCommentForATEmptyFields
--- PASS: TestProcessCourse_FRecordComment_NoCommentForATEmptyFields (0.08s)
=== RUN   TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs
--- PASS: TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs (0.08s)
PASS
ok  	excel-service	(cached)

$ ./init.sh 2>&1 | tail -15
[OK]    all sdd=1 features have their spec files on disk
[WARN]  No verify_command configured in .harness.json — skipping
[OK]    snapshot regenerated at state
[WARN]  $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync
[OK]    Environment ready. You can start working.

$ git status
On branch staging
Your branch is up to date with 'origin/staging'.
Changes not staged for commit:
        modified:   export.go
        modified:   export_test.go
Untracked files:
        progress/impl_excel_comment_missing_for_unjustified_absence.md
        specs/excel_comment_missing_for_unjustified_absence/
        state/features/002-excel_comment_missing_for_unjustified_absence.md
        state/sessions/2026-08-31-4-excel_comment_missing_for_unjustified_absence.md
        state/sessions/2026-08-31-5-excel_comment_missing_for_unjustified_absence.md

$ git diff --stat
 excel-service/export.go      |  46 ++++++++
 excel-service/export_test.go | 258 +++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 304 insertions(+)
```

## Regression adversarial outputs (verbatim)

```
$ # Step 3: dedupe disabled
$ go test -run TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs -v
export_test.go:359: R4: duplicate shape id id="_x0000_s1025" after dedupe
    --- vml ---
    [...full VML drawing dump showing three v:shape id="_x0000_s1025" entries with different x:Anchor coordinates + the shared v:shapetype id="_x0000_t202"...]
--- FAIL: TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs (0.07s)
FAIL

$ # Step 5: dedupe restored
$ go test -v ./...
=== RUN   TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs
--- PASS: TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs (0.08s)
PASS
ok  	excel-service	(cached)
```

## Verdict

APPROVED — every checkpoint is met, every R is covered by a concrete test,
the regression adversarial check passes, edge cases are handled correctly,
conventions are respected.