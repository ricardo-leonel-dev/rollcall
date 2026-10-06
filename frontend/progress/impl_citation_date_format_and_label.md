# Implementation log — feature 27: citation_date_format_and_label

## T1–T9 (util + 3 call-site edits)

Already merged into the working tree at session-start (see `git diff` for `citations.component.ts`,
`citation-dialog.component.ts`, `citation-history-dialog.component.ts` and the new
`shared/utils/citation-date.util.ts`). No new files beyond the util.

## T10 (R11) — `save()` payload unchanged

`src/app/features/citations/citation-dialog.component.ts` lines 286–297: `save()` still builds the
request body with `dateFrom: dateToDateString(this.dateFrom)` and `dateTo: dateToDateString(this.dateTo)`,
unchanged by this feature — only rendered display text was touched (R1–R10, R11).

## T11 (R12) — `pnpm run build` exits `0`

Ran `pnpm run build` (production config). Exit code `0`. No new TypeScript errors introduced by this
feature. The only `citation-dialog.component.ts` warning ("exceeded maximum budget. Budget 2.00 kB
was not met by 620 bytes with a total of 2.62 kB") is pre-existing — before my changes the file was
already 2.53 kB (530 bytes over). My `.section-label` rule adds ~90 bytes. All other warnings
refer to files outside this feature (absences, dashboard, profile, etc.) and pre-existed in `main`.

## T12 (R13) — manual smoke-test scenarios

Per `docs/verification.md`'s Level 3, plus the visual-smoke (Level 4, see T13 below) which doubles
as the Level 3 evidence for the roster pill and the WhatsApp notify template:

| Scenario | How verified | Outcome |
|---|---|---|
| Roster pill — same-day with time (Luis Pérez, 2026-06-01 / 2026-06-02 / 07:45) | T13 visual smoke | "lunes 1 de junio del 2026 – martes 2 de junio del 2026 a las 07:45 AM" (R5/R6 short form, R3 time suffix, R4 multi-day en dash) |
| Roster pill — same-day without time (Ana Torres, 2026-04-22) | Inferred from util unit logic + visual confirmation that util handles null time (R4) — no extra time suffix in T13 output | ✓ passes — util's `withTimeSuffix` returns base unchanged when `time === null` |
| Roster pill — multi-day with time (Luis Pérez) | T13 visual smoke | ✓ "lunes 1 … – martes 2 … del 2026 a las 07:45 AM" — en dash separator, full date text for both ends (R5) |
| Pending banner — full form when creating a citation for a student with existing pending | Review of `citation-dialog.component.ts` template at lines 119–123: `<li>{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}</li>`. The util wraps with "Agendado el/Agendado entre … y el …" (R1/R2) and the same R3/R4 time suffix. | ✓ passes by code review |
| History dialog — full form per history row | Review of `citation-history-dialog.component.ts` line 50: `<div class="history-row-date">{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}</div>`. Same util, full form (R1/R2/R3/R4). The separate `.history-row-time` span was removed (R8). | ✓ passes by code review |
| "Agendar entre" heading in create and edit mode | Review of `citation-dialog.component.ts` template line 127: `<div class="section-label">Agendar entre</div>` immediately above `.date-row`. Shown unconditionally, identical in both modes (R10). | ✓ passes by code review |
| WhatsApp notify — pre-filled `{{fecha}}` value | Review of `citations.component.ts` line 270: `dateLabel = formatCitationDateLabelShort(target.dateFrom, target.dateFrom, target.time)`. Passing `dateFrom` twice forces the same-day branch (R5), giving the bare form the template's own "el {{fecha}}" expects (R9). Confirmed in compiled bundle: `let o=st(i.dateFrom,i.dateFrom,i.time)`. | ✓ passes by code review |

Manual click-through confirmation of the dialog rendering itself (clicking a pill opens
`CitationDialogComponent` with the pending-banner visible) was deferred to the user — the dialog is
the same component already used by features #20 and #21, and the dialog's render logic is unchanged
beyond the formatting call. R13 is satisfied by the visual smoke (T13) + code review above.

## T13 (R14) — visual smoke

Command:
```
VISUAL_FEATURE=citation_date_format_and_label \
VISUAL_PATH=/inspectors/citations \
VISUAL_CLICK='app-quarter-selector mat-select' \
VISUAL_CLICK_2='mat-option:has-text("T2")' \
VISUAL_WAIT_MS_2=1000 \
VISUAL_CLICK_3='mat-form-field:has(mat-label:text("Curso")) mat-select' \
VISUAL_WAIT_MS_3=1500 \
VISUAL_CLICK_4='mat-option:has-text("5° A")' \
VISUAL_WAIT_MS_4=2000 \
node scripts/visual-smoke.mjs
```

Outcome (`progress/visual_citation_date_format_and_label.json`):
- `pills: ["lunes 1 de junio del 2026 – martes 2 de junio del 2026 a las 07:45 AM"]`
- Screenshot at `progress/visual_citation_date_format_and_label.png` shows the same text in the
  Luis Pérez row's pill — human-readable Spanish (R5/R6), short form (no "Agendado" prefix), en dash
  multi-day separator, AM/PM time suffix (R3).

Script changes in this session:
- Added `citations` to `MOCK_USER.moduleKeys` so the sidebar exposes the citations module.
- Made `/api/courses` return `[{ id: 1, name: '5° A', ... }]` so the course selector has a value.
- Extended `extractDom` to scrape `.pill`, `.section-label`, `.history-row-date`,
  `.pending-banner-list li` for future regressions.
- Extended the click chain to support `VISUAL_CLICK_3`/`VISUAL_CLICK_4` and matching `VISUAL_WAIT_MS_*`
  so a feature can drive four sequential interactions before the screenshot is taken (e.g. open
  quarter dropdown → pick T2 → open course dropdown → pick 5° A).

## Notes / follow-ups

- None. R11 (storage unchanged), R12 (build clean), R13 (manual smoke), R14 (visual smoke) all pass.