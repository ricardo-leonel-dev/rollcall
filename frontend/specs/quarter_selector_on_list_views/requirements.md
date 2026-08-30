# Requirements — Mandatory quarter dropdown on Absences and Justifications list views

Scope: frontend-only (`asistencia-frontend`). Reuses the
`QuarterContextService` and `QuarterSelectorComponent` delivered by feature 5
(`quarter_selector_foundation`, done; see
`specs/quarter_selector_foundation/{requirements,design,tasks}.md` and its
implementation note `progress/impl_quarter_selector_foundation.md`) and wires
the existing `<app-quarter-selector />` into exactly **two** screens:

- **`src/app/features/absences/absences.component.ts`** — adds the selector
  to the page-level `.filter-bar` **next to** the existing "Curso"
  `mat-form-field` (as the first child of the bar that already hosts the course
  selector), used by all four `mat-tab` panels: Foto, Manual, Voz, Listado,
  Historial. The selector seeds the existing Listado `dateFrom`/`dateTo`
  pickers (no new page-level fields on this component).
- **`src/app/features/justifications/justifications.component.ts`** — adds
  the selector to the page-level `.filter-bar` **next to** the existing
  "Curso" `mat-form-field` (same first-child position), used by both tabs:
  Nueva justificación, Historial. Justifications has no date pickers on the
  page, so the selector drives two new shared fields
  (`selQuarterStart`/`selQuarterEnd`) consumed by every loader as
  `date_from`/`date_to`.

Nothing in this feature modifies `QuarterSelectorComponent`, `QuarterContextService`,
`QuarterService`, or the foundation feature's spec. The "Reuse, don't reimplement"
constraint is captured by R13 and discussed in `design.md`'s discarded alternatives.

Cross-references:

- `QuarterContextService`
  (`src/app/core/services/quarter-context.service.ts`) — provides the
  singleton selection state this feature only **reads** via
  `context.selectedId()`/`context.selected()` and **reacts to** via the
  `(quarterChange)` output of `<app-quarter-selector />`. The service's
  reactive reload on academic-year switch (R5 of the foundation) and its
  default-quarter computation (R6–R10) are inherited unchanged.
- `QuarterSelectorComponent`
  (`src/app/shared/components/quarter-selector/quarter-selector.component.ts`)
  — zero-input, OnPush, single `quarterChange: output<Quarter | null>` output
  (R12–R19 of the foundation; rendered empty/loading/wrong-year/empty/dropdown
  states all stay owned by this component).
- `AbsencesComponent` — already paginates its "Listado" panel via local
  `selCourse`/`selYear`/`dateFrom`/`dateTo`/`filterType`/`studentSearch`
  (lines around `loadAbsences()`/`clearFilters()`). The existing Listado
  `dateFrom`/`dateTo` pickers are the seed destination for the quarter
  dropdown — the pickers are still user-editable, and every loader reads from
  them. This feature does **not** add `selQuarterStart`/`selQuarterEnd` on
  Absences (the pickers serve that role). `loadVoiceLogs()` is invalidated
  the same way `confirmVoiceAbsence()` already invalidates it. The
  `photoDate` input (used only to set the context date for a photo upload)
  is **not** seeded by the quarter dropdown — it is a single-date input
  scoped to a different user action, not a query filter.
- `JustificationsComponent` — already paginates both tabs via
  `selCourse`/`selYear`; this feature adds the shared
  `selQuarterStart`/`selQuarterEnd` pair and threads them through
  `loadHistorial()` and `loadPendingStudents()` as `date_from`/`date_to`.
  This page has no date pickers, so the dropdown is the only date source.
