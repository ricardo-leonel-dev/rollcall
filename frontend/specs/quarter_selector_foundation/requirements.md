# Requirements — Shared quarter/period selector: context service + dropdown, wired into Dashboard

> **Revision note (2026-08-29).** The backend feature
> `get_api_quarters_accepts_optional_academic_year_id_filter` (`attendance_backend` project) has
> shipped: `GET /api/quarters` now accepts an optional `academic_year_id` query param (still
> defaulting to the institution's active year when omitted, `400` on a non-numeric/non-positive
> value, `404` on an id that doesn't exist or belongs to another institution). This spec has been
> revised accordingly — the former R5/R17/R18 "only available for the active year" guard has been
> replaced with real year-scoped behavior (R5, R17, R18 below now describe reactive reload and
> selection reset on academic-year switch). See `design.md`'s discarded-alternative #5 for the
> superseded rejection this replaces.

Scope: frontend-only (`asistencia-frontend`). Introduces a new `QuarterContextService`
(`core/services/quarter-context.service.ts`) and a new reusable `QuarterSelectorComponent`
(`shared/components/quarter-selector/`), then wires the latter into
`src/app/features/dashboard/dashboard.component.ts`. This is explicitly a **foundation** feature —
feature 6 (`quarter_selector_on_list_views`, not yet drafted) will reuse the same service/component
on other screens; this spec only requires and verifies the Dashboard integration, but the service and
component must not carry Dashboard-specific assumptions in their public contract.

Cross-references:
- `QuarterService` (`core/services/quarter.service.ts`) — `getAll(academicYearId?: number)` calls
  `GET /api/quarters`, optionally passing `?academic_year_id=`. The backend
  (`findAllForYear`, `../backend/src/services/quarter.service.ts`) resolves that id to the requesting
  institution's own academic year (`404` if it doesn't exist or belongs to another institution,
  `400` if malformed), or falls back to the institution's active year when the param is omitted. This
  feature always passes the id of whichever year is currently selected in
  `AcademicYearContextService` (R1), so `QuarterContextService` shows that year's real quarters,
  whether or not it's the active one — see R5/R17/R18 for the reactive-reload/selection-reset
  contract this enables.
- `AcademicYearContextService` (`core/services/academic-year-context.service.ts`) — the existing
  "globally selected X" pattern (private `_signal` + public `.asReadonly()`/`computed()`, no
  localStorage persistence, reloaded once per app-shell bootstrap) that `QuarterContextService`
  follows for consistency (R4).
- `dashboard.component.ts`'s existing relative-date presets (`PeriodPreset`: `today | yesterday | 7d |
  15d | 30d | full | custom`, driven by `selectedPeriod`/`customFrom`/`customTo` and
  `computeDateRange()`) — R20–R24 define exactly how the new quarter dropdown coexists with them.
- Sibling feature `flexible_quarter_admin_ui` (done) — established that `Quarter.name` is a free-form
  `string`, `startDate`/`endDate` are independently nullable (`string | null`), and soft-deleted
  quarters never appear in `GET /api/quarters`'s response (already filtered server-side).

### Note (user amendment, 2026-08-29)

The user reviewed this spec before approval and decided partial-date quarters (only one of
`startDate`/`endDate` set, or neither) should stop being a normal, accepted state going forward —
every quarter should always have both dates. A companion feature, `require_full_dates_on_quarters`
(frontend, `quarters-dialog.component.ts`), will make both fields mandatory in the admin dialog.
That feature is **not yet implemented** as of this spec's approval, so R8–R11/R15/R16/R19 below
still exist and must still be implemented — they now serve as defensive handling of **legacy/
anomalous data** (quarters saved before that enforcement shipped, or any future gap if backend
validation is ever bypassed) rather than as an expected everyday case. Do not remove or simplify
this handling on the assumption that partial dates can't happen — see the
"Update (post-backend-validation, 2026-08-29)" below for the current rationale, which is
narrower than what was known at the time of approval.

**Update (post-backend-validation, 2026-08-29):** the backend feature
`backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados` has shipped
in the `attendance_backend` project, materially narrowing the rationale above. As of today:

- `POST /api/quarters` and `PUT /api/quarters/:id` now reject partial-date bodies at both the
  controller layer (`backend/src/controllers/quarter.controller.ts`, guards with `next(...)`
  returning HTTP 400) and the service layer's new private `assertValidDates(range)` helper
  (`backend/src/services/quarter.service.ts`, called from `create` and `update`). The error
  message in both layers is exactly: `"El período debe tener fecha de inicio y fecha de fin."`.
- Migration `postgres/19_quarters_softdelete_legacy_null_dates.sql` (idempotent — second run is
  a no-op) sets `deleted_at = NOW()` and `is_active = false` on every historical row that had
  `start_date IS NULL OR end_date IS NULL`, so legacy null-dated quarters are no longer
  reachable through `GET /api/quarters`: the backend's existing soft-delete filter already
  excludes them server-side, and the frontend selector's input side (which reads only
  non-deleted rows) inherits that exclusion for free.

The remaining real-world source of partial-date quarters is now narrow and well-defined:
`seedQuarters()` (`backend/src/services/quarter.service.ts`, invoked from
`academic-year.service.ts#create` on every newly created academic year) still inserts 3 rows
per fresh AY with `startDate: null, endDate: null` — explicitly identifiable by
`isActive && sequenceNumber in {1, 2, 3} && !startDate && !endDate`. These rows are editable
via `PUT` once the user supplies both dates (a single call with both fields set works — live
verified by the user), so no one is locked out. R8–R11/R15/R16/R19/R23 therefore remain
implemented **as a safety net for that single, well-defined case**: if a user opens the year
admin screen / period dialog for a freshly created AY before filling in the dates, the
selector must still degrade gracefully (R15 empty-list note, R10/R11 `null` default, R16/R19
inline notes, R23 no-op on selection) instead of crashing or auto-querying an un-dated range.
The defensive layer is **not removable** — the user amendment above still stands, only the
*reason* it stays has narrowed from "backend permits + legacy exists" to
"`seedQuarters()` output for new AYs only, while the user is mid-edit."

