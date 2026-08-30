# Design — Mandatory quarter dropdown on Absences and Justifications list views

See `docs/architecture.md` (signal-based state, `inject()` over constructor injection,
`OnPush`, inline templates/styles, `firstValueFrom` over `.subscribe()`, zoneless change
detection) and `docs/conventions.md` (naming, file structure, no comments unless they
explain a non-obvious why, 2-space indent / single quotes / trailing commas in multiline
literals) for the baseline this design builds on. See `docs/specs.md` for the EARS/`R<n>`/
`T<n>` contract this design satisfies. See
`specs/quarter_selector_foundation/{requirements,design,tasks}.md` for the service/
component contract this feature inherits verbatim.

## Files to touch

| File | Change | Requirements |
|---|---|---|
| `src/app/features/absences/absences.component.ts` | Import `QuarterSelectorComponent` and `Quarter`; add `QuarterSelectorComponent` to `@Component.imports`; render `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` as the first child of the page-level `.filter-bar` (immediately before the existing "Curso" `mat-form-field` — the dropdown sits **next to** the course selector, not in a sidebar); add `onQuarterChange(q)` handler (R12 no-op, otherwise writes `dateFrom`/`dateTo` and re-loads every panel — same-quarter re-selection is a no-op on the pickers, see "Per-screen integration pattern"); leave the existing `loadAbsences()`/`loadTodayAbsences()` `if (this.dateFrom)`/`if (this.dateTo)` lines untouched (the pickers are the seed destination and the source of truth — no precedence logic is needed). | R1, R2, R3, R4, R10, R11, R12, R13 |
| `src/app/features/justifications/justifications.component.ts` | Import `QuarterSelectorComponent`, `Quarter`, and `dateStringToDate`; add `QuarterSelectorComponent` to `@Component.imports`; render `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` as the first child of the page-level `.filter-bar` (immediately before the existing "Curso" `mat-form-field`); add `selQuarterStart`/`selQuarterEnd` fields (R9); add `onQuarterChange(q)` handler (R12 no-op, otherwise writes the fields and calls `onCourseChange()` — same-quarter re-selection is a no-op); extend `loadHistorial()`/`loadPendingStudents()` to append `date_from`/`date_to` from `selQuarterStart`/`selQuarterEnd` when both are non-null — backend support is in `attendance_backend` feature `backend_acepta_date_from_date_to_en_get_api_justifications` (shipped 2026-08-30, see R10). | R5, R6, R7, R8, R9, R10, R11, R12, R13 |

No other files are touched. **`src/app/shared/components/quarter-selector/quarter-selector.component.ts` is NOT modified** — the foundation contract
already exposes everything this feature needs (zero-input tag, single
`quarterChange` output). **`src/app/core/services/quarter-context.service.ts` is NOT modified** — both screens read its public signals via the
component, the same way the Dashboard does. **`src/app/shared/layout/layout.component.ts` is NOT modified** — the foundation's R2 bootstrap (`await
quarterContext.load()` in `ngOnInit`) already loads the quarter list once for the
whole app, so both new screens get the data for free on first render.

## Component contract (frozen — do NOT modify)

The "Reuse, don't reimplement" constraint is the **first** design choice and is the
cornerstone the rest of this file is built on. The full public contract this feature
inherits, verbatim, from `quarter_selector_foundation`:

```ts
// shared/components/quarter-selector/quarter-selector.component.ts
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSelectModule, MatFormFieldModule, FormsModule],
  selector: 'app-quarter-selector',
  template: ` ... `, // see the actual file — loading / empty / dropdown + annotations
})
export class QuarterSelectorComponent {
  readonly context = inject(QuarterContextService);
  readonly quarterChange = output<Quarter | null>();
  // No @Input() — R14 of the foundation: zero inputs, configures itself from the singleton.
  hasAnyDatedQuarter(): boolean { ... }
  onSelect(id: number): void { this.context.select(id); this.quarterChange.emit(...); }
}
```

Both new screens consume exactly two surfaces:

1. The DOM tag `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` —
   binds the existing shared selection from `QuarterContextService`.
2. The `onQuarterChange(q: Quarter | null)` handler — fired only on a real user
   selection (the component does not fire it on first paint).

Anything that would require modifying the component itself is **out of scope** for this
feature. See discarded alternative #2 for why a "clear" affordance is not added here,
discarded alternative #3 for why a per-screen year-scoped override is not added, and
discarded alternatives #7 and #8 for why the position is "next to the course selector"
and the precedence model is "seed, not override".

## Per-screen integration pattern

The pattern mirrors the trimester pills in
`excel-export-dialog.component.ts#selectTrimester` and
`export-config-dialog.component.ts#selectTrimester`: clicking the pill (here, the
quarter dropdown) writes its dates to the same `dateFrom`/`dateTo` fields the user
can still edit manually. When the user picks a different pill, the dates reset
(overwriting any manual edits); picking the same pill again is a no-op. The
difference from the export dialog: the dropdown lives in the page-level filter bar
(not inside a dialog), the seed fields are page state (not local dialog state), and
the pickers are real `<mat-datepicker>` inputs (not just `[(ngModel)]` doubles).