- `AcademicYearContextService` — already injected by both components for
  `selected()?.id`. This feature reuses that existing read; it does **not**
  inject `QuarterContextService` itself anywhere except to read
  `selectedId()` in the page-level handler that derives
  `selQuarterStart`/`selQuarterEnd` from the chosen `Quarter` (a single
  `.find()` against `context.quarters()`, mirroring the foundation's
  `dashboard.component.ts#onQuarterChange` shape — see "Dashboard integration
  pattern" in `specs/quarter_selector_foundation/design.md`).
- `core/utils/date.util.ts#dateStringToDate` — already imported by both
  target components (Absences imports `dateToDateString`; Justifications
  imports nothing date-related today). Both new `onQuarterChange` handlers
  need `dateStringToDate`; Absences extends its existing import, Justifications
  adds it.
- `require_full_dates_on_quarters` (frontend feature, done) — narrowed the
  rationale for keeping the defensive partial-date layer in the foundation;
  the same reasoning applies here (see the "Partial-date no-op" note below).

## Note (user amendment, 2026-08-29 — defensive partial-date layer, inherited)

The user reviewed this spec's foundation and decided partial-date quarters
(`startDate`/`endDate` only one of which is set, or neither) should stop
being a normal state going forward — every quarter should always have both
dates. Backend enforcement of the same rule has shipped (see feature
`backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados`
in the `attendance_backend` project, and migration
`postgres/19_quarters_softdelete_legacy_null_dates.sql` which soft-deleted
legacy null-dated rows). The remaining real-world source is narrow:
`seedQuarters()` (`backend/src/services/quarter.service.ts`, called from
`academic-year.service.ts#create`) still inserts 3 rows per fresh AY with
`startDate: null, endDate: null` until the user fills them in via the
admin dialog.

This feature therefore mirrors the foundation's R23 contract on **both**
new screens: selecting a quarter without a full `startDate`+`endDate` pair
must be a silent no-op — no `date_from`/`date_to` mutation, no
`loadXxx()` call, no toast. The defensive layer is **not removable** for the same
reason it isn't on the Dashboard (see R8/R9/R11 of the foundation and its
2026-08-29 user-amendment note). Do not interpret the backend hardening as
authorization to skip the no-op guard.

## Note (user amendment, 2026-08-30 — seed-not-override model)

The user reviewed the initial draft of this spec (which modeled the quarter
dropdown as an OVERRIDE of the Listado date range when both were set) and
decided the model should instead be **SEED, not override**, mirroring the
existing export feature
(`src/app/features/student-report/excel-export-dialog.component.ts` and
`export-config-dialog.component.ts`). In that dialog, clicking a trimestre
pill writes the pill's dates to the `dateFrom`/`dateTo` pickers, but the user
can still edit the pickers manually afterwards. The user wants the exact same
UX on Absences and Justifications:

- The dropdown lives **next to the course selector** in the page-level
  `.filter-bar` (as the first child of the bar that already hosts "Curso") on
  both screens — not in a sidebar, not as a separate filter row. This
  positioning is what makes it act "globally" on every input that has a date
  on the page.
- Selecting a fully-dated quarter **writes** `quarter.startDate` and
  `quarter.endDate` to the page's existing date inputs (Absences: the
  Listado `dateFrom`/`dateTo` pickers; Justifications: the internal
  `selQuarterStart`/`selQuarterEnd` fields since the page has no pickers).
  The pickers / fields are still user-editable afterwards.
- Picking the **same** quarter currently selected is a no-op on the pickers
  (the user keeps whatever values they have, including any manual edits).
- Picking a **different** fully-dated quarter **re-seeds** the pickers to
  the new quarter's range, **overwriting** any manual edits the user made
  since the last quarter selection. This matches the export pill behavior
  — picking a new pill resets the dates.
- Selecting a partial-date quarter (R12 no-op) leaves the pickers untouched
  — no seed, no overwrite.
- When no quarter has been touched yet (initial render, or after
  `clearFilters()` on Absences), the pickers stay at whatever default the
  user had before — the dropdown's default does NOT pre-fill the pickers.
  This preserves the existing first-render behavior on both screens.
- The `photoDate` input on Absences is intentionally **not** seeded —
  it is a single-date input scoped to the photo upload flow, not a query
  filter.

Acceptance-criterion mapping (every bullet from the feature description is satisfied by at
least one `R<n>` below; every `R<n>` below cites the acceptance bullet it satisfies):

- A1: "Absences list view shows the quarter dropdown in its filter bar and scopes every panel
  (Foto / Manual / Voz / Listado / Historial) to the selected quarter's date range" →
  **R1, R2, R3, R4, R10**
