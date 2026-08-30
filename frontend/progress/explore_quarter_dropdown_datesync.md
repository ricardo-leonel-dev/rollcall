# Explore: Quarter dropdown sort order + date-picker sync bugs

## BUG 1 — Quarters not sorted by configured start date

**Root cause:**
`src/app/core/services/quarter-context.service.ts:56-60`
```ts
async load(): Promise<void> {
    const academicYearId = this.academicYearContext.selectedId();
    const list = await this.quarterService.getAll(academicYearId ?? undefined);
    const sorted = [...list].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
```
The list backing `context.quarters()` (rendered by `QuarterSelectorComponent`'s `mat-select`, and by the "period pill" buttons in the two export dialogs) is sorted by `sequenceNumber`, **not** `startDate`. Quarter numbering doesn't always match calendar order (per the comment in `admin.component.ts:471-476`), so the dropdown can render out of chronological order.

**Raw fetch (no sorting applied):**
`src/app/core/services/quarter.service.ts:31-36` — `getAll()` just does `GET /api/quarters` and returns API order; sorting is left to callers.

**Dropdown render (consumes already-sorted signal, no extra sort):**
`src/app/shared/components/quarter-selector/quarter-selector.component.ts:44-48`
```ts
<mat-select [ngModel]="context.selectedId()" (ngModelChange)="onSelect($event)">
  @for (q of context.quarters(); track q.id) {
    <mat-option [value]="q.id">{{ q.name }}</mat-option>
  }
</mat-select>
```

**Contrast — admin quarters table sorts correctly (not buggy, reference pattern):**
`src/app/features/admin/admin.component.ts:471-486`, `quarterRowsFor(yearId)` sorts `.sort((a, b) => a.startDate < b.startDate ? -1 : ...)` with a comment explaining why sequence order isn't chronological order. This is the fix pattern to apply inside `QuarterContextService.load()` instead of `a.sequenceNumber - b.sequenceNumber`.

Note: `quarters-dialog.component.ts:303` also sorts by `sequenceNumber`, but that's the admin editing-order list, not a filter dropdown — likely intentional/out of scope.

**Consumers affected (all read `context.quarters()`):**
- `dashboard.component.ts:53`
- `absences.component.ts:109`
- `justifications.component.ts:80`
- `student-report/excel-export-dialog.component.ts:110`, `getDatedQuarters()` L168-170 (no re-sort)
- `student-report/export-config-dialog.component.ts:277`, `getDatedQuarters()` L407-409 (no re-sort)

## BUG 2 — Auto-selected default quarter not synced to date pickers

**"Current quarter based on date" logic:**
`src/app/core/services/quarter-context.service.ts:80-109`, `computeDefaultQuarter(quarters, today)`, invoked from `load()` L61:
```ts
const { id, isFallback, direction } = computeDefaultQuarter(sorted, dateToDateString(new Date()));
this._defaultQuarterId.set(id);
...
this._selectedId.set(id);
```
`_selectedId` is set programmatically — no user interaction.

**`QuarterSelectorComponent` only fires `quarterChange` on user-driven selection, never for the initial default:**
`src/app/shared/components/quarter-selector/quarter-selector.component.ts:44, 70-73`
```ts
<mat-select [ngModel]="context.selectedId()" (ngModelChange)="onSelect($event)">
...
onSelect(id: number): void {
    this.context.select(id);
    this.quarterChange.emit(this.context.quarters().find(q => q.id === id) ?? null);
}
```
Because `[ngModel]` is bound to `context.selectedId()` which is already set to the default before `mat-select` renders, no `ngModelChange` fires on initial render — `onSelect`/`quarterChange` only fire on later manual selection.

**Broken — rely solely on `(quarterChange)`, no initial sync:**

1. `dashboard.component.ts` — template L53 `(quarterChange)="onQuarterChange($event)"`; handler L365-372 sets `customFrom`/`customTo`/`selectedPeriod` only when invoked. `ngOnInit` (L301-305) never calls it and never injects `QuarterContextService` (no `inject(QuarterContextService)` in file; only a comment at L363). Result: dropdown shows the default quarter but `customFrom`/`customTo` stay `null`, `selectedPeriod` stays `'full'` until the user manually reselects.

2. `absences.component.ts` — template L109 same output; handler L791-799 sets `dateFrom`/`dateTo` + reloads, guarded by `lastAppliedQuarterId` (L684). `ngOnInit` (L698-720) never calls it, never injects `QuarterContextService`. Same missing-initial-sync bug.

3. `justifications.component.ts` — template L80 same output; handler L453-460 sets `selQuarterStart`/`selQuarterEnd`, guarded by `lastAppliedQuarterId` (L341). `ngOnInit` (L384-401) never calls it. Same bug.

**Correct — inject `QuarterContextService` directly and call an explicit `applyDefaultQuarter()` in `ngOnInit` (reference pattern):**

4. `student-report/excel-export-dialog.component.ts` — `ngOnInit` L156-159 calls `applyDefaultQuarter()`; L161-166 reads `quarterContext.defaultQuarterId()`/`quarters()` directly and calls `applyQuarter(q)` which sets `dateFrom`/`dateTo` (L172-177). Works because `layout.component.ts:340` already awaits `quarterContext.load()` before the dialog can open.

5. `student-report/export-config-dialog.component.ts` — same pattern: `ngOnInit` L395-398 → `applyDefaultQuarter()` L400-405 → `applyQuarter()` L411-416 sets `dateFrom`/`dateTo`.

**Fix pattern for Bug 2:** apply the export-dialogs' pattern (inject `QuarterContextService`, call an `applyDefaultQuarter()`-equivalent synchronously in `ngOnInit` reading `defaultQuarterId()`/`quarters()`) to `dashboard.component.ts`, `absences.component.ts`, `justifications.component.ts`, instead of relying on `(quarterChange)`, which Angular Material's `mat-select` never emits for a value that arrives pre-selected via `[ngModel]`.