The minimal handler shape is `if (!q || !q.startDate || !q.endDate) return;` (R12
no-op) → `if (q.id === currentlySelectedQuarterId()) return;` (same-quarter
no-op on the pickers) → write the dates → re-issue the page's loaders.

### Absences (template + handler — exact change)

```ts
// absences.component.ts — template additions only (no style change)
import { QuarterSelectorComponent } from '../../shared/components/quarter-selector/quarter-selector.component';
import { Quarter, /* ...existing... */ } from '../../core/models/index';
import { dateStringToDate } from '../../shared/utils/date.util'; // extend existing import

// @Component.imports (extend the existing array):
imports: [
  /* existing */, QuarterSelectorComponent,
],

// Template — page-level .filter-bar gets a new first child (NEXT to the course selector):
<!-- Filtros comunes -->
<div class="filter-bar">
  <app-quarter-selector (quarterChange)="onQuarterChange($event)" />
  <mat-form-field appearance="outline" style="width:220px">
    <mat-label>Curso</mat-label>
    <mat-select [(ngModel)]="selCourse" (ngModelChange)="onFiltersChange()">
      <mat-option [value]="null">— Seleccionar —</mat-option>
      @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
    </mat-select>
  </mat-form-field>
</div>

// Component class — additions only:
// (R1, R2, R4, R12) Page-level quarter handler. Mirrors the export pill's selectTrimester
// shape: partial-date is a silent no-op (R12); same-quarter re-selection is a no-op on
// the pickers; different-quarter re-selection writes the dates to dateFrom/dateTo,
// overwriting any manual edits since the last quarter selection, then re-issues the
// same set of requests onFiltersChange() issues today. dateFrom/dateTo ARE the source
// of truth for the loaders — no selQuarterStart/selQuarterEnd fields on this component.
onQuarterChange(q: Quarter | null): void {
  if (!q || !q.startDate || !q.endDate) return;                    // R12 — no usable range, no-op
  if (q.id === this.academicYearContext.selected()?.id) {           // (placeholder — see note)
    // same-quarter no-op on the pickers: nothing to do, the dropdown is already on it
    return;
  }
  this.dateFrom = dateStringToDate(q.startDate);                     // R2 — seed the Listado pickers
  this.dateTo   = dateStringToDate(q.endDate);                       // (overwrites manual edits since the last quarter pick)
  this.voiceLogsLoaded = false;                                     // force Historial refresh
  this.onFiltersChange();                                            // R10: Foto / Manual / Listado
  this.loadTodayAbsences();                                          // R10: Foto "marked-today" badges
  if (this.selectedTabIndex === 4) this.loadVoiceLogs();             // R2: Historial if currently open
}
```

> **Note on the same-quarter guard.** The placeholder
> `q.id === this.academicYearContext.selected()?.id` is illustrative only —
> the actual identifier is the quarter's `id`, which the implementer reads from
> `QuarterContextService.selectedId()` (or a cached local mirror) and compares
> against `q.id`. The exact read is left to the implementer; the contract is
> "same-quarter re-selection is a no-op on the pickers".

### Absences (per-loader changes — exact change)

```ts
// loadAbsences() — UNCHANGED from today's behavior. The two lines stay as-is:
//   if (this.dateFrom)   params.push(`date_from=${dateToDateString(this.dateFrom)});`
//   if (this.dateTo)     params.push(`date_to=${dateToDateString(this.dateTo)});`
// The pickers ARE the source of truth (R9/R10). When the quarter dropdown seeds them,
// loadAbsences() reads the seeded values on the next call. No precedence logic
// ("quarter scope wins / manual range otherwise") is needed — that complexity is
// gone with the seed model.

// loadTodayAbsences() — replace today's hardcoded single-day pair with dateFrom/dateTo:
// (previously hardcoded `const today = this.todayStr(); ... date_from=${today}&date_to=${today}`)
async loadTodayAbsences(): Promise<void> {
  if (!this.selCourse) { this.todayAbsences.set([]); return; }
  const from = dateToDateString(this.dateFrom);
  const to   = dateToDateString(this.dateTo);
  const data = await firstValueFrom(
    this.http.get<Absence[]>(`/api/absences?course_id=${this.selCourse}&date_from=${from}&date_to=${to}`)
  );
  this.todayAbsences.set(data);
}
```

