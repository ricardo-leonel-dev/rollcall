# Design — Cap citations-per-student pills, reveal the rest on hover/tap

## Baseline (as currently merged/deployed in staging)

This design starts from `CitationsComponent` exactly as it exists today (features #20/#21/#24/#25/#27/#28 already
merged and deployed) — single `date`/`time` fields per `Citation` (feature #28 replaced the earlier `dateFrom`/
`dateTo` pair), the readable overlap-conflict message (#25), and the current date-label formatting (#27) are all
already-shipped, stable ground truth, not open variants to re-derive. This feature is a small, additive change on
top of that baseline: it touches only the "Citaciones el:" cell's rendering inside
`src/app/features/citations/citations.component.ts` (template, `styles`, and a few new component methods) — no
model, route, or backend contract changes.

Relevant existing pieces this design builds on directly, unchanged:
- `scopedCitations(row): Citation[]` — already computes the quarter-scoped citation list per row; this feature
  only changes how that list is *rendered*, not how it's computed.
- `pillStyle(c)` / `pillLabel(c)` — already provide the pending/closed inline style and the
  `formatCitationDateLabelShort` label; reused as-is for every pill this feature renders (visible and revealed).
- `onPillClick(row, c)` — already opens `CitationDialogComponent` for a specific citation; reused as-is as the
  citation-detail handler for both the visible pill (R10) and every revealed pill (R11). No new dialog is
  introduced.
- `resolveTargetCitation(row)` / `openHistory(row)` — untouched (R13, R14); this feature's "most recent" selection
  for *display* is a separate concern from the pending-priority "target" selection used by WhatsApp/delete.

## Approach: reuse `MatMenu`/`MatMenuTrigger` as the reveal panel

`MatMenuModule` is already imported in this component (used today for the row's "more actions" `#rowMenu`). This
feature adds a second, per-row `mat-menu` — anchored to the "+N" control — and wires it to open on **hover** (via
`(mouseenter)` calling `MatMenuTrigger.openMenu()`) in addition to the click-to-open/toggle behavior `MatMenuTrigger`
already provides natively, so the same control satisfies both R5 (hover) and R7 (click/touch fallback):

```html
<div class="pills-cell">
  <button class="pill badge" [style]="pillStyle(latestCitation(row)!)" (click)="onPillClick(row, latestCitation(row)!)">
    {{ pillLabel(latestCitation(row)!) }}
  </button>
  @if (extraCitations(row).length > 0) {
    <button class="pill pill-more"
            [matMenuTriggerFor]="moreMenu"
            #moreTrigger="matMenuTrigger"
            (mouseenter)="moreTrigger.openMenu()"
            (mouseleave)="moreTrigger.closeMenu()">
      +{{ extraCitations(row).length }}
    </button>
    <mat-menu #moreMenu="matMenu" (mouseleave)="moreTrigger.closeMenu()">
      @for (c of extraCitations(row); track c.id) {
        <button mat-menu-item (click)="onPillClick(row, c)">
          <span class="badge" [style]="pillStyle(c)">{{ pillLabel(c) }}</span>
        </button>
      }
    </mat-menu>
  }
</div>
```

New component methods (private ordering helper + two row-scoped derivations, all pure functions of the existing
`scopedCitations(row)`):

```ts
private sortedScopedCitations(row: CitationRosterRow): Citation[] {
  return [...this.scopedCitations(row)].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
}

latestCitation(row: CitationRosterRow): Citation | null {
  return this.sortedScopedCitations(row)[0] ?? null;
}

extraCitations(row: CitationRosterRow): Citation[] {
  return this.sortedScopedCitations(row).slice(1);
}
```

`date` is `YYYY-MM-DD` and `time` is the native `<input type="time">` value (`HH:MM`, 24-hour, zero-padded — see
`citation-dialog.component.ts`'s `time` field), so string-concatenation + lexicographic compare (R12) is a correct
and dependency-free way to sort without touching `date.util.ts`.

## Why `MatMenu` instead of a hand-rolled overlay/dropdown

`.data-table-wrap` (used by every list page's table, including this one) is styled `overflow-x-auto` (Tailwind
utility, `src/styles.css`). Per CSS overflow semantics, setting `overflow-x` to a non-`visible` value while
`overflow-y` stays at its `visible` initial value forces the browser to compute `overflow-y` as `auto` too — so a
plain `position: absolute` popover nested inside a table cell would risk being clipped or forced into its own
scroll region by the ancestor `.data-table-wrap`, not just visually overlapping neighboring rows. `MatMenu`
renders its panel through Angular CDK's overlay container (a top-level DOM node outside `.data-table-wrap`'s
layout box entirely), so this clipping risk doesn't apply, and viewport-edge flipping, focus trapping, and
`Escape`-to-close come for free from the already-imported `@angular/material/menu` (backed by `@angular/cdk`,
already a direct `package.json` dependency — see `docs/architecture.md` principle 2, "adding a new runtime
dependency is a deliberate choice": no new dependency is added here).

## Styling note

Per `docs/conventions.md` / `docs/architecture.md`'s "Design Workflow", any edit to this component's
`template:`/`styles:` block (adding the `.pill-more` class, and any small `mat-menu-item` padding tweak so the
revealed pills read well inside the menu) requires the `frontend-design` skill — this is not optional polish, it
applies to this small a restyle exactly as it would to a new screen.

## Discarded alternatives

1. **Hand-rolled `position: absolute` popover (plain CSS, no CDK/`MatMenu`).** Rejected: as explained above,
   `.data-table-wrap`'s `overflow-x-auto` risks clipping a nested absolutely-positioned panel, and this approach
   would require reimplementing viewport-edge flipping and outside-click/keyboard dismissal that `MatMenu` already
   provides — reinventing infrastructure this codebase already has, for no behavioral benefit.
2. **Route revealed/latest pill clicks to "Ver historial completo" (`CitationHistoryDialogComponent`) instead of
   `onPillClick`.** The feature card allows this as an "acceptable destination," but it is rejected here because
   the existing `onPillClick` → `CitationDialogComponent` flow (shipped in #20/#21) lets the user act on a specific
   citation (edit it) directly from the pill; `CitationHistoryDialogComponent` is read-only and unscoped by quarter.
   Switching the click target would silently regress an already-shipped capability for every pill, not just the
   newly-revealed ones, to satisfy a feature that is only about *how many* pills show by default.
3. **Show the top 2-3 pills inline plus "+N more" instead of exactly one.** Rejected because the feature card's
   acceptance criteria are explicit: "By default only the most recent citation per student is shown" — not "top
   N" — and showing more than one by default reintroduces the same wrapping-pill-list visual noise this feature
   exists to fix, just with a smaller N.
4. **Recompute `resolveTargetCitation` to always match `latestCitation`, so WhatsApp/delete always act on the
   visibly-shown pill.** Rejected: out of scope for this feature (R14) and a behavior change to an already-shipped,
   independently-specified action (pending-priority target resolution, from `citations_listing_page`); conflating
   "most recent for display" with "target for actions" was not requested and would need its own review.
