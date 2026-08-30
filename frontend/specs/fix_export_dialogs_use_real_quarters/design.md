# Design — Fix PDF / Excel export dialogs to use real quarter data instead of equal-thirds guess

See `docs/architecture.md` (signal-based state, `inject()` over constructor injection,
`OnPush`, inline templates/styles, `firstValueFrom` over `.subscribe()`, zoneless change
detection) and `docs/conventions.md` (naming, file structure, no comments unless they
explain a non-obvious why, 2-space indent / single quotes / trailing commas in
multiline literals) for the baseline this design builds on. See `docs/specs.md` for
the EARS/`R<n>`/`T<n>` contract this design satisfies.

This design inherits the service/component contract from
`specs/quarter_selector_foundation/{requirements,design,tasks}.md`
unchanged — no foundation file is modified, and no foundation contract is
re-derived here. The "Reuse, don't reimplement" constraint is captured by
R1/R4/R8 and discussed below in discarded alternative #1 (why
`QuarterSelectorComponent` itself is **not** reused here) and discarded
alternative #4 (why the equal-thirds computation is **not** retained).

## Equal-thirds algorithm — what we're removing (R16)

For traceability, the exact code currently in both dialogs (deleting it
is R16):

```ts
// excel-export-dialog.component.ts (lines 151-164, 166-176) and
// export-config-dialog.component.ts (lines 385-398, 400-410).
// Identical shapes in both — by design, both dialogs share the same
// synthetic-trimester compute.
private setDefaultTrimester(year: AcademicYear): void {
  if (!year.startDate || !year.endDate) return;
  const start = new Date(year.startDate);
  const end = new Date(year.endDate);
  const third = (end.getTime() - start.getTime()) / 3;
  const bounds = [start, new Date(start.getTime() + third), new Date(start.getTime() + 2 * third), end];
  const today = new Date();
  const clamped = today < start ? start : today > end ? end : today;
  const idx = bounds.slice(1).findIndex(b => clamped.getTime() <= b.getTime());
  const i = idx === -1 ? 2 : idx;
  this.dateFrom = bounds[i];
  this.dateTo = bounds[i + 1];
  this.activeTrimester.set(i);
}

selectTrimester(i: number): void {
  const year = this.academicYearContext.selected();
  if (!year?.startDate || !year?.endDate) return;
  const start = new Date(year.startDate);
  const end = new Date(year.endDate);
  const third = (end.getTime() - start.getTime()) / 3;
  const bounds = [start, new Date(start.getTime() + third), new Date(start.getTime() + 2 * third), end];
  this.dateFrom = bounds[i];
  this.dateTo = bounds[i + 1];
  this.activeTrimester.set(i);
}
```

```ts
// export-config-dialog.component.ts (lines 412-422) — only this dialog
// uses a midpoint to derive a trimester label for the PDF title.
private getTrimesterName(): string {
  const year = this.academicYearContext.selected();
  if (!this.dateFrom || !this.dateTo || !year?.startDate || !year?.endDate) return 'TRIMESTRE';
  const start = new Date(year.startDate);
  const end = new Date(year.endDate);
  const third = (end.getTime() - start.getTime()) / 3;
  const midpoint = new Date((this.dateFrom.getTime() + this.dateTo.getTime()) / 2);
  if (midpoint <= new Date(start.getTime() + third)) return 'PRIMER TRIMESTRE';
  if (midpoint <= new Date(start.getTime() + 2 * third)) return 'SEGUNDO TRIMESTRE';
  return 'TERCER TRIMESTRE';
}
```

These three methods (`setDefaultTrimester`, `selectTrimester`,
`getTrimesterName`) and the three usages of `activeTrimester` (`set(null)`
in `(ngModelChange)` on the two pickers; `set(i)` at the end of
`selectTrimester`; the `activeTrimester() === i` binding in the template)
are the entire surface area being changed. Everything else in both
dialogs (the course `mat-select`, the date pickers, the PDF/Excel
generation logic, the print iframe flow, the type-pills, color toggle,
onlyWithRecords toggle) stays exactly as today.

