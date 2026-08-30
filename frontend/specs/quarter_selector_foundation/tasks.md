# Tasks — Shared quarter/period selector: context service + dropdown, wired into Dashboard

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists the
file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition. The
implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]` without a
documented, reviewer-accepted justification in `progress/impl_<feature>.md`.

- [x] T1 (R1, R3) Create `src/app/core/services/quarter-context.service.ts` with `@Injectable({
      providedIn: 'root' })` class `QuarterContextService`, injecting `QuarterService` via `inject()`.
      Add private `_quarters = signal<Quarter[]>([])` and `_loaded = signal(false)`, public
      `quarters = this._quarters.asReadonly()` and `loaded = this._loaded.asReadonly()`, and an
      `async load(): Promise<void>` that calls `this.quarterService.getAll()`, sorts the result by
      `sequenceNumber` ascending into a new array (`[...list].sort(...)`, never mutating the array
      `getAll()` returned), sets `_quarters`, and sets `_loaded` to `true`. Done: a temporary console
      call (removed before T15) confirms `quarters()` returns the backend's list sorted ascending by
      `sequenceNumber` after `await load()`.

- [x] T2 (R4) In the same file, add `private _selectedId = signal<number | null>(null)`, public
      `selectedId = this._selectedId.asReadonly()`, `selected = computed(() => this._quarters().find(q
      => q.id === this._selectedId()) ?? null)`, and `select(id: number | null): void { this._selectedId.set(id);
      }` — same shape as `AcademicYearContextService`. Done: `selected()` returns the matching
      `Quarter` object after `select(id)` is called with an id present in `quarters()`, and `null` when
      called with an id not present.

- [x] T3 (R5) In the same file, inject `AcademicYearContextService` and add `readonly
      isViewingActiveYear = computed(() => this.academicYearContext.selected()?.isActive === true)`.
      Done: with a mocked/manual `AcademicYearContextService.selected()` returning `{ isActive: false,
      ... }`, `isViewingActiveYear()` returns `false`; returning `{ isActive: true, ... }` makes it
      `true`.

- [x] T4 (R6, R7, R8, R9, R10, R11) In the same file, add a module-level pure function
      `computeDefaultQuarter(quarters: Quarter[], today: string): { id: number | null; isFallback:
      boolean; direction: 'past' | 'future' | null }` implementing exactly the algorithm in
      `design.md`'s "Default-quarter algorithm" section (filter to fully-dated quarters; exact
      containment match with lowest-`sequenceNumber` tie-break; else closest-past by largest `endDate`
      less than `today`; else closest-future by smallest `startDate` greater than `today`; else
      `{ id: null, isFallback: false, direction: null }`). Add private `_defaultQuarterId =
      signal<number | null>(null)`, `_defaultWasFallback = signal(false)`, `_fallbackDirection =
      signal<'past' | 'future' | null>(null)` plus their public `readonly` exposures, and call
      `computeDefaultQuarter` from inside `load()` (after sorting, before setting `_loaded`), using
      `dateToDateString(new Date())` as `today`, storing the result into those three signals and also
      calling `this._selectedId.set(result.id)` so the dropdown's initial value is already correct.
      Done: five manual invocations of `computeDefaultQuarter` with hand-built `Quarter[]` fixtures
      cover, respectively — (i) a single quarter containing today → exact match, `isFallback: false`;
      (ii) two overlapping quarters both containing today → lowest `sequenceNumber` wins; (iii) today
      between two fully-dated quarters (a gap) → the earlier one wins (`direction: 'past'`); (iv) today
      before the first fully-dated quarter with no past quarter available → the earliest one wins
      (`direction: 'future'`); (v) every quarter has only one of `startDate`/`endDate` set → `{ id:
      null, isFallback: false, direction: null }`. Record the 5 fixtures + results verbatim in
      `progress/impl_quarter_selector_foundation.md`.

      Note (rationale update, 2026-08-29): partial-date quarters in production are now narrow —
      backend rejects them with HTTP 400 and the migration soft-deleted legacy null-dated rows.
      Fixture (v) covers the residual case (only `seedQuarters()` output for freshly created
      AYs). The exclusion filter is **not** removable; see `requirements.md`'s
      "Update (post-backend-validation, 2026-08-29)" for the current rationale.

- [x] T5 (R2) In `src/app/shared/layout/layout.component.ts`, inject `QuarterContextService` and add
      `await this.quarterContext.load()` to the same `Promise.all([...])` (or sequential
      `await`/`await` pair, matching the file's existing style) that already resolves
      `academicYearContext.load()` in `ngOnInit`, before `institutionReady.set(true)`. Done: opening
      any authenticated route triggers a `GET /api/quarters` network call before the routed component's
      own `ngOnInit` fires (verified via the Network tab's request-order/waterfall).

- [x] T6 (R12, R14) Create `src/app/shared/components/quarter-selector/quarter-selector.component.ts`
      — standalone, `OnPush`, selector `app-quarter-selector`, `imports: [MatSelectModule,
      MatFormFieldModule, FormsModule]`, injecting `QuarterContextService` as a public readonly field
      named `context`. No `@Input()` of any kind. Template renders a `mat-form-field
      appearance="outline"` containing a `mat-select` bound `[ngModel]="context.selectedId()"` and
      iterating `@for (q of context.quarters(); track q.id)` rendering `<mat-option [value]="q.id">{{
      q.name }}</mat-option>`. Done: dropping `<app-quarter-selector />` into a throwaway host template
      with `QuarterContextService.quarters()` pre-populated (3 fixture quarters) renders 3 options in
      `sequenceNumber` order with zero bindings passed to the tag.

- [x] T7 (R13) In the same file, add `readonly quarterChange = output<Quarter | null>()` and an
      `onSelect(id: number): void` method bound to `(ngModelChange)` that calls
      `this.context.select(id)` then `this.quarterChange.emit(this.context.quarters().find(q => q.id
      === id) ?? null)`. Done: selecting a different option in the rendered dropdown both updates
      `QuarterContextService.selectedId()` to the new id and fires one `quarterChange` event carrying
      the matching `Quarter` object.

- [x] T8 (R15, R17, R18) In the same file, wrap the `mat-form-field` from T6 in the `@if`/`@else if`
      chain from `design.md`'s "Empty/guard state precedence" section, in this exact order: (1)
      `!context.loaded()` → render `<div class="quarter-selector-placeholder">Cargando períodos…</div>`;
      (2) `!context.isViewingActiveYear()` → render `<div class="quarter-selector-note">El selector de
      períodos solo está disponible para el año lectivo activo.</div>`; (3) `context.quarters().length
      === 0` → render `<div class="quarter-selector-note">No hay períodos configurados para este año
      lectivo.</div>`; (4) `@else` → the T6/T7 dropdown. Done: toggling each of the three guard
      conditions independently (via manual signal manipulation in a throwaway host) renders exactly the
      corresponding message and no dropdown; with all three conditions false, the dropdown renders.

- [x] T9 (R16, R19) In the same file, add a `hasAnyDatedQuarter(): boolean` method returning
      `this.context.quarters().some(q => q.startDate && q.endDate)`, and inside the dropdown branch
      (state 4 from T8) add: `@if (!hasAnyDatedQuarter())` → `<span class="quarter-selector-note">Los
      períodos no tienen fechas configuradas.</span>`; `@else if (context.defaultWasFallback() &&
      context.selectedId() === context.defaultQuarterId())` → `<span class="quarter-selector-note">Hoy
      está fuera de los períodos definidos — mostrando {{ context.fallbackDirection() === 'past' ? 'el
      período más reciente' : 'el próximo período' }}.</span>`. Done: with fixtures where no quarter has
      both dates, the "no tienen fechas" note renders; with a fixture that resolved via the
      closest-past fallback, the "período más reciente" note renders while the dropdown still shows the
      selected option; selecting a *different*, non-default quarter manually removes the fallback note
      (the `context.selectedId() === context.defaultQuarterId()` guard stops applying).

- [x] T10 (R25) In the same file, add the component's `styles: [...]` block per `design.md`'s "Visual &
      UX direction": `.quarter-selector-placeholder, .quarter-selector-note { color:
      var(--muted-strong); font-family: 'Nunito', sans-serif; font-size: 12px; display: inline-flex;
      align-items: center; }` plus `margin-left: 8px` on the note variant that sits beside the dropdown
      (T9's two notes) — split into two classes if needed to keep the guard-state notes (T8, full-width,
      no margin) visually distinct from the beside-dropdown annotations (T9, `margin-left: 8px`). Done:
      `grep -nE "#[0-9a-fA-F]{3,8}"` on the file's `styles: [\`...\`]` literal returns no matches (every
      color is a `var(--*)` reference).

- [x] T11 (R20, R21) In `src/app/features/dashboard/dashboard.component.ts`, import
      `QuarterSelectorComponent` from `../../shared/components/quarter-selector/quarter-selector.component`,
      add it to the `@Component.imports` array, and place `<app-quarter-selector
      (quarterChange)="onQuarterChange($event)" />` as the first child inside the existing
      `.filter-bar` div that currently only contains the "Curso" `mat-form-field`, immediately before
      that field. Done: loading the Dashboard renders the period dropdown to the left of the course
      selector, pre-selected to `QuarterContextService`'s computed default; `selectedPeriod` remains
      `'full'` and no extra `GET /api/dashboard/summary` call fires beyond the one `ngOnInit` already
      issues (confirm via Network tab request count before/after this change).

- [x] T12 (R22, R23) In the same file, import `Quarter` (already imported from `core/models/index` —
      extend the existing import) and `dateStringToDate` from `../../shared/utils/date.util` (extend
      the existing `date.util` import), then add `onQuarterChange(q: Quarter | null): void` that
      returns immediately (no-op) if `!q || !q.startDate || !q.endDate`; otherwise sets `this.selectedPeriod
      = 'custom'`, `this.customFrom = dateStringToDate(q.startDate)`, `this.customTo =
      dateStringToDate(q.endDate)`, `this.showCustomPanel = false`, and calls `this.loadSummary()`.
      Done: selecting a fully-dated quarter in the dropdown updates the "Inasistencias — {{
      periodLabel() }}" chart header to that quarter's custom date range and fires exactly one new
      `GET /api/dashboard/summary` call with `date_from`/`date_to` matching the quarter's dates;
      selecting a quarter with a missing date leaves the previous range and chart data unchanged and
      fires no new HTTP call.

