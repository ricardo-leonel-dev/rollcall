# Design — Fix quarter selector sort order, date-picker sync, and Excel export quarter

## Files touched

| File | Change |
|---|---|
| `src/app/core/services/quarter-context.service.ts` | Replace the sort comparator in `load()` (R1). |
| `src/app/features/dashboard/dashboard.component.ts` | Inject `QuarterContextService`; add `applyDefaultQuarter()`; call it first in `ngOnInit()` (R2, R3). |
| `src/app/features/absences/absences.component.ts` | Inject `QuarterContextService`; add `applyDefaultQuarter()`; call it first in `ngOnInit()` (R4, R5, R7). |
| `src/app/features/justifications/justifications.component.ts` | Inject `QuarterContextService`; add `applyDefaultQuarter()`; call it first in `ngOnInit()` (R6, R7). |
| `src/app/features/student-report/excel-export-dialog.component.ts` | Append `quarter_id` to the export URL when `activeQuarterId()` is non-null (R8, R9). |

No new files, no new dependencies, no backend/`excel-service` changes (R10 is verified end-to-end but
implemented entirely by R8; the receiving side already shipped in a prior feature — see
`progress/explore_export_quarter_bug.md` Hop 2/3).

## R1 — sort comparator

```ts
// quarter-context.service.ts, load()
const sorted = [...list].sort((a, b) => {
  if (a.startDate === null && b.startDate === null) return 0;
  if (a.startDate === null) return 1;
  if (b.startDate === null) return -1;
  return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
});
```

This is the exact comparator shape already used correctly in `admin.component.ts`'s `quarterRowsFor()`
(lines 471–486), inlined at the single point (`QuarterContextService.load()`) that feeds every consumer
of `context.quarters()` — the dropdown, both export dialogs' pill lists, and (indirectly, since it reads
the same signal) `computeDefaultQuarter()`'s tie-break logic, which already breaks ties by
`sequenceNumber` independent of list order and is unaffected by this change.

**Discarded alternative:** sort in each consumer instead (`quarter-selector.component.ts`,
`excel-export-dialog.component.ts`'s `getDatedQuarters()`, `export-config-dialog.component.ts`'s
`getDatedQuarters()`). Rejected because it triples the comparator logic across files that would need to
stay byte-identical, and this codebase's own convention (`docs/conventions.md` "Reusability") already
prefers a shared context service over repeating the same 2–3 bindings/behaviors per host — sorting once
where the signal is populated is the same principle applied to ordering.

## R2–R7 — `applyDefaultQuarter()` in the three broken components

Reference pattern (already shipped, correct) —
`ExcelExportDialogComponent`:

```ts
private readonly quarterContext = inject(QuarterContextService);
async ngOnInit(): Promise<void> {
  this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
  this.applyDefaultQuarter();
}
private applyDefaultQuarter(): void {
  const id = this.quarterContext.defaultQuarterId();
  if (id === null) return;
  const q = this.quarterContext.quarters().find(qq => qq.id === id);
  if (q) this.applyQuarter(q);
}
```

This works today because `layout.component.ts:328–342` `await`s `AcademicYearContextService.load()` then
`QuarterContextService.load()` before flipping `institutionReady` (which gates the routed
`<router-outlet>`), so by the time any feature component's `ngOnInit` runs,
`quarterContext.defaultQuarterId()`/`quarters()` are already populated — no race, no extra `await`
needed inside the new `applyDefaultQuarter()` methods.

**`DashboardComponent`** (new method, called first in `ngOnInit`):

```ts
private readonly quarterContext = inject(QuarterContextService);
async ngOnInit(): Promise<void> {
  this.applyDefaultQuarter();
  this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
  this.selectedYear = this.academicYearContext.selected()?.id ?? null;
  await this.loadSummary();
}
private applyDefaultQuarter(): void {
  const id = this.quarterContext.defaultQuarterId();
  if (id === null) return;
  const q = this.quarterContext.quarters().find(qq => qq.id === id);
  if (!q || !q.startDate || !q.endDate) return;
  this.selectedPeriod = 'custom';
  this.customFrom = dateStringToDate(q.startDate);
  this.customTo = dateStringToDate(q.endDate);
}
```