## Files to touch

| File | Change | Requirements |
|---|---|---|
| `src/app/features/student-report/excel-export-dialog.component.ts` | Inject `QuarterContextService` as a private readonly field. Replace `activeTrimester: signal<number \| null>` with `activeQuarterId: signal<number \| null>`. Replace `setDefaultTrimester(year)` with `applyDefaultQuarter()` (reads `quarterContext.defaultQuarterId()`). Replace `selectTrimester(i)` with `applyQuarter(q: Quarter \| null)`. Replace `let i = $index` template binding with iteration over `quarterContext.quarters()` filtered to fully-dated entries, labeled with `q.name`. Add the empty-note `<div class="trimester-empty-note">` per R2 when the filtered list is empty. Keep the two `(ngModelChange)="activeQuarterId.set(null)"` lines on the date pickers (R14). | R1, R2, R4, R5, R6, R7, R8, R9, R10, R11, R14, R15, R16 |
| `src/app/features/student-report/export-config-dialog.component.ts` | Same set of changes as the Excel dialog. Additionally, replace `getTrimesterName()` with `getTitleSection()` that returns the active quarter's `name.upperCase()` or `'PERÍODO PERSONALIZADO'`, and update its single call site in `printReport()` (R12, R13). | R1, R2, R3, R4, R5, R6, R7, R12, R13, R14, R15, R16 |
| `specs/fix_export_dialogs_use_real_quarters/{requirements,design,tasks}.md` | **New.** The spec content of this feature (source-of-truth, git-tracked). | (this file) |
| `progress/spec_fix_export_dialogs_use_real_quarters.md` | **New.** Drafter's progress note written at `mark-spec-ready` time (summary, open questions, considered-but-not-included discarded alternatives). | (this file) |

No other files are touched. **`src/app/shared/components/quarter-selector/quarter-selector.component.ts`
is NOT modified** — see discarded alternative #1 for why a direct
`QuarterSelectorComponent` reuse wouldn't match the dialog's UX shape.
**`src/app/core/services/quarter-context.service.ts` is NOT modified** — both
dialogs only read its public signals; the foundation's contract already
exposes everything this feature needs.

## Component contract (frozen — do NOT modify)

The "Reuse, don't reimplement" constraint is the **first** design choice
and is the cornerstone the rest of this file is built on. The full public
contract this feature inherits, verbatim, from `quarter_selector_foundation`:

```ts
// core/services/quarter-context.service.ts
@Injectable({ providedIn: 'root' })
export class QuarterContextService {
  // — public readonly signals (foundation R3, R4) —
  readonly quarters: Signal<Quarter[]>;                    // sorted by sequenceNumber asc
  readonly loaded: Signal<boolean>;
  readonly selectedId: Signal<number | null>;
  readonly defaultQuarterId: Signal<number | null>;
  readonly selected: Signal<Quarter | null>;

  // — async load (foundation R1, R5, R6–R10) —
  load(): Promise<void>;                                    // bootstrapped by LayoutComponent
  select(id: number | null): void;                          // (not used by this feature)
}
```

Both export dialogs consume exactly the **read-only** signals above — no
new reactive primitives are introduced for this feature. The reactive
year-switch behavior (foundation R5) and the reactive default recompute
(foundation R6–R10) are inherited for free.

## Per-dialog integration pattern

The shared shape, for both `excel-export-dialog.component.ts` and
`export-config-dialog.component.ts`:

```ts
// shared imports (extend existing import block per docs/conventions.md
// ordering: "Local: core services" before "Local: shared utils")
import { QuarterContextService } from '../../core/services/quarter-context.service';
import { Quarter } from '../../core/models/index'; // extend existing index import
import { dateStringToDate } from '../../shared/utils/date.util'; // only Excel needs this; PDF already imports dateToDateString

// @Component.class — additions only:
private readonly quarterContext = inject(QuarterContextService);

// activeTrimester (signal<number|null>) → activeQuarterId (signal<number|null>)
readonly activeQuarterId = signal<number | null>(null);
```

