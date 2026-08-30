# Design — Shared quarter/period selector: context service + dropdown, wired into Dashboard

See `docs/architecture.md` (layers, signal-based state, `inject()` over constructor injection,
`OnPush`, inline templates/styles, `firstValueFrom` over `.subscribe()`, zoneless change detection) and
`docs/conventions.md` (naming, file structure, no comments unless they explain a non-obvious why) for
the baseline this design builds on. See `docs/specs.md` for the EARS/`R<n>`/`T<n>` contract this design
satisfies.

**Revision note (2026-08-29):** the backend feature
`get_api_quarters_accepts_optional_academic_year_id_filter` shipped, so `QuarterService.getAll()` now
accepts an optional `academicYearId` and `QuarterContextService` reacts to
`AcademicYearContextService.selectedId()` changing instead of assuming a single, fixed active year for
the whole session. See discarded alternative #5 for the rejection this supersedes.

## Files to touch

| File | Change | Requirements |
|---|---|---|
| `src/app/core/services/quarter.service.ts` | `getAll()` gains an optional `academicYearId?: number` parameter, forwarded as `?academic_year_id=` when provided; no-arg calls are byte-for-byte unchanged (still `GET /api/quarters` with no query string). | R1 |
| `src/app/core/services/quarter-context.service.ts` | **New.** `QuarterContextService` — loads quarters for the currently selected academic year, reactively reloads on year switch, computes the default, mirrors `AcademicYearContextService`'s shape. | R1–R11 |
| `src/app/shared/components/quarter-selector/quarter-selector.component.ts` | **New.** `QuarterSelectorComponent` — reusable dropdown + empty/loading states. | R12–R19, R25 |
| `src/app/shared/layout/layout.component.ts` | Add `await QuarterContextService.load()` to `ngOnInit`, after `academicYearContext.load()` resolves. | R2 |
| `src/app/features/dashboard/dashboard.component.ts` | Import and render `QuarterSelectorComponent` in the filter area; add `onQuarterChange()` to bridge the dropdown's selection into the existing `computeDateRange()`/`loadSummary()` flow. | R20–R24 |

No changes to `src/app/core/models/index.ts` — the existing `Quarter` interface already carries every
field this feature needs (`id`, `academicYearId`, `name`, `sequenceNumber`, `startDate`, `endDate`,
`isActive`).

### `QuarterService.getAll()` change

```ts
// src/app/core/services/quarter.service.ts
getAll(academicYearId?: number): Promise<Quarter[]> {
  const params = academicYearId !== undefined ? { academic_year_id: String(academicYearId) } : {};
  return firstValueFrom(this.http.get<Quarter[]>('/api/quarters', { params }));
}
```

`AdminComponent` is the only other current caller of `QuarterService.getAll()`
(`admin.component.ts`'s `loadAll()`/`openQuartersDialog()`/`saveAcademicYear()`, from the
`flexible_quarter_admin_ui` feature) — it keeps calling `getAll()` with zero arguments, so its
requests are unaffected (`params: {}` produces the exact same `GET /api/quarters` with no query
string as today). This feature does not change `AdminComponent`'s own year-scoping behavior; that's
out of scope here.

## `QuarterContextService`

