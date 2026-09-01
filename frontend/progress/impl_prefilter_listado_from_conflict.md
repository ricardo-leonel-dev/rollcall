# Implementation — Pre-filtrar Listado desde el diálogo de conflictos de ausencia

Feature: **14 — `prefilter_listado_from_conflict`**
Spec: `specs/prefilter_listado_from_conflict/{requirements.md,design.md,tasks.md}` (sdd=1, approved by Ricardo Aguilar)
Session: 24

## Outcome

Frontend-only change to `src/app/features/absences/absences.component.ts`. The Listado tab
now has a student picker (Material `MatAutocomplete` attached to the existing "Buscar
estudiante" input) that, when a suggestion is selected, switches the
`GET /api/absences` query from the general `{course_id, academic_year_id, date_from,
date_to, type}` shape to a student-scoped `{enrollment_id, date_from, date_to}` shape
the backend already accepts (since feature 6). Closing the conflict dialog from any
of the three save flows (`saveAbsenceRange`, `confirmPhotoAbsences`, `confirmVoiceAbsence`)
now derives a `dateFrom`/`dateTo` from the sorted conflict dates, sets the student filter,
and reloads the Listado scoped to that student + date range — preserving the existing
flash/scroll cue from feature 12 (R16). A removable "Filtrando por ..." chip exposes
the active filter, and every general-filter action (Aplicar filtros, Limpiar, course/
quarter change, initial query-param load) clears it before applying the general
filters so it can never leak across modes.

No backend, no `excel-service`, no other frontend file changed.

## Files modified

- `src/app/features/absences/absences.component.ts` — single file, all T1–T12 live here.

## Spec traceability (R<n> → T<n>)

| Requirement | Tasks implementing it | Code anchor |
|---|---|---|
| R1 — student picker sets active filter, calls `GET /api/absences` with `enrollment_id`/`date_from`/`date_to` only | T1, T2, T5 | `studentFilter` signal, `loadAbsences()` branch, `selectStudentFilter()` |
| R2 — picker input shows the selected student's full name while filter is active | T5, T7 | `selectStudentFilter()` sets `studentSearch = enrollment.fullName`; chip renders `sf.label` |
| R3 — no-suggestion behaviour: typing free text only narrows `absences()` client-side | T7 (no template regression), `filteredAbsences()` unchanged | `filteredAbsences()` untouched, `studentSuggestions()` returns `[]` when query empty so autocomplete panel stays closed |
| R4 — suggestions sourced from already-loaded `enrollments()` | T3, T7 | `studentSuggestions()` reads `this.enrollments()` |
| R5 — closing conflict dialog with ≥1 conflict sets student filter to enrollment + min/max dates | T11, T12 | `applyHighlight()` derives `sortedDates[0]`/`sortedDates[len-1]`, sets `studentFilter` + `studentSearch` |
| R6 — switches to tab index 3 and reloads before flashing | T12 | `this.selectedTabIndex = 3; await this.loadAbsences();` before the flash loop |
| R7 — keeps the transient `flash-conflict` highlight, now scoped to the filtered rows | T12 | flash/scroll loop unchanged after the `loadAbsences()` await |
| R8 — no-op when no conflict shown (`_pendingHighlight` null) | T12 | `if (!target) return;` guard preserved |
| R9 — picker usable outside the dialog flow | T2, T3, T4, T5, T7 | `studentSuggestions()` + `selectStudentFilter()` + MatAutocomplete wired to the Listado's own date pickers |
| R10 — visible control to clear filter | T6, T8 | `clearStudentFilter()` + chip's close `<button mat-icon-button>` |
| R11 — clicking Aplicar filtros / Limpiar clears the student filter | T9 | `applyFilters()` (new wrapper) and `clearFilters()` both call `this.studentFilter.set(null)` first |
| R12 — course / quarter / query-param load clears any stale student filter | T10 | `onFiltersChange()` opens with `this.studentFilter.set(null)` |
| R13 — cross-feature nav into `/absences` (dashboard, justifications, student-history) keeps seeding `studentSearch` as free text | T13 | `ngOnInit()` body untouched; the new `studentFilter.set(null)` in `onFiltersChange()` is exactly what R12 wants and is also what protects R13 (the `studentSearch` text survives, the backend call uses general filters, `filteredAbsences()` narrows client-side) |
| R14 — Manual / Foto / Voz tabs unaffected | T2 | `loadAbsences()` is the only call site for `/api/absences`; the other tabs never invoke it |
| R15 — build green + manual smoke | T14, T15 | `pnpm`-equivalent build (`./node_modules/.bin/ng build --configuration production`) exits 0; manual smoke below |

## Verification

### Level 1 — Build (`T14`)

```bash
./node_modules/.bin/ng build --configuration production
```

Result: **exit 0**. Only pre-existing warnings remain (`NG8102`/`NG8107` in unrelated
files, the styles.css `@import` ordering warning, the existing component-style budget
warnings on `login`/`layout`/`justification-create-dialog`/`calendar`/
`export-config-dialog`; `absences.component.ts`'s 2.65 kB styles budget warning was
already over before this feature added ~200 bytes of chip CSS — also pre-existing
drift, not introduced here). Output written to `dist/frontend/browser/`.

### Level 3 — Manual smoke (`T15`, documented for execution against `docker compose up -d --build frontend`)

1. **Manual pick (R1/R4/R9):** Open the Listado tab, type a partial student name in
   "Buscar estudiante", confirm the autocomplete panel lists up to 8 students sourced
   from the already-loaded roster (no `/api/enrollments` call), select one. Confirm
   `GET /api/absences?enrollment_id=<id>&date_from=<pickers>&date_to=<pickers>` is
   issued and that the request does **not** carry `course_id`/`academic_year_id`/`type`.
   Confirm the chip "Filtrando por <nombre> · <desde> – <hasta>" renders below the
   filter bar.
2. **Auto-jump on conflict (R5/R6/R7):** Trigger a same-day-type conflict from any of
   the three flows (Manual: register an absence for a date the student already has an
   absence of the same type; Foto: pick a roster match whose date collides; Voz: speak
   a request that collides). Confirm closing the dialog switches to the Listado tab,
   narrows the request to `enrollment_id=<id>&date_from=<min>&date_to=<max>`, and
   the conflicting row(s) still get the `flash-conflict` pulse + smooth scroll.
3. **Clear filter via chip (R10):** Click the chip's close button. Confirm the chip
   disappears, the picker text is cleared, and `GET /api/absences` is reissued with the
   general filters only (no `enrollment_id`).
4. **Clear via general-filter controls (R11):** With the chip active, click "Aplicar
   filtros" — confirm the chip is gone before the new request is sent. Then with the
   chip active again, click "Limpiar" — same effect, plus the date/type controls reset.
5. **Course / quarter change clears filter (R12):** With the chip active, change the
   quarter selector. Confirm the chip is gone and the new request uses general filters
   (no stale `enrollment_id`). Then change the course `<mat-select>` — same behaviour.
6. **Cross-feature nav unchanged (R13):** From the dashboard (or
   `student-history-dialog` or `justifications`), trigger a "jump to student" link into
   `/absences?course=...&student=...&dateFrom=...&dateTo=...`. Confirm the Listado
   loads with free-text `studentSearch` (not the picker filter) and `filteredAbsences()`
   narrows the result client-side — i.e. the next request to `/api/absences` carries
   `course_id`/`academic_year_id`/`date_from`/`date_to`, never `enrollment_id`.

## Anything unusual the leader should know

- **R13 interaction with T10:** `onFiltersChange()` now starts with
  `studentFilter.set(null)`. This is exactly what R12 wants, and it is also what
  preserves R13 — when `/absences?course=...&student=...` arrives via cross-feature
  nav, `ngOnInit` sets `studentSearch` from the query param, then calls
  `onFiltersChange()` which nulls any prior `studentFilter` (no-op for first load)
  before reloading with the general filters. `filteredAbsences()` then narrows the
  already-loaded `absences()` by `studentSearch` substring, exactly as before. No
  caller of the cross-feature nav knows an `enrollmentId`, so this is the only
  viable shape — R13's invariant holds.
- **Voice-flow `course: ''`:** the dialog still passes `course: ''` for the voice
  flow (`confirmVoiceAbsence` line ~1206), but that has no effect on the post-dialog
  filter because `applyHighlight()` ignores the dialog data entirely and only reads
  `_pendingHighlight` + the existing `enrollments()` signal — already correct in
  feature 12, unchanged here.
- **`grouped` map shape change:** the photo flow's `grouped` map was
  `Map<number, string[]>`; to thread `studentName` through to `_pendingHighlight`
  without a second lookup pass, it became `Map<number, { dates: string[];
  studentName: string }>`. The first-iteration destructuring at
  `grouped.entries().next().value` adapts to the new shape.
- **Build budget drift on `absences.component.ts`:** the component styles went from
  ~2 kB to 2.65 kB (over the 2 kB default budget). The budget warning is a noisy
  Angular warning, not an error — the build still passes with exit 0. The chip CSS
  is ~200 bytes; the rest is pre-existing inline styles. Not addressed here (out of
  scope per `docs/conventions.md` — no separate budget-bump PR, no separate cleanup
  pass); flag for the reviewer as a pre-existing condition that this feature
  technically nudges further over the line.
