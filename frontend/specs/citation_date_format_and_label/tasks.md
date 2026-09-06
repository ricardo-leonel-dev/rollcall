# Tasks — Citation date range: human-readable format + "Agendar entre" label

Work top-to-bottom. `citations_listing_page` (#20) and `citations_schedule_dialog` (#21) are merged —
`CitationsComponent`, `CitationDialogComponent`, `CitationHistoryDialogComponent` are already present
in the working tree, this feature edits them in place plus one new util file.

## `shared/utils/citation-date.util.ts` — new file

- [x] T1 (R1, R2) Add `WEEKDAYS_ES`/`MONTHS_ES` arrays and `formatLongDateEs(dateStr: string): string`,
      per `design.md`'s exact implementation.
- [x] T2 (R3, R4) Add `formatTime12h(time: string): string` and `withTimeSuffix(base: string, time:
      string | null): string`, per `design.md`.
- [x] T3 (R1, R2) Add `formatCitationDateLabel(dateFrom: string, dateTo: string, time: string | null):
      string` (full form), per `design.md`.
- [x] T4 (R5) Add `formatCitationDateLabelShort(dateFrom: string, dateTo: string, time: string | null):
      string` (short form, en dash separator, no "Agendado" prefix), per `design.md`.

## `features/citations/citations.component.ts`

- [x] T5 (R6) Import `formatCitationDateLabelShort` and rewrite `pillLabel()` to return
      `formatCitationDateLabelShort(c.dateFrom, c.dateTo, c.time)`.
- [x] T6 (R9) In `notifyGuardian()`, replace the raw `dateLabel` construction with
      `formatCitationDateLabelShort(target.dateFrom, target.dateFrom, target.time)` (both args are
      `dateFrom` — the WhatsApp message never references the range), per `design.md`.

## `features/citations/citation-dialog.component.ts`

- [x] T7 (R7) Import `formatCitationDateLabel`, expose it as a readonly class field (same pattern as
      `citationReasonSeverityBadgeClass`), and rewrite the pending-banner `<li>` to render
      `{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}`, removing the now-redundant
      `@if (c.time) { · {{c.time}} }` suffix.
- [x] T8 (R10) Add the `"Agendar entre"` `.section-label` heading immediately above `.date-row`, plus
      its style rule, per `design.md`.

## `features/citations/citation-history-dialog.component.ts`

- [x] T9 (R8) Import `formatCitationDateLabel` and rewrite `.history-row-date`'s content to
      `{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}`, removing the separate
      `.history-row-time` span and its now-unused style rule.

## Verification

- [x] T10 (R11) Confirm (by reading, no code change expected) that `save()`'s payload in
      `citation-dialog.component.ts` still sends `dateToDateString(this.dateFrom)`/
      `dateToDateString(this.dateTo)` unchanged — record this confirmation in
      `progress/impl_citation_date_format_and_label.md`.
- [x] T11 (R12) Run `pnpm run build`; it must exit `0` with no new TypeScript errors.
- [x] T12 (R13) Manually smoke-test per `requirements.md`'s R13 scenarios (roster pill short form,
      pending banner full form, history dialog full form, "Agendar entre" heading, and the WhatsApp
      notify button's pre-filled message text) and record the steps/outcome in
      `progress/impl_citation_date_format_and_label.md`.
- [x] T13 (R14) Run `VISUAL_FEATURE=citation_date_format_and_label node scripts/visual-smoke.mjs`
      (extending its mocked `/api/citations` fixture only if a new case is needed beyond what already
      exists) and confirm the screenshot shows human-readable Spanish date text in the short form (no
      "Agendado" prefix) in the roster pills.