```ts
// applyDefaultQuarter() — replaces setDefaultTrimester(year).
// Reads foundation's pre-computed default (R6–R10); mirrors the
// Dashboard's onQuarterChange no-op-on-partial-date guard.
applyDefaultQuarter(): void {
  const id = this.quarterContext.defaultQuarterId();
  if (id === null) return;                                // R2: no fully-dated quarter → fall through
  const q = this.quarterContext.quarters().find(qq => qq.id === id);
  if (q) this.applyQuarter(q);                            // R7 / R11 — both dialogs
}

// applyQuarter(q) — replaces selectTrimester(i).
// Empty-guard: partial-date quarter is a silent no-op (R6 / R10).
// Same-quarter re-selection is a no-op (dateFrom/dateTo unchanged), which
// mirrors the export pill's pre-existing "clicking the same pill does
// nothing" behavior. (The dialogs had no same-quarter guard before — they
// had the index-based selectTrimester where re-clicking the same pill was
// also a no-op because dates get re-set to the same bounds.)
applyQuarter(q: Quarter | null): void {
  if (!q || !q.startDate || !q.endDate) return;           // R6/R10 + R15 defensive layer
  this.dateFrom = dateStringToDate(q.startDate);
  this.dateTo   = dateStringToDate(q.endDate);
  this.activeQuarterId.set(q.id);
}
```

And the template change (identical in both dialogs):

```html
<!-- OLD — equal-thirds, hardcoded literal, index-based active -->
<div class="trimester-row">
  @for (t of ['Primer', 'Segundo', 'Tercer']; track t; let i = $index) {
    <button class="period-pill" [class.active]="activeTrimester() === i" (click)="selectTrimester(i)">
      {{t}} trimestre
    </button>
  }
</div>
```

```html
<!-- NEW — real quarters, configured name, id-based active. R1/R4/R8/R9/R15. -->
@if (getDatedQuarters().length === 0) {
  <div class="trimester-empty-note">No hay períodos con fechas configuradas para este año lectivo. Define los períodos en el módulo de administración o usa los selectores de fecha para establecer el rango manualmente.</div>
} @else {
  <div class="trimester-row">
    @for (q of getDatedQuarters(); track q.id) {
      <button class="period-pill" [class.active]="activeQuarterId() === q.id" (click)="applyQuarter(q)">
        {{ q.name }}
      </button>
    }
  </div>
}
```

with a helper method colocated in each component's class body (kept as a
plain method, not a computed signal — it's trivial, called from exactly
one template binding, and doesn't drive any reactive state):

```ts
// R1/R4/R8: the only "filter" in this feature. Plain method, no signal.
// Same shape on both dialogs.
getDatedQuarters(): Quarter[] {
  return this.quarterContext.quarters().filter(q => q.startDate && q.endDate);
}
```

(Equivalently, a computed signal colocated in each class:
`readonly datedQuarters = computed(() => this.quarterContext.quarters().filter(q => q.startDate && q.endDate));`.
The implementer picks one — see note under "Signal/computed wiring" below.)

## `getTitleSection()` (PDF dialog only — R12, R13)

```ts
// export-config-dialog.component.ts — replaces getTrimesterName().
// Always returns a label for the report's title section. When a pill is
// active and the matching quarter's name resolves cleanly, use the real
// configured name (uppercased). When the user has manually edited the
// pickers (activeQuarterId() is null) or the active quarter has no name
// for some reason, fall back to the generic "PERÍODO PERSONALIZADO".
// The PDF title template (`${mainTitle} ${trimesterName} — ${courseName}`)
// stays the same — only the variable changes.
private getTitleSection(): string {
  const id = this.activeQuarterId();
  if (id === null) return 'PERÍODO PERSONALIZADO';
  const q = this.quarterContext.quarters().find(qq => qq.id === id);
  if (!q) return 'PERÍODO PERSONALIZADO';
  return q.name.trim().toUpperCase();
}
```

