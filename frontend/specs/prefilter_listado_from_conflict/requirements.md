# Requirements — Pre-filtrar Listado desde el diálogo de conflictos de ausencia

Scope: frontend-only (`attendance_frontend`). One feature file is affected
(`src/app/features/absences/absences.component.ts`). No backend or `excel-service` change is in
scope — the backend already accepts `enrollment_id` on `GET /api/absences`
(`backend/src/controllers/absence.controller.ts` line 13, `backend/src/services/absence.service.ts`
line 45, shipped in backend feature `report_conflicting_absence_type_on_create`/pre-existing since
before feature 6). This spec only adds the frontend query-building, UI, and state to use it.

This feature builds directly on top of `warn_conflicting_absence_type_same_day` (feature 12,
already merged): the `_pendingHighlight` signal, the `applyHighlight()` method, and the
`AbsenceSaveResultDialogComponent` close-flow (`saveAbsenceRange`, `confirmPhotoAbsences`,
`confirmVoiceAbsence`) all already exist and are extended here, not built from scratch. See
`specs/warn_conflicting_absence_type_same_day/requirements.md` R16 for the pre-existing highlight
behaviour this feature complements.

Acceptance-criterion mapping (every bullet from the harness feature description —
`state/features/014-prefilter_listado_from_conflict.md` — is satisfied by at least one `R<n>`
below; every `R<n>` cites the bullet it satisfies):

- AC1: "El Listado tiene un nuevo filtro-por-estudiante funcional (campo de búsqueda o picker) que
  llama GET /api/absences con enrollment_id + date_from/date_to" → **R1, R2, R3, R4**
- AC2: "Cuando el usuario cierra el diálogo de conflictos de feature 12 con al menos 1 conflicto,
  el Listado salta automáticamente al estudiante y rango de fechas de los conflictos (reemplaza o
  complementa al highlight visual de R16)" → **R5, R6, R7, R8**
- AC3: "El filtro-por-estudiante es reutilizable: un usuario puede buscar manualmente un estudiante
  en el Listado fuera del flujo del diálogo de feature 12" → **R2, R9**
- AC4: "Hay un botón/acción para limpiar el filtro y volver al Listado completo del trimestre" →
  **R10, R11**
- AC5: "Los flujos existentes del Listado (carga inicial, cambio de trimestre) siguen funcionando
  sin regresiones" → **R12, R13, R14**
- AC6: "Build verde; smoke manual contra docker compose up" → **R15**

## Student-filter query (AC1)

## R1
WHEN the user selects a specific enrollment from the new student picker on the Listado tab, the
system SHALL store that selection as the active student filter, holding at minimum the
enrollment's id, its display label (full name), and a `dateFrom`/`dateTo` pair, and SHALL
immediately call `GET /api/absences` with exactly the query parameters `enrollment_id`,
`date_from`, and `date_to` derived from that stored filter — the system SHALL NOT include
`course_id`, `academic_year_id`, or `type` in that request while the student filter is active.

## R2
WHILE the active student filter is set, the system SHALL populate the picker's own search input
with the selected student's full name (so the currently-active filter is always visible as text in
the same field used to search).

## R3
WHERE the user has not selected any suggestion from the student picker (they are only typing free
text or have cleared it), the system SHALL preserve today's behaviour verbatim: `GET /api/absences`
continues to be called with `course_id`/`academic_year_id`/`date_from`/`date_to`/`type` (never
`enrollment_id`), and the typed text continues to narrow the already-loaded `absences()` list
client-side exactly as `filteredAbsences()` does today (substring match on `studentName`,
case-insensitive).

## R4
WHEN the student picker's suggestion list is shown, the system SHALL source suggestions from the
enrollments already loaded for the currently-selected course/year (`enrollments()`, the same array
the Manual tab's roster uses) filtered by the typed text (case-insensitive substring match on
`fullName`) — the system SHALL NOT issue a new `GET /api/enrollments` call to populate suggestions.

## Auto-jump from the conflict dialog (AC2)

