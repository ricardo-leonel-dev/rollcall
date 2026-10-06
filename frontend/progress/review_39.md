# Review — feature 39 `citations_chapter_header`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, `docs/*`, `CHECKPOINTS.md` all present; `init.sh` exits 0.
- C2: [x] — Only feature 39 is `in_progress`; session 62 is the open one with `review_status` empty (consistent with no review recorded yet).
- C3: [x] — Diff is confined to `src/app/features/citations/citations.component.ts`. Layer boundaries respected (ChapterHeaderComponent is a `shared/components/` reusable, already imported in feature 37 the same way). No new top-level folders, no new deps, no debug logs, no TODOs.
- C4: [x] — No automated test suite exists in this project (`docs/verification.md` is explicit about this — verify_command is empty). Build evidence is the project-defined Level 1 verification: `pnpm build` exits 0, only pre-existing CSS-budget warnings on untouched files (profile, login, absences, layout, justification-create-dialog, calendar, citation-dialog, export-config-dialog, admin). `citations.component.ts` itself produced no warning. Visual smoke JSONs (`visual_citations_chapter_header{,_tablet,_mobile}.json`) all assert `institutionEyebrow.present === true`, `roman === "Inspectoría"`, `sub === "Registro de citaciones"`, `separator === "·"`, `institutionFiletePresent === true`, `institutionTitle === null` (the smoking-gun for "no `title` prop"), and the icon prefix `campaign` is present in `full`. Per-tab mirrors (`coursesEyebrow`, `citationReasonsEyebrow`, `permissionsEyebrow`, `rosterEyebrow`) are identical to the institution eyebrow — confirms the eyebrow element is present in the DOM and reachable by every probe, not just the institution one.
- C5: [x] — Untracked files in `progress/` are the implementer's session artifacts (impl_39.md, three visual smoke reports with .png + .json) plus a carry-over of feature 34's `progress/{impl_34.md,review_34.md,visual_admin_remaining_tabs_*}` from the previous session — none are stray temp files added by this feature. Session 62 is open; the leader closes it after reading this review.
- C6: [x] — N/A — feature 39 is `sdd=0` (verified via `scripts/harness.sh status`); spec-driven gates do not apply.

## Acceptance criteria

1. Eyebrow `Inspectoría · Registro de citaciones` (icon `campaign`) renders above `.page-header` on `/citations`. PASS — visual smoke at all three viewports asserts `institutionEyebrow.present === true` with the expected roman/sub/separator and `full: "campaignInspectoría·Registro de citaciones"`. The `<app-chapter-header>` is at `citations.component.ts:81-84`, immediately above `<div class="page-header">` at line 86.
2. Double filete renders below the eyebrow. PASS — `institutionFiletePresent === true` at all three viewports.
3. `title` prop NOT set on `<app-chapter-header>`; h1 stays in its own `.page-header` block. PASS — `institutionTitle === null` in every JSON, and the diff confirms no `title` attribute. h1 `<h1 class="page-title">Citaciones</h1>` is untouched at line 87.
4. No regression to existing citations screen. PASS — diff is identical in shape to feature 37's (`git show 4537e79`): one import line + one entry appended to the `imports` array + a 3-line `<app-chapter-header>` template block + one blank line. No styles, no logic, no other markup changed.
5. No `Co-Authored-By` trailer on the commit. PASS — `git show 9849f26` trailer is empty; `grep -i co-authored` returns nothing.
6. Visual smoke at desktop 1440x900, tablet 1024x768, mobile 375x667 — eyebrow + filete visible, h1 stays in `.page-header`, no overflow. PASS — viewport fields in the three JSONs match the expected sizes (1440x900, 1024x768, 375x667); all three carry the same `institutionEyebrow` payload.
7. `pnpm build` exits 0; only pre-existing CSS-budget warnings on untouched files. PASS — re-ran build during this review: exit code 0, no warnings on `citations.component.ts`.

## Diff-vs-precedent check

Compared to feature 37's commit `4537e79` on `absences.component.ts`: identical mechanical shape. Only deltas are the icon (`event_busy` → `campaign`) and the suffix (`Registro de asistencia` → `Registro de citaciones`). The `campaign` icon is correctly chosen — `src/app/core/nav-items.ts:40` uses `icon: 'campaign'` for the `/inspectors/citations` sidebar entry, and it's the same icon already used in the existing empty state at `citations.component.ts:103,135`.

## Eyebrow suffix rationale

`Registro de citaciones` is well-justified in `progress/impl_39.md`: avoids duplicating the h1 (`Citaciones`) and avoids copying the long sidebar label (`Administración de citaciones`), while paralleling feature 37's most analogous screen (`Registro de asistencia` for absences — both are registries of student behavior over a trimester).

## Files changed

- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/citations/citations.component.ts` (+8 / -1)

## Artifacts

- Commit: `9849f26` on top of `origin/staging`.
- Visual smoke: `progress/visual_citations_chapter_header.json`, `_tablet.json`, `_mobile.json` (+ matching PNGs).
- Implementer report: `progress/impl_39.md`.

## Verdict

Approved. The implementation is mechanical and faithful to the foundation pattern set by features 29/35/36/37. Build is green, visual smoke asserts the expected DOM state at every viewport, no `Co-Authored-By` trailer, no diff drift outside the chapter-header insertion. The leader can now run `record-review approved` and `log-out`.
