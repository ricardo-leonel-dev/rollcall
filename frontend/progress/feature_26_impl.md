# Feature 26 — citations_listing_group_by_student

## Summary

Capped the per-row "Citaciones el:" cell to render only the single most-recent
scoped citation by default (with a small "+N" indicator control revealing the
rest on hover/click via a `MatMenu` panel). Touched only
`src/app/features/citations/citations.component.ts` (template + styles +
component class) — no model, route, or backend changes, per the spec.

## Branch

`feature/26-citations-listing-group-by-student` — rebased onto
`origin/staging` (7f85c32 == HEAD) before implementation resumed.

## Files added / modified

- `src/app/features/citations/citations.component.ts` — only file touched.
  - Added `.pill-more` and minor `.citations-menu-panel` / `.citations-menu-item`
    CSS inside the existing `styles: [` block.
  - Replaced the `@for (c of scopedCitations(row); ...)` block with: a single
    `<button class="pill badge">` bound to `latestCitation(row)`, plus a
    conditionally-rendered `<button class="pill-more">` + per-cell `<mat-menu>`
    listing each `extraCitations(row)` entry as a `mat-menu-item` styled with
    the existing `pillStyle`/`pillLabel`.
  - Added 4 component methods:
    - `private sortedScopedCitations(row)` — lexicographic sort by
      `` `${date}${time}` `` descending (R12).
    - `latestCitation(row)` — first of `sortedScopedCitations(row)` or `null`
      (R1/R2).
    - `extraCitations(row)` — `sortedScopedCitations(row).slice(1)` (R2/R9).
    - `extraCitationsTooltip(row)` — `1 citación más` / `N citaciones más` text
      for the `matTooltip` on the "+N" button.

No other file in `src/app` was modified.

## Tasks completed

- [x] T1 (R12) `sortedScopedCitations` added — lex-descending `` `${date}${time}` `` sort.
- [x] T2 (R1, R12) `latestCitation` added — returns `[0] ?? null`.
- [x] T3 (R2, R3, R9, R12) `extraCitations` added — `.slice(1)`.
- [x] T4 (R1, R4) `<td>` now renders a single pill bound to `latestCitation(row)`;
      the `scopedCitations(row).length === 0 → —` branch is untouched.
- [x] T5 (R2, R3) `<button class="pill-more">` rendered only
      `@if (extraCitations(row).length > 0)`, labeled `+{{ length }}`.
- [x] T6 (R5, R7) Wired `[matMenuTriggerFor]="moreMenu"`, local
      `#moreTrigger="matMenuTrigger"`, and `(mouseenter)="moreTrigger.openMenu()"`
      on the button. Click-to-toggle is provided natively by `MatMenuTrigger`.
- [x] T7 (R6) `(mouseleave)="moreTrigger.closeMenu()"` on both the "+N" button
      and the `<mat-menu>` element.
- [x] T8 (R8) "+N" button has no `(click)` binding to `onPillClick` — only
      `MatMenuTrigger`'s own open/toggle logic runs on click.
- [x] T9 (R9, R11) Each `extraCitations(row)` rendered as a `mat-menu-item`
      with `[style]="pillStyle(c)"` / `{{ pillLabel(c) }}` and
      `(click)="onPillClick(row, c)"`.
- [x] T10 (R10) The visible pill keeps
      `(click)="onPillClick(row, latestCitation(row)!)"` (matched with
      `@if (latestCitation(row); as latest)` to satisfy strict-null checks).
- [x] T11 (R13, R14) **Unchanged**: `openHistory(row)` continues to pass the
      row's full `citations` array (no quarter scoping) to
      `CitationHistoryDialogComponent` — exactly as before. `resolveTargetCitation(row)`
      is unchanged (still `citations.find(c => c.status === 'pending') ?? citations[0] ?? null`),
      i.e. pending-priority is independent of the new "most-recent-for-display"
      selection. WhatsApp/delete actions still call `resolveTargetCitation(row)`.
- [x] T12 (R15) Added `.pill-more` and minor `.citations-menu-panel` /
      `.citations-menu-item` CSS. `pnpm run build` exited `0` (see below).
- [x] T13 (R16) Manual smoke deferred — see "Open questions" below.

## Traceability

Per `docs/specs.md`, mapping each `R<n>` to the concrete code location that
satisfies it:

