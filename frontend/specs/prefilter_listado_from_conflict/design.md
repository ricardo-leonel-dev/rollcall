# Design — Pre-filtrar Listado desde el diálogo de conflictos de ausencia

## Files touched

- `src/app/features/absences/absences.component.ts` — only file changed. No new files, no new
  routes, no backend/`excel-service` change (backend already accepts `enrollment_id`, verified at
  `backend/src/controllers/absence.controller.ts:13` and `backend/src/services/absence.service.ts:45`).

## Current state (baseline, for contrast)

- `dateFrom`/`dateTo`/`filterType` (plain fields, bound via `ngModel` to the Desde/Hasta/Tipo
  controls) and `studentSearch` (plain field, bound to the "Buscar estudiante" input) drive the
  Listado tab.
- `loadAbsences()` builds `GET /api/absences?course_id&academic_year_id&date_from&date_to&type` and
  stores the result in `absences` (a signal). `studentSearch` is **not** sent to the backend — it
  only narrows the already-loaded list client-side via `filteredAbsences()`.
- `_pendingHighlight` (`{ enrollmentId: number; dates: string[] }`, private signal) is set by the
  three save flows (`saveAbsenceRange`, `confirmPhotoAbsences`, `confirmVoiceAbsence`) whenever
  `AbsenceSaveResultDialogComponent` reports `conflicts.length > 0`; `applyHighlight()` (called from
  `dialogRef.afterClosed()`) switches to the Listado tab, reloads with whatever `dateFrom`/`dateTo`
  the pickers already held, and flashes/scrolls to the matching `tr[data-enrollment-id]` rows.

## New state

```ts
interface StudentFilter {
  enrollmentId: number;
  label: string;      // full name, mirrors the picker's search text
  dateFrom: string;   // ISO yyyy-mm-dd
  dateTo: string;     // ISO yyyy-mm-dd
}
```

`readonly studentFilter = signal<StudentFilter | null>(null);` — a plain component-local signal,
same pattern as the existing `photoPreview`/`voiceResult` signals (no `_`-prefixed/public-readonly
pair needed; that pattern is reserved for service-exposed state per `docs/architecture.md` §4, and
this state never leaves the component).

`PendingHighlight` (feature 12) gains one field: `studentName: string`. All three call sites
already have the name in scope at the point they call `_pendingHighlight.set(...)` (`enrollment.fullName`
for manual/photo, `r.studentName` for voice — for photo, thread it through the existing `grouped`
map alongside the dates), so this is a pure additive change, no new lookups.

## Query building (`loadAbsences()`)

```ts
async loadAbsences(): Promise<void> {
  const filter = this.studentFilter();
  const params: string[] = [];
  if (filter) {
    params.push(`enrollment_id=${filter.enrollmentId}`);
    params.push(`date_from=${filter.dateFrom}`);
    params.push(`date_to=${filter.dateTo}`);
  } else {
    if (this.selCourse)  params.push(`course_id=${this.selCourse}`);
    if (this.selYear)    params.push(`academic_year_id=${this.selYear}`);
    if (this.dateFrom)   params.push(`date_from=${dateToDateString(this.dateFrom)}`);
    if (this.dateTo)     params.push(`date_to=${dateToDateString(this.dateTo)}`);
    if (this.filterType) params.push(`type=${this.filterType}`);
  }
  // ... unchanged: absLoading, firstValueFrom, absences.set(data)
}
```