`clearFilters()` (R11) is unchanged — the existing `this.dateFrom = null;
this.dateTo = null;` lines reset the Listado sub-filters but leave the
page-level quarter dropdown's selection untouched. After "Limpiar", the user
can re-seed by re-selecting the same quarter (which now IS a different
selection because the pickers are null — see "Same-quarter guard" caveat in
T3) or by picking a different quarter.

### Justifications (template + handler — exact change)

```ts
// justifications.component.ts — template additions only (no style change)
import { QuarterSelectorComponent } from '../../shared/components/quarter-selector/quarter-selector.component';
import { Quarter, Justification, Course, Absence } from '../../core/models/index';
import { dateStringToDate } from '../../shared/utils/date.util';

// @Component.imports (extend the existing array):
imports: [
  /* existing */, QuarterSelectorComponent,
],

// Template — page-level .filter-bar gets a new first child (NEXT to the course selector):
<!-- Filtro de curso compartido entre tabs -->
<div class="filter-bar" style="margin-bottom:0;border-radius:var(--radius-lg) var(--radius-lg) 0 0;border-bottom:none">
  <app-quarter-selector (quarterChange)="onQuarterChange($event)" />
  <mat-form-field appearance="outline" style="width:220px">
    <mat-label>Curso</mat-label>
    <mat-select [(ngModel)]="selCourse" (ngModelChange)="onCourseChange()">
      <mat-option [value]="null">Todos los cursos</mat-option>
      @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
    </mat-select>
  </mat-form-field>
</div>

// Component class — additions only:
selQuarterStart: Date | null = null;                              // R9 — Justifications has no pickers,
selQuarterEnd: Date | null = null;                                //     these fields cache the quarter's range

// (R5, R6, R8, R12) Same partial-date no-op and same-quarter no-op guards as Absences.
// On a different-quarter selection, writes the fields and calls onCourseChange() — which
// already parallel-loads loadHistorial() + loadPendingStudents().
onQuarterChange(q: Quarter | null): void {
  if (!q || !q.startDate || !q.endDate) return;                    // R12
  if (q.id === <currentSelectedQuarterId>) return;                 // same-quarter no-op on the fields
  this.selQuarterStart = dateStringToDate(q.startDate);
  this.selQuarterEnd   = dateStringToDate(q.endDate);
  this.onCourseChange();                                            // R10: parallel loadHistorial + loadPendingStudents
}
```

### Justifications (per-loader changes — exact change)

```ts
// loadHistorial() — append quarter scope after the existing per-falsy branch:
// "if (this.selYear)   params.push(`academic_year_id=${this.selYear}`);"
// "if (this.selCourse) params.push(`course_id=${this.selCourse}`);"
if (this.selQuarterStart && this.selQuarterEnd) {
  params.push(`date_from=${dateToDateString(this.selQuarterStart)}`);
  params.push(`date_to=${dateToDateString(this.selQuarterEnd)}`);
}

// loadPendingStudents() — append quarter scope to the /api/absences URL:
// (current implementation builds the URL inline; the refactor mirrors loadHistorial's
// params-array pattern, with is_justified=false preserved as today)
async loadPendingStudents(): Promise<void> {
  if (!this.selYear || !this.selCourse) { this.pendingStudents.set([]); return; }
  const params: string[] = [
    `course_id=${this.selCourse}`,
    `academic_year_id=${this.selYear}`,
    `is_justified=false`,
  ];
  if (this.selQuarterStart && this.selQuarterEnd) {
    params.push(`date_from=${dateToDateString(this.selQuarterStart)}`);
    params.push(`date_to=${dateToDateString(this.selQuarterEnd)}`);
  }
  const pending = await firstValueFrom(
    this.http.get<Absence[]>(`/api/absences?${params.join('&')}`)
  );
  // ...rest unchanged
}
```