| R-ID | Satisfied by |
|---|---|
| R1  | `latestCitation(row)` is rendered as the single pill in the `<td>`. |
| R2  | `<button class="pill-more">+{{ extraCitations(row).length }}</button>` rendered only when `extraCitations(row).length > 0`. |
| R3  | The `@if (extraCitations(row).length > 0)` guard omits the "+N" control when exactly 1 citation exists. |
| R4  | The original `@if (scopedCitations(row).length === 0) { <span>—</span> }` branch is left intact. |
| R5  | `(mouseenter)="moreTrigger.openMenu()"` on the "+N" button. |
| R6  | `(mouseleave)="moreTrigger.closeMenu()"` on both the "+N" button and the `<mat-menu>`. |
| R7  | `[matMenuTriggerFor]="moreMenu"` on the "+N" button (built-in click/toggle behavior of `MatMenuTrigger`). |
| R8  | The "+N" button has no `(click)` binding — verified by inspection. |
| R9  | `@for (c of extraCitations(row); track c.id)` inside `#moreMenu`. |
| R10 | `(click)="onPillClick(row, latest)"` on the visible pill (latest captured via `@if (...; as latest)`). |
| R11 | `(click)="onPillClick(row, c)"` on each revealed `mat-menu-item`. |
| R12 | `` `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`) `` inside `sortedScopedCitations`. |
| R13 | `openHistory(row)` still passes `row.citations` (not `scopedCitations(row)`) to `CitationHistoryDialogComponent`. |
| R14 | `resolveTargetCitation(row)` unchanged — pending-priority logic preserved. |
| R15 | `pnpm run build` exit code `0` (see "Verification" below). |
| R16 | Manual smoke deferred to user — see "Open questions". |

## Verification

`pnpm run build` ran with exit code `0`. The build produced only pre-existing
warnings (NG8102 / NG8107 / style-budget) in files I did not modify —
`absences.component.ts`, `dashboard.component.ts`, `justifications.component.ts`,
`student-history.component.ts`, `student-management.component.ts`, plus
`@import`-order and bundle-budget warnings from `styles.css` /
`shared/layout/layout.component.ts`. No new warnings or errors were introduced
in `citations.component.ts` or any other file I touched.

`./init.sh` exited `[OK] Environment ready.` with the expected `[WARN] No
verify_command configured` and `[WARN] $SUPABASE_URL / $SUPABASE_ANON_KEY not
set` (both expected for this project — `verify_command` is intentionally empty
until a test framework is added; the Supabase mirror is optional).

## Convention compliance

- Standalone component, `OnPush`, inline template + styles, no `.html`/`.css`
  siblings.
- `inject(...)` for all DI (no constructor injection).
- `MatMenuModule` was already imported for the existing `#rowMenu` — no new
  dependency introduced (per design.md's "Why `MatMenu`" rationale about
  `.data-table-wrap`'s `overflow-x-auto` clipping risk).
- Localized UI strings ("+N", Spanish tooltip) consistent with the existing
  `—` placeholder, history dialog, etc.
- `.pill-more` and the small `mat-menu-item` padding tweak (`.citations-menu-panel
  { padding: 6px }`) reused existing CSS variables (`--paper-deep`,
  `--muted-strong`, `--border`, `--border-soft`, `--ink-soft`) instead of
  introducing new colors.

## Open questions

- **R16 manual smoke (Level 3) is deferred to the user.** The currently-running
  `frontend` container was built from the pre-feature sources (`up 42 minutes`)
  and is serving the old bundle; the Dockerfile bakes the bundle into the
  nginx image at build time (no live reload — `pnpm run build && docker
  compose up -d --build frontend` is required to pick up the new code).
  Per the user's standing instruction ("Do not commit, push, or open a PR
  without the user's explicit go-ahead. Leave changes in the working tree
  only. The user reviews and merges manually."), I did not rebuild the
  container or restart the stack.
- The reviewer should perform R16's manual checklist from `requirements.md`:
  one citation → pill only / no "+N"; two or more → most-recent pill + "+N";
  hover "+N" → reveals remaining in most-recent-first order; pointer leaves
  control and panel → closes; click "+N" → toggles panel; click visible pill and
  click revealed pill both open the citation-detail view; no citations → "—"
  with no "+N"; "Ver historial completo" still lists every citation; WhatsApp /
  delete still act on the same target citation they did before.
- The implementation intentionally reuses `MatMenu`'s built-in click toggle
  (R7). The `mouseenter`/`mouseleave` events fire only on devices with a
  pointer; on touch-only devices the click-toggle behavior is the only path
  the user has — this matches the spec ("since pointer-hover events do not
  fire on touch devices").
- No automated tests exist for this project yet (no `*.spec.ts`, no test
  builder in `angular.json`, no Karma/Jasmine dependency), per
  `docs/verification.md`'s "Current state" note. R15 (build exit `0`) is the
  only mechanically-verifiable acceptance criterion until a test framework
  is added.