## R5
WHEN `AbsenceSaveResultDialogComponent` (opened from any of `saveAbsenceRange()`,
`confirmPhotoAbsences()`, `confirmVoiceAbsence()`) is closed AND at least one conflict was shown
(the existing `_pendingHighlight` signal from feature 12 is non-null), the system SHALL derive a
`dateFrom`/`dateTo` pair as the minimum and maximum of the conflicting dates (sorted ascending
first, since callers are not required to hand them pre-sorted) and SHALL set the active student
filter (R1's stored filter) to that enrollment id, its student name, and that derived date range —
SHALL NOT require the user to manually search for the student first.

## R6
WHEN R5's filter is applied, the system SHALL switch the active tab to Listado (index 3, matching
today's `applyHighlight()` behaviour) and SHALL load the filtered absences (R1's query) before
performing the row highlight.

## R7
WHEN R6's filtered load completes, the system SHALL still perform today's transient visual
highlight (the `flash-conflict` CSS class + `scrollIntoView` on the matching `tr[data-enrollment-id]`
rows, auto-clearing on `animationend`/timeout) for each conflicting date, now scoped to the
narrower, student-filtered result set — this feature complements feature 12's R16, it does not
remove the flash/scroll cue.

## R8
IF no conflict was shown when the dialog closes (the idempotent-only or all-created cases, where
`_pendingHighlight` was never set) THEN the system SHALL NOT touch the active student filter and
SHALL NOT switch tabs — identical to today's guard clause in `applyHighlight()`.

## Manual reuse (AC3)

## R9
The student picker described in R1–R4 SHALL be reachable and usable independently of the conflict
dialog flow — a user opening the Listado tab directly SHALL be able to type in the picker's input
and select a suggestion to apply the student filter, using the currently-selected quarter's
`dateFrom`/`dateTo` pickers (the ones already bound to the Listado's own date inputs) as the
filter's date range when the selection is made manually (as opposed to R5's dialog-derived range).

## Clearing the filter (AC4)

## R10
The system SHALL provide a visible control (rendered only while the student filter is active) that
clears the active student filter, resets the picker's search text to empty, and reloads the
Listado using today's general filters (`course_id`/`academic_year_id`/`date_from`/`date_to`/`type`
from the existing Desde/Hasta/Tipo controls) — restoring the full quarter listing.

## R11
WHEN the user clicks the existing "Aplicar filtros" or "Limpiar" controls on the Listado tab while
a student filter is active, the system SHALL clear the active student filter as part of that action
(same effect as R10) before applying the general filters — general filtering and the student filter
are mutually exclusive modes, never combined in the same request.

## No regressions (AC5)

## R12
WHEN the Listado's `onFiltersChange()` runs (triggered by initial load via `ngOnInit`'s course query
param, by the course `<mat-select>` changing, or by `onQuarterChange()`), the system SHALL clear any
active student filter first, so a stale student-scoped view never leaks across a course or quarter
change — the resulting `loadAbsences()` call SHALL use the general filters (R3), never a leftover
`enrollment_id`.

## R13
The pre-existing cross-feature navigation into `/absences` via query params (`course`, `student`,
`dateFrom`, `dateTo` — used by `dashboard.component.ts`, `student-history-dialog.component.ts`,
`justifications.component.ts`) SHALL continue to work exactly as today: it seeds `studentSearch`
with free text and relies on client-side filtering (R3), since those callers only know a student's
name, not their `enrollmentId`. This feature SHALL NOT change that entry point.

## R14
The Manual, Foto, and Voz tabs' existing behaviour (roster listing, photo preview, voice transcript,
`markedToday` badges) SHALL be unaffected by this feature — the student filter and its state are
local to the Listado tab's query-building only.

## Build & verification (AC6)

## R15
The implementer SHALL run `pnpm run build` (or `./node_modules/.bin/tsc` if `pnpm` is not on PATH)
and confirm it exits 0, since `tsconfig.json` is `strict: true`. Per `docs/conventions.md` "Tests",
this project has no automated test suite — verification SHALL be manual against the running stack
(`docker compose up -d --build frontend`), covering: (1) manually picking a student in the Listado
and confirming the network request carries `enrollment_id`/`date_from`/`date_to` and no other
filter param; (2) triggering a same-day-type conflict (any of the three flows) and confirming the
Listado auto-filters + flashes on dialog close; (3) clearing the filter and confirming the full
quarter listing returns; (4) switching quarter/course and confirming no stale student filter
persists.