Acceptance-criterion mapping (`state/features/005-…md`):

- A1: "`QuarterContextService` expone el periodo activo por defecto calculado a partir de la fecha
  actual y los periodos del `QuarterService`" → **R1, R3, R6–R11**
- A2: "El dropdown reutilizable lista todos los periodos configurados para el año académico
  actualmente seleccionado, y se actualiza si el usuario cambia de año lectivo" → **R1, R5, R12,
  R17, R18**
- A3: "`dashboard.component.ts` muestra el dropdown y por defecto selecciona el periodo
  correspondiente a la fecha actual" → **R20, R21**
- A4: "Si no hay periodos con fechas configuradas, el componente muestra un estado claro en vez de un
  default incorrecto" → **R15, R16, R19**
- A5: "Diseño construido siguiendo el skill `frontend-design`" → **R25**
- A6: "`pnpm run build` retorna 0 sin warnings nuevos" → **R26**

## A — `QuarterContextService`: loading & scope

## R1
The system SHALL provide a `QuarterContextService`, `providedIn: 'root'`, that loads the quarter list
for the academic year currently selected in `AcademicYearContextService`
(`academicYearContext.selectedId()`) by calling `QuarterService.getAll(academicYearId)`.

## R2
WHEN the authenticated app shell initializes (`LayoutComponent.ngOnInit`), the system SHALL call
`QuarterContextService.load()` in the same initialization sequence as, and strictly after,
`AcademicYearContextService.load()` resolves, before the routed component renders.

## R3
WHEN `QuarterContextService.load()` resolves, the system SHALL expose the loaded quarters through a
public readonly signal (`quarters`) sorted by `sequenceNumber` ascending.

## R4
The system SHALL expose `QuarterContextService.selectedId` (readonly signal), `selected` (computed
from `quarters` and `selectedId`), and a `select(id: number): void` method, mirroring
`AcademicYearContextService`'s public shape.

