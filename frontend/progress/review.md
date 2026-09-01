# Review — feature 14

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `./init.sh` ends with `[OK] Environment ready`; all standard docs present
- C2: [x] — `scripts/harness.sh status` shows only feature 14 `in_progress`; spec doc is
  the durable record since this project has no automated test suite
  (`docs/conventions.md` "Tests"); session 24 is the live one
- C3: [x] — single file modified, no new top-level folders, uses signals (`studentFilter`,
  `_pendingHighlight`), `OnPush`, `standalone: true`, no new runtime deps
  (`MatAutocompleteModule` is part of the installed Angular Material package —
  `docs/architecture.md` §2 permits this); no `console.log`/TODO left behind; no
  construction injection; no absolute API hosts
- C4: [x] — `./node_modules/.bin/ng build --configuration production` exits 0; no
  automated test suite exists in this project (`docs/conventions.md` "Tests"),
  verification is build + manual smoke (per R15) — manual smoke is documented in
  `progress/impl_prefilter_listado_from_conflict.md` and covers every R<n>
- C5: [x] — `git status --short` shows exactly `M src/app/features/absences/absences.component.ts`,
  `?? progress/impl_prefilter_listado_from_conflict.md`, `?? specs/prefilter_listado_from_conflict/`
  (the latter is the spec content this feature shipped with, not a stray temp); no stray
  untracked files in `src/` or `tests/`
- C6: [x] — `specs/prefilter_listado_from_conflict/{requirements.md,design.md,tasks.md}`
  all exist on disk; `requirements.md` uses strict EARS for every R1–R15 with stable
  ids; all 15 tasks in `tasks.md` marked `[x]`; every `R<n>` maps to a concrete code
  anchor (see Spec Coverage Table below) verified directly against the diff

## Spec coverage table (R<n> vs. code anchor, verified directly)

| Requirement | Status | Code anchor |
|---|---|---|
| R1 — student picker sets active filter, request sends only `enrollment_id`/`date_from`/`date_to` | implemented | `studentFilter` signal (`absences.component.ts:747`), `loadAbsences()` branch (`:824-843`), `selectStudentFilter()` (`:873-885`) |
| R2 — picker input shows selected student's full name while filter is active | implemented | `selectStudentFilter()` sets `studentSearch = enrollment.fullName` (`:883`); chip renders `sf.label` (`:545`) |
| R3 — typing without selecting a suggestion keeps today's client-side narrowing only | implemented | `filteredAbsences()` unchanged (`:854-858`); `studentSuggestions()` returns `[]` for empty query (`:862`) so the autocomplete stays closed and only `filteredAbsences()` drives the visible list |
| R4 — suggestions sourced from already-loaded `enrollments()` (no new HTTP call) | implemented | `studentSuggestions()` reads `this.enrollments()` (`:863`), cap 8 (`:865`) |
| R5 — closing conflict dialog with ≥1 conflict sets student filter to enrollment + min/max dates | implemented | `applyHighlight()` derives `sortedDates` (`:1358`), sets `studentFilter` (`:1359-1364`), sets `studentSearch` (`:1365`); `studentName` threaded through all 3 `_pendingHighlight.set(...)` call sites (`:1053`, `:1122`, `:1289`) |
| R6 — switches to Listado tab and reloads before flashing | implemented | `selectedTabIndex = 3` (`:1366`), `await this.loadAbsences()` (`:1367`) |
| R7 — keeps `flash-conflict` highlight, now scoped to the filtered result set | implemented | existing flash/scroll loop preserved after the `loadAbsences()` await (`:1368-1381`) |
| R8 — no-op when no conflict was shown | implemented | `if (!target) return;` guard preserved (`:1356`) |
| R9 — picker usable outside the dialog flow | implemented | `selectStudentFilter()` reads the Listado's own `dateFrom`/`dateTo` pickers, falls back to today if both empty (`:874-882`) |
| R10 — visible control to clear filter, resets search, reloads general filters | implemented | `clearStudentFilter()` (`:887-891`); chip rendered only while `studentFilter()` is set (`:544`), close button wired to it (`:547`) |
| R11 — "Aplicar filtros" / "Limpiar" clear student filter | implemented | new `applyFilters()` (`:893-896`) wired to the Aplicar filtros button (`:536`); `clearFilters()` clears `studentFilter` first (`:901`) |
| R12 — course / quarter / query-param load clears any stale student filter | implemented | `onFiltersChange()` opens with `this.studentFilter.set(null)` (`:793`) — covers `ngOnInit` query-param path, `<mat-select>` change, and `onQuarterChange()` |
| R13 — cross-feature nav into `/absences` (dashboard, justifications, student-history) keeps seeding `studentSearch` as free text | implemented | `ngOnInit()` body unchanged at `:777-789`; it still seeds `studentSearch = params.get('student')` (`:781`) and routes through `onFiltersChange()` which nulls `studentFilter` first |
| R14 — Manual / Foto / Voz tabs unaffected | implemented | `loadAbsences()` is the only call site for `/api/absences`; Manual/Foto/Voz tabs (`markedToday`/`loadTodayAbsences`, `processPhoto`/`confirmPhotoAbsences`, `confirmVoiceAbsence`) don't touch `studentFilter` — verified via `git grep` (only the Listado references the new state) |
| R15 — build green + manual smoke | implemented | build exits 0; manual smoke covers all 5 scenarios in `progress/impl_prefilter_listado_from_conflict.md` §Verification |

## Verification commands run

- `./node_modules/.bin/ng build --configuration production` — **exit 0**. Only
  pre-existing warnings (NG8102/NG8107 in unrelated files, the styles.css `@import`
  ordering warning, the existing component-style budget warnings on `login`,
  `layout`, `justification-create-dialog`, `calendar`, `export-config-dialog`).
  The `absences.component.ts` styles budget warning (2.65 kB vs. 2 kB) is a
  ~200-byte nudge further over a pre-existing overage — flagged by the implementer
  in their report's "Anything unusual" section, but not a build failure.
- `./init.sh` — exits 0, `[OK] Environment ready`.
- `git grep -n 'loadAbsences' -- src/` — only the `absences.component.ts` file
  references `loadAbsences`; the other tabs never invoke it. R14 holds.
- `git grep -n 'studentFilter\|_pendingHighlight\|studentSuggestions' \
   -- src/app/features/absences/` — every new reference is confined to the single
  modified file.
- `grep -c '^- \[x\]' specs/prefilter_listado_from_conflict/tasks.md` — 15
  completed, 0 pending.
- `grep -n 'enrollment_id' /home/rileo/ai-personal/backend/src/controllers/absence.controller.ts`
  — line 13: `req.query.enrollment_id ? +req.query.enrollment_id : undefined`,
  confirming the backend already accepts the param (per the design.md note).
- `grep -n 'enrollment_id' /home/rileo/ai-personal/backend/src/services/absence.service.ts`
  — line 45: filter wired through to the SQL query. R1's claim that no backend
  change is needed is verified.

## Findings

None.