# Implementer handoff — quarter_selector_foundation (feature 5)

## Outcome

Added a new shared `QuarterContextService` (`core/services/quarter-context.service.ts`)
and a reusable `QuarterSelectorComponent`
(`shared/components/quarter-selector/quarter-selector.component.ts`), wired the
component into the Dashboard's filter bar, and added the optional
`academic_year_id` query parameter to `QuarterService.getAll()` so the service
can scope the quarter list to the year currently selected in
`AcademicYearContextService` (R1/R5). The service reactively reloads on year
switch (R5) and resets the selected quarter to the freshly computed default for
the new year (R18). The default-quarter computation is a pure function
`computeDefaultQuarter(quarters, today)` colocated in the same file and tested
against the five required fixtures (R6–R11). The Dashboard's existing
`'custom'` codepath handles the range/scoped-summary re-fetch (R22/R24);
selecting a quarter with only one of `startDate`/`endDate` set is a no-op (R23).
The new component renders an empty-state message when the year has no quarters
(R15), an inline note when no quarter has both dates (R16), and a direction-aware
note when the default was resolved via R8/R9 rather than R6/R7 (R19).

## Scope

### Files added
| File | Purpose |
|---|---|
| `src/app/core/services/quarter-context.service.ts` | `QuarterContextService` (`providedIn: 'root'`, signal/computed-based, mirrors `AcademicYearContextService`'s shape) + the pure `computeDefaultQuarter(quarters, today)` helper. |
| `src/app/shared/components/quarter-selector/quarter-selector.component.ts` | `QuarterSelectorComponent` — standalone, OnPush, zero required inputs, single `quarterChange` output, dropdown + dated/fallback notes + empty/loading guards. |
| `scripts/qsf-smoke.mjs` | Playwright Level-3 smoke that serves `dist/frontend/browser` on port 4321 with `/api/*` proxied to the real backend on :3000, logs in as `superadmin`/`Admin2026!`, and exercises the dropdown against the real Tia Blanquita institution. |

### Files modified
| File | Change | Requirements |
|---|---|---|
| `src/app/core/services/quarter.service.ts` | `getAll()` gained an optional `academicYearId?: number` parameter, forwarded as `?academic_year_id=` via `HttpParams` when provided; zero-arg calls remain byte-for-byte unchanged (`GET /api/quarters`, no query string). Imported `HttpParams`. | R1 |
| `src/app/shared/layout/layout.component.ts` | Imported `QuarterContextService` and added `quarterContext` as a `readonly` injected field. `ngOnInit` now `await`s `quarterContext.load()` after `academicYearContext.load()` resolves, before `institutionReady.set(true)`. | R2 |
| `src/app/features/dashboard/dashboard.component.ts` | Imported `Quarter` (extended the existing `core/models/index` import) and `dateStringToDate` (extended the existing `date.util` import); added `QuarterSelectorComponent` to `@Component.imports`; placed `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` as the first child of the existing `.filter-bar` (immediately before the "Curso" `mat-form-field`); added `onQuarterChange(q: Quarter | null)` that returns immediately when the quarter lacks a full date pair (R23) and otherwise mirrors the existing `'custom'` preset codepath (sets `selectedPeriod = 'custom'`, `customFrom`/`customTo` via `dateStringToDate`, hides `showCustomPanel`, calls `loadSummary()`). | R20–R24 |

No other files were touched. `selectPeriod()` and `onCustomDateChange()` in
`dashboard.component.ts` were verified to **not** reference `QuarterContextService`
(grep returned no matches outside the new `onQuarterChange` and import), so R24's
"presets and dropdown are independent inputs" contract holds without code changes.

## Verification

### `pnpm run build` (`ng build --configuration production`) — PASS

- Exit code: **0**
- Warning count: **21** (unchanged from the baseline of 21 captured before
  this feature's first commit).
- All remaining warnings are pre-existing infra issues (NG8107 `?.` in
  students/student-management; `@import`-ordering in `styles.css`; bundle
  budget warnings on the unchanged `login`, `layout`, `calendar`,
  `export-config-dialog`, `justification-create-dialog` styles). None of them
  point at the four files touched/added by this feature.

### `./init.sh` — PASS

- `[OK] Environment ready.`
- Both `[WARN]` lines are pre-existing infra config (empty `verify_command`
  in `.harness.json`; unset `SUPABASE_URL`/`SUPABASE_ANON_KEY` env vars).
  They are unchanged from the baseline.

### `computeDefaultQuarter` fixtures (T4 done-condition)

The pure function was extracted into a Node script (`/tmp/test_computeDefaultQuarter.mjs`,
mirroring the source verbatim) and run with `today = '2026-08-29'`:

| Fixture | Description | Result | Match |
|---|---|---|---|
| (i) | single quarter containing today | `{id:1, isFallback:false, direction:null}` | R6 ✓ |
| (ii) | two overlapping quarters both containing today | `{id:11, isFallback:false, direction:null}` (sequenceNumber 2 wins over 5) | R6/R7 ✓ |
| (iii) | today in a gap between two fully-dated quarters | `{id:20, isFallback:true, direction:'past'}` | R8 ✓ |
| (iv) | today before the first fully-dated quarter, no past | `{id:30, isFallback:true, direction:'future'}` | R9 ✓ |
| (v) | every quarter has only one of `startDate`/`endDate` set (or neither) | `{id:null, isFallback:false, direction:null}` | R10/R11 ✓ |

### Backend `GET /api/quarters` interaction check (R1 / R5 supporting evidence)

- `GET /api/quarters` (no arg) → returns the active year's quarters
  (3 rows for Tia Blanquita / AY 1: T2, T3, T1 — sorted by `sequenceNumber`
  asc on the wire, matching R3).
- `GET /api/quarters?academic_year_id=1` → identical response (since AY 1 is
  the active one), confirming the new `HttpParams`-based forwarding.
- `GET /api/quarters?academic_year_id=99999` → HTTP 404 with
  `{"error":"Academic year not found"}` (matches the cross-reference in
  `requirements.md`).
- `GET /api/quarters?academic_year_id=abc` → HTTP 400 with
  `{"error":"academic_year_id debe ser un entero positivo"}` (matches the
  cross-reference).

### Level-3 smoke against the real stack (T15)

`scripts/qsf-smoke.mjs` was created and run against the already-running docker
compose stack (`docker compose ps` confirmed `frontend`, `backend`,
`excel-service`, `postgres`, `redis` all up; full log at
`progress/qsf_smoke_log.json`, screenshot at `progress/qsf_smoke_dashboard.png`).
The script serves the freshly-built `dist/frontend/browser` on `:4321` (so the
nginx-served `:80` frontend is bypassed — it still hosts the pre-feature build
from the running container image) and proxies `/api/*` to the real backend on
`:3000`. Logged in as `superadmin` / `Admin2026!` and forced `X-Institution-Id: 2`
(Tia Blanquita). Observations:

- **`app-quarter-selector` rendered**: count=1 (R12 ✓)
- **`mat-select` rendered inside the selector**: count=1 (R12 ✓)
- **Open dropdown option texts** (in dropdown order): `["Segundo Trimestre",
  "Tercer Trimestre", "Primer Trimestre"]` — sorted by `sequenceNumber` (T2=2,
  T3=3, T1=4 in this institution's data; R3 ✓). The fact that the chronological
  first quarter has `sequenceNumber=4` (not 1) reflects the existing admin-side
  reality — `admin.component.ts`'s `quarterRowsFor()` deliberately reorders by
  `startDate` instead of `sequenceNumber` for the same reason — and does not
  indicate a bug.
- **Default selected text**: `"Segundo Trimestre"` (T2, id=2). Today is
  2026-08-29, which falls in T2's `2026-08-11` – `2026-11-06` range. R6 ✓
  (containing match; no fallback).
- **Fallback / no-dates note visible**: count=0 (correct — R6/R7 won, not
  R8/R9, so R19's note is correctly hidden).
- **Clicking "Primer Trimestre"** (T1, id=9) → chart header updates to
  `"Inasistencias — 2026-05-04 – 2026-08-07"` (T1's actual `startDate`/
  `endDate` values), confirming R22 ✓ — the chart was re-scoped to the
  quarter's date range and a new `GET /api/dashboard/summary` fired
  (one extra request observed in `page.on('request')`).

Smoke steps not exercised (out of session scope; would need a disposable
academic year or admin-side manipulation, see "T15 gaps" below): R8/R9
fallback note with `isViewingActiveYear` true and a gap configured; R15 empty
list (Tia Blanquita always has 3 quarters); R17 loading placeholder (load
resolves too quickly to catch in a smoke run); R23 no-op on partial-date
selection (no current Tia Blanquita quarter has a missing date — the only
real-world source is `seedQuarters()` on a freshly-created AY, and creating
one would require admin-only data mutation that the smoke-script contract
defers to the reviewer's manual pass per `docs/verification.md` Level 3).

## Traceability (R<n> → file:line)

| R<n> | Code / file:line | Evidence |
|---|---|---|
| R1 | `src/app/core/services/quarter.service.ts:28-36` (`getAll(academicYearId?: number)`); `src/app/core/services/quarter-context.service.ts:62-65` (load uses `quarterService.getAll(academicYearId ?? undefined)`) | `HttpParams().set('academic_year_id', String(academicYearId))` only when defined; zero-arg call passes `{}`. Verified by `curl -s "http://localhost:3000/api/quarters?academic_year_id=1"` returning the same rows as no-arg. |
| R2 | `src/app/shared/layout/layout.component.ts:327-340` (the extended `ngOnInit`) | `await this.quarterContext.load()` runs strictly after `await this.academicYearContext.load()` and before `this.institutionReady.set(true)`. |
| R3 | `src/app/core/services/quarter-context.service.ts:64` (`const sorted = [...list].sort((a, b) => a.sequenceNumber - b.sequenceNumber);`) | Smoke: dropdown order `["Segundo Trimestre", "Tercer Trimestre", "Primer Trimestre"]` = sequenceNumber 2, 3, 4 ascending. |
| R4 | `src/app/core/services/quarter-context.service.ts:21, 33-36, 71-73` | `selectedId` (`asReadonly`), `selected` (`computed`), `select(id: number | null): void` mirror `AcademicYearContextService`. |
| R5 | `src/app/core/services/quarter-context.service.ts:48-56` (`effect()` in the constructor) | Watches `academicYearContext.selectedId()`; only fires when `this._loaded()` is already `true` (skipping the bootstrap tick where AcademicYearContextService's `load()` resolves and sets `selectedId()` for the first time). |
| R6 | `src/app/core/services/quarter-context.service.ts:91-94` (`containing` branch in `computeDefaultQuarter`) | Fixture (i) + smoke: today=2026-08-29, T2 (id=2) range `2026-08-11` – `2026-11-06` contains today → default id=2. |
| R7 | Same `:93` (`reduce` lowest-`sequenceNumber` tie-break) | Fixture (ii): two overlapping quarters, sequenceNumber 2 wins over 5. |
| R8 | `src/app/core/services/quarter-context.service.ts:96-100` (`past` branch) | Fixture (iii): today in gap, earlier quarter with `endDate < today` wins; `isFallback: true, direction: 'past'`. |
| R9 | `src/app/core/services/quarter-context.service.ts:102-106` (`future` branch) | Fixture (iv): today before any started quarter, earliest future wins; `isFallback: true, direction: 'future'`. |
| R10 | `src/app/core/services/quarter-context.service.ts:108` (`return { id: null, ... }`) | Fixture (v): all partial-date quarters → `{id: null, isFallback: false, direction: null}`. |
| R11 | `src/app/core/services/quarter-context.service.ts:89` (`dated = quarters.filter(q => q.startDate && q.endDate)`) | Filter applied up front; partial-date quarters remain in `quarters()` for manual selection but never enter any branch. |
| R12 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:41-51` (template's `@else` branch) + `:69` (injects `context = QuarterContextService`) | Smoke: `app-quarter-selector` count=1, options rendered. |
| R13 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:76-79` (`onSelect(id)`) + `:71` (`quarterChange = output<Quarter \| null>()`) | `[ngModel]` bound to `context.selectedId()`, `(ngModelChange)` → `onSelect` → `context.select(id)` then emit `find(q => q.id === id) ?? null`. |
| R14 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:69` (`context` injected directly, no `@Input()` declared) | Dashboard usage: `<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` with zero inputs. |
| R15 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:35-37` (`@else if (context.quarters().length === 0)` branch) | Renders `<div class="quarter-selector-note">No hay períodos configurados para este año lectivo.</div>`; not exercised in smoke (Tia Blanquita always has 3 quarters); covered by template review. |
| R16 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:54-56` (`@if (!hasAnyDatedQuarter())`) | `<span class="quarter-selector-note beside">Los períodos no tienen fechas configuradas.</span>`. `hasAnyDatedQuarter()` at `:81`. |
| R17 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:31-33` (first guard) | Renders `<div class="quarter-selector-placeholder">Cargando períodos…</div>` while `context.loaded()` is false; supersedes R15 + dropdown while loading. |
| R18 | `src/app/core/services/quarter-context.service.ts:65-69` (inside `load()`: `this._selectedId.set(id)` overwrites the previous selection after the new `defaultQuarterId` is computed) | The reactive `effect()` in `:48-56` triggers `load()` on year switch; `load()` itself sets `_selectedId` to the freshly computed default for the new year's list. The previous selection is dropped by replacement, not by a separate "reset" call. |
| R19 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:57-62` (`@else if (context.defaultWasFallback() && context.selectedId() === context.defaultQuarterId())`) | Renders `<span>Hoy está fuera de los períodos definidos — mostrando {{ direction === 'past' ? 'el período más reciente' : 'el próximo período' }}.</span>`; secondary guard (`selectedId() === defaultQuarterId()`) makes the note disappear as soon as the user picks a different, non-default quarter. |
| R20 | `src/app/features/dashboard/dashboard.component.ts:52` (`<app-quarter-selector (quarterChange)="onQuarterChange($event)" />` placed as the first child of the existing `.filter-bar`) | Smoke screenshot: dropdown visible to the left of the "Curso" `mat-form-field` and above the period-pill row. |
| R21 | `src/app/core/services/quarter-context.service.ts:69` (`this._selectedId.set(id)` inside `load()`) + smoke observation "default selected text: 'Segundo Trimestre'" | The dropdown shows the computed default the instant it renders; `DashboardComponent.ngOnInit` was not modified, so `selectedPeriod` stays `'full'` and `loadSummary()` is still called exactly once (the original `ngOnInit` flow). |
| R22 | `src/app/features/dashboard/dashboard.component.ts:357-364` (`onQuarterChange` body) | Smoke observation: clicking "Primer Trimestre" updated chart header to `"Inasistencias — 2026-05-04 – 2026-08-07"` (T1's actual range) — same codepath as the existing `'custom'` preset (`selectedPeriod = 'custom'`, `customFrom`/`customTo`, `showCustomPanel = false`, `loadSummary()`). |
| R23 | `src/app/features/dashboard/dashboard.component.ts:358` (`if (!q \|\| !q.startDate \|\| !q.endDate) return;`) | Partial-date selection is a silent no-op — no `selectedPeriod` mutation, no `loadSummary()` call. Not exercised in smoke (Tia Blanquita's quarters all have full dates); covered by code review + the existing defensive layer rationale in `requirements.md`. |
| R24 | `src/app/features/dashboard/dashboard.component.ts:347-356` (`selectPeriod()`, `onCustomDateChange()` — unchanged, no `QuarterContextService` references) | grep `quarterContext\|QuarterContextService` in the file → 0 matches outside the new `onQuarterChange` + imports + template. The two existing entry points never touch the quarter context, so clicking a pill does not reset the dropdown's visible selection. |
| R25 | `src/app/shared/components/quarter-selector/quarter-selector.component.ts:13-26` (component `styles`) | `color: var(--muted-strong)`, Nunito 12px, `display: inline-flex` + `align-items: center` for `.quarter-selector-placeholder`/`.quarter-selector-note`; `margin-left: 8px` on the `.beside` modifier for the beside-dropdown annotations (R19, R16) so they don't crash into the field outline; `min-height: 40px` on the host envelope so the filter bar height doesn't jump between states. `grep -nE "#[0-9a-fA-F]{3,8}"` on the new file returns 0 matches — every color is a `var(--*)` reference. |
| R26 | `pnpm run build` exit 0, 21 warnings (unchanged from baseline). | Verified by `grep -c "WARNING"` against the build output before and after this feature's changes. |

### Re-amend deviations from `tasks.md`

- **T8's "wrong year" guard branch was NOT rendered.** `design.md`'s discarded
  alternative #5 ("Update (revisited, 2026-08-29)") explicitly retires the
  guard: *"R18's original 'only available for the active year' guard message
  has been retired in favor of real year-scoped behavior."* The template now
  goes `(1) loading → (2) empty quarters → (3) dropdown (+ annotations)` —
  the `!context.isViewingActiveYear()` branch is omitted. `isViewingActiveYear`
  is still exposed as a computed (T3) and is internally useful for any future
  consumer; the only consumer today is the service's own `effect()` for R5
  reasoning, not the template. If the reviewer disagrees, adding the branch
  back is one `@else if` plus one extra `<div>`.

- **`QuarterService.getAll(academicYearId)` is called WITH the id, not with
  zero args.** T1's literal text reads *"calls `this.quarterService.getAll()`"*
  but R1's contract (and `design.md`'s `QuarterService.getAll(academicYearId?: number)`
  change in the "Files to touch" table) explicitly says `getAll(academicYearId)`
  — without the id, R5's reactive reload against a different year would still
  hit the backend with no query string and silently return the active-year
  quarters, breaking R1. Implementation passes
  `this.academicYearContext.selectedId() ?? undefined`.

## State of the repo

```
$ git status -s (src/ + scripts/ scope only — excludes pre-existing sibling-project dirty state)

 M src/app/core/services/quarter.service.ts
 M src/app/features/dashboard/dashboard.component.ts
 M src/app/shared/layout/layout.component.ts
?? src/app/core/services/quarter-context.service.ts
?? src/app/shared/components/quarter-selector/
?? scripts/qsf-smoke.mjs
?? progress/qsf_smoke_dashboard.png
?? progress/qsf_smoke_log.json
```

```
$ git diff --stat src/

 src/app/core/services/quarter.service.ts   | 11 ++++++++--
 src/app/features/dashboard/dashboard.component.ts | 25 +++++++++++++++++++++++
 src/app/shared/layout/layout.component.ts | 10 ++++++++
 3 files changed, 44 insertions(+), 2 deletions(-)
```

(`src/app/core/models/index.ts`, `src/app/features/admin/admin.component.ts`,
`src/app/features/admin/quarters-dialog.component.ts`, `src/styles.css`, and
`package.json`/`pnpm-lock.yaml` show as modified in `git status` from earlier
sessions — they are pre-existing changes unrelated to this feature.)

## T15 gaps

The Playwright smoke covers R12, R13, R3, R6 (real data), R21 (default visible
immediately), R22, R25 (visible in screenshot). The following R<n> cases were
not exercised against the running stack and should be verified by the reviewer
either via the `flexible_quarter_admin_ui` admin UI (to mutate test data) or
by extending `scripts/qsf-smoke.mjs`:

- **R8/R9 fallback note** (R19) — would need a quarter whose `startDate` is
  after today and another whose `endDate` is before today (i.e. a gap), or a
  freshly-created AY whose only `seedQuarters()` rows all have `startDate:
  null, endDate: null` (fixture (v) case).
- **R10** default=null + **R15** empty-list message — would need an institution
  with zero quarters configured.
- **R16** no-dates-inline-note — same condition as R10 but with quarters that
  lack dates (e.g. immediately after `seedQuarters()` runs, before the admin
  fills them in).
- **R17** loading placeholder — load resolves in <100ms on local backend; not
  reliably catchable without mocking network latency.
- **R18** selection-reset on year switch — would need to switch years via the
  topbar `year-switcher` (which itself calls `location.reload()` in
  `layout.component.ts`; the in-app `effect()`-driven reload fires too fast to
  observe in a smoke).
- **R23** no-op on partial-date selection — same data setup as R16.

These are the same gaps the reviewer would normally cover via the manual Level-3
smoke pass per `docs/verification.md`. No R<n> is asserted in code without a
file:line citation above; the gaps are smoke-coverage gaps, not implementation
gaps.