- A2: "Justifications list view shows the quarter dropdown in its filter bar and scopes both
  tabs (Nueva justificación / Historial) to the selected quarter's date range" →
  **R5, R6, R7, R8, R9, R10**
- A3: "Selecting a partial-date quarter on either screen is a silent no-op (matches Dashboard's
  R23 contract from feature 5)" → **R12**
- A4: "The dropdown keeps the foundation's default-quarter behavior on both screens — no
  per-screen override of the singleton selection" → **R13**
- A5: "Existing per-screen filters (course on both; date range / type / student on Absences'
  Listado panel) keep working alongside the new quarter scope" → **R10, R11**
- A6: "`pnpm run build` exits 0 with no new warnings" → **R14**
- A7: "Manual smoke test against the running stack, mirroring feature 5's T15 structure" →
  **R15**

## A — Absences integration

## R1
The system SHALL render `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />`
inside `AbsencesComponent`'s page-level `.filter-bar`, immediately before the
existing "Curso" `mat-form-field` (i.e. as the **first child of the same bar
that hosts the course selector** — the dropdown sits **next to** the course
selector, not in a sidebar or separate row), and SHALL add
`QuarterSelectorComponent` to that component's `@Component.imports` array.

## R2
WHEN `AbsencesComponent.onQuarterChange(q)` receives a `Quarter` whose
`startDate` and `endDate` are both non-null AND `q.id` differs from the
currently-selected quarter (i.e. the user picked a **different** fully-dated
quarter), the system SHALL set `this.dateFrom = dateStringToDate(q.startDate)`
and `this.dateTo = dateStringToDate(q.endDate)` (writing directly to the same
`dateFrom`/`dateTo` `mat-datepicker` inputs bound to the existing Listado
sub-filter pickers — overwriting any manual edits the user made since the
last quarter selection), and SHALL call every data-reloading method the page
owns (`onFiltersChange()`, `loadTodayAbsences()`, `loadVoiceLogs()` — exactly
the set already invoked when the user changes the "Curso" filter, with
`loadVoiceLogs()` guarded by `voiceLogsLoaded` being flipped to `false` to
force a re-fetch, mirroring how `confirmVoiceAbsence()` already invalidates
it). IF the user picks the **same** quarter currently selected (no change),
the handler SHALL return without mutating `dateFrom`/`dateTo` and without
re-issuing the page's reloaders — the user keeps whatever values they have.

## R3
WHEN the Absences page initializes, the dropdown SHALL show
`QuarterContextService`'s `defaultQuarterId` (R6–R10 of the foundation) and
SHALL NOT pre-fill `dateFrom`/`dateTo` from that default — the existing
first-render data fetch (driven by `?course=`/`?student=`/`?dateFrom=`/
`?dateTo=` query params or the empty state) is preserved verbatim; only an
explicit user selection in the dropdown seeds the pickers. (When the
deep-link sets `dateFrom`/`dateTo` via query params, those values take
precedence over the quarter, mirroring the deep-link's pre-existing
behavior.)

## R4
WHEN the user changes the "Curso" `mat-select` on Absences, the system SHALL
preserve the current `dateFrom`/`dateTo` values (whether they came from the
quarter dropdown or were entered manually) — the quarter dropdown and the
course selector are independent inputs to the page, and the existing
`onFiltersChange()` flow already re-issues all per-panel requests when
`selCourse`/`selYear` change.

## B — Justifications integration

## R5
The system SHALL render `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />`
inside `JustificationsComponent`'s page-level `.filter-bar`, immediately before
the existing "Curso" `mat-form-field` (the dropdown sits **next to** the
course selector, as the first child of the same bar), and SHALL add
`QuarterSelectorComponent` to that component's `@Component.imports` array.

## R6
WHEN `JustificationsComponent.onQuarterChange(q)` receives a `Quarter` whose
`startDate` and `endDate` are both non-null AND `q.id` differs from the
currently-selected quarter, the system SHALL set
`this.selQuarterStart = dateStringToDate(q.startDate)` and
`this.selQuarterEnd = dateStringToDate(q.endDate)`, and SHALL call
`this.onCourseChange()` (the same single re-load entry point already invoked
when the user changes the "Curso" filter — which in turn calls
`loadHistorial()` + `loadPendingStudents()` in parallel). IF the user picks
the same quarter currently selected, the handler SHALL return without
mutating either field or calling `onCourseChange()`. Justifications has no
date pickers on the page, so the `selQuarterStart`/`selQuarterEnd` fields
are the only date source for the loaders; the user cannot manually edit
them.