```ts
// src/app/core/services/quarter-context.service.ts
@Injectable({ providedIn: 'root' })
export class QuarterContextService {
  private readonly quarterService = inject(QuarterService);
  private readonly academicYearContext = inject(AcademicYearContextService);

  private readonly _quarters = signal<Quarter[]>([]);
  private readonly _selectedId = signal<number | null>(null);
  private readonly _defaultQuarterId = signal<number | null>(null);
  private readonly _loaded = signal(false);
  private readonly _defaultWasFallback = signal(false); // true iff R8/R9 fired instead of R6/R7
  private readonly _fallbackDirection = signal<'past' | 'future' | null>(null);

  readonly quarters = this._quarters.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly defaultQuarterId = this._defaultQuarterId.asReadonly();
  readonly defaultWasFallback = this._defaultWasFallback.asReadonly();
  readonly fallbackDirection = this._fallbackDirection.asReadonly();

  readonly selected = computed(
    () => this._quarters().find(q => q.id === this._selectedId()) ?? null
  );
  readonly isViewingActiveYear = computed(
    () => this.academicYearContext.selected()?.isActive === true
  );

  async load(): Promise<void> {
    const list = await this.quarterService.getAll();
    const sorted = [...list].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    this._quarters.set(sorted);
    const { id, isFallback, direction } = computeDefaultQuarter(sorted, dateToDateString(new Date()));
    this._defaultQuarterId.set(id);
    this._defaultWasFallback.set(isFallback);
    this._fallbackDirection.set(direction);
    this._selectedId.set(id);
    this._loaded.set(true);
  }

  select(id: number | null): void {
    this._selectedId.set(id);
  }
}
```

`selectedId` is initialized to the computed default in the same `load()` call (R21 relies on this —
the dropdown must already show the right value the instant it renders, with no extra round trip).
`select(null)` is a valid call (e.g. a future consumer clearing the selection); `QuarterSelectorComponent`
never calls it with `null` on its own in this feature, since removing the "no selection" option from the
`mat-select` keeps R21's contract simple, but the service's own contract stays permissive for feature 6.

### Default-quarter algorithm (`computeDefaultQuarter`, pure function, colocated in the same file)

```ts
function computeDefaultQuarter(
  quarters: Quarter[],
  today: string
): { id: number | null; isFallback: boolean; direction: 'past' | 'future' | null } {
  const dated = quarters.filter(q => q.startDate && q.endDate) as (Quarter & { startDate: string; endDate: string })[];

  const containing = dated.filter(q => q.startDate <= today && today <= q.endDate);
  if (containing.length > 0) {
    const winner = containing.reduce((a, b) => (a.sequenceNumber <= b.sequenceNumber ? a : b));
    return { id: winner.id, isFallback: false, direction: null };
  }

  const past = dated.filter(q => q.endDate < today);
  if (past.length > 0) {
    const winner = past.reduce((a, b) =>
      a.endDate !== b.endDate ? (a.endDate > b.endDate ? a : b) : (a.sequenceNumber <= b.sequenceNumber ? a : b)
    );
    return { id: winner.id, isFallback: true, direction: 'past' };
  }

  const future = dated.filter(q => q.startDate > today);
  if (future.length > 0) {
    const winner = future.reduce((a, b) =>
      a.startDate !== b.startDate ? (a.startDate < b.startDate ? a : b) : (a.sequenceNumber <= b.sequenceNumber ? a : b)
    );
    return { id: winner.id, isFallback: true, direction: 'future' };
  }

  return { id: null, isFallback: false, direction: null };
}
```

Traceability inside the function: `containing.length > 0` branch is R6/R7 (the `reduce` tie-break is
R7); the `past` branch is R8; the `future` branch is R9; the final `return { id: null, ... }` is R10;
filtering to `dated` up front is R11. All comparisons are plain string comparisons — ISO `YYYY-MM-DD`
strings compare correctly lexicographically, so no `Date` parsing/timezone handling is needed (same
assumption `AdminComponent`'s existing overlap validation and this service's backend counterpart
already rely on).

### Why bootstrap in `LayoutComponent`, not lazily in `DashboardComponent` (R2)