Backend support for `date_from`/`date_to` on `/api/justifications` is in
`attendance_backend` feature `backend_acepta_date_from_date_to_en_get_api_justifications`
(shipped 2026-08-30). The backend filters via
`EXISTS (SELECT 1 FROM justification_absences ja JOIN absences a ON a.id = ja.absence_id WHERE ja.justification_id = j.id AND a.deleted_at IS NULL AND a.date BETWEEN $N AND $M)`,
gated behind `dateFromIdx || dateToIdx` (so the clause is NOT injected when both params are absent — see backend's round-1/round-2 fix for why the gate matters). Returns HTTP 400 on malformed dates or `date_from > date_to`. T10 smoke-confirms this on the live stack.

The "Todos los cursos" reset (R11) is unchanged — `onCourseChange()` resets
`selStudentCreate`/`selStudentHistorial`/`unjustified`/`selectedIds`/`currentPage`
but does not touch `selQuarterStart`/`selQuarterEnd`, since the existing reset was
local to per-course selection.

## Signal/computed wiring

`JustificationsComponent` introduces two plain mutable fields
(`selQuarterStart`, `selQuarterEnd`) — they are not `signal()`s because they are
only consumed inside the page's own `loadXxx()` methods, never in the template,
never by another component. `AbsencesComponent` introduces **no** new fields at
all — the existing `dateFrom`/`dateTo` `mat-datepicker` inputs are the source
of truth and the seed destination.

The foundation's `QuarterContextService.selected()`/`selectedId()` continues
to be the single source of truth for the dropdown's visible state, observed
via the component's existing `context` injection — neither new screen calls
`inject(QuarterContextService)` in its class body. This is deliberate:

- Avoids re-implementing the foundation's reactive year-switch contract (R5/R18 of the
  foundation) on each new screen — the dropdown already handles it via
  `QuarterContextService`.
- Avoids two `QuarterSelectorComponent` instances on the page drifting out of sync
  (only one is rendered per screen, but the principle holds — every screen sees the
  same shared singleton).
- The "same-quarter re-selection is a no-op" guard reads
  `QuarterContextService.selectedId()` and compares to `q.id` — no new reactive
  primitives are introduced for this comparison.

The "single source of truth for selection" pattern is unchanged — see
`docs/architecture.md`'s signal/computed section and `AcademicYearContextService` for
the established precedent.

## Visual & UX direction

This feature adds zero new visual surface area:

- The `<app-quarter-selector />` tag is rendered inside the existing page-level
  `.filter-bar` on both screens, positioned **next to** the existing "Curso"
  `mat-form-field` (as the first child of the same bar) — exactly mirroring how
  the export dialog places its trimester pills in line with its date pickers.
  This positioning is the user's explicit choice (2026-08-30 amendment):
  inline with the course selector, not in a sidebar.
- The selector's own width (`200px`), label ("Período"), guard-state messages, and
  fallback annotation are owned entirely by `QuarterSelectorComponent`'s `styles: [...]`
  block (foundation R25), which is frozen by this feature — no overrides, no per-screen
  theming.
- The page-level `.filter-bar` is already styled (rounded corners on Justifications
  because it bleeds into the `mat-tab-group`; rectangular on Absences because the
  filter bar sits above its own `mat-tab-group`); no `.filter-bar` style is touched.
- No new colors are introduced. The selector's `var(--muted-strong)` / Nunito 12px
  text is the only non-control styling, inherited from the foundation.
- `grep -nE "#[0-9a-fA-F]{3,8}"` against the two modified files returns no new matches
  in any of this feature's additions (the two files already contain a handful of
  pre-existing hex colors for the badge / mic / alert-bar inline styles; none of those
  are modified by this feature).

## Discarded alternatives

1. **Add the quarter dropdown as an extra "Listado"-panel filter rather than a page-level
   scope.** Rejected: the title says **"mandatory quarter dropdown"**, which scopes the
   whole page (Foto / Manual / Voz / Listado / Historial on Absences; both tabs on
   Justifications), not just one sub-panel. Putting it inside the "Listado" panel would
   leave Foto / Manual / Voz unaffected — defeating the point. The page-level placement
   matches how a user already narrates the question: *"show me Primer Trimestre's
   inasistencias in this course"* — the period is the primary scope, the course is the
   secondary filter.

2. **Add a "Limpiar período" button to the selector so the user can drop the quarter
   scope and see "everything".** Rejected: (a) the selector's public contract is frozen
   by this feature (foundation R14: zero inputs), and adding a button would require a
   new `@Input() allowClear` + `(cleared)` output + template changes the foundation does
   not own — out of scope; (b) the realistic user need is to switch to a different
   quarter, not to see "everything ever" — the period list itself already offers every
   configured quarter (which, for a normal school year, **is** "everything" anyway);
   (c) `clearFilters()` on Absences is intentionally local to the Listado sub-filters
   (R11), and "Todos los cursos" on Justifications already provides an existing
   "widen this one dimension" affordance. Adding a parallel "clear period" affordance
   is YAGNI.