- [x] T13 (R24) Confirm (no code change expected) that `selectPeriod()` and `onCustomDateChange()` in
      the same file do not call `QuarterContextService.select(...)` or otherwise touch
      `QuarterSelectorComponent`'s state — grep the file for `quarterContext`/`QuarterContextService`
      outside of `onQuarterChange` and the new import/template binding to confirm no such call was
      added. If either method is found to reset the quarter selection, remove that reset — the pills
      and the dropdown must stay independent per R24. Done: clicking a relative-date pill after
      selecting a quarter changes the chart's date range but the quarter dropdown still visibly shows
      the previously selected quarter (not reset to a placeholder or to the default).

- [x] T14 (R26) Run `pnpm run build` and `./init.sh`. Done: `pnpm run build` exits `0` with no new
      warnings attributable to the 4 files touched/added by this feature (`quarter-context.service.ts`,
      `quarter-selector.component.ts`, `layout.component.ts`, `dashboard.component.ts`); `./init.sh`
      ends with `[OK] Environment ready` (the pre-existing `[WARN]`s for empty `verify_command` and
      unset `SUPABASE_URL` are unchanged from baseline).

- [x] T15 (R2, R6–R11, R15–R19, R20–R24) Run the manual smoke test described in `docs/verification.md`
      Level 3 (and Level 4 if the visual diff is non-trivial) against a running stack (`docker compose
      up --build` at the monorepo root, or confirm via `docker ps` that it's already up per
      `docs/verification.md`'s note about not assuming otherwise). Cover at minimum, against the real
      "Tia Blanquita" (or equivalent) test institution's active academic year: (i) with 3 quarters
      configured and today inside one of them, confirm the dropdown defaults to that quarter with no
      fallback note; (ii) manually adjust a quarter's dates via the `flexible_quarter_admin_ui` dialog
      so today falls in a gap, reload, and confirm the fallback note appears with the correct direction
      wording; (iii) confirm switching to a non-active academic year via the topbar year-switcher shows
      R18's guard message instead of a dropdown; (iv) confirm selecting a fully-dated quarter updates
      the Dashboard's chart data and header label; (v) confirm clicking a relative-date pill afterward
      changes the chart but leaves the quarter dropdown's selection visible and unchanged; (vi) for an
      institution/year with zero quarters configured, confirm R15's empty message renders. Restore any
      quarter dates changed during step (ii) back to their original values before ending the session.
      Capture the observations in `progress/impl_quarter_selector_foundation.md`'s Traceability section.
      Done: every row of the traceability table references a concrete `R<n>` and the table covers at
      least one observation per `R1`–`R26`.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1 |
| R2 | T5, T15 |
| R3 | T1 |
| R4 | T2 |
| R5 | T3 |
| R6, R7 | T4 |
| R8 | T4 |
| R9 | T4 |
| R10 | T4 |
| R11 | T4 |
| R12 | T6 |
| R13 | T7 |
| R14 | T6 |
| R15 | T8, T15 |
| R16 | T9 |
| R17 | T8 |
| R18 | T8, T15 |
| R19 | T9, T15 |
| R20 | T11 |
| R21 | T11 |
| R22 | T12, T15 |
| R23 | T12 |
| R24 | T13, T15 |
| R25 | T10 |
| R26 | T14 |