`AcademicYearContextService.load()` already runs once in `LayoutComponent.ngOnInit()`, gated behind
`institutionReady`, before any routed component mounts. `QuarterContextService.load()` joins that same
`Promise.all([...])` (institution → academic year & quarter loads run together, since neither depends
on the other's *result*, only on the institution header already being attached). This means:

- Every future consumer (feature 6's list views) gets the data for free, already loaded, without
  re-implementing a bootstrap call.
- `QuarterSelectorComponent` never needs an `ngOnInit` of its own to trigger the load — it only reads
  already-populated signals, keeping it a dumb, reusable presentation component.

## `QuarterSelectorComponent`

```ts
// src/app/shared/components/quarter-selector/quarter-selector.component.ts
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSelectModule, MatFormFieldModule, FormsModule],
  selector: 'app-quarter-selector',
  styles: [ /* see Visual & UX direction */ ],
  template: `
    @if (!context.loaded()) {
      <div class="quarter-selector-placeholder">Cargando períodos…</div>
    } @else if (!context.isViewingActiveYear()) {
      <div class="quarter-selector-note">El selector de períodos solo está disponible para el año lectivo activo.</div>
    } @else if (context.quarters().length === 0) {
      <div class="quarter-selector-note">No hay períodos configurados para este año lectivo.</div>
    } @else {
      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px">
        <mat-label>Período</mat-label>
        <mat-select [ngModel]="context.selectedId()" (ngModelChange)="onSelect($event)">
          @for (q of context.quarters(); track q.id) {
            <mat-option [value]="q.id">{{ q.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (!hasAnyDatedQuarter()) {
        <span class="quarter-selector-note">Los períodos no tienen fechas configuradas.</span>
      } @else if (context.defaultWasFallback() && context.selectedId() === context.defaultQuarterId()) {
        <span class="quarter-selector-note">
          Hoy está fuera de los períodos definidos — mostrando
          {{ context.fallbackDirection() === 'past' ? 'el período más reciente' : 'el próximo período' }}.
        </span>
      }
    }
  `,
})
export class QuarterSelectorComponent {
  readonly context = inject(QuarterContextService);
  readonly quarterChange = output<Quarter | null>();

  hasAnyDatedQuarter(): boolean {
    return this.context.quarters().some(q => q.startDate && q.endDate);
  }

  onSelect(id: number): void {
    this.context.select(id);
    this.quarterChange.emit(this.context.quarters().find(q => q.id === id) ?? null);
  }
}
```

No `@Input()` is declared at all (R14) — the component's only configuration surface is
`QuarterContextService` itself (a singleton, so every instance of `QuarterSelectorComponent` on the
page stays in sync automatically) plus the `quarterChange` output for a host that wants to *react* to a
change without re-reading the service on every tick. This is deliberately the same shape as the
`year-switcher`/`institution-switcher` `mat-select`s already inlined in `layout.component.ts` (inject
the context service directly, bind `[ngModel]`/`(ngModelChange)` to it) — just promoted into its own
reusable component because, unlike the year/institution switchers (each used in exactly one place, the
topbar), this dropdown is explicitly slated for reuse across several feature pages (feature 6).

### Empty/guard state precedence (R15–R18)

Checked top-to-bottom in the template, first match wins: **(1) loading → (2) wrong year → (3) zero
quarters → (4) dropdown (with the dated/fallback notes as secondary, non-blocking annotations)**. A
component can only be in one of these states at a time; there's no need for a computed "state enum"
given how small this list is — the `@if`/`@else if` chain *is* the state machine, kept inside the
template for exactly the same reason `DashboardComponent`'s own `@if (loading()) { … } @else if
(summary()) { … }` chain does it that way.

## Dashboard integration

```ts
// dashboard.component.ts — additions only, existing code otherwise unchanged
import { QuarterSelectorComponent } from '../../shared/components/quarter-selector/quarter-selector.component';
import { Quarter } from '../../core/models/index'; // already imports from this file

@Component({
  imports: [/* existing */, QuarterSelectorComponent],
  // template: add <app-quarter-selector (quarterChange)="onQuarterChange($event)" />
  //           inside the existing `.filter-bar` that already holds the period-pill row
})
export class DashboardComponent {
  // ...existing fields unchanged...

  onQuarterChange(q: Quarter | null): void {
    if (!q || !q.startDate || !q.endDate) return;       // R23 — no usable range, no-op
    this.selectedPeriod = 'custom';
    this.customFrom = dateStringToDate(q.startDate);
    this.customTo = dateStringToDate(q.endDate);
    this.showCustomPanel = false;                        // the quarter drives the range; no need to
                                                           // expose the raw date pickers for this path
    this.loadSummary();                                   // R22
  }
}
```

`selectPeriod()` and `onCustomDateChange()` — the two existing entry points that change
`selectedPeriod`/`customFrom`/`customTo` today — are **not modified**: they already only touch their
own fields and never reach into `QuarterContextService`, so R24 ("selecting a pill doesn't clear the
quarter dropdown's selection") holds without any new code — it's the *absence* of a reset call that
satisfies R24, not an added guard. The quarter dropdown's own visible selection is entirely owned by
`QuarterContextService.selectedId`, independent of `DashboardComponent.selectedPeriod`; the two are
bridged in exactly one direction (dropdown → date range, via `onQuarterChange`), never the other way
— clicking "Últimos 7 días" never fires `QuarterContextService.select(...)`. This is what R24 means by
"independent, last-touched-wins": the *date range actually queried* follows whichever control the user
touched most recently, while the *dropdown's displayed selection* is unaffected by pill clicks (it
still shows the last quarter the user picked, or the computed default, until the user picks a different
quarter — matching how a real "which period am I looking at" indicator should behave, as opposed to
resetting to a placeholder every time an unrelated control fires).

On `ngOnInit`, no code is added to auto-apply the quarter's range — R21 only requires the *dropdown* to
show the right default value, not for the chart to auto-scope to it. See "Discarded alternatives" #1 for
why.

## Visual & UX direction (R25)

Subject, audience, job:

- **Subject.** The same school administrator/rector/teacher already using the Dashboard's course
  filter and relative-date pills to answer "how are we doing" questions — the quarter dropdown is one
  more way to scope that same question ("how did *this trimester* go"), not a new mental model.
- **Audience.** Same Spanish-speaking staff users as every other screen in the app.
- **Job.** Pick a configured period by name, glance at whether it's the one currently in progress, and
  fall back gracefully (with an explicit, readable note) when the institution's calendar data can't
  answer that automatically.

This extends the existing "Cuaderno de Asistencia" warm-paper/ledger palette already used throughout
`dashboard.component.ts`'s `.filter-bar` and `.period-pill` — no parallel visual system, no new colors.

### Token plan

| Decision | Token / source |
|---|---|
| Dropdown chrome | Angular Material `mat-form-field appearance="outline"`, same as the existing "Curso" selector immediately above it in the filter bar — visual consistency with the control it sits next to. |
| Guard/empty/loading text (`.quarter-selector-note`, `.quarter-selector-placeholder`) | `color: var(--muted-strong)`, Nunito 400, 12px — same treatment as `.stat-label` and the existing `empty-state` text elsewhere in the app. |
| Fallback-default note | Same `.quarter-selector-note` styling — **not** a warning color; a fallback default is expected, normal behavior (R8/R9), not an error state, so it must not borrow the `alert-bar`'s red/amber treatment already reserved for the 5+-absences alert on this same page. |
| Radius | `var(--radius-sm)` on any custom-styled note container (Material's outline field keeps its own default radius, already themed globally via `--mat-form-field-outlined-container-shape` in `src/styles.css`). |

### Layout

- Placed as the **first item** inside the existing `.filter-bar` that currently only holds the "Curso"
  `mat-form-field`, to the left of it — reads left-to-right as "which period, then which course",
  matching how a user narrates the question out loud ("cómo estuvo el primer trimestre, en tal curso").
  Width `200px` (slightly narrower than the 220px "Curso" field, since period names are shorter than
  the longest course names).
- The relative-date-preset pill row stays exactly where it is today, on its own line below the
  `mat-form-field` row — this feature does not restructure that row, only adds the new field to the row
  above it.
- Guard/empty/loading states render as a single inline text node in place of the `mat-form-field`
  (same width envelope, `display: inline-flex; align-items: center;`), so the filter bar's height
  doesn't visibly jump between states.
- The fallback-default note and the "no dates configured" note render as a small `<span>` immediately
  to the right of the `mat-form-field`, `margin-left: 8px`, so they read as an annotation on the
  dropdown rather than a separate alert block.

### Motion

None beyond what Angular Material's `mat-select` already provides out of the box (its own open/close
transition) — this is a low-drama, informational control; no motion budget is spent here, consistent
with `docs/architecture.md`'s existing restraint on `dashboard.component.ts` (the only intentional
motion already on this page is `.stat-card:hover`'s lift, unrelated to this feature).

### Writing

- Label: "Período" (matches "Curso" label style — one word, sentence case).
- Empty state: "No hay períodos configurados para este año lectivo." (mirrors
  `flexible_quarter_admin_ui`'s "Sin períodos configurados." wording family, adapted to a full sentence
  since this isn't an inline chip).
- Wrong-year guard: "El selector de períodos solo está disponible para el año lectivo activo."
- No-dates note: "Los períodos no tienen fechas configuradas."
- Fallback note: "Hoy está fuera de los períodos definidos — mostrando el período más reciente." /
  "…mostrando el próximo período." (direction-dependent, per R19).
- Loading: "Cargando períodos…"

## Discarded alternatives

1. **Auto-apply the default quarter's date range to the Dashboard's chart data on load, instead of
   leaving `selectedPeriod = 'full'` untouched.** Rejected: this would silently change the Dashboard's
   long-standing landing view (currently "año completo") to "current trimester" for every institution
   the moment this feature ships, hiding data users are used to seeing by default, with no opt-in. R21
   only requires the *dropdown's displayed value* to default correctly — actually re-scoping the chart
   is a one-click action the user takes deliberately (R22 fires only `onQuarterChange`, which only runs
   on a real user interaction with the `mat-select`, never programmatically during init).

2. **Make `QuarterSelectorComponent` a fully "dumb" `@Input() quarters: Quarter[]` /
   `@Input() selectedId: number | null` / `@Output() selectedIdChange` component, with the host
   responsible for injecting `QuarterContextService` itself and passing the data down.** Rejected:
   every consumer of this component (this feature's Dashboard, and feature 6's future list views) wants
   the *same* shared selection, not a per-instance one — mirroring the year/institution switcher
   pattern (inject directly) avoids every host having to re-wire the same three bindings, and keeps
   multiple instances of the selector on the page (unlikely today, but not precluded) trivially in
   sync. The component still exposes `quarterChange` for a host that needs to *react*, so composability
   isn't lost — only the redundant plumbing is.

3. **Treat a quarter with only one of `startDate`/`endDate` set as "open-ended" and let it win the
   default computation (e.g., a quarter with only `startDate` set is "current" for every day from
   `startDate` onward, forever).** Rejected: an open-ended range would silently swallow every future
   date once its `startDate` has passed, including dates that rightfully belong to a *later*,
   fully-dated quarter if that later quarter's own dates haven't been entered yet — this is exactly the
   kind of "confident wrong default" the feature's acceptance criteria (A4) explicitly wants to avoid
   surfacing silently. Partial-date quarters stay manually selectable (R11) but never win the automatic
   default.

   **Update (user amendment, 2026-08-29):** the user has separately decided partial-date quarters
   shouldn't be a normal state at all going forward — see `require_full_dates_on_quarters` (new
   frontend feature, not yet implemented) which will make both dates mandatory in the admin
   dialog. Until that ships (and until/unless a backend validation companion exists), this
   feature's R8–R11/R15/R16/R19 handling stays in place as a defensive fallback for legacy or
   otherwise-incomplete data — it is not being removed by that decision, just demoted from
   "expected case" to "graceful degradation."

   **Update (post-backend-validation, 2026-08-29):** the proposed backend validation companion
   has shipped as feature
   `backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados` in the
   `attendance_backend` project, narrowing the rationale for keeping the defensive layer
   (R8–R11/R15/R16/R19, plus R23 on the Dashboard side):

   - `POST /api/quarters` and `PUT /api/quarters/:id` now reject partial-date bodies at both the
     controller (`backend/src/controllers/quarter.controller.ts`) and the service layer's new
     `assertValidDates(range)` helper (`backend/src/services/quarter.service.ts`), with HTTP 400
     and the exact message `"El período debe tener fecha de inicio y fecha de fin."`.
   - Migration `postgres/19_quarters_softdelete_legacy_null_dates.sql` soft-deleted every legacy
     null-dated row (`deleted_at = NOW()`, `is_active = false`), so historical partial-date
     quarters are no longer reachable through `GET /api/quarters` — the existing server-side
     soft-delete filter excludes them, and the selector's input side inherits that exclusion.
   - The only remaining real-world source of partial-date quarters is now `seedQuarters()` in
     `backend/src/services/quarter.service.ts`, called from `academic-year.service.ts#create`
     on every newly created academic year, which still inserts 3 rows with
     `startDate: null, endDate: null` (identifiable as
     `isActive && sequenceNumber in {1, 2, 3} && !startDate && !endDate`). The user can repair
     each seeded row with a single `PUT` carrying both dates; live-verified by the user.

   The defensive layer therefore stays in place as a safety net for the `seedQuarters()` output
   case only — so the selector degrades cleanly (R15 empty list, R10/R11 null default, R16/R19
   inline notes, R23 dashboard no-op) if a user opens the year admin screen / period dialog for
   a freshly created AY before filling in the dates. Do not interpret this update as
   authorization to remove the layer: the user amendment above still stands; only the *reason*
   it stays has narrowed from "backend permits + legacy data exists" to
   "`seedQuarters()` for new AYs while the user is mid-edit."

4. **Fall back to the *closest upcoming* quarter before the *closest past* one when today falls in a
   gap.** Rejected: this project's Dashboard exists to show attendance data that already happened,
   and an upcoming, not-yet-started quarter has zero recorded absences by definition — defaulting to it
   would land the user on a guaranteed-empty view. Defaulting to the most recently ended quarter shows
   real data immediately; the "no past quarter exists yet" case (R9) only applies at the very start of
   an academic year, before any quarter has ended, where there is no better option anyway.

5. **Have `QuarterSelectorComponent` accept an `@Input() academicYearId` to let a host request a
   specific (non-active) year's quarters.** Rejected for this feature: the backend endpoint
   (`GET /api/quarters`) has no way to honor such a parameter at all — it is hardcoded server-side to
   the institution's active year (see the cross-reference note in `requirements.md`). Adding the input
   now would create a prop that silently does nothing, which is worse than not having it; R18's
   explicit guard message is the honest way to handle a mismatched year today. If a future backend
   feature adds year-scoped quarter lookup, this input can be added then, backed by real data.

   **Update (revisited, 2026-08-29):** the referenced backend feature
   `get_api_quarters_accepts_optional_academic_year_id_filter` has since shipped in the
   `attendance_backend` project. The follow-up is folded into the same spec rather than a
   separate `quarter_selector_foundation`-v2 feature: see the Revision note at the top of this
   `design.md` and the `QuarterService.getAll(academicYearId?: number)` change in the "Files to
   touch" table below. `QuarterContextService` now reacts to
   `AcademicYearContextService.selectedId()` changes (R5) and the year-filter route in this
   discarded alternative is the path actually taken — R18's original "only available for the
   active year" guard message has been retired in favor of real year-scoped behavior.
