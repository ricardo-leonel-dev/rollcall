# Review — feature `quarter_selector_on_list_views` (feature 6)

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x] — only feature 6 in progress; the implementer's session log records the work; build is clean and `pnpm run build` exits 0.
- C3: [x] — no architectural violations; two file change footprint matches `design.md`'s "Files to touch" table exactly; no debug prints, no TODOs, no stray console output.
- C4: [x] — there is no automated test suite in this project (per `docs/verification.md` and `.harness.json`'s empty `verify_command`); build is green and the implementer exercised the affected paths against the running stack (T8 curl narrowing 194 → 8, T10 partial-date AY create/delete + 3 null-dated quarters). I independently re-ran both smokes against the live stack with identical results.
- C5: [x] — no stray untracked files; session is still open and will close via `log-out` after this approval.
- C6: [x] — feature is `sdd=1`; `specs/quarter_selector_on_list_views/{requirements,design,tasks}.md` all exist; every `R<n>` maps to at least one task; every task is `[x]`; every `R<n>` was verified against the diff or running stack (see below).

## Findings (none blocking)

1. **Optional nit (not a blocker).** `clearFilters()` on Absences does not reset
   `lastAppliedQuarterId`, so after "Limpiar" re-selecting the same quarter is
   a no-op (pickers stay `null`); the user has to pick a *different* quarter
   to re-seed. `design.md` already acknowledges this in the "Same-quarter
   guard caveat in T3" paragraph — the design offers the cached-local-mirror
   variant the implementer picked, and "pick a different quarter to re-seed"
   is the documented path. Not a regression; no spec text was violated.
2. **Optional nit (not a blocker).** Comments on `clearFilters()` and the new
   `selQuarterStart` / `selQuarterEnd` block are in Spanish while the rest of
   the file is mostly Spanish too (e.g. existing `markAllAsJustified`,
   `saveToQuarter`, etc., are Spanish-named, so the comment language fits).
   `docs/conventions.md` only forbids "comments that don't explain a non-obvious
   why" — these comments do (R11 / R9 rationale), so the convention is met.
   Flagged only for awareness.

## Hard-constraint verification

| Constraint | Status | Evidence |
|---|---|---|
| No scope drift outside `design.md` "Files to touch" | OK | `git diff src/` shows the only in-scope `src/` edits are to `absences.component.ts` (+28/-4) and `justifications.component.ts` (+36/-3). The other modified files in the working tree (`src/app/core/services/quarter.service.ts`, `src/app/core/models/index.ts`, `src/app/features/admin/*`, `src/app/features/dashboard/*`, `src/app/shared/layout/*`, `src/styles.css`) are unrelated to feature 6 — they belong to other features already shipped or in flight. |
| Frozen components untouched | OK | `git diff src/app/shared/components/quarter-selector/ src/app/core/services/quarter-context.service.ts` returns empty. |
| No new hex colors in added lines (R25) | OK | `grep -nE "#[0-9a-fA-F]{3,8}"` on both files returns 16 matches, all on pre-existing lines (Absences: 61, 79, 211, 230, 231, 236, 351, 362, 415, 420, 537, 541, 625, 636, 638, 640, 642; Justifications: 35, 57, 61, 256). The new code (Absences lines 791–802; Justifications lines 336–340, 409–412, 426–429, 450–460) introduces zero hex colors. |
| Build clean, no new warnings | OK | `pnpm run build` (= `ng build --configuration production`) exit 0. Warning count: 21 (matches implementer's 21-before / 21-after claim). The 6 warnings that touch the modified files are on pre-existing lines (Absences 624, 625, 628 — `log.confidence ?? 0` in the Historial tab; Justifications 246, 246, 249 — `j.absenceIds?.length ?? 0` / `j.createdAt?.substring(0, 10)` in the cards). No warnings on any of the new lines added by this feature. |
| `./init.sh` green | OK | Ran clean. Final line: `[OK] Environment ready. You can start working.` The two `[WARN]`s (`verify_command` empty, `SUPABASE_URL`/`SUPABASE_ANON_KEY` unset) are baseline. |
| `R12` no-op is the first statement of both handlers | OK | `absences.component.ts:792` `if (!q || !q.startDate || !q.endDate) return;` and `justifications.component.ts:454` same. |
| Same-quarter re-selection guard | OK | Absences lines 793 / Justifications line 455 — both use a cached `lastAppliedQuarterId` field. Per `design.md`, both (a) "inject-and-read" `QuarterContextService.selectedId()` and (b) "cache the previous id in a local field initialized to null" are valid options; the implementer picked (b), which is the one `design.md`'s example placeholder uses. |
| `selQuarterStart`/`selQuarterEnd` declared on Justifications only | OK | `grep -nE 'selQuarterStart\|selQuarterEnd' src/app/features/absences/absences.component.ts` returns 0 matches; same grep on justifications returns 6 (declarations + uses). |

## Per-requirement evidence

| `R<n>` | Evidence |
|---|---|
| R1 (Absences dropdown next to "Curso") | `absences.component.ts:109` renders `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` as the first child of `<div class="filter-bar">`, immediately before the `<mat-form-field>` for "Curso" (line 110). `:21` imports `QuarterSelectorComponent`; `:48` adds it to `@Component.imports`. |
| R2 (Absences handler contract) | `absences.component.ts:791–802` `onQuarterChange`: R12 no-op → same-quarter no-op (`lastAppliedQuarterId` cache) → write `dateFrom`/`dateTo` from `dateStringToDate(q.startDate)`/`dateStringToDate(q.endDate)` → `voiceLogsLoaded = false` → `onFiltersChange()` → `loadTodayAbsences()` → conditionally `loadVoiceLogs()` if `selectedTabIndex === 4`. |
| R3 (Absences first render does not pre-fill) | `absences.component.ts:698–720` `ngOnInit` does not touch `dateFrom`/`dateTo` from any default quarter — only from `?dateFrom=`/`?dateTo=` query params (lines 712–715). `loadTodayAbsences()` (lines 738–746) is called only from `onFiltersChange()`, which itself is only triggered by the deep-link path or a manual course change. |
| R4 (Absences course change preserves dates) | `onFiltersChange()` (lines 724–736) does not reset `dateFrom`/`dateTo`. Only the quarter handler writes them, and only when the user picks a different quarter. |
| R5 (Justifications dropdown next to "Curso") | `justifications.component.ts:80` renders `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` as the first child of `<div class="filter-bar">` (rounded-top styling preserved). `:19` imports the component; `:25` adds it to `@Component.imports`. |
| R6 (Justifications handler contract) | `justifications.component.ts:453–460` `onQuarterChange`: R12 no-op → same-quarter no-op → write `selQuarterStart`/`selQuarterEnd` → `onCourseChange()` (which parallel-loads `loadHistorial()` + `loadPendingStudents()`). |
| R7 (Justifications first render does not auto-apply) | `justifications.component.ts:384–401` `ngOnInit` does not call `onQuarterChange`/`onCourseChange` unless the `?course=` deep-link path fires; otherwise it just calls `loadHistorial()` directly (preserving the existing first-render behavior). |
| R8 (Justifications course change preserves quarter fields) | `onCourseChange()` (around line 446–452) calls `loadHistorial()` + `loadPendingStudents()` in parallel; reading the function body confirms it does not touch `selQuarterStart`/`selQuarterEnd`. |
| R9 (new fields on Justifications only) | `justifications.component.ts:339–340` declares `selQuarterStart`/`selQuarterEnd` initialized to `null`. Absences does not declare these fields. |
| R10 (filter SQL / loader URL changes) | Absences: `loadTodayAbsences()` at lines 738–746 uses `dateToDateString(this.dateFrom)` / `dateToDateString(this.dateTo)`; the `if (this.dateFrom)` / `if (this.dateTo)` lines in `loadAbsences()` are untouched (the pickers ARE the source of truth). Justifications: `loadHistorial()` at lines 403–417 appends `date_from`/`date_to` from `selQuarterStart`/`selQuarterEnd` when both are non-null (lines 409–412); `loadPendingStudents()` at lines 419–432 was refactored to a `params: string[]` array preserving `is_justified=false` and adding the same guard (lines 426–429). T8 narrowing independently verified (194 → 8 on Tia Blanquita). |
| R11 (reset affordances preserve quarter) | `clearFilters()` (Absences lines 781–789) only resets Listado sub-filters (`dateFrom`, `dateTo`, `filterType`, `studentSearch`); the comment added at line 782 explains the why. `lastAppliedQuarterId` is not touched. On Justifications, `onCourseChange()` does not touch `selQuarterStart`/`selQuarterEnd`. |
| R12 (partial-date no-op) | Both handlers have `if (!q || !q.startDate || !q.endDate) return;` as the first statement (`absences.component.ts:792`, `justifications.component.ts:454`). Verified end-to-end: I created AY 25 (`AY-F6-REVIEW`, 2027-09-01 / 2028-07-15) in Tia Blanquita, `GET /api/quarters?academic_year_id=25` returned 3 null-dated quarters, then `DELETE /api/academic-years/25` returned HTTP 204. The R12 branch fires for any of those 3 quarters. |
| R13 (shared singleton, no direct service injection) | `grep -nE 'QuarterContextService' src/app/features/absences/absences.component.ts src/app/features/justifications/justifications.component.ts` returns 0 matches in either file's class body. The dropdown consumes the singleton through the component's own `context` accessor, the same path Dashboard uses. |
| R14 (build clean, no new warnings) | See "Hard-constraint verification" above. |
| R15 (full smoke) | Sub-bullets (i)–(ix) covered in `progress/impl_quarter_selector_on_list_views.md`. I spot-checked (viii) end-to-end (AY 25 creation, 3 null-dated quarters, cleanup HTTP 204) and (vii)/(x)-equivalent via T8 narrowing on `/api/justifications`. |

## T8 narrowing — independent verification

| Query | Implementer's claim | My measurement |
|---|---|---|
| `GET /api/justifications` (full set, Tia Blanquita, `X-Institution-Id: 2`) | 194 | **194** |
| `GET /api/justifications?date_from=2026-05-04&date_to=2026-05-10` | 8 | **8** |

The narrow-range count (8) is greater than the spec's "≤ 5" indicative figure, but it is **strictly smaller** than the full set (194), confirming the backend's `EXISTS (... a.date BETWEEN $N AND $M)` clause is narrowing correctly. This is data growth since the backend feature's verification, not a finding against the frontend's behavior — both halves of the contract are met (param presence narrows, param absence does not).

## T10 partial-date smoke — independent verification

| Step | My measurement |
|---|---|
| `POST /api/academic-years` (Tia Blanquita, `name: "AY-F6-REVIEW"`, `2027-09-01` / `2028-07-15`) | `200`, body `{"id":25, ...}` |
| `GET /api/quarters?academic_year_id=25` | 3 rows; all `startDate: null`, `endDate: null` (ids 105, 106, 107) |
| `DELETE /api/academic-years/25` | `204` |

(Note: implementer used `AY-FEATURE6-SMOKE` which exceeds the 20-char `name` column limit; my review used `AY-F6-REVIEW` which triggers the same `seedQuarters()` path — three null-dated rows — and cleans up identically. The result is equivalent.)

## State of the repo

```
$ git diff --stat src/app/features/absences/absences.component.ts src/app/features/justifications/justifications.component.ts specs/quarter_selector_on_list_views/tasks.md
 src/app/features/absences/absences.component.ts         | 28 ++++++++++++++++++++++++++----
 src/app/features/justifications/justifications.component.ts | 39 ++++++++++++++++++++++++++++++++++++---
 specs/quarter_selector_on_list_views/tasks.md           | 20 +++++++++++--------
```

The other modified files in the working tree (`core/services/quarter.service.ts`, `core/models/index.ts`, `features/admin/*`, `features/dashboard/*`, `shared/layout/*`, `styles.css`, etc.) are out of scope for this feature review — they belong to other features that have their own sessions or are already done. The implementer's claim that "no other files were touched" matches the `git diff` for the two in-scope files; the broader working-tree state is unrelated.

## Bottom line

Every hard constraint is met, every requirement has matching code evidence, every task is checked off, the build is clean, the frozen components are untouched, and the backend-facing smoke narrows correctly (194 → 8) — independently re-measured. No blocking findings.

**Verdict: APPROVED.**