The two branches are mutually exclusive by construction (R1's "SHALL NOT include course_id/
academic_year_id/type"), so there is no need for a combined query shape or a backend change.

## Student picker (UI)

Reuses the existing "Buscar estudiante" `mat-form-field`/input (no new form field, no layout
change) and adds a `MatAutocomplete` panel to it — this codebase has no prior `MatAutocomplete`
usage, so this is a new module import (`@angular/material/autocomplete`, already a transitive
dependency of the installed Angular Material version) but not a new UI pattern class (it's a
standard Material combobox, consistent with "Angular Material for UI primitives" in
`docs/architecture.md` §2).

```html
<mat-form-field appearance="outline" subscriptSizing="dynamic" class="md:flex-1" style="min-width:160px">
  <mat-label>Buscar estudiante</mat-label>
  <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
  <input matInput [(ngModel)]="studentSearch" [matAutocomplete]="studentAuto" placeholder="Ej: ANDRADE">
</mat-form-field>
<mat-autocomplete #studentAuto="matAutocomplete" [displayWith]="displayEnrollment"
                   (optionSelected)="selectStudentFilter($event.option.value)">
  @for (e of studentSuggestions(); track e.enrollmentId) {
    <mat-option [value]="e">{{ e.fullName }}</mat-option>
  }
</mat-autocomplete>
@if (studentFilter(); as sf) {
  <div class="student-filter-chip">
    Filtrando por <strong>{{ sf.label }}</strong> · {{ sf.dateFrom }} – {{ sf.dateTo }}
    <button mat-icon-button (click)="clearStudentFilter()" matTooltip="Quitar filtro">
      <mat-icon>close</mat-icon>
    </button>
  </div>
}
```

`studentSuggestions()`: a plain method (not a signal-backed `computed()`, matching how
`filteredEnrollments()`/`filteredAbsences()` are already implemented as template-called plain
methods reading signals internally) returning `enrollments()` filtered by `studentSearch`,
capped to a small number (e.g. 8) to keep the panel usable — mirrors `filteredEnrollments()`'s
existing substring-match logic (`e.fullName.toLowerCase().includes(q)`), duplicated rather than
extracted into a shared helper (see "Discarded alternatives" below).

`displayEnrollment(e: Enrollment | string): string` — Material's `[displayWith]` receives either
the selected option's value or the raw typed string; returns `e.fullName` when given an
`Enrollment`, otherwise returns `e` unchanged, so free typing keeps working (R3).

## New/changed methods

- `selectStudentFilter(enrollment: Enrollment): void` — builds a `StudentFilter` using
  `enrollment.enrollmentId`/`fullName`, and `dateFrom`/`dateTo` from the Listado's own date pickers
  (falling back to today's date if both are empty, so the request is never sent with missing
  range params); sets `studentSearch` to the full name (R2); calls `loadAbsences()`. Used by both
  R9 (manual pick) and internally by the R5 auto-jump path (see below).
- `clearStudentFilter(): void` — `this.studentFilter.set(null)`, `this.studentSearch = ''`,
  `this.loadAbsences()`. Bound to the chip's close button (R10).
- `clearFilters()` (existing "Limpiar" handler) and the "Aplicar filtros" button's handler gain one
  line each: `this.studentFilter.set(null)` before their existing body, satisfying R11.
- `onFiltersChange()` gains `this.studentFilter.set(null)` at the top, satisfying R12 (course
  change, quarter change, and the query-param-driven initial load all funnel through this method
  already).
- `applyHighlight()` (feature 12) is modified, not replaced: instead of relying on whatever
  `dateFrom`/`dateTo` the pickers already hold, it now derives `dateFrom`/`dateTo` as
  `min`/`max` of the sorted conflict dates and calls the same `StudentFilter`-setting logic as
  `selectStudentFilter()` before `loadAbsences()` — then keeps its existing flash/scroll loop
  unchanged (R5–R7):

  ```ts
  private async applyHighlight(): Promise<void> {
    const target = this._pendingHighlight();
    if (!target) return;
    this._pendingHighlight.set(null);
    const sortedDates = [...target.dates].sort();
    this.studentFilter.set({
      enrollmentId: target.enrollmentId,
      label: target.studentName,
      dateFrom: sortedDates[0],
      dateTo: sortedDates[sortedDates.length - 1],
    });
    this.studentSearch = target.studentName;
    this.selectedTabIndex = 3;
    await this.loadAbsences();
    // ... existing flash/scroll loop over target.dates, unchanged
  }
  ```

  Deliberately **not** extracted into a shared private helper with `selectStudentFilter()` beyond
  what's naturally shared by both calling `loadAbsences()` — the two call sites build the
  `StudentFilter` from different inputs (conflict dates vs. the date pickers) and forcing a shared
  signature would just relocate an `if` rather than remove one. If a third call site appears later,
  revisit.

## Discarded alternatives

1. **Route query params (`router.navigate(['/absences'], { queryParams: {...} })`), the same
   mechanism `dashboard.component.ts`/`justifications.component.ts`/`student-history-dialog.component.ts`
   already use to jump into `/absences` pre-filtered.** Rejected: those three callers navigate
   *into* the Absences page from a different route, so Angular activates a fresh component
   instance and `ngOnInit` (which reads `route.snapshot.queryParamMap` once) runs. The conflict
   dialog, by contrast, closes while the user is already on the already-mounted Absences page/tab
   group — navigating to the same route only updates the URL on the existing component instance,
   `ngOnInit` does not re-run, so the query-param-reading code would never fire. A direct method
   call (`applyHighlight()`, already wired to `dialogRef.afterClosed()`) is the only mechanism that
   actually runs in that context.
2. **Send `enrollment_id` together with `course_id`/`academic_year_id`/`type` on every student-filter
   request, instead of dropping the general filters entirely (R1).** Rejected: `confirmVoiceAbsence()`
   does not guarantee the matched enrollment belongs to the currently-selected `selCourse` (the
   voice pipeline matches against the institution's roster via the LLM, not the currently-selected
   course — note `course: ''` is passed to the dialog for the voice flow today, precisely because
   it isn't known/relevant there). Keeping `course_id` in the request would silently return zero
   rows for a voice-flow conflict outside the currently-selected course, defeating the whole
   feature for that flow. Dropping the general filters when `enrollment_id` is present avoids this
   silently-empty-result trap entirely; the backend enforces institution/role scoping
   independently either way (`assertEnrollmentInScope`/`courseIds` in
   `backend/src/services/absence.service.ts`), so no authorization is lost by omitting `course_id`.
3. **Extract `filteredEnrollments()`'s substring-match into a shared `matchesQuery()` utility used
   by both it and the new `studentSuggestions()`.** Considered, not done: `docs/conventions.md`'s
   "Reusability" section biases toward building shared abstractions once a *third* similar need
   shows up, not preemptively duplicating a one-line `.includes()` check into a new module-level
   `shared/utils` helper for two call sites in the same file.

## Error handling

No new error paths — `loadAbsences()`'s existing `try/finally` around `firstValueFrom` (setting
`absLoading`) is unchanged; a failed request in student-filter mode surfaces the same way a failed
general-filter request does today (this component does not currently wrap `loadAbsences()`'s
`firstValueFrom` in a `catch`+`NotificationService.error(...)`, which is pre-existing drift from
`docs/conventions.md`'s error-handling convention — out of scope to fix here, not introduced by
this feature).

## Verification

No automated test suite exists in this project (`docs/conventions.md` "Tests"). Verification is
`pnpm run build` (or `tsc` fallback) plus the manual smoke scenarios listed in R15, run against
`docker compose up -d --build frontend`, per `docs/verification.md`.
