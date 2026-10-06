# Tasks — Cap citations-per-student pills, reveal the rest on hover/tap

All work is confined to `src/app/features/citations/citations.component.ts`.

- [ ] T1 (R12) Add a private `sortedScopedCitations(row: CitationRosterRow): Citation[]` method to
  `CitationsComponent` that returns `scopedCitations(row)` sorted by `` `${date}${time}` `` string, descending
  (lexicographic compare).
- [ ] T2 (R1, R12) Add `latestCitation(row: CitationRosterRow): Citation | null`, returning
  `sortedScopedCitations(row)[0] ?? null`.
- [ ] T3 (R2, R3, R9, R12) Add `extraCitations(row: CitationRosterRow): Citation[]`, returning
  `sortedScopedCitations(row).slice(1)`.
- [ ] T4 (R1, R4) In the "Citaciones el:" `<td>`, replace the current `@for` over `scopedCitations(row)` with a
  single pill bound to `latestCitation(row)` (reusing `pillStyle`/`pillLabel`), leaving the existing
  `scopedCitations(row).length === 0` → `—` branch untouched.
- [ ] T5 (R2, R3) Add the "+N" indicator `<button class="pill pill-more">`, rendered only
  `@if (extraCitations(row).length > 0)`, labeled `+{{extraCitations(row).length}}`.
- [ ] T6 (R5, R7) Wire the "+N" button to a new per-cell `mat-menu` (`#moreMenu="matMenu"`) via
  `[matMenuTriggerFor]="moreMenu"` and a local `#moreTrigger="matMenuTrigger"` reference; add
  `(mouseenter)="moreTrigger.openMenu()"` on the button so hover opens it in addition to `MatMenuTrigger`'s
  built-in click-to-open/toggle (which alone covers R7).
- [ ] T7 (R6) Add `(mouseleave)="moreTrigger.closeMenu()"` on both the "+N" button and the `<mat-menu>` element so
  the panel closes once the pointer leaves both the control and the opened panel.
- [ ] T8 (R8) Confirm the "+N" button carries no `(click)` binding to `onPillClick` (or any other citation-detail
  handler) — only `MatMenuTrigger`'s own open/toggle logic runs on click.
- [ ] T9 (R9, R11) Inside `#moreMenu`, render each of `extraCitations(row)` as a `mat-menu-item` styled with the
  existing `pillStyle`/`pillLabel`, each bound to `(click)="onPillClick(row, c)"`.
- [ ] T10 (R10) Confirm the visible pill from T4 keeps `(click)="onPillClick(row, latestCitation(row)!)"`, matching
  this component's per-pill click behavior from before this feature.
- [ ] T11 (R13, R14) Inspect (no code change expected) that `openHistory()` / `CitationHistoryDialogComponent` and
  `resolveTargetCitation()` (used by the WhatsApp/delete actions) are unmodified by this feature's edits; record
  this confirmation in `progress/impl_citations_listing_group_by_student.md`.
- [ ] T12 (R15) Add the `.pill-more` CSS class (and any minor `mat-menu-item`/`.pills-cell` spacing tweak needed for
  the revealed pills to read well) per the `frontend-design` skill, then run `pnpm run build` and confirm it exits
  `0`.
- [ ] T13 (R16) Manually verify against the running stack (`docker compose up -d --build frontend`) per the
  checklist in requirements.md's R16, and record the results in
  `progress/impl_citations_listing_group_by_student.md`.
