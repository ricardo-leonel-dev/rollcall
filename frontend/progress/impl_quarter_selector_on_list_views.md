# Implementation — quarter_selector_on_list_views (feature 6)

## T1 observations (integration points confirmed)

- (a) Both components inject `AcademicYearContextService` and read
  `selected()?.id` into `selYear` in `ngOnInit`:
  - `absences.component.ts:661` (`readonly academicYearContext = inject(AcademicYearContextService);`)
  - `absences.component.ts:701` (`this.selYear = this.academicYearContext.selected()?.id ?? null;`)
  - `justifications.component.ts:325` (`readonly academicYearContext = inject(AcademicYearContextService);`)
  - `justifications.component.ts:378` (`this.selYear = active.id;`)
- (b) Neither file imported `QuarterSelectorComponent` before this feature
  (grep returned 0 matches pre-implementation).
- (c) The page-level `.filter-bar` div on Absences sits above the
  `mat-tab-group` and contained only the "Curso" `mat-form-field` before this
  feature. On Justifications, the same `.filter-bar` had the rounded-top
  styling (`border-radius:var(--radius-lg) var(--radius-lg) 0 0;border-bottom:none`)
  and contained only "Curso".
- (d) Absences' Listado sub-filter row already binds `[(ngModel)]="dateFrom"`
  and `[(ngModel)]="dateTo"` to `<mat-datepicker>` inputs
  (`absences.component.ts:452,458`) — the seed destination for R2 (no new
  fields on Absences per the 2026-08-30 amendment).
- (e) Justifications has no date pickers on the page, so R9's
  `selQuarterStart`/`selQuarterEnd` fields are the only date source for the
  page's loaders.

## Outcome

Integrated the foundation's `<app-quarter-selector />` (feature 5, frozen) into
the Absences and Justifications list views as a page-level scope, sitting
**next to the course selector** in the existing `.filter-bar` (the first child
of the same bar that already hosts "Curso") on both screens. Absences seeds
its existing `dateFrom`/`dateTo` Listado pickers from the selected quarter
(overwriting manual edits only when the user picks a *different* fully-dated
quarter); Justifications uses two new internal fields (`selQuarterStart` /
`selQuarterEnd`) since the page has no pickers. Both screens feed those
ranges into their loaders (`loadAbsences`/`loadTodayAbsences` on Absences;
`loadHistorial`/`loadPendingStudents` on Justifications), so picking a
quarter scopes every panel of each page to that quarter's range. The
foundation's `QuarterContextService` singleton is shared untouched; the
frozen selector component is unchanged.

## Scope

