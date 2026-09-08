# Review — feature 26 (`citations_listing_group_by_student`)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, `docs/`, `CHECKPOINTS.md` all on disk; `./init.sh` exits green (`[OK] Environment ready.`).
- C2: [x] — only feature 26 is `in_progress`; session #47 reflects current work on this branch.
- C3: [x] — code stays inside `src/app/features/citations/`; no new dependencies (`MatMenuModule` was already imported for `#rowMenu`); standalone + `OnPush` + inline template/styles preserved; `inject(...)` DI throughout.
- C4: [x] — `pnpm run build` exits `0`; no new warnings/errors introduced in `citations.component.ts` (the single warning flagged for the citations folder, `citation-dialog.component.ts`, is pre-existing and unrelated to this diff). No automated test suite exists in this project per `docs/conventions.md` and `CHECKPOINTS.md` (test framework not yet added), so `pnpm run build` is the mechanical verification.
- C5: [x] — session closure will be handled by the orchestrator (`log-out`) after this approval is recorded. Working tree is clean of debris besides the intended modified file and the new `progress/feature_26_impl.md` / `specs/citations_listing_group_by_student/` artifacts.
- C6: [x] — `specs/citations_listing_group_by_student/{requirements.md,design.md,tasks.md}` all on disk; requirements use strict EARS syntax with stable `R1`–`R16` ids; every task except `T13` is checked `[x]` and `T13`'s unchecked status is documented in `progress/feature_26_impl.md` (R16 manual smoke intentionally deferred to the user per their standing instruction not to rebuild the container). Every `R<n>` maps to concrete code that exists in the diff and is exercised by the build (no test framework yet → build is the only mechanical check, which is the project's currently-documented contract).

## Requirement traceability (R ↔ code)

| R  | Code reference in `citations.component.ts` | OK? |
|---|---|---|
| R1  | Template lines 151-154: `@if (latestCitation(row); as latest) { <button class="pill badge" ...>{{pillLabel(latest)}}</button>` — single pill rendered when `latestCitation(row)` is non-null. | OK |
| R2  | Template lines 155-164: `@if (extraCitations(row).length > 0) { <button class="pill-more">+{{ extraCitations(row).length }}</button> }` — only rendered when there are extras. | OK |
| R3  | Same `@if` guard — when exactly 1 scoped citation, `extraCitations(row)` is empty (`slice(1)` of `[c]`), so the `> 0` check excludes the "+N" control. | OK |
| R4  | Template line 147-148: `@if (scopedCitations(row).length === 0) { <span style="color:var(--muted)">—</span> }` left untouched. | OK |
| R5  | Template line 160: `(mouseenter)="moreTrigger.openMenu()"` on the "+N" button. | OK |
| R6  | Template lines 161 & 165: `(mouseleave)="moreTrigger.closeMenu()"` on both the "+N" button and the `<mat-menu>` element. | OK |
| R7  | Template line 158: `[matMenuTriggerFor]="moreMenu"` — `MatMenuTrigger` provides built-in click-to-toggle (touch/keyboard fallback). | OK |
| R8  | The "+N" button at lines 156-164 has no `(click)` binding to `onPillClick` or any other citation-detail handler — only the `MatMenuTrigger` open/toggle behavior runs on click. | OK |
| R9  | Template line 166: `@for (c of extraCitations(row); track c.id)` — ordering comes from `sortedScopedCitations(row).slice(1)`. | OK |
| R10 | Template line 152: `(click)="onPillClick(row, latest)"` on the visible pill (with `@if (...; as latest)` to satisfy strict-null checks, semantically identical to `onPillClick(row, latestCitation(row)!)`). | OK |
| R11 | Template line 167: `(click)="onPillClick(row, c)"` on each revealed `mat-menu-item`. | OK |
| R12 | `sortedScopedCitations` (lines 279-283): `\`${b.date}${b.time}\`.localeCompare(\`${a.date}${a.time}\`)` — descending lex compare on `YYYY-MM-DD` + `HH:MM` concatenation. | OK |
| R13 | `openHistory` (lines 349-354) is byte-identical to `origin/staging` — passes `row.citations` (unscoped) to `CitationHistoryDialogComponent`. | OK |
| R14 | `resolveTargetCitation` (lines 314-316) is byte-identical to `origin/staging` — pending-priority logic preserved, used by `notifyGuardian`/`deleteCitation` actions. | OK |
| R15 | `pnpm run build` exit `0` (verified by reviewer); no new warnings/errors in the modified file. | OK |
| R16 | Manual smoke deferred to user — see "Open questions" in `progress/feature_26_impl.md` and "Required changes" below. | Deferred (justified) |

