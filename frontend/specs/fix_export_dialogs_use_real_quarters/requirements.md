# Requirements — Fix PDF / Excel export dialogs to use real quarter data instead of equal-thirds guess

Scope: frontend-only (`asistencia-frontend`). Reuses the
`QuarterContextService` delivered by feature 4 (`quarter_selector_foundation`,
done) and replaces the **equal-thirds trimester algorithm** in two export
dialogs with real quarter data fetched from the backend.

The two dialogs involved, both in `src/app/features/student-report/`:

- **`excel-export-dialog.component.ts`** — the Excel export dialog (downloads
  a `.xlsx` template filled by the Go `excel-service` via
  `GET /api/export/excel`).
- **`export-config-dialog.component.ts`** — the PDF reports dialog (fetches
  `GET /api/reports/student-summary` then renders a printable HTML report,
  one page per selected course).

Both dialogs today share the same flawed UI: a `.trimester-row` containing
three hardcoded pills labelled `'Primer trimestre'`, `'Segundo trimestre'`,
`'Tercer trimestre'`, computed via an equal-thirds division of the academic
year's `startDate`/`endDate` range (see R16 below). When an institution's
configured quarters number 2, 4, or N, or have non-equal date ranges, the
pills lie — they show `Primer/Segundo/Tercer trimestre` even when the real
configured quarters are named `Q1`/`Q2`, `T1`/`T2`/`T3`/`T4`, etc. — and the
PDF title `FALTAS PRIMER TRIMESTRE` is anchored to a synthetic midpoint
that may not even be inside the first real quarter. This feature replaces
both behaviors with the same `QuarterContextService.quarters()` the
foundation exposes.

Out of scope (explicit): changing the export backend, changing the export
format, changing the course picker, changing the academic-year picker,
touching `QuarterSelectorComponent`, modifying `QuarterContextService`, or
any change outside the two export dialogs and their immediate consumers.

Cross-references:

- `QuarterContextService`
  (`src/app/core/services/quarter-context.service.ts`) — provides
  `quarters()` (sorted by `sequenceNumber` ascending), `selectedId()`,
  `loaded()`, `defaultQuarterId()`. Already loaded once at app bootstrap by
  the foundation's `LayoutComponent.ngOnInit`, so both dialogs see populated
  data the moment they render.
- `QuarterSelectorComponent`
  (`shared/components/quarter-selector/quarter-selector.component.ts`) —
  the reusable dropdown, **not** directly used by the export dialogs: the
  export UX uses pills (not a `mat-select`), and re-using
  `QuarterSelectorComponent` here would force the dialog into a
  presentation shape that doesn't match `MatDialog`'s tight-form layout.
  Both dialogs instead inject `QuarterContextService` directly and render
  pills themselves — see R1 and `design.md`'s discarded alternative #1.
- `AcademicYearContextService`
  (`core/services/academic-year-context.service.ts`) — already injected by
  both dialogs (`academicYearContext.selected()` is used to drive the
  default trimester today). The reactive year-switch reload (foundation
  R5) automatically re-fetches the quarter list when the AY changes, so
  this feature does NOT need to subscribe to AY changes — `quarters()`
  is already reactive.
- `require_full_dates_on_quarters` (frontend feature, done, 2026-08-29) —
  the admin dialog now requires both `startDate`/`endDate` on every
  trimester, narrowing the partial-date rationale. The same defensive
  layer pattern applies here (see R15 below).
- `backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados`
  (backend feature, shipped) — backend now rejects partial-date bodies at
  `POST/PUT /api/quarters`, migration soft-deletes legacy null-dated rows.
  Same source of partial-date quarters as the foundation's note: only
  `seedQuarters()` for freshly-created AYs (the 3 rows with
  `isActive && sequenceNumber in {1,2,3} && !startDate && !endDate`).

## Note (user amendment, 2026-08-30 — partial-date defensive layer, inherited)

The user's 2026-08-29 decision (carried by features 5 and 6) that
partial-date quarters should not be a normal state still applies here.
Backend rejection and the legacy soft-delete migration shipped, so the
remaining real-world source is narrow: `seedQuarters()` on a fresh AY
(typically never — the admin dialog forces both dates immediately for new
AY flows, but the 3 `null`-dated rows remain in the DB until filled in).