## R5
WHEN `AcademicYearContextService.selectedId()` changes to a different value after
`QuarterContextService`'s initial `load()` has already completed once, the system SHALL
automatically reload the quarter list for the newly selected academic year (by calling
`QuarterService.getAll()` with that year's id), without requiring any other component to call
`load()` again.

## B — Default-quarter algorithm

Every rule below operates on ISO `YYYY-MM-DD` date strings (lexicographically comparable) and only
ever considers quarters with **both** `startDate` and `endDate` set as candidates for automatic
selection (see R11 for why partial-date quarters are excluded from this computation specifically).
"Today" means `dateToDateString(new Date())` at the moment `load()` resolves.

## R6
WHEN `QuarterContextService.load()` resolves and exactly one fully-dated quarter satisfies
`startDate <= today <= endDate`, the system SHALL set that quarter as the default (`defaultQuarterId`).

## R7
IF more than one fully-dated quarter satisfies `startDate <= today <= endDate` THEN the system SHALL
select the one with the lowest `sequenceNumber` as the default, and SHALL NOT throw an error or leave
`defaultQuarterId` unset.

## R8
IF no fully-dated quarter's range contains today, THEN the system SHALL select, among fully-dated
quarters whose `endDate < today`, the one with the largest `endDate` ("closest past quarter") as the
default, when at least one such quarter exists.

## R9
IF no fully-dated quarter's range contains today AND no fully-dated quarter has `endDate < today`,
THEN the system SHALL select, among fully-dated quarters whose `startDate > today`, the one with the
smallest `startDate` ("closest upcoming quarter") as the default, when at least one such quarter
exists.

## R10
IF no quarter has both `startDate` and `endDate` set, THEN the system SHALL set `defaultQuarterId` to
`null` and SHALL NOT select any quarter automatically.

## R11
The system SHALL exclude any quarter with only one of `startDate`/`endDate` set (or neither) from the
default-quarter computation in R6–R10, while still including that quarter in the `quarters` signal
from R3 so it remains available for manual selection.

## C — `QuarterSelectorComponent` (reusable dropdown)

## R12
The system SHALL provide a standalone `QuarterSelectorComponent`
(`shared/components/quarter-selector/quarter-selector.component.ts`) that renders a dropdown listing
`QuarterContextService.quarters()`, in the order that signal is already sorted (`sequenceNumber`
ascending).

## R13
WHEN the user selects a different option in the dropdown, `QuarterSelectorComponent` SHALL call
`QuarterContextService.select(id)` AND SHALL emit the corresponding `Quarter` through a
`quarterChange` output.

## R14
The system SHALL make every input of `QuarterSelectorComponent` optional, so the component can be
placed in a template with zero bindings and still read/write `QuarterContextService`'s shared
selection.

## R15
IF `QuarterContextService.quarters()` is empty after loading, THEN `QuarterSelectorComponent` SHALL
render the message "No hay períodos configurados para este año lectivo." instead of a dropdown.

## R16
IF `QuarterContextService.quarters()` is non-empty but none of its items has both `startDate` and
`endDate` set, THEN `QuarterSelectorComponent` SHALL still render the dropdown (listing quarters by
name) AND SHALL display an inline note ("Los períodos no tienen fechas configuradas.") next to it.

## R17
WHILE `QuarterContextService.loaded()` is `false` — whether during its initial `load()` or a
subsequent reload triggered by R5 — `QuarterSelectorComponent` SHALL render a disabled loading
placeholder instead of the empty-state message (R15) or the dropdown.

## R18
WHEN `QuarterContextService` reloads quarters for a newly selected academic year (R5), the system
SHALL discard the previous selection and set `selectedId` to the freshly computed default (R6–R10)
for the new year's quarter list — a quarter selected while viewing one academic year SHALL NOT remain
"selected" after the user switches to a different academic year.

## R19
WHEN `QuarterContextService`'s `defaultQuarterId` was resolved via R8 or R9 (today outside every
quarter's range) rather than R6/R7 (an exact containing match), `QuarterSelectorComponent` SHALL
display an inline note distinguishing that fallback from an exact match, naming whether it is the most
recently ended period or the next upcoming one.

## D — Dashboard integration

## R20
The system SHALL render `QuarterSelectorComponent` inside `dashboard.component.ts`'s filter area,
alongside the existing course `mat-select` and the relative-date-preset pills.

## R21
WHEN `DashboardComponent` initializes, the quarter dropdown SHALL show
`QuarterContextService`'s `defaultQuarterId` (R6–R10) as its selected value, and this SHALL NOT change
`DashboardComponent`'s own default relative-date preset (`selectedPeriod = 'full'`) or trigger an
extra `loadSummary()` call beyond the one `ngOnInit` already performs.

## R22
WHEN the user selects, via the dropdown, a quarter that has both `startDate` and `endDate` set,
`DashboardComponent` SHALL set its active date range to that quarter's `startDate`/`endDate` (the same
codepath as the existing `'custom'` preset) AND SHALL reload the dashboard summary.

## R23
IF the user selects, via the dropdown, a quarter that lacks a full `startDate`/`endDate` pair, THEN
`DashboardComponent` SHALL leave its currently active date range unchanged AND SHALL NOT reload the
dashboard summary as a result of that selection.

## R24
WHEN the user activates a relative-date-preset pill or edits the custom date range directly,
`DashboardComponent` SHALL NOT clear or reset the quarter dropdown's current selection — the dropdown
and the presets SHALL operate as independent inputs to the active date range, with whichever the user
touched most recently determining the range actually queried.

## E — Visual design & build

## R25
The system SHALL style `QuarterSelectorComponent` and its Dashboard integration using only existing
design tokens from `src/styles.css` (no new hex colors), following the "Cuaderno de Asistencia" visual
language per the `frontend-design` skill.

## R26
The system SHALL leave `pnpm run build` exiting with status `0` and no new build warnings after this
feature's changes.
