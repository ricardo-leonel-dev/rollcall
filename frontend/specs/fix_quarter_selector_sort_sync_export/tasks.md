# Tasks — Fix quarter selector sort order, date-picker sync, and Excel export quarter

- [x] T1 (R1) In `src/app/core/services/quarter-context.service.ts`'s `load()`, replace the
  `(a, b) => a.sequenceNumber - b.sequenceNumber` comparator with the `startDate`-ascending,
  nulls-last, stable-tiebreak comparator from `design.md` (mirrors `admin.component.ts`'s
  `quarterRowsFor()`).

- [x] T2 (R2, R3) In `src/app/features/dashboard/dashboard.component.ts`: inject
  `QuarterContextService`; add a private `applyDefaultQuarter()` method that seeds
  `selectedPeriod`/`customFrom`/`customTo` from `quarterContext.defaultQuarterId()` (no-op if `null`
  or the matching quarter lacks a full date range); call it as the first statement of `ngOnInit()`,
  before `loadSummary()` is invoked.

- [x] T3 (R4, R5) In `src/app/features/absences/absences.component.ts`: inject
  `QuarterContextService`; add a private `applyDefaultQuarter()` method that seeds
  `dateFrom`/`dateTo`/`lastAppliedQuarterId` from `quarterContext.defaultQuarterId()` (no network
  calls, no-op if `null` or partial-date); call it as the first statement of `ngOnInit()`, before the
  existing `Promise.all([...])` and `courseParam` branch — confirm the `courseParam` branch's own
  `dateFrom`/`dateTo` query-param assignment still runs after and still overwrites when present.

- [x] T4 (R6) In `src/app/features/justifications/justifications.component.ts`: inject
  `QuarterContextService`; add a private `applyDefaultQuarter()` method that seeds
  `selQuarterStart`/`selQuarterEnd`/`lastAppliedQuarterId` from `quarterContext.defaultQuarterId()`
  (no-op if `null` or partial-date); call it as the first statement of `ngOnInit()`, before
  `this.courses.set(...)` and the existing `selYear`/`courseParam` branching.

- [x] T5 (R7) Manually confirm (code read, no code change expected) that
  `AbsencesComponent.onQuarterChange()` and `JustificationsComponent.onQuarterChange()`'s existing
  `if (q.id === this.lastAppliedQuarterId) return;` guard correctly no-ops when the user re-picks, via
  the dropdown, the same quarter T3/T4 already seeded — document this check in
  `progress/impl_fix_quarter_selector_sort_sync_export.md`.

- [x] T6 (R8, R9) In `src/app/features/student-report/excel-export-dialog.component.ts`'s
  `downloadExcel()`, append `&quarter_id=${this.activeQuarterId()}` to the export URL when
  `this.activeQuarterId()` is non-null, and nothing when it is `null` (per `design.md`'s
  `quarterParam` snippet).

- [x] T7 (R11) Run `pnpm run build` (or `./node_modules/.bin/ng build --configuration production`);
  confirm exit code 0 and no new warnings attributable to the 5 touched files (baseline: the
  pre-existing warning count/list recorded in `progress/impl_require_full_dates_on_quarters.md`).

- [x] T8 (R1, R12) Manual smoke: with an academic year whose quarters are configured out of
  `sequenceNumber`/calendar order, confirm the dropdown (`QuarterSelectorComponent`, visible on
  Dashboard/Absences/Justifications) and both export dialogs' trimestre pill rows list them in
  `startDate` order.

- [x] T9 (R2, R4, R6, R12) Manual smoke: hard-reload Dashboard, then Absences, then Justifications
  (no prior manual quarter pick in the session) and confirm each page's date-range fields already
  reflect the current default quarter's `startDate`/`endDate` before any user interaction with the
  quarter dropdown.

- [x] T10 (R8, R10, R12) Manual smoke against a running stack (`docker ps` / `docker compose up
  --build`): in the Excel export dialog, click a non-default trimestre pill, download, and open the
  resulting `.xlsx` to confirm it shows that quarter's sheet/months rather than always the first
  trimestre's fixed columns. Document T8–T10's results in
  `progress/impl_fix_quarter_selector_sort_sync_export.md`'s Traceability section, same convention as
  T17 of `flexible_quarter_admin_ui` / R9 of `require_full_dates_on_quarters`.