## R7
WHEN the Justifications page initializes, the dropdown SHALL show
`QuarterContextService`'s `defaultQuarterId` (R6–R10 of the foundation) and
SHALL NOT auto-apply any quarter range — `JustificationsComponent.ngOnInit`'s
single first-render `loadHistorial()` call (or its `onCourseChange()` flow for
the `?course=` deep-link path) is preserved verbatim; only an explicit user
selection in the dropdown seeds the page.

## R8
WHEN the user changes the "Curso" `mat-select` on Justifications, the system
SHALL preserve the current `selQuarterStart`/`selQuarterEnd` values — the
quarter dropdown and the course selector are independent inputs to both
tabs' re-load calls.

## C — Seed model + scope plumbing

## R9 [A5]
`JustificationsComponent` SHALL add two new fields:
`selQuarterStart: Date | null` (initialized to `null`) and
`selQuarterEnd: Date | null` (initialized to `null`). Both fields are bound to
HTTP requests as `date_from=dateToDateString(selQuarterStart)` and
`date_to=dateToDateString(selQuarterEnd)` — appended to every per-panel
request the page already makes, only when both are non-null (the default
state — and the partial-date selection state per R12 — keeps the request
unfiltered, just like today's behavior). `AbsencesComponent` SHALL **not** add
these fields; the existing `dateFrom`/`dateTo` `mat-datepicker` inputs in
the Listado sub-filter row serve the same role for the loaders and are the
single source of truth on that page.

## R10 [A5]
`AbsencesComponent.loadAbsences()` SHALL continue to append
`date_from=${dateToDateString(this.dateFrom)}` and
`date_to=${dateToDateString(this.dateTo)}` to its query string (the existing
two `if (this.dateFrom)`/`if (this.dateTo)` lines stay as-is — they are
the seed destination, so no precedence / "scope wins" logic is needed; the
pickers ARE the source of truth). `AbsencesComponent.loadTodayAbsences()`
SHALL replace today's hardcoded single-day pair with
`dateToDateString(this.dateFrom)` / `dateToDateString(this.dateTo)` (the
quarter seed gives the user a meaningful single-day query when the picked
quarter is one day long, or a range query otherwise). The `/api/enrollments`
call in `onFiltersChange()` is left unchanged (it does not filter by date).
`JustificationsComponent.loadHistorial()` and
`JustificationsComponent.loadPendingStudents()` SHALL append
`date_from=${dateToDateString(this.selQuarterStart)}` and
`date_to=${dateToDateString(this.selQuarterEnd)}` to the query string when
both fields are non-null (and SHALL NOT append them when one or both are
null — no other date-range source exists on Justifications, so the
no-default state is unfiltered, like today). Backend support for `date_from`/`date_to` on `/api/justifications` is in
`attendance_backend` feature `backend_acepta_date_from_date_to_en_get_api_justifications`
(shipped 2026-08-30). The backend filters via
`EXISTS (SELECT 1 FROM justification_absences ja JOIN absences a ON a.id = ja.absence_id WHERE ja.justification_id = j.id AND a.deleted_at IS NULL AND a.date BETWEEN $N AND $M)`,
gated behind the presence of either param (no unconditional injection — see the backend's
round-1/round-2 fix for why the gate matters), returning HTTP 400 on malformed dates or
`date_from > date_to`. T10 smoke-confirms this against the live stack.

## R11 [A5]
The existing per-screen reset affordances SHALL keep working:
`AbsencesComponent.clearFilters()` SHALL continue to set `this.dateFrom = null`
and `this.dateTo = null` (its current behavior — the "Limpiar" button is local
to the Listado sub-filter's date/type/student range and does NOT reset the
page-level quarter dropdown; the user picks a different quarter — or the same
quarter in a way that re-seeds via a `?` reset path described below — to
re-seed if they want). On Justifications, the "Todos los cursos"
`mat-option` SHALL continue to reset `selCourse` to `null` without touching
`selQuarterStart`/`selQuarterEnd`.

## D — Partial-date no-op (defensive layer)

## R12 [A3]
IF `onQuarterChange(q)` is called on either `AbsencesComponent` or
`JustificationsComponent` with a `Quarter` whose `startDate` or `endDate` is
`null` (or `q` itself is `null`), THEN the system SHALL return immediately —
no picker mutation, no field mutation, no `loadXxx()` call, no toast. This
mirrors the Dashboard's R23 contract from the foundation and is the same
defensive layer the `require_full_dates_on_quarters` user amendment
(2026-08-29) keeps in place across the app.

## E — Default + visual continuity

## R13 [A4]
The dropdown on both screens SHALL be the **same** `QuarterContextService`
singleton the Dashboard uses — neither component injects `QuarterContextService`
directly into the template binding (that is owned by `QuarterSelectorComponent`
per foundation R14) and neither component calls `QuarterContextService.select(...)`
from anywhere except the no-op-or-apply bridge in its own `onQuarterChange`.
Switching the dropdown on the Dashboard to "Primer Trimestre" and then
navigating to Absences SHALL leave Absences' dropdown showing "Primer
Trimestre" with the same default-driven visible state (R18 of the foundation
guarantees the selected quarter persists across navigation; this feature
inherits that behavior unchanged).