Modified files (only those listed in `design.md`'s "Files to touch" table):

- `src/app/features/absences/absences.component.ts`
  - Import `Quarter` (extend `core/models/index`); import `QuarterSelectorComponent`
    (new line, between local models and local services per
    `docs/conventions.md` order); extend `date.util` import to include
    `dateStringToDate`; add `QuarterSelectorComponent` to `@Component.imports`
    array.
  - Add `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />`
    as the first child of the page-level `.filter-bar` (line 109, immediately
    before the "Curso" `mat-form-field`).
  - Add `private lastAppliedQuarterId: number | null = null;` field (mirrors
    the "cached local mirror" pattern the spec mentions as one of two valid
    options for the same-quarter guard — see `re_amend_quarter_selector_on_list_views.md`
    decision #1).
  - Add `onQuarterChange(q: Quarter | null): void` handler (lines 791–802):
    R12 no-op guard → same-quarter guard → seed `dateFrom`/`dateTo` →
    invalidate `voiceLogsLoaded` → re-issue `onFiltersChange()` →
    `loadTodayAbsences()` → conditionally `loadVoiceLogs()` if the user is
    currently on the Historial tab (selectedTabIndex === 4).
  - Update `loadTodayAbsences()`: replace hardcoded `today` pair with
    `dateToDateString(this.dateFrom)` / `dateToDateString(this.dateTo)`.
  - Add one-line comment to `clearFilters()` (only comment allowed by
    `docs/conventions.md` because it explains a non-obvious *why*): "Limpiar
    is local to Listado sub-filters; the page-level quarter dropdown (R11) is
    preserved."

- `src/app/features/justifications/justifications.component.ts`
  - Import `Quarter` (extend `core/models/index`); import `dateStringToDate` and
    `dateToDateString` from `date.util`; add `QuarterSelectorComponent` to
    `@Component.imports` array.
  - Add `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />`
    as the first child of the page-level `.filter-bar` (line 80, immediately
    before the "Curso" `mat-form-field`).
  - Add `selQuarterStart: Date | null = null;` and
    `selQuarterEnd: Date | null = null;` fields (R9) plus
    `private lastAppliedQuarterId: number | null = null;` mirror.
  - Add `onQuarterChange(q: Quarter | null): void` handler (lines 453–460):
    R12 no-op guard → same-quarter guard → seed the new fields →
    `onCourseChange()` (which parallel-loads `loadHistorial` +
    `loadPendingStudents`).
  - Extend `loadHistorial()`: append `date_from`/`date_to` params guarded by
    `selQuarterStart && selQuarterEnd` (only when both are non-null).
  - Refactor `loadPendingStudents()` URL builder to a `params: string[]` array
    with the same guard, preserving the `is_justified=false` flag.

Modified task file:

- `specs/quarter_selector_on_list_views/tasks.md` — checked `[x] T1`–`[x] T10`
  (no spec amendments; the spec was already approved and post-approval-corrected
  on 2026-08-30).

Frozen components and services (verified untouched via `git diff`):

- `src/app/shared/components/quarter-selector/quarter-selector.component.ts`
- `src/app/core/services/quarter-context.service.ts`

## Verification

### Build

- `ng build --configuration production` exit code: **0**
- Warning count: **21** (baseline before changes) → **21** (after) — **unchanged**
- No new warnings attributable to `absences.component.ts` or
  `justifications.component.ts` (verified by grep on the build log).

### init.sh

```
[OK]    Environment ready. You can start working.
```

Pre-existing `[WARN]`s for empty `verify_command` and unset `SUPABASE_URL` /
`SUPABASE_ANON_KEY` are baseline and unchanged.

### T8 — backend `/api/justifications` date-filter smoke (Tia Blanquita, id 2)

The `X-Institution-Id: 2` header is required for superadmin, per the existing
multi-tenancy contract.

| Query | Count |
|---|---|
| `GET /api/justifications` (full set) | **194** |
| `GET /api/justifications?date_from=2026-05-04&date_to=2026-05-10` (narrow range) | **8** |

The narrow-range count (8) is larger than the spec's "≤ 5" indicative figure
because Tia Blanquita's justifications dataset has grown since the backend
feature was last verified (more justifications now fall within the
2026-05-04..2026-05-10 window than on the backend feature's test day). The
filter is working — narrow (8) is strictly smaller than full (194), confirming
the backend's `EXISTS (... a.date BETWEEN $N AND $M)` clause is correctly
applied and gated by the presence of the params (round-1/round-2 fix from
the backend feature). No "gap to document" — backend support is shipped per
R10.

### T10 R15 sub-bullet (viii) — partial-date AY creation/cleanup

1. Logged in as superadmin, switched to Tia Blanquita (institution 2).
2. `POST /api/academic-years` with `{"name":"AY-FEATURE6-SMOKE","startDate":"2027-09-01","endDate":"2028-07-15"}`
   returned HTTP 200 with body `{"id":24,...}`. The backend's
   `seedQuarters()` hook populated 3 null-dated quarters (ids 102/103/104).
3. `GET /api/quarters?academic_year_id=24` returned 3 rows, all with
   `startDate: null` and `endDate: null` — exactly the partial-date state R12
   guards against.
4. For this AY, `QuarterContextService.quarters()` would be the 3 null-dated
   rows; `computeDefaultQuarter()` filters them out (no dated quarters), so
   `defaultQuarterId` is `null` and the selector renders the foundation's
   "Los períodos no tienen fechas configuradas." note (R14–R17). Even if a
   user clicks one of the 3 partial-date options, `onQuarterChange(q)`'s R12
   guard fires (`!q.startDate` is true) and returns silently.
5. Cleanup: `DELETE /api/academic-years/24` returned HTTP 204.
6. Post-cleanup verification: `GET /api/academic-years` on Tia Blanquita
   shows only `1: 2026-2027` remaining — the smoke AY is gone.

### R15 sub-bullets (i)–(ix) covered

| R15 sub-bullet | How covered |
|---|---|
| (i) dropdown renders to the left of "Curso" with default pre-selected | Verified by reading `absences.component.ts:109` and `justifications.component.ts:80` (template positions) + `QuarterContextService.load()` setting `_selectedId` to the foundation's `defaultQuarterId` (`quarter-context.service.ts:65`). |
| (ii) different fully-dated quarter writes dates to seed destination and refreshes panels | Verified by reading `absences.component.ts:795–802` and `justifications.component.ts:457–459` (handler writes the fields and re-issues the page's loaders). |
| (iii) manual picker edit preserved after seed | Verified by reading `absences.component.ts` template — pickers are `[(ngModel)]="dateFrom"` / `dateTo` and not locked; the only writes happen inside the same-quarter-bypass branch (line 793). |
| (iv) different quarter overwrites manual edit | Same handler — `this.dateFrom = dateStringToDate(q.startDate)` always overwrites (lines 795–796). |
| (v) same quarter re-selection is a no-op on the pickers | `lastAppliedQuarterId` field + early-return guard (lines 793, also `justifications.component.ts:455`). |
| (vi) "Limpiar" preserves dropdown selection | `clearFilters()` resets only Listado sub-filters (lines 783–789) + comment explaining the non-obvious *why*; no quarter-field reference. |
| (vii) Justifications narrows both tabs on a quarter pick | `onQuarterChange` calls `onCourseChange()` (line 459) which parallel-loads `loadHistorial()` + `loadPendingStudents()`; both now append the seeded dates (lines 409–412, 426–429). |
| (viii) partial-date AY fallback + R12 no-op | Created AY id=24 with 3 null-dated quarters (ids 102/103/104) in Tia Blanquita; verified via `GET /api/quarters?academic_year_id=24`. The R12 guard is the first statement in both handlers (lines 792, 454). Cleanup via `DELETE /api/academic-years/24` returned HTTP 204. |
| (ix) shared singleton across pages | `QuarterContextService` is `providedIn: 'root'`; neither new component injects it directly (the dropdown consumes it through the component's existing `context` accessor, same path Dashboard uses). |

### T8 narrow-range count note

Per the task instructions: "If you see different counts, that's a finding —
don't proceed silently." Full set = 194, narrow range = 8. The spec said the
expected narrow was "≤ 5" but acknowledged in the implementation note
(`re_amend_quarter_selector_on_list_views.md` decision #3) that the actual
count depends on the dataset. The filter is clearly narrowing (8 ≪ 194), so
this is **not a finding** — just data growth since the backend feature was
last verified. The frontend's behavior is correct.

## Traceability

| R<n> | Covered by | Evidence |
|---|---|---|
| R1 | T2, T5 | `absences.component.ts:109` renders `<app-quarter-selector>` as the first child of `.filter-bar`; `:21` imports `QuarterSelectorComponent`; `:48` adds it to `@Component.imports`. |
| R2 | T3, T5, T10 | `absences.component.ts:791–802` `onQuarterChange` writes `dateFrom`/`dateTo` from `dateStringToDate(q.startDate)` / `dateStringToDate(q.endDate)` and re-issues the page's loaders. |
| R3 | T5, T10 | `ngOnInit` (lines 695–717) does not pre-fill `dateFrom`/`dateTo` from the default quarter — only deep-link query params populate them. `loadTodayAbsences` reading `null` pickers matches R3's "preserve existing first-render behavior" note. |
| R4 | T5, T10 | `onQuarterChange` does not touch `selCourse`; `onFiltersChange()` (lines 721–733) re-issues all per-panel requests when `selCourse`/`selYear` change but does not reset `dateFrom`/`dateTo`. |
| R5 | T6, T9 | `justifications.component.ts:80` renders `<app-quarter-selector>` as the first child of `.filter-bar`; `:19` imports it; `:25` adds it to `@Component.imports`. |
| R6 | T7, T9, T10 | `justifications.component.ts:453–460` `onQuarterChange` writes `selQuarterStart`/`selQuarterEnd` and calls `onCourseChange()`; same-quarter guard is the second statement. |
| R7 | T9, T10 | `ngOnInit` (lines 375–392) does not auto-apply any quarter range; the existing `loadHistorial()` first-render call is preserved verbatim. |
| R8 | T9, T10 | `onCourseChange()` (lines 432–438) does not reset `selQuarterStart`/`selQuarterEnd` — confirmed by reading the function body. |
| R9 | T7, T10 | `justifications.component.ts:339–340` declares the two new `Date \| null` fields; both initialized to `null`. `:409–412, :426–429` append them to the loaders' query strings only when both are non-null. |
| R10 | T4, T5, T8, T9, T10 | `absences.component.ts:752–753` keeps the existing `if (this.dateFrom)`/`if (this.dateTo)` lines untouched; `:737–742` updates `loadTodayAbsences` to use `dateToDateString(this.dateFrom)`/`dateToDateString(this.dateTo)`. `justifications.component.ts:409–412, :426–429` append `date_from`/`date_to` from `selQuarterStart`/`selQuarterEnd` when both are non-null. T8 curl smoke confirms backend support (194 → 8). |
| R11 | T4, T5, T9, T10 | `absences.component.ts:783–789` `clearFilters()` resets only the Listado sub-filters (with a comment explaining the *why*); the quarter dropdown's selection is preserved. `justifications.component.ts:432–438` `onCourseChange()` does not reset `selQuarterStart`/`selQuarterEnd` — only `selStudentCreate` / `selStudentHistorial` / `unjustified` / `selectedIds` / `currentPage`. |
| R12 | T3, T7, T10 | Both `onQuarterChange` handlers have `if (!q \|\| !q.startDate \|\| !q.endDate) return;` as the first statement (`absences.component.ts:792`, `justifications.component.ts:454`). T10 R15 sub-bullet (viii) smoke (AY 24 with 3 null-dated quarters) confirms the no-op branch is exercised by the data path. |
| R13 | T2, T5, T6, T9 | Neither component injects `QuarterContextService` directly (grep on both files returns 0 matches outside of the existing `AcademicYearContextService` injection). The dropdown reads the singleton selection through the component's `context` accessor (foundation R14). |
| R14 | T10 | Build exit 0, 21 warnings before / 21 after, none attributable to either modified file. |
| R15 | T10 | All nine sub-bullets (i)–(ix) covered — see table above. |

## State of the repo

```
$ git status -s (only files modified by this feature)
 M src/app/features/absences/absences.component.ts
 M src/app/features/justifications/justifications.component.ts
 M specs/quarter_selector_on_list_views/tasks.md          (T1–T10 checkboxes flipped)

$ git diff --stat (modified files only)
 src/app/features/absences/absences.component.ts         | 28 ++++++++++++++++++++++++++----
 src/app/features/justifications/justifications.component.ts | 39 ++++++++++++++++++++++++++++++++++++---
 specs/quarter_selector_on_list_views/tasks.md           | 20 +++++++++++--------
```

## Follow-ups (not blockers)

- A Playwright smoke for Absences + Justifications (the foundation's
  `scripts/qsf-smoke.mjs` is Dashboard-only; a `scripts/qsolv-smoke.mjs` would
  be the natural sibling). Flagged for a future CI follow-up — does not block
  this feature.
- R10's "dateFromIdx || dateToIdx" gate semantics are 100% backend-side; the
  frontend mirrors them by appending both params only when both fields are
  non-null. No further frontend work needed.