This feature therefore **filters partial-date quarters out of the pill row
in both dialogs** and shows an explanatory inline note if no fully-dated
quarter exists for the year. The picker row (`<mat-datepicker>` Desde /
Hasta) is kept fully usable in that case so the user can still generate
an export. This mirrors the foundation's defensive pattern (R10/R11 of
`quarter_selector_foundation/requirements.md`) and applies to both
dialogs identically.

## Note (title preservation in PDF exports)

`export-config-dialog.component.ts` derives the PDF report's section title
(`FALTAS PRIMER TRIMESTRE — <courseName>`) from a midpoint comparison
against the equal-thirds bounds (`getTrimesterName()`, a private method).
With real quarter data the title becomes the **real quarter's configured
name** (`FALTAS PRIMER TRIMESTRE — <courseName>` if the admin named it that,
`FALTAS Q1 — <courseName>` if they named it `Q1`, etc.). For a
manually-edited custom date range not aligned with any configured quarter,
the title falls back to `PERÍODO PERSONALIZADO` (R13). This is intentional:
the title now mirrors the data the user actually selected, instead of an
inferred midpoint that's often wrong.

Acceptance-criterion mapping (every bullet from the feature description is
satisfied by at least one `R<n>` below; every `R<n>` cites the acceptance
bullet it satisfies):

- A1: "The PDF and Excel export dialogs source their trimester/quarter list
  from `QuarterContextService.quarters()` instead of computing synthetic
  equal-thirds" → **R1, R4, R8**
- A2: "Each pill is labelled with the configured quarter's `name`, in
  `sequenceNumber` order" → **R1, R5, R9**
- A3: "Clicking a pill writes the quarter's `startDate`/`endDate` to the
  dialog's `dateFrom`/`dateTo` pickers; editing the pickers manually
  clears the active pill (seed-not-override model, mirroring the export
  dialog's own pre-existing behavior)" → **R6, R10, R14, R15**
- A4: "The PDF title's trimester label uses the real quarter's name (or
  `PERÍODO PERSONALIZADO` for a free-form range)" → **R13**
- A5: "Empty / partial-date lists degrade gracefully; the pill row shows
  an inline note; the date pickers remain usable" → **R2, R3, R15**
- A6: "`pnpm run build` exits 0 with no new warnings" → **R17**
- A7: "Manual smoke test against the running stack documents every
  observation against an `R<n>`" → **R18**

## A — Data source (shared by both dialogs)

