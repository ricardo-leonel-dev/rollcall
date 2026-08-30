# Requirements — Fix quarter selector sort order, date-picker sync, and Excel export quarter

Scope: frontend-only (`asistencia-frontend`). Three files are broken (`src/app/core/services/
quarter-context.service.ts`, and the `ngOnInit` of `src/app/features/dashboard/dashboard.component.ts`,
`src/app/features/absences/absences.component.ts`, `src/app/features/justifications/
justifications.component.ts`), plus one file that silently drops data it already has
(`src/app/features/student-report/excel-export-dialog.component.ts`). No backend or `excel-service`
change is in scope — both already fully support everything this feature needs to send them (see
`progress/explore_export_quarter_bug.md`, Hop 2/Hop 3). Root-cause detail (exact lines, code quotes) for
every requirement below was independently re-verified against the current working tree before writing
this file; see `progress/explore_quarter_dropdown_datesync.md` (bugs 1–2) and
`progress/explore_export_quarter_bug.md` (bug 3) for the original investigation.

Acceptance-criterion mapping (every bullet from the harness feature description — `scripts/harness.sh
status` / `state/features/009-fix_quarter_selector_sort_sync_export.md` — is satisfied by at least one
`R<n>` below; every `R<n>` cites the bullet it satisfies):

- A1: "Quarters are listed sorted by startDate (not sequenceNumber) in every quarter selector and
  export-dialog pill list" → **R1**
- A2: "On initial load, dashboard, absences, and justifications seed their date range fields from the
  auto-selected default quarter without requiring the user to manually reselect a quarter" → **R2–R7**
- A3: "excel-export-dialog.component.ts includes quarter_id in the /api/export/excel request when a
  quarter pill is active, and the exported Excel file shows the correct trimester sheet/months for the
  selected quarter" → **R8–R10**
- Build & verification (implicit in every feature, same convention as `require_full_dates_on_quarters`
  R8/R9) → **R11, R12**

## Sort order

## R1 [A1]
WHEN `QuarterContextService.load()` receives the quarters list from `QuarterService.getAll()`, the
system SHALL sort it in ascending order by `startDate` before setting `_quarters`, `_defaultQuarterId`
(via `computeDefaultQuarter`), and `_selectedId` — replacing the current `(a, b) => a.sequenceNumber -
b.sequenceNumber` comparator (`quarter-context.service.ts:59`) with one that places any quarter whose
`startDate` is `null` after every quarter with a non-`null` `startDate`, and, for two quarters with the
same `startDate` value (including both `null`), preserves their relative order from the fetched list
(`Array.prototype.sort` is stable) — the same comparator pattern already used correctly in
`admin.component.ts`'s `quarterRowsFor()` (lines 471–486). Because `QuarterSelectorComponent`'s
`mat-select` (`quarter-selector.component.ts:45`) and both export dialogs' pill lists
(`excel-export-dialog.component.ts`'s `getDatedQuarters()`, `export-config-dialog.component.ts`'s
`getDatedQuarters()`) all render `context.quarters()` (or a `.filter()` over it, which preserves order)
with no sort of their own, this single change fixes chronological ordering everywhere the shared signal
is consumed.

## Default-quarter date-picker sync

## R2 [A2]
WHEN `DashboardComponent.ngOnInit()` runs, the system SHALL, as its first statement (synchronously,
before `this.courses.set(...)` and before `loadSummary()` is called), invoke a new private
`applyDefaultQuarter()` method that reads `QuarterContextService.defaultQuarterId()` and, IF a quarter
with that id exists in `QuarterContextService.quarters()` and has both `startDate` and `endDate`
non-`null`, THEN SHALL set `selectedPeriod` to `'custom'`, `customFrom` to that quarter's `startDate`,
and `customTo` to that quarter's `endDate` — mirroring `ExcelExportDialogComponent.applyDefaultQuarter()`
(`excel-export-dialog.component.ts:161–166`), which is the correct reference pattern this feature
description points to. `DashboardComponent` SHALL inject `QuarterContextService` directly for this
(it does not today).

## R3 [A2]
IF `QuarterContextService.defaultQuarterId()` is `null` (no dated quarter configured for the active
academic year) THEN `DashboardComponent.applyDefaultQuarter()` SHALL leave `selectedPeriod`, `customFrom`,
and `customTo` unchanged from their existing defaults (`'full'`, `null`, `null`) — no regression for an
academic year with no dated quarters yet.

## R4 [A2]
WHEN `AbsencesComponent.ngOnInit()` runs, the system SHALL, as its first statement (before the existing
`Promise.all([...])` course/user fetch), invoke a new private `applyDefaultQuarter()` method that reads
`QuarterContextService.defaultQuarterId()` and, IF a matching dated quarter exists, THEN SHALL set
`dateFrom` to that quarter's `startDate`, `dateTo` to that quarter's `endDate`, and
`lastAppliedQuarterId` to that quarter's `id` — using the same field-assignment logic already proven in
`onQuarterChange()` (`absences.component.ts:791–796`) but without invoking its network side effects
(`onFiltersChange()`, `loadTodayAbsences()`), since at `ngOnInit` time no course is selected yet and
those calls would be no-ops guarded by `if (this.selCourse && this.selYear)` (`absences.component.ts:726`)
anyway. `AbsencesComponent` SHALL inject `QuarterContextService` directly for this (it does not today).