And the single call site (`printReport`):

```ts
// OLD:
const trimesterName = this.getTrimesterName();

// NEW (R13):
const trimesterName = this.getTitleSection();
// No other call-site changes — printReport's title still reads
// `${mainTitle} ${trimesterName} — ${escapeHtml(courseReport.course.name.toUpperCase())}`.
```

## `ngOnInit` changes (both dialogs)

```ts
// OLD (excel-export-dialog.component.ts and export-config-dialog.component.ts,
// identical shape):
async ngOnInit(): Promise<void> {
  this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
  const active = this.academicYearContext.selected();
  if (active) this.setDefaultTrimester(active);
}
```

```ts
// NEW — both dialogs:
// Apply the foundation's computed default (R7/R11). Note we no longer
// read this.academicYearContext.selected() to derive a default: the
// foundation's defaultQuarterId() is already year-scoped and null-safe
// (R6–R10). The user can still edit the pickers afterward.
async ngOnInit(): Promise<void> {
  this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
  this.applyDefaultQuarter();
}
```

`AcademicYearContextService` is **still injected** on both dialogs (its
field is `readonly academicYearContext` and is used today by the
generation methods — e.g. `downloadExcel()` reads `year.id` for the
`academic_year_id` query param). This feature keeps that injection
unchanged. It just stops using it to derive a synthetic trimester default.

## Signal/computed wiring

`activeQuarterId` is `signal<number | null>(null)` — same shape as the
old `activeTrimester`, just storing the quarter's `id` instead of an
array index. This is intentional symmetry: the only template binding
that needs it is `[class.active]="activeQuarterId() === q.id"`, which
OnPush + `signal()` already triggers when the value changes.

The `getDatedQuarters()` filter is invoked from one template binding
per dialog. Two implementation choices:

- **Plain method** (`return this.quarterContext.quarters().filter(...)`).
  Cheap; the list is ≤ ~10 items; runs on every change detection pass.
- **`computed()` signal** (`readonly datedQuarters = computed(...)`).
  Memoizes between ticks; cleaner if this dialog later adds more
  bindings.

Either is acceptable. The implementer picks. The contract that matters
is the filter semantics (`q.startDate && q.endDate`), not the mechanism.

No new `effect()`, `toSignal()`, or `inject()` outside
`QuarterContextService` is added to either dialog.

## Visual & UX direction

The visual language of the pill row stays identical — same `.period-pill`
class, same `.trimester-row { display: flex; gap: 8px; flex-wrap: wrap;
margin-top: 8px }` rule that already exists in both dialogs' `styles:`
blocks, same active-state highlight (whatever the existing
`.period-pill.active` looks like today). The new visual additions are:

- **Per-pill width adapts to the configured name length.** No fixed
  `min-width` per pill — `flex-wrap: wrap` already handles 2, 3, 4, or
  N pills gracefully. A real world Tia Blanquita configuration named
  `Primer Trimestre` will render the same width it did under the old
  hardcoded literal (since "Primer trimestre" → `Primer Trimestre` is the
  same string uppercased and lowercased). A configuration named `Q1`
  will render narrower pills; the `flex-wrap` ensures layout adapts.
- **Empty-state note.** A single `<div class="trimester-empty-note">` with
  `font-size: 12px; color: var(--muted-strong); line-height: 1.5;
  background: var(--paper-deep); border: 1px solid var(--border-soft);
  border-radius: var(--radius-md); padding: 10px 12px; margin-top: 8px;`
  — same visual treatment as the existing `.hint-note` rule in the Excel
  dialog and the `.output-card` block in the PDF dialog. Mirrors the
  foundation's `.quarter-selector-note` family.