## R1 [A1, A2]
The system SHALL source the pill row in both
`ExcelExportDialogComponent` and `ExportConfigDialogComponent` from
`QuarterContextService.quarters()` (injected as a private readonly field
on each component, alongside the existing
`AcademicYearContextService` injection), iterating the signal as-is (already
sorted by `sequenceNumber` ascending per foundation R3). The system SHALL
NOT recompute trimesters from the academic year's
`startDate`/`endDate`. The hardcoded literal `['Primer', 'Segundo',
'Tercer']` SHALL be removed from both dialogs' templates and `let i =
$index` index-based `selectTrimester` SHALL be replaced with the
corresponding quarter's `id` (`activeQuarterId`).

## R2 [A5]
IF `QuarterContextService.quarters()` returns an empty list (no quarters
configured for the current academic year) OR every entry lacks both
`startDate` and `endDate` (the partial-date case — see R15), THEN the pill
row SHALL render a single inline `<div class="trimester-empty-note">No
hay períodos con fechas configuradas para este año lectivo. Define los
períodos en el módulo de administración o usa los selectores de fecha
para establecer el rango manualmente.</div>` instead of any pills, AND
both dialogs' `dateFrom`/`dateTo` pickers SHALL remain user-editable so
the user can still complete an export with a free-form date range.

## R3 [A5]
WHEN `AcademicYearContextService.selectedId()` changes (and therefore
`QuarterContextService` reactively reloads the quarter list per
foundation R5), the system SHALL re-evaluate the pill row in both dialogs
without further code in the dialogs themselves — the foundation's
existing reactive signal/computed wiring is the single source of truth,
and no extra subscription is added here.

## B — PDF dialog (`export-config-dialog.component.ts`)

## R4 [A1]
`ExportConfigDialogComponent` SHALL remove
`setDefaultTrimester(year)` and `selectTrimester(i)` in their current
equal-thirds form and SHALL replace them with `applyDefaultQuarter()` and
`applyQuarter(q: Quarter | null)`, both of which read from
`QuarterContextService.quarters()` instead of computing synthetic
trimesters. The `activeTrimester: signal<number | null>` field SHALL be
replaced with `activeQuarterId: signal<number | null>` tracking the
selected quarter's `id` rather than an array index.

## R5 [A2]
`ExportConfigDialogComponent`'s pill row SHALL render one
`<button class="period-pill">` per fully-dated quarter (i.e. every entry
in `QuarterContextService.quarters()` where
`q.startDate && q.endDate`), labeled with `q.name` (NOT with the
hardcoded `'Primer trimestre'` etc.), bound to
`[class.active]="activeQuarterId() === q.id"`, and SHALL emit no pill
for partial-date quarters (defensive layer; see R15). When clicked, the
pill SHALL call `applyQuarter(q)`.

## R6 [A3]
WHEN `applyQuarter(q)` is called with a `Quarter` whose `startDate` and
`endDate` are both non-null, the system SHALL set
`this.dateFrom = dateStringToDate(q.startDate)` and
`this.dateTo = dateStringToDate(q.endDate)`, AND
`this.activeQuarterId.set(q.id)`. IF `applyQuarter(q)` is called with a
`Quarter` whose `startDate` or `endDate` is null, the system SHALL return
immediately (no-op) without mutating `dateFrom`/`dateTo` and without
setting `activeQuarterId` (defensive layer; see R15).

## R7 [A1]
`ExportConfigDialogComponent.applyDefaultQuarter()` SHALL, on dialog
init, read
`this.quarterContext.defaultQuarterId()` (foundation R6–R10) and IF that
is non-null, look up the matching `Quarter` in
`this.quarterContext.quarters()` and call `applyQuarter(q)`. IF
`defaultQuarterId()` is null (no fully-dated quarter exists), the system
SHALL leave `dateFrom`/`dateTo` null and the pill row SHALL fall through
to R2's empty-note state.

## C — Excel dialog (`excel-export-dialog.component.ts`)

## R8 [A1]
`ExcelExportDialogComponent` SHALL remove `setDefaultTrimester(year)` and
`selectTrimester(i)` in their equal-thirds form and SHALL replace them
with `applyDefaultQuarter()` and `applyQuarter(q: Quarter | null)`, both
of which read from `QuarterContextService.quarters()`. The
`activeTrimester: signal<number | null>` field SHALL be replaced with
`activeQuarterId: signal<number | null>`.

## R9 [A2]
`ExcelExportDialogComponent`'s pill row SHALL render one
`<button class="period-pill">` per fully-dated quarter, labeled with
`q.name` (NOT `'Primer trimestre'` etc.), bound to
`[class.active]="activeQuarterId() === q.id"`, and SHALL emit no pill for
partial-date quarters (R15). When clicked, the pill SHALL call
`applyQuarter(q)`.

## R10 [A3]
`ExcelExportDialogComponent.applyQuarter(q)` SHALL follow R6's exact
contract: set `dateFrom`/`dateTo` to the quarter's range and
`activeQuarterId.set(q.id)` when both dates are present; otherwise return
immediately as a no-op.

## R11 [A1]
`ExcelExportDialogComponent.applyDefaultQuarter()` SHALL mirror R7
exactly — read `defaultQuarterId()`, look up the matching `Quarter`, call
`applyQuarter(q)`; leave pickers null and fall through to R2's empty-note
state if `defaultQuarterId()` is null.

## D — PDF report title (`export-config-dialog.component.ts`)

## R12 [A1]
The system SHALL remove `getTrimesterName()`'s equal-thirds midpoint
logic (`PRIMER/SEGUNDO/TERCER TRIMESTRE` keywords computed from a
midpoint inside `bounds[i..i+1]`).

## R13 [A4]
`ExportConfigDialogComponent.getTitleSection()` (the replacement for
`getTrimesterName()`) SHALL, when `activeQuarterId()` is non-null, look up
the matching `Quarter` in `QuarterContextService.quarters()` and return
its `name` uppercased and trimmed (e.g. `Q1` → `Q1`, `Primer Trimestre`
→ `PRIMER TRIMESTRE`, `Q3 2026` → `Q3 2026`). WHEN
`activeQuarterId()` is null OR the matching `Quarter` lacks both dates,
the system SHALL return the literal `'PERÍODO PERSONALIZADO'`. The title
template (`${mainTitle} ${trimesterName} — ${courseName}`) remains
unchanged.

## E — Shared concerns

## R14 [A3]
WHEN the user edits `dateFrom` or `dateTo` manually via either dialog's
`mat-datepicker`, the system SHALL clear `activeQuarterId` (set it to
`null`) so the pill row no longer shows a pill as active. IF the manually
edited range happens to equal a configured quarter's range, the pill will
not automatically re-highlight — the user must click the pill to
re-affirm. This mirrors today's equal-thirds behavior (`activeTrimester.set(null)`
on `(ngModelChange)`) and preserves the "pill is opt-in scope" mental
model.

## R15 [A5]
The system SHALL exclude any `Quarter` in
`QuarterContextService.quarters()` whose `startDate` or `endDate` is null
from the pill row in both dialogs. The exclusion SHALL be a simple
inline filter in the `for` loop (`q.startDate && q.endDate`), not a
separate computed signal. The defensive layer rationale mirrors the
foundation's `require_full_dates_on_quarters` user amendment:
backend now rejects partial-date bodies and migration soft-deleted legacy
null-dated rows, so the only remaining narrow source is
`seedQuarters()` for freshly-created AYs mid-edit; partial-date quarters
are not auto-selectable for the default computation and are not offered
as pills in the export picker (the `mat-datepicker`s remain available).

## R16 [A1]
The system SHALL delete the equal-thirds computation
(`(end.getTime() - start.getTime()) / 3`, `bounds = [start, start+third,
start+2*third, end]`, and the `today`-based default-trimester pick from
`setDefaultTrimester`) from both dialogs. No new equal-thirds math
replaces it — the real `Quarter.startDate`/`endDate` is the only source
of truth going forward.

## F — Build, verification, smoke

## R17 [A6]
The system SHALL leave `pnpm run build` exiting with status `0` and SHALL
introduce no new build warnings attributable to the two files this feature
modifies (`export-config-dialog.component.ts`,
`excel-export-dialog.component.ts`).

## R18 [A7]
WHEN the implementation is complete, the system SHALL be verified by a
manual smoke test against the running stack (`docker compose up` at the
monorepo root, or confirm via `docker ps` it's already up per
`docs/verification.md`), covering at minimum, against the real "Tia
Blanquita" (or equivalent) test institution: (i) opening the PDF export
dialog and confirming the pill row labels match the configured quarters'
real names (not "Primer/Segundo/Tercer trimestre") and are in
`sequenceNumber` order; (ii) opening the Excel export dialog and confirming
the same; (iii) clicking a pill on either dialog writes its dates to the
Desde/Hasta pickers and highlights the pill; (iv) editing a picker
manually clears the highlight; (v) on a year with N quarters (2, 4, or N),
both dialogs render N pills; (vi) on a year with 0 fully-dated quarters,
both dialogs render the inline empty-note (R2) and the pickers remain
usable, allowing a manual export; (vii) the PDF report title uses the
real quarter's name (e.g. `Q1` → `Q1` in the title) when a pill is
active, and `PERÍODO PERSONALIZADO` when both pickers were edited
manually (R13); (viii) switching the academic year via the topbar
year-switcher (to another year with different quarters or to a year with
seedQuarters' null-dated rows) reactively updates the pill row in both
dialogs the next time they're opened (R3); (ix) on a fresh AY where
`seedQuarters()` rows have null dates, the pill row renders the empty
note (R2) and the pickers remain usable — partial-date quarters are
filtered out (R15). The result SHALL be documented in
`progress/impl_fix_export_dialogs_use_real_quarters.md`'s Traceability
section, mirroring the structure of
`progress/impl_quarter_selector_foundation.md`'s Traceability table (one
row per `R<n>` with file:line + evidence + the R18 sub-bullet that covers
it).
