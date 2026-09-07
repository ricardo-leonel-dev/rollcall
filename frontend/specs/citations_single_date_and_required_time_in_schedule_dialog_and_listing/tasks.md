# Tasks — Citations: single date + required time in schedule dialog and listing

- [ ] T1 (R1, R2, R3) Update the `Citation` interface in `core/models/index.ts`: drop `dateFrom`/
  `dateTo`, add `date: string`, change `time` to `string` (non-nullable), add
  `guardianId: number | null`.

- [ ] T2 (R4, R5, R6, R7) Rewrite `shared/utils/citation-date.util.ts`: change
  `formatCitationDateLabel`/`formatCitationDateLabelShort` to the `(date: string, time: string)`
  signature, remove the multi-day-range branch and the `withTimeSuffix` null-check from both, always
  append the time suffix.

- [ ] T3 (R8) Load the `frontend-design` skill, then update `citation-dialog.component.ts`'s template:
  replace the "Agendar entre" heading + "Desde"/"Hasta" `.date-row` with a single `mat-form-field`
  labeled `"Fecha"` bound to a single date-picker; remove the now-unused `.date-row` CSS rules.

- [ ] T4 (R9) In the same template edit, change the time field's `mat-label` from
  `"Hora (opcional)"` to `"Hora"`.

- [ ] T5 (R8) Update `citation-dialog.component.ts`'s component class: replace the `dateFrom`/`dateTo:
  Date | null` fields with a single `date: Date | null` initialized from `data.citation?.date` (via
  `dateStringToDate`) or `new Date()`.

- [ ] T6 (R13) Add a readonly `isOrphanCitation` flag (`isEdit && data.citation!.guardianId === null`)
  and render a warning block (reusing the existing amber-banner styling) when it's `true`, explaining
  the citation has no representative and can't be saved.

- [ ] T7 (R10) Update `canSave` to require `!isOrphanCitation`, `reasonIds.length > 0`, a non-null
  `date`, and a non-empty `time`; remove the old `dateToDateString(dateFrom) <= dateToDateString(dateTo)`
  comparison.

- [ ] T8 (R11) Update `save()`'s payload to depend on mode — POST sends `{ enrollmentId: this.data.enrollmentId, date: dateToDateString(this.date), time: this.time, observations: this.observations.trim() || null, reasonIds: this.reasonIds }`; PUT sends `{ date: dateToDateString(this.date), time: this.time, observations: this.observations.trim() || null, reasonIds: this.reasonIds }` (no `enrollmentId`, since `update()`'s Partial type is `Partial<{ date; time; observations; reasonIds }>` and silently ignores it — see `backend/src/services/citation.service.ts:209-210`). Both modes drop `dateFrom`/`dateTo` and the `time || null` fallback.

- [ ] T9 (R12) Update the pending-citations banner's date label call to
  `formatCitationDateLabel(c.date, c.time)`.

- [ ] T10 (R17) Update `citation-history-dialog.component.ts`'s history-row date label call to
  `formatCitationDateLabel(c.date, c.time)`.

- [ ] T11 (R14) Update `citations.component.ts`'s `scopedCitations()` to filter on `c.date` instead of
  `c.dateFrom`.

- [ ] T12 (R15) Update `citations.component.ts`'s `pillLabel()` to call
  `formatCitationDateLabelShort(c.date, c.time)`.

- [ ] T13 (R16) Update `citations.component.ts`'s `notifyGuardian()` to build its date label via
  `formatCitationDateLabelShort(target.date, target.time)`.

- [ ] T14 (R18) Run `pnpm run build` and fix any TypeScript errors introduced by T1–T13.

- [ ] T15 (R20) Update `scripts/visual-smoke.mjs`'s `/api/citations` fixture citations to the new
  `date`/`guardianId` shape: drop `dateFrom`/`dateTo`, add `date: <YYYY-MM-DD>` (e.g. `id: 1` →
  `date: '2026-05-10'`; `id: 3`'s multi-day `dateFrom/dateTo` collapses to `date: '2026-06-01'` since
  a range is no longer representable), and add a `guardianId: <non-null int>` per citation (any
  non-null integer is fine). Additionally fix `id: 2`'s `time: null` → `time: '08:00'` (or any
  non-empty `HH:MM`) so the fixture satisfies `pnpm run build`'s TS check against the new
  `Citation.time: string` (non-nullable) model; its `status: 'closed'` is unchanged. Then run
  `VISUAL_FEATURE=citations_single_date_and_required_time_in_schedule_dialog_and_listing node
  scripts/visual-smoke.mjs` and inspect the resulting screenshot/report.

- [ ] T16 (R19) Manually smoke test against `docker compose up` per Level 3: create a citation (inspect
  the request body for `date`/`time`, absence of `dateFrom`/`dateTo`), confirm "Guardar" is disabled
  with an empty time, edit an existing citation's date, confirm the disabled "Guardar" + warning
  banner when editing a citation whose `guardianId` is `null`, and trigger a backend `409` by
  scheduling two citations for the same enrollment with overlapping dates/times within 10 minutes,
  confirming the existing generic-error toast surfaces the backend's plain message
  (`"Ya existe una citación pendiente para este representante en un horario cercano"`) readably,
  without any inline rendering of the redacted `conflict` object's fields (that richer treatment is
  owned by `citation_overlap_conflict_ui` #25). Record steps and outcomes in
  `progress/impl_citations_single_date_and_required_time_in_schedule_dialog_and_listing.md`.