- **`grep -nE "#[0-9a-fA-F]{3,8}"`** against the two modified files
  returns **no new matches** in this feature's additions. The two files
  already contain a handful of pre-existing hex colors (notably the
  `.type-pill` class definitions in the PDF dialog); none of those are
  modified by this feature, and the new `.trimester-empty-note` style
  uses existing design tokens.

## Discarded alternatives

1. **Reuse the foundation's `QuarterSelectorComponent` (the `mat-select`
   dropdown) inside both dialogs instead of rendering pill rows.**
   Rejected: `QuarterSelectorComponent` is a `mat-form-field` +
   `mat-select` styled to fit the Dashboard's filter bar (height,
   outline-field chrome, 200px width). Dropping it into a `MatDialog`
   beside a `.trimester-row`-shaped layout where the existing pill row
   already lives would either (a) re-style a `mat-select` to look like
   a pill — which is exactly what the foundation rejected in its
   discarded alt #2 ("avoid per-screen override") for consistency, or
   (b) force a visual model-switch inside a 2-screen tour (pills in
   export dialogs, `mat-select` in Dashboard / Absences / Justifications)
   for what is functionally the same control. The simpler contract wins:
   both dialogs consume the same `QuarterContextService` signals
   directly, but render pills (their existing UX shape) using those
   signals instead of via the shared dropdown component. The foundation
   stays untouched; the pills stay pills. Adding a sixth consumer shape
   is YAGNI.

2. **Retain the equal-thirds algorithm as a fallback when
   `QuarterContextService.quarters()` is empty.** Rejected: the
   foundation's load path guarantees the list is either (a) the real
   configured quarters, or (b) empty (for a year with zero
   non-deleted quarters). There is no middle case where the list is
   absent but the AY exists. If the list is empty, falling back to
   equal-thirds would reintroduce the bug for institutions with 2 or 4
   real quarters that happen to delete them all — exactly the case
   this feature is fixing. The empty-state note (R2) is the honest UX:
   there are no configured quarters, the user must use the pickers
   manually or configure quarters in the admin module.

3. **Keep the equal-thirds algorithm as a parallel alternative ("auto" mode)
   alongside the new "real quarters" pills.** Rejected: this duplicates
   the answer to the same question ("what range should I export?") in the
   same dialog. Two competing UIs for the same scope is worse than the
   bug being fixed. If a user really wants equal-thirds, they can
   pick a quarter that happens to be equal-thirds-aligned, or pick
   custom dates that match. The pill row is now the single source of
   truth for "scope by quarter" (R1/R4/R8).

4. **Recompute `setDefaultTrimester`'s equal-thirds logic only as a
   default when `defaultQuarterId()` is null (no fully-dated quarter).**
   Rejected: equal-thirds was never correct for institutions whose real
   quarters number 2 or 4; it was a heuristic that produced plausible
   answers only when quarters happened to be equal. Carrying it as a
   fallback re-introduces the silent-wrong-default problem this feature
   is fixing (the same trap the foundation's discarded alt #3 warned
   about, and the Dashboard's discarded alt #1 explicitly avoided).
   Instead, R2's empty-state note tells the user the pickers are the
   only path forward — explicit, not silent.

5. **Render `getTitleSection()` as a computed signal instead of a plain
   method.** Considered: possible, but `getTitleSection()` reads
   `activeQuarterId()` once per call and returns a string that's read
   once per `printReport()` invocation (the user clicks the "Generar
   PDF" button — no need for reactivity). A plain method is simpler
   and matches how `getTrimesterName()` was already written. Skipped.

6. **Migrate the three pills' `(click)` handlers to use event delegation
   on the `.trimester-row` container.** Rejected: the pre-existing
   dialog structure binds per-pill, mirroring the foundation's
   `<mat-option>` per-row pattern. Event delegation would be a wider
   refactor for a small perf gain on a list of ≤ 10 items. Skipped.