3. **Inject `QuarterContextService` directly into `AbsencesComponent` and
   `JustificationsComponent` and read `selected()` reactively (via `effect()` or
   `computed()`) instead of going through the `(quarterChange)` output.** Rejected:
   the component already exposes `(quarterChange)` for exactly this purpose (foundation
   R13, used by Dashboard), and `effect()`-driven reactive reads would (a) duplicate
   the foundation's reactive year-switch handling (which `QuarterContextService` already
   owns), (b) fire on every signal tick — including ones that don't represent a real
   user selection (e.g. the default-quarter recompute after year switch, where the
   dropdown emits no `quarterChange` but the `selectedId` signal does change). The
   output-driven bridge fires exactly once per real user interaction and is the same
   shape the Dashboard uses — consistency wins. The fields `selQuarterStart`/
   `selQuarterEnd` on Justifications are deliberately plain (not `signal()`s) for the
   same reason: they are not consumed by any template binding, only by imperative
   `loadXxx()` methods.

4. **Replace the existing per-screen date-range inputs (Absences' "Desde"/"Hasta"
   pickers in the Listado panel) with the quarter dropdown — i.e. delete the date
   pickers since the dropdown now drives the same scope.** Rejected: the user can still
   legitimately want to query a non-quarter-aligned date range ("show me inasistencias
   for the week before Primer Trimestre started"), and the existing date pickers are
   the only way to do that. Under the seed model (R2/R10), the pickers are the seed
   destination **and** the user-editable override — removing them would remove the
   "override" half of the model. Keeping both lets the user click a quarter to
   pre-fill, then nudge the dates manually as needed.

5. **Auto-apply the default quarter's range on first render the way the feature title
   could be read to demand.** Rejected: the title says "mandatory" only in the sense
   "the dropdown must be present and visible" — not "the dropdown's default must
   auto-scope every panel before the user has touched anything". R3 / R7 explicitly
   preserve the existing first-render behavior (today's empty-state for the Listado
   panel, today's `?course=` deep-link path for both screens). Auto-applying on load
   would silently hide data the user is used to seeing by default — the same trap the
   foundation's discarded alternative #1 (`progress/impl_quarter_selector_foundation.md`)
   explicitly avoids for the Dashboard.

6. **Add the selector to Students, Enrollments, Calendar, or any other view as part of
   this feature.** Rejected: explicit out-of-scope per the leader's instructions on this
   draft. Each view has its own scope semantics (per-student detail vs. per-course
   roster vs. calendar-week), and bundling them into this feature would multiply
   design decisions without changing the reusable contract — exactly the scope creep
   the foundation was designed to defer. Surface as a possible follow-up feature per
   view once the Absences + Justifications integration is approved and shipped.

7. **Treat the quarter scope as overriding the manual Listado date range when both are
   set (the initial spec's "scope wins" precedence rule).** Rejected: the user
   explicitly reviewed the initial draft (2026-08-30) and decided the model should
   mirror the export feature's trimester pills instead — the dropdown SEEDS the
   pickers, the pickers remain user-editable, and picking a different quarter re-seeds
   (overwriting manual edits since the last quarter selection). This is the "seed, not
   override" model captured by R2/R6/R10 and explicitly documented in the 2026-08-30
   user-amendment note. The "scope wins" model was rejected because it would hide the
   user's manual picker edits the moment they picked any quarter — the export pill
   does not behave that way and the user wants the same UX.

8. **Place the quarter dropdown in a sidebar / dedicated region (e.g. a chip rail
   above the page header) instead of next to the course selector in the existing
   `.filter-bar`.** Rejected: the user explicitly reviewed the initial draft
   (2026-08-30) and decided the dropdown should sit "al lado del curso" (next to the
   course selector) so it "actúe de forma global en donde sea que haya selección de
   fecha" (acts globally wherever there's date selection). Inline placement next to
   the course selector is what makes the seed model feel natural — the user scans
   left-to-right and sees the period control + the course control + the date pickers
   (or their loader-side consumers) all in the same row. A sidebar placement would
   visually decouple the period from the rest of the page's filters and break the
   seed-not-override mental model.
