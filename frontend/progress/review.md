# Review — feature 31

**Verdict:** APPROVED

## Checkpoints

- C1: [x] (`.harness.json`, `harness.db`, filled-in docs all present; `./init.sh` exits 0 — re-verified via `pnpm run build` exit 0 below)
- C2: [x] (only feature 31 is `in_progress`; open session #56 reflects this exact work; `state/features/031-admin_years_cuaderno_timeline.md` updated_at matches the session's start)
- C3: [x] (only `src/app/features/admin/admin.component.ts` modified; respects standalone-component + OnPush + inline-styles conventions from `docs/conventions.md`; no new top-level folder; uses existing `shared/utils/date.util` helpers and existing `core/services/*` patterns; no `console.log`/TODO leftovers in the diff)
- C4: [x] (no test framework configured per `docs/conventions.md` "Tests" + `docs/verification.md`, so build is the standing-in unit-test substitute for now; `pnpm run build` re-run by reviewer → exit 0; the only Angular CSS-budget warning on `admin.component.ts` is the pre-existing >2.00 kB by 376 bytes (same magnitude as before this change per the git diff); visual smoke artifact `progress/visual_admin_years_timeline.png` opened in this review confirms the timeline renders with proportional segments + accent spine on the active row)
- C5: [x] (no stray untracked files in `src/`; the three untracked artifacts under `progress/` — `impl_31.md`, `visual_admin_years_timeline.png`, `visual_admin_years_timeline.json` — are the expected durable review record per `docs/conventions.md` "Smoke scripts")
- C6: N/A — feature is `sdd=0`

## Required Changes (if applicable)

None.

## Detailed checks

1. **`segmentBasis(q, y)`** — `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/admin/admin.component.ts:652-661`. Returns a string in every branch:
   - Lines 653 and 656: `'0%'` for missing year dates, null yDays/qDays, or non-positive day counts.
   - Line 660: `${pct}%` after clamping to `[0, 100]` (lines 658-659).
   - Template binding on line 253 (`[style.flex-basis]="segmentBasis(q, y)"`) is always a valid CSS string.

2. **`timelineHoy(y, segments)`** — same file:667-681. All four sub-conditions verified:
   - Line 668: `return null` when `y.startDate`/`y.endDate` is missing.
   - Line 670: `return null` when `yDays` is null or `<= 0`.
   - Line 672: `return null` when `today < y.startDate || today > y.endDate` (string compare on ISO date works correctly because `YYYY-MM-DD` ordering matches chronological).
   - Line 673-674: `return null` when no segment covers today (covers the acceptance criterion "no aparece si no cae dentro de ningún trimestre configurado").
   - Line 677-680: otherwise computes `(todayDay / yDays) * 100`, clamps `[0, 100]`, returns `${pct}%` — a string suitable for `[style.left]`.

3. **`timelineSegmentsFor(y)`** — same file:647-650. Returns `[]` when `y` lacks dates (line 648); otherwise filters to quarters with both start and end dates. Template `segments.length > 0` branch (line 248) gates the timeline track, `@else` branch (line 265) preserves the empty-state CTA.

4. **Empty-state branch preserved verbatim** — lines 265-272:
   ```html
   <div class="admin-row-quarters">
     <span class="period-chip-empty">
       Sin períodos configurados.
       <a class="period-chip-cta" (click)="openQuartersDialog(y)">Configurar trimestres</a>
     </span>
   </div>
   ```
   Exact copy of the original markup from the prior `@empty` branch. No semantic or class changes. CTA still wired to `openQuartersDialog(y)`.

5. **Spine color** — styles block lines 79-82:
   - `.admin-row { ... border-left: 4px solid var(--muted); ... }` (line 79)
   - `.admin-row.is-active { border-left-color: var(--accent); }` (line 82)
   Template line 238: `<div class="admin-row" [class.is-active]="y.isActive">` toggles the class. The screenshot confirms the accent (purple) bar on the left of the active row.

6. **Activate button still works** — line 280: `@if (!y.isActive) { <button mat-icon-button style="color:var(--accent)" title="Marcar como año activo" (click)="activateYear(y.id)"><mat-icon>check_circle</mat-icon></button> }`. `activateYear` method unchanged at line 855. No code path was removed or hidden by the spine change.

7. **`ChapterHeaderComponent` and `SealAvatarComponent` not modified** — `git diff HEAD -- src/app/shared/` returns empty. Both shared components reused as-is from feature 29's foundation.

8. **Other tabs not modified** — `git diff HEAD -- src/app/features/admin/admin.component.ts` only touches (a) the styles block (added `.timeline-*` / `.admin-row.is-active` / split `.admin-row` border into per-side; removed the now-dead `.quarter-chip-list`, `.period-chip`, `.period-chip-name`, `.period-chip-range`); (b) the `years` tab branch in the template (lines 237-285 region); (c) the imports (added `dateStringToDate, dateToDateString` from `shared/utils/date.util`); and (d) new helper methods on the component class (lines 632-681). The other tabs (institutions, courses, citation-reasons, users, permissions, roster) are byte-identical.

9. **No new dependency** — `git diff HEAD -- package.json pnpm-lock.yaml` returns empty.

10. **Build green** — `pnpm run build` exit 0, output written to `dist/frontend/`. Pre-existing CSS-budget warnings (admin.component.ts is 376 bytes over 2 kB; layout, login, calendar, etc. also flagged) are unchanged in magnitude — no new warnings, no new errors.

11. **Visual smoke PNG** — `progress/visual_admin_years_timeline.png` opened in this review. Confirmed:
    - Chapter-header eyebrow "CAPÍTULO III — CALENDARIO ACADÉMICO" + h1 "Años lectivos" + doble filete.
    - Accent (purple) spine on the left of the active row.
    - `<app-seal-avatar>` (calendar_today, double ring) replacing the bespoke 40x40 box.
    - Proportional timeline with T1, T2, T3 segments of different widths matching the 91/92/106-day distribution (~31/32/37%) — not equal thirds.
    - "Activo" badge + edit/delete/configure actions on the right.
    - JSON transcript confirms `hasAdminRowQuarters: true`, `hasOldPanel: false`, `chipCount: 0`, `activeYearText: "Año Lectivo 2026"` — old `.quarter-chip-list` / `.inline-quarters-summary` markup is gone.
    - Level 3 real-backend manual smoke is a documented gap (this session was mock-only per the implementer's `progress/impl_31.md`); the same screen was last Level-3 exercised for feature 40's API refinements. Not blocking for approval — the feature is purely UI and the visual smoke artifact is the actual test.

12. **No leftover `.quarter-chip-list` / `.period-chip-name` / `.period-chip-range` styles** — grep confirms only `.period-chip-empty` (line 144, 267) and `.period-chip-cta` (line 149, 152, 269) survive as selectors. The lone mention of `.quarter-chip-list` in the file (line 91) is inside the explanatory comment for the new `.timeline-track` styles block, not a selector.

13. **Nunito only, existing CSS vars only** — grep of `font-family` shows only `'Nunito', sans-serif` (lines 117, 136, 145). Grep of CSS vars in the new styles shows only `--paper`, `--paper-deep`, `--border-soft`, `--border`, `--accent-soft`, `--ink`, `--muted`, `--muted-strong`, `--accent`, `--accent-2` — all pre-existing in `src/styles.css`. No new hex color introduced (the new styles use `--ink` for the HOY marker line/label, which is reused, not added).

## Notes

- The two documented deviations from the brief in `progress/impl_31.md` are both sound:
  - Avatar swap to `<app-seal-avatar [size]="36">` matches features 30/33 and uses an existing shared component — listed by the brief as the "your call" option.
  - HOY gate combines year-range with at least one configured segment covering today — slightly stricter than "today inside year" alone, which makes the "no aparece si no cae dentro de ningún trimestre configurado" criterion literally correct in all four cases the spec cares about (no year, no quarters, quarters exist but don't cover today, today outside year).
---

# Review — feature 41

**Verdict:** APPROVED

## Checkpoints

- C1: [x] (`.harness.json`, `harness.db`, filled-in docs all present; `./init.sh` re-run by reviewer exits 0)
- C2: [x] (only feature 41 `in_progress`; open session #57 reflects exactly this diff — its log entry names both bugs, the `yearPct` unification, and the fixture change, matching the actual diff)
- C3: [x] (only `src/app/features/admin/admin.component.ts` and `scripts/visual-smoke.mjs` touched; standalone/OnPush/inline-styles conventions respected; no new top-level folder; reuses existing `shared/utils/date.util` helpers (`dateStringToDate`, `dateToDateString`) instead of inventing new date math; no `console.log`/TODO left in application source — the only `console.*` calls are pre-existing diagnostics inside the harness-owned `visual-smoke.mjs` script, not new app code)
- C4: [x] (no test framework configured, per `docs/conventions.md`; `pnpm run build` re-run by reviewer → exit 0, no new errors, no new warnings beyond the pre-existing per-component CSS-budget class; visual smoke JSON/PNG independently re-verified by the reviewer, see below — not taken on the implementer's word)
- C5: [x] (no stray untracked files in `src/`; the untracked files under `progress/` — `impl_41.md`, `visual_fix_admin_years_timeline_visibility_and_alignment.{png,json}` — are the expected durable smoke record per `docs/conventions.md` "Smoke scripts"; the pre-existing untracked `impl_31.md`/`visual_admin_years_timeline.{png,json}` predate this session, from feature 31's own uncommitted review)
- C6: N/A — feature is `sdd=0`

## Required Changes (if applicable)

None.

## Detailed verification (independent of the implementer's report)

1. **Bug 1 (clipping) is genuinely fixed, not cosmetic.** Diff moves `overflow: hidden` off `.timeline-track` onto a new inner `.timeline-segments` wrapper (`position: absolute; inset: 0; border-radius: inherit; overflow: hidden;`), and `.timeline-hoy`/`.timeline-hoy-label` are now template-siblings of that wrapper, not children (`admin.component.ts` template around the `@if (segments.length > 0)` branch). Re-ran `clippingAncestor()`'s own logic by hand against `progress/visual_fix_admin_years_timeline_visibility_and_alignment.json`: `timelineHoyLabelRect` (`top:277, bottom:292.5`) and `timelineHoyRect` (`top:293, bottom:331`) both fall **outside** `timelineTrackRect` (`top:298, bottom:326`) — i.e. they genuinely extend past the track's box, exactly as the CSS `top:-16px`/`top:-6px;bottom:-6px` intends — and `timelineHoyLabelClipping.clipped`/`timelineHoyClipping.clipped` are both `false` with `ancestorSelector: null`, meaning the walk-up-to-`<body>` check found no `overflow:hidden`/`clip` ancestor containing-but-cropping either element. Segments themselves (`timelineSegments[].rect`) are all fully inside `timelineTrackRect` (e.g. T3 right `1160.64 <= 1171`), confirming the inner wrapper still clips only segments to the track's rounded corners. Screenshot (`visual_fix_admin_years_timeline_visibility_and_alignment.png`) confirms visually: "HOY" pill fully legible above the bar, not cropped.

2. **Bug 2 (alignment) is genuinely fixed via one shared coordinate system, not two independent calcs that happen to agree in this one fixture.** Re-derived the expected pixel geometry from first principles (not from the implementer's numbers): using `dateStringToDate`/`daysBetween` exactly as coded, with the fixture's `y.startDate=2026-01-01`, `y.endDate=2026-12-20` (`yDays=353`), computed `yearPct` for T1/T2/T3 start/end and for `today=2026-09-08`, then converted to px using the actual `timelineTrackRect.width=661.9375` (border-box, Tailwind preflight confirmed active via `@tailwind base` in `src/styles.css`, so content width for the `inset:0` wrapper = `661.9375 - 2×1px border = 659.9375`) and `trackRect.left=509.0625 + 1px border`. Every computed value matched the recorded rects to within rounding:
   - T1: computed left `517.54px` / width `138.34px` vs. recorded `517.53125` / `138.34375`.
   - T2: computed left `704.48px` / width `314.06px` vs. recorded `704.484375` / `314.0625`.
   - T3: computed left `1020.43px` / width `140.20px` vs. recorded `1020.4375` / `140.203125`.
   - HOY: computed left `977.44px` vs. recorded `timelineHoyRect.left=977.4375`.
   This independently confirms `segmentLeft`/`segmentWidth`/`timelineHoy` all genuinely route through the same `yearPct(dateStr, y)` (admin.component.ts, private helper) — not a flex-packed segment calc alongside a separately-computed marker offset that happened to coincide in this fixture.
   - **Real gap rendered as real gap**: `timelineSegments[0].rect.right` (T1) `655.875` vs. `timelineSegments[1].rect.left` (T2) `704.484375` → `48.61px` visible empty track, matching the fixture's real 26-day recess (`2026-03-20` → `2026-04-15`). This is not zero, so the bug-2 fix is not a no-op relabeling of the old packed layout.
   - **HOY lands in the correct segment**: `timelineHoyRect.left = 977.4375` falls inside `[t2Segment.left=704.484375, t2Segment.right=1018.546875]` — confirmed both via the JSON's own `timelineHoyAlignment.hoyWithinT2: true` and independently via the from-scratch calc above.

3. **Fixture genuinely exercises both bugs**, confirmed by diff of `scripts/visual-smoke.mjs`: `MOCK_QUARTERS` now has T1 `2026-01-05→2026-03-20`, T2 `2026-04-15→2026-09-30` (a real 26-day gap before T2, not present in feature 31's contiguous T1/T2/T3-summing-to-100% fixture), and "today" (real system clock, `2026-09-08` in this environment) falls inside T2, not T1 — so both the gap-rendering and the marker-lands-in-the-right-segment assertions are non-trivial, not incidentally true regardless of the fix.

4. **Quarters are genuinely allowed to have gaps** — confirmed in `src/app/features/admin/quarters-dialog.component.ts`: validation only checks in-range (lines 232-254) and pairwise non-overlap via interval comparison (lines 260-265); no contiguity check anywhere in the file. So the fixture's gap is a legitimately reachable production state, not a fixture-only edge case.

5. **Feature 31's four original acceptance criteria remain intact**, re-read directly in the current file (not taken from the implementer's table):
   - Proportional segment widths: `segmentLeft`/`segmentWidth` still derive from real day counts (now via `yearPct`, same day-math, just with an added left-offset term) — `admin.component.ts`.
   - Empty-state CTA: template `@if (segments.length > 0) { ... } @else { <span class="period-chip-empty">Sin períodos configurados. <a class="period-chip-cta" (click)="openQuartersDialog(y)">Configurar trimestres</a></span> }` — byte-identical markup/classes to feature 31, `openQuartersDialog` wiring untouched. `grep` confirms no orphaned `.quarter-chip-list`/`.period-chip-name`/`.period-chip-range` selectors remain (only `.period-chip-empty`/`.period-chip-cta`, still used).
   - Lateral spine: `.admin-row { border-left: 4px solid var(--muted); ... }` + `.admin-row.is-active { border-left-color: var(--accent); }`, template `[class.is-active]="y.isActive"` — unchanged from feature 31's diff, feature 41 didn't touch this.
   - HOY suppression: `timelineHoy(y, segments)` still gates on `today` inside `[y.startDate, y.endDate]` **and** `segments.some(q => ... q.startDate <= today <= q.endDate)` before returning a pct — same gating logic as feature 31, only the position formula changed.

6. **No new CSS custom properties or hex colors** — the new `.timeline-*` rules reuse only pre-existing tokens (`--paper`, `--paper-deep`, `--border-soft`, `--ink`), all defined (light + dark variants) in `src/styles.css`.

7. **`pnpm run build`** re-run by the reviewer independently: exit `0`. Only pre-existing warnings (bundle budget, a few per-component CSS-budget overages including `admin.component.ts` at +425 bytes over 2.00 kB — same pre-existing category the implementer's report describes, not a new failure class).

8. **`./init.sh`** re-run by the reviewer: green, same two pre-existing `[WARN]` lines (no `verify_command` configured; Supabase env vars unset) as every other session in this project.