## Task traceability (T ↔ code)

- T1  (R12) — `sortedScopedCitations` added at lines 279-283. OK.
- T2  (R1, R12) — `latestCitation` added at lines 285-287. OK.
- T3  (R2, R3, R9, R12) — `extraCitations` added at lines 289-291. OK.
- T4  (R1, R4) — template `<td>` rewritten (lines 150-174) with single pill + empty `—` branch untouched. OK.
- T5  (R2, R3) — `+N` button at lines 156-164 guarded by `@if (extraCitations(row).length > 0)`. OK.
- T6  (R5, R7) — `[matMenuTriggerFor]`, `#moreTrigger="matMenuTrigger"`, `(mouseenter)="moreTrigger.openMenu()"` all wired. OK.
- T7  (R6) — `(mouseleave)="moreTrigger.closeMenu()"` on both the button (line 161) and the `<mat-menu>` (line 165). OK.
- T8  (R8) — no `(click)` handler on "+N" button; verified by inspection of the diff. OK.
- T9  (R9, R11) — each `extraCitations(row)` rendered as `mat-menu-item` with `pillStyle`/`pillLabel` and `(click)="onPillClick(row, c)"` (lines 166-170). OK.
- T10 (R10) — visible pill keeps `(click)="onPillClick(row, latest)"` (line 152). OK.
- T11 (R13, R14) — `openHistory`/`resolveTargetCitation` byte-identical to `origin/staging`. OK.
- T12 (R15) — `.pill-more` and minor `.citations-menu-panel`/`.citations-menu-item` CSS added; `pnpm run build` exits `0`. OK.
- T13 (R16) — manual smoke deferred to user per their standing instruction (working-tree-only change; no container rebuild). Documented in `progress/feature_26_impl.md`. Acceptable justification for the unchecked box.

## Convention compliance

- Standalone component, `OnPush`, inline template + styles, no `.html`/`.css` siblings — preserved.
- `inject(...)` DI throughout; no constructor injection.
- `MatMenuModule` was already imported for `#rowMenu` — no new dependency introduced.
- Localized UI strings ("+N", tooltip "1 citación más" / "N citaciones más") match the existing Spanish-language style of this page.
- New `.pill-more` and menu-panel CSS reuses existing CSS variables (`--paper-deep`, `--muted-strong`, `--border`, `--border-soft`, `--ink-soft`) rather than introducing new colors.
- `.pills-cell` got a small `align-items: center` tweak so the "+N" control sits vertically aligned with the pill — minimal and consistent with the existing flex container intent.

## Files reviewed

- `/home/rileo/ai-personal-worktrees/feature-27-citation-date-format-and-label/frontend/src/app/features/citations/citations.component.ts` (modified)
- `/home/rileo/ai-personal-worktrees/feature-27-citation-date-format-and-label/frontend/specs/citations_listing_group_by_student/{requirements.md,design.md,tasks.md}`
- `/home/rileo/ai-personal-worktrees/feature-27-citation-date-format-and-label/frontend/progress/feature_26_impl.md`

## Required changes

None. R16 manual smoke (Level 3 verification per `docs/verification.md`) remains the user's responsibility under their standing instruction not to rebuild the container from this branch. The implementer's `progress/feature_26_impl.md` documents this deferral and the precise checklist; the orchestrator passes this on to the user.