## R5 [A2]
IF `AbsencesComponent.ngOnInit()`'s existing `courseParam` branch (`absences.component.ts:708–719`) sets
`this.dateFrom`/`this.dateTo` from the `dateFrom`/`dateTo` query params (lines 712–715), THEN those
explicit query-param values SHALL overwrite the values set by R4's `applyDefaultQuarter()` — i.e. the
existing query-param branch keeps running unmodified, after R4's seed, so explicit navigation-supplied
dates keep taking precedence over the auto-selected default quarter, exactly as today.

## R6 [A2]
WHEN `JustificationsComponent.ngOnInit()` runs, the system SHALL, as its first statement (before
`this.courses.set(...)` and before the existing `selYear`/`courseParam` branching that decides whether to
call `onCourseChange()` or `loadHistorial()`), invoke a new private `applyDefaultQuarter()` method that
reads `QuarterContextService.defaultQuarterId()` and, IF a matching dated quarter exists, THEN SHALL set
`selQuarterStart` to that quarter's `startDate`, `selQuarterEnd` to that quarter's `endDate`, and
`lastAppliedQuarterId` to that quarter's `id` — using the same field-assignment logic already proven in
`onQuarterChange()` (`justifications.component.ts:453–458`) but without invoking `onCourseChange()`
directly (the existing branching immediately after already triggers the equivalent initial fetch, which
will now read the seeded `selQuarterStart`/`selQuarterEnd`). `JustificationsComponent` SHALL inject
`QuarterContextService` directly for this (it does not today).

## R7 [A2]
IF the user subsequently picks, via `QuarterSelectorComponent`'s `(quarterChange)` output, the same
quarter id that R4/R6 already applied during `ngOnInit`, THEN `AbsencesComponent.onQuarterChange()` /
`JustificationsComponent.onQuarterChange()`'s existing `if (q.id === this.lastAppliedQuarterId) return;`
guard (`absences.component.ts:793`, `justifications.component.ts:455`) SHALL treat it as already applied
and SHALL NOT reseed the fields or re-trigger a fetch — no change to `onQuarterChange()` itself; this
pins that R4/R6 writing `lastAppliedQuarterId` up front composes correctly with the pre-existing guard
instead of bypassing it.

## Excel export quarter_id

## R8 [A3]
WHEN `ExcelExportDialogComponent.downloadExcel()` builds the `/api/export/excel` request URL
(`excel-export-dialog.component.ts:206`), IF `this.activeQuarterId()` is non-`null`, THEN the system
SHALL append `&quarter_id=<activeQuarterId()>` to that URL's query string, so the value the component
already tracks (set by `applyQuarter()`, `excel-export-dialog.component.ts:172–177`, and cleared to
`null` by the manual date-picker `(ngModelChange)="activeQuarterId.set(null)"` handlers, lines 94 and
101) reaches `GET /api/export/excel`.

## R9 [A3]
IF `this.activeQuarterId()` is `null` at the time `downloadExcel()` runs (the user typed/edited a fully
custom date range and never clicked a trimestre pill afterward, or no dated quarters exist) THEN the
system SHALL NOT append a `quarter_id` param — preserving today's behavior of exporting purely by
`date_from`/`date_to`, and matching the backend's `quarter_id` being an optional query param
(`backend/src/controllers/export.controller.ts:17,29–36`).

## R10 [A3]
WHEN a `quarter_id` is included per R8 and the export request completes, the downloaded `.xlsx` file
SHALL contain the trimestre sheet whose sequence/name matches the selected quarter rather than always
sheet index 0 — this is an end-to-end consequence of R8 alone, since `backend/src/services/
export.service.ts:20–27` (resolves `quarter_id` → `quarter_sequence`/`quarter_name`) and
`excel-service/export.go`'s `resolveTrimesterSheetIndex`/`selectAndKeepSheet` (lines 550–576, 578–595)
are already implemented and unit-tested by a prior feature (see
`excel-service/progress/impl_export_selects_the_correct_trimester_sheet.md`) and are out of scope to
modify here. R10 SHALL be verified by manual smoke against the real backend + `excel-service` stack
(`docs/verification.md` Level 2/3), not by frontend code alone.

## Build & verification

## R11
WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit code 0
and SHALL introduce no new build warnings attributable to the modified files.

## R12
WHEN the implementation is complete, the system SHALL be verified by a manual smoke test
(`docs/verification.md` Level 2/3) covering at minimum: (a) an academic year with quarters configured
out of `sequenceNumber`/calendar order, confirming the dropdown (`QuarterSelectorComponent`) and both
export dialogs' pill lists show them in `startDate` order (R1); (b) a hard reload of Dashboard, Absences,
and Justifications with no prior manual quarter pick in the session, confirming each page's date fields
already reflect the current default quarter before any user interaction (R2, R4, R6); (c) selecting a
non-default trimestre pill in the Excel export dialog, downloading, and opening the resulting `.xlsx` to
confirm it shows that quarter's sheet/months rather than always the first (R8, R10). Results SHALL be
documented in `progress/impl_fix_quarter_selector_sort_sync_export.md`'s Traceability section.
