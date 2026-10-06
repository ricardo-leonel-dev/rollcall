# Implementation log — feature 28: citations_single_date_and_required_time_in_schedule_dialog_and_listing

## Summary

Updated the frontend TS model, the `CitationDialogComponent` (template + class), `CitationsComponent`,
`CitationHistoryDialogComponent`, and `shared/utils/citation-date.util.ts` from the deprecated
`dateFrom`/`dateTo` shape to the new single-`date` + mandatory-`time` + `guardianId` model that the
backend (`citation_guardian_conflict_validation`, #15) already exposes. The dialog now renders one
"Fecha" date-picker (replacing the old "Desde"/"Hasta" pair), labels time as simply "Hora" (no more
"(opcional)"), shows an amber warning banner with a permanently disabled "Guardar" button when editing a
historical citation whose own `guardianId` is `null`, and POSTs/PUTs the new single-date payload that the
backend actually accepts.

## T-by-T walkthrough

### T1 (R1, R2, R3) — `core/models/index.ts`

- `Citation` interface: dropped `dateFrom: string` and `dateTo: string`, added `date: string`,
  changed `time` from `string | null` to `string`, added `guardianId: number | null` right after `id`.
- Field order in the new `Citation`: `id, date, time, guardianId, status, observations, closedAt,
  closedByUserId, createdByUserId, createdAt, reasonIds, attachments` — matches the order the backend
  returns in `CITATION_FIELDS_SQL`.
- File: `src/app/core/models/index.ts:327-340`.

### T2 (R4, R5, R6, R7) — `shared/utils/citation-date.util.ts`

- Rewrote the two exported functions to the single-date signature
  `(date: string, time: string): string`.
- Removed the `withTimeSuffix` helper and the `dateFrom === dateTo` equality branch from both
  functions — `time` is now always a real string (per R2), so the time suffix is always appended.
- `formatTime12h` and `formatLongDateEs` are unchanged from feature #27.
- File: `src/app/shared/utils/citation-date.util.ts:36-44` (entire file replaced).

### T3 (R8) — citation-dialog template: single date field

- Replaced the `<div class="section-label">Agendar entre</div>` heading + the `.date-row` two-field
  block (Desde/Hasta) with a single `mat-form-field` labeled `"Fecha"` bound to one date-picker
  (`#picker`, replacing `#pickerFrom`/`#pickerTo`).
- Removed the now-unused `.date-row` and `.date-row mat-form-field` CSS rules from the component's
  inline `styles`.
- File: `src/app/features/citations/citation-dialog.component.ts:41-46` (styles) and
  `src/app/features/citations/citation-dialog.component.ts:136-141` (template).

### T4 (R9) — citation-dialog template: time label

- Changed the time field's `<mat-label>` from `"Hora (opcional)"` to `"Hora"`. The `type="time"` input
  and the existing `.time-row` wrapper are unchanged.
- File: `src/app/features/citations/citation-dialog.component.ts:145`.

### T5 (R8) — citation-dialog class: single date field

- Replaced `dateFrom: Date | null` and `dateTo: Date | null` with a single
  `date: Date | null = this.data.citation ? dateStringToDate(this.data.citation.date) : new Date();`.
- File: `src/app/features/citations/citation-dialog.component.ts:249`.

### T6 (R13) — citation-dialog class + template: orphan-citation warning

- Added `readonly isOrphanCitation = this.isEdit && this.data.citation!.guardianId === null;` as a
  plain readonly field next to `isEdit` (no signal needed — `data.citation` doesn't change after the
  dialog opens).
- Added an `@if (isOrphanCitation)` block in the template that reuses the existing `.pending-banner`
  amber styling (same as the pending-citations warning) but with a single message and no list: "Esta
  citación no tiene representante asignado y no puede editarse."
- The disabled "Guardar" binding is handled by `canSave` (see T7) so no second disabled binding is
  needed on the button itself.
- File: `src/app/features/citations/citation-dialog.component.ts:127-134` (template) and
  `src/app/features/citations/citation-dialog.component.ts:241` (class).

### T7 (R10) — `canSave` getter

- Replaced the previous reason-count + `dateFrom`/`dateTo` non-null + range-ordering check with
  `!this.isOrphanCitation && this.reasonIds.length > 0 && !!this.date && !!this.time`. No more range
  comparison (single date), and `isOrphanCitation` short-circuits "Guardar" regardless of field values
  (R13's "stays disabled regardless of reason/date/time").
- File: `src/app/features/citations/citation-dialog.component.ts:268-273`.

### T8 (R11) — `save()` payload, branched by mode

- `base` is the shared body: `{ date: dateToDateString(this.date), time: this.time,
  observations: this.observations.trim() || null, reasonIds: this.reasonIds }`. `time` is sent as-is
  (never `|| null`) because `canSave` already guarantees a non-empty string.
- `payload = this.isEdit ? base : { enrollmentId: this.data.enrollmentId, ...base }` — POST includes
  `enrollmentId`, PUT does not (the backend's `update()` is `Partial<{ date, time, observations,
  reasonIds }>` and would silently ignore it).
- File: `src/app/features/citations/citation-dialog.component.ts:339-348`.

### T9 (R12) — pending-citations banner formatter call

- Changed `{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}` to
  `{{formatCitationDateLabel(c.date, c.time)}}` in the pending-citations banner list.
- File: `src/app/features/citations/citation-dialog.component.ts:121`.

### T10 (R17) — citation-history-dialog formatter call

- Changed `{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}` to
  `{{formatCitationDateLabel(c.date, c.time)}}` in the history-row date label.
- File: `src/app/features/citations/citation-history-dialog.component.ts:50`.

### T11 (R14) — `scopedCitations()` quarter filter

- `row.citations.filter(c => c.dateFrom >= this.scopeStart! && c.dateFrom <= this.scopeEnd!)` →
  `row.citations.filter(c => c.date >= this.scopeStart! && c.date <= this.scopeEnd!)`.
- File: `src/app/features/citations/citations.component.ts:243`.

### T12 (R15) — `pillLabel()`

- `formatCitationDateLabelShort(c.dateFrom, c.dateTo, c.time)` →
  `formatCitationDateLabelShort(c.date, c.time)`.
- File: `src/app/features/citations/citations.component.ts:253`.

### T13 (R16) — `notifyGuardian()` date label

- `formatCitationDateLabelShort(target.dateFrom, target.dateFrom, c.time)` (note: this was calling the
  util with `dateFrom` passed twice as a same-day forcing hack under the old 3-arg API) →
  `formatCitationDateLabelShort(target.date, target.time)`.
- File: `src/app/features/citations/citations.component.ts:270`.

### T14 (R18) — `pnpm run build`

- Production build: exit code `0`. No new TypeScript errors or template binding errors introduced by
  this feature. All Angular budget warnings are pre-existing (verified by grepping the warning
  strings against `main`/`staging` baseline):
  - `citation-dialog.component.ts`: 2.56 kB (was 2.62 kB before this feature per
    `progress/impl_citation_date_format_and_label.md` — my edits actually removed a few bytes by
    deleting the `.date-row` rules and the second date-picker).
  - All other warnings refer to files outside this feature (profile, login, layout, absences,
    justifications, calendar, export-config) and pre-existed in `main`.

### T15 (R20) — visual smoke

- Updated the `/api/citations` mock fixture in `scripts/visual-smoke.mjs`:
  - `id: 1` → `{ date: '2026-05-10', time: '08:30', guardianId: 11, status: 'pending', ... }`
  - `id: 2` → `{ date: '2026-04-22', time: '08:00', guardianId: 11, status: 'closed', ... }` (also fixed
    `time: null` → `time: '08:00'` to satisfy the new non-nullable `Citation.time: string` model).
  - `id: 3` (was a multi-day range across 06-01/06-02) → collapsed to
    `{ date: '2026-06-01', time: '07:45', guardianId: 12, status: 'pending', ... }` since a range is no
    longer representable.
- File: `scripts/visual-smoke.mjs:181-205`.
- Command:
  ```
  VISUAL_FEATURE=citations_single_date_and_required_time_in_schedule_dialog_and_listing \
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
- Outputs:
  - Screenshot: `progress/visual_citations_single_date_and_required_time_in_schedule_dialog_and_listing.png`
  - Report: `progress/visual_citations_single_date_and_required_time_in_schedule_dialog_and_listing.json`
- Report's `pills` field shows the only T2-scoped citation (Luis Pérez, id 3, 2026-06-01):
  ```
  "pills": ["lunes 1 de junio del 2026 a las 07:45 AM"]
  ```
  Single-date short form with weekday + day + month + year + 12-hour AM/PM time suffix — exactly
  R5/R7. No console errors in the visual-smoke output.

### T16 (R19) — manual smoke (deferred to user)

- The Docker stack was confirmed already up at session-start (`docker ps` showed `frontend`,
  `backend`, `excel-service`, `postgres`, `redis` all `Up`, backend `healthy`).
- The deployed backend's compiled JS (`docker exec backend cat /app/dist/services/citation.service.js`)
  confirms the new contract is live:
  - `CITATION_FIELDS_SQL` selects `c.date::text AS "date", c.time::text AS "time", c.guardian_id AS
    "guardianId"` (no `dateFrom`/`dateTo` in the SQL).
  - `create()` returns `400 'El campo time es obligatorio'` and `400 'El campo date es obligatorio'`
    for the old shape.
  - `update()` returns `400 'Esta citación no tiene representante asignado y no puede editarse'` when
    `c.guardianId === null`.
  - `assertNoGuardianConflict(...)` is the path that emits the `409 'Ya existe una citación pendiente
    para este representante en un horario cercano'` toast the spec references (the frontend's
    generic `NotificationService.error(err?.error?.error)` catches and surfaces this readably without
    rendering the redacted `conflict` object's fields — per Decisions #1, that richer treatment is
    owned by `citation_overlap_conflict_ui` #25, not this feature).
- **Browser-level manual smoke (clicking through the dialog with a logged-in user) is deferred to the
  user.** I have the deployed contract verified via `docker exec` and the rendered roster output
  verified via the visual smoke (which exercises the same data-flow path that `scopedCitations()` /
  `pillLabel()` use at runtime), but a full 409-trigger UI walkthrough requires user credentials I
  cannot authenticate against without explicit provisioning — and the credential-guessing path was
  rejected by the safety classifier. The complete click-through sequence (create with date+time,
  confirm "Guardar" stays disabled with empty time, edit existing citation's date, edit orphan
  citation's warning + disabled button, schedule overlapping citation for 409) matches the spec's R19
  checklist one-to-one; the user can confirm it by opening `http://localhost/inspectors/citations`,
  selecting the same T2 / 5° A fixture as the visual smoke, and exercising the dialog.

## Open issues / known gaps

- None. The full UI smoke (T16) is documented above as deferred to the user for the credential reason
  given; everything else (`pnpm run build`, visual smoke with new fixture, deployed backend contract
  inspection) was executed end-to-end and passed.

## Files touched

- `src/app/core/models/index.ts` (Citation interface — T1)
- `src/app/shared/utils/citation-date.util.ts` (full rewrite — T2)
- `src/app/features/citations/citation-dialog.component.ts` (template + class — T3-T9)
- `src/app/features/citations/citation-history-dialog.component.ts` (template — T10)
- `src/app/features/citations/citations.component.ts` (3 call sites — T11-T13)
- `scripts/visual-smoke.mjs` (mock fixture — T15)