Called before `loadSummary()` so the single existing `loadSummary()` call in `ngOnInit` already computes
its date range (via `computeDateRange()`'s `'custom'` branch) from the seeded values — no second fetch
added. `showCustomPanel` is deliberately left `false` (unchanged): it only controls whether the
inline custom-range picker panel is expanded, not which range is active.

**`AbsencesComponent`** (new method, called first in `ngOnInit`, before the `Promise.all([...])`):

```ts
private readonly quarterContext = inject(QuarterContextService);
async ngOnInit(): Promise<void> {
  this.applyDefaultQuarter();
  const [courses, me] = await Promise.all([...]);
  // ...unchanged...
}
private applyDefaultQuarter(): void {
  const id = this.quarterContext.defaultQuarterId();
  if (id === null) return;
  const q = this.quarterContext.quarters().find(qq => qq.id === id);
  if (!q || !q.startDate || !q.endDate) return;
  this.dateFrom = dateStringToDate(q.startDate);
  this.dateTo = dateStringToDate(q.endDate);
  this.lastAppliedQuarterId = q.id;
}
```

Deliberately does not call `onFiltersChange()`/`loadTodayAbsences()` — no course is selected yet at this
point (`this.selCourse` is unset unless the `courseParam` branch further down sets it), and
`onFiltersChange()` is already guarded by `if (this.selCourse && this.selYear)`. The existing
`courseParam` branch (lines 707–719) runs after this and, if present, overwrites `dateFrom`/`dateTo` from
its own query params (R5) — unchanged.

**`JustificationsComponent`** (new method, called first in `ngOnInit`, before `this.courses.set(...)`):

```ts
private readonly quarterContext = inject(QuarterContextService);
async ngOnInit(): Promise<void> {
  this.applyDefaultQuarter();
  this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
  // ...unchanged...
}
private applyDefaultQuarter(): void {
  const id = this.quarterContext.defaultQuarterId();
  if (id === null) return;
  const q = this.quarterContext.quarters().find(qq => qq.id === id);
  if (!q || !q.startDate || !q.endDate) return;
  this.selQuarterStart = dateStringToDate(q.startDate);
  this.selQuarterEnd = dateStringToDate(q.endDate);
  this.lastAppliedQuarterId = q.id;
}
```

Placed before the existing `selYear`/`courseParam` branching so that branch's own initial fetch
(`onCourseChange()` or `loadHistorial()`) already reads the seeded `selQuarterStart`/`selQuarterEnd` —
same "seed before the pre-existing initial fetch" ordering used for Dashboard/Absences, so no separate
requirement is needed to force a second fetch.

**Discarded alternative:** make `QuarterSelectorComponent` itself emit `quarterChange` once on init
(e.g. an `effect()` or an `ngOnInit` that reads `context.selectedId()` and emits synthetically) instead
of touching the three consumer components. Rejected for two reasons: (1) it would re-fire on every
`QuarterSelectorComponent` re-instantiation (route navigation away and back), which is functionally
equivalent to the user re-picking the same quarter — a case `onQuarterChange()`'s
`lastAppliedQuarterId` guard exists specifically to no-op, so a synthetic re-emit would either need to
duplicate that guard inside the shared selector (leaking consumer-specific state into a
feature-agnostic `shared/` component, against `docs/conventions.md`'s "Reusability" guidance) or bypass
it; (2) the feature description explicitly names the two already-shipped export dialogs as the
reference pattern to replicate ("inject `QuarterContextService` directly and call an
`applyDefaultQuarter()` in `ngOnInit`"), so making the three broken components consistent with the two
working ones is both the smaller diff and the one the acceptance criteria point to.

## R8, R9 — export URL

```ts
// excel-export-dialog.component.ts, downloadExcel()
const courseIds = this.selCourseIds.join(',');
const quarterParam = this.activeQuarterId() !== null ? `&quarter_id=${this.activeQuarterId()}` : '';
const url = `/api/export/excel?course_ids=${courseIds}&academic_year_id=${year.id}` +
  `&date_from=${dateToDateString(this.dateFrom)}&date_to=${dateToDateString(this.dateTo)}${quarterParam}`;
```

`activeQuarterId` is already correctly maintained: `applyQuarter()` sets it when a pill is clicked
(line 176), and both manual date inputs already reset it to `null` on edit
(`(ngModelChange)="activeQuarterId.set(null)"`, lines 94 and 101) — so R9's "don't send `quarter_id` for
a fully custom range" falls out of existing state management with no new code beyond the conditional
string above.

**Discarded alternative:** resolve `quarter_sequence`/`quarter_name` client-side (reading them off the
already-fetched `Quarter` object) and send those directly instead of `quarter_id`. Rejected because
`export.service.ts:20–27` already performs that resolution server-side, and crucially also re-validates
that the quarter belongs to the requested `academic_year_id` (`if (quarter.academicYearId !==
academicYearId) throw ... 404`) — sending the raw `quarter_id` preserves that server-side authorization
check instead of trusting client-computed values; it's also the parameter name `export.controller.ts`
already parses (line 17), so no backend change is possible or needed, consistent with this feature's
frontend-only scope constraint.

## Error handling

No new error paths. `downloadExcel()`'s existing `try/catch` (`excel-export-dialog.component.ts:215–219`)
already wraps the whole request, including the now-conditionally-longer URL; a 404 from the backend's
quarter-ownership check (an edge case not newly reachable by this change, since `activeQuarterId()` can
only hold an id already present in `getDatedQuarters()`, which is itself scoped to the active academic
year) surfaces through the same `NotificationService.error('Error al exportar')` path as any other export
failure. The three `applyDefaultQuarter()` methods have no failure path beyond `if (!q || ...) return;`
— consistent with the identical early-return guard in the two reference implementations.