## R14 [A6]
The system SHALL leave `pnpm run build` exiting with status `0` and SHALL
introduce no new build warnings attributable to the two files this feature
modifies (`absences.component.ts`, `justifications.component.ts`).

## F — Verification

## R15 [A7]
WHEN the implementation is complete, the system SHALL be verified by a manual
smoke test against the running stack (`docker compose up` at the monorepo
root, or confirm via `docker ps` it's already up per `docs/verification.md`),
covering at minimum: opening the Absences page and confirming (i) the
dropdown renders to the left of "Curso" with the foundation's computed
default already selected; (ii) selecting a **different** fully-dated quarter
WRITES that quarter's `startDate`/`endDate` to the existing Listado "Desde"/
"Hasta" pickers (verify by reading the visible date text in the pickers),
AND every panel's data refreshes to match the seeded range (the "Listado"
table, the "Manual" tab's `marked-today` badges, the "Voz" tab's "Hoy está
fuera…" hint unchanged); (iii) AFTER the seed, editing the "Desde" or "Hasta"
picker MANUALLY preserves the manual value (verify by changing "Hasta" to a
later date and seeing the Listado table narrow further); (iv) selecting a
**different** quarter again overwrites the manual edit (verify by selecting
"Segundo Trimestre" and seeing "Hasta" reset to the quarter's `endDate`);
(v) re-selecting the **same** quarter currently selected does NOT mutate the
pickers (verify by editing "Hasta" to a manual value, then opening the
dropdown and clicking the already-active quarter — "Hasta" stays at the
manual value); (vi) on the "Listado" panel, clicking "Limpiar" sets
`dateFrom`/`dateTo` to null but the quarter dropdown's selection is
unchanged — re-selecting the dropdown's current quarter (or picking a
different one) re-seeds the pickers afterward; (vii) opening the
Justifications page and confirming the dropdown appears pre-selected next to
the course selector, and selecting a quarter narrows both tabs' data to that
quarter's range (the `loadHistorial()` and `loadPendingStudents()` loaders
accept the seeded `date_from`/`date_to` even though there are no date
pickers on this page); (viii) on a fresh AY whose `seedQuarters()` rows
have null dates (created via the admin UI — `POST /api/academic-years`
against the Tia Blanquita test institution; see T10 for the exact cleanup
path), opening the Absences or Justifications page scoped to that AY
renders the dropdown with the foundation's "no usable period" fallback
state and selecting any of the partial-date quarters is a silent no-op
(R12); (ix) the dropdown is the same instance across Absences and
Justifications — selecting "Primer Trimestre" on one page and navigating
to the other leaves the second page's dropdown showing "Primer Trimestre"
(R13). The result SHALL be documented in
`progress/impl_quarter_selector_on_list_views.md`'s Traceability section,
mirroring feature 5's T15 structure
(`progress/impl_quarter_selector_foundation.md`).
