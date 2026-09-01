# Requirements — Deep-link a edición de ausencia existente desde el diálogo de conflictos

Scope: **frontend-only** (`attendance_frontend`). Files affected: `src/app/features/absences/
absence-save-result-dialog.component.ts`, `src/app/app.routes.ts`, and a new
`src/app/features/absences/absence-edit.component.ts`. No backend change is in scope — see
"Backend dependency reassessment" below, which supersedes part of the original acceptance
criteria in `state/features/016-deep_link_to_edit_existing_conflicting_absence.md`.

## Backend dependency reassessment (read before the rest of this file)

The harness feature description assumes two backend gaps: (a) `POST /api/absences`'s
`skippedDetails` needs a new `existingId: number` field, and (b) an endpoint to edit/delete an
absence by id doesn't exist yet. Both assumptions are **incorrect as of this writing**, verified
by reading the sibling backend repo (`attendance_backend`, read-only, no edits made there):

- `PUT /api/absences/:id` and `DELETE /api/absences/:id` already exist
  (`backend/src/controllers/absence.controller.ts` lines 24-25) and are already consumed by this
  frontend today (`absence-dialog.component.ts` line 100 for `PUT`,
  `absences.component.ts` line 1169 for `DELETE`).
- `GET /api/absences` already accepts `enrollment_id`, `date_from`, and `date_to` query
  parameters (`backend/src/controllers/absence.controller.ts` lines 12-20,
  `backend/src/services/absence.service.ts` lines 39-76) and returns full `Absence` rows,
  including `id` — already used by this frontend for exactly this
  enrollment+date-range shape (`absences.component.ts` lines 815, 840).
- The `absences` table enforces a soft-delete-aware `UNIQUE(enrollment_id, date)` constraint
  (documented inline at `backend/src/services/absence.service.ts` lines 144-146), so
  `GET /api/absences?enrollment_id=<id>&date_from=<d>&date_to=<d>` returns at most one active row
  — exactly the conflicting absence a same-day/same-enrollment conflict refers to.

Consequently, this spec resolves the conflicting absence's `id` via that existing `GET`
endpoint instead of depending on a new `existingId` field, and reuses the existing `PUT`/`DELETE`
`:id` endpoints for editing/removing it. **No cross-project blocker is needed for this feature.**
See `design.md`'s "Discarded alternatives" for the full comparison.

## Acceptance-criterion mapping

Every bullet from `state/features/016-deep_link_to_edit_existing_conflicting_absence.md` is
addressed below; bullets superseded by the reassessment above are marked as such rather than
mapped to an `R<n>`.

- AC1: "skippedDetails del backend incluye existingId — verificado en la respuesta de POST
  /api/absences" → **SUPERSEDED, not required** (see reassessment above; R1–R3 resolve the id
  without it).
- AC2: "El AbsenceSaveResultDialogComponent tiene un botón 'Editar' por cada conflicto" → **R1,
  R4**
- AC3: "Existe un componente standalone o ruta para editar una ausencia por id" → **R5, R6, R7,
  R8, R9**
- AC4: "Al hacer click en 'Editar', el editor se abre prefillado con la ausencia conflictiva y el
  diálogo se cierra" → **R2, R3, R10, R11**
- AC5: "El usuario puede borrar la ausencia desde el editor y el flujo de feature 12 puede
  re-correrse sin conflicto" → **R14, R15, R16, R17**
- AC6: "Si el editor es una ruta, la URL refleja el id (deep-linkable)" → **R5, R6, R7**
- AC7: "Build verde en frontend y backend" → **R22** (frontend only — no backend change is made
  by this spec, so there is nothing new to build/verify on the backend side).
- AC8: "Smoke manual ... crear F, intentar crear AT el mismo día → conflicto → click Editar →
  borrar → retry AT → creado OK" → **R22**

## Conflict data carries enough context to resolve the existing absence (AC1 superseded, AC2)

## R1
The system SHALL include the `enrollmentId` of the conflicting absence in every
`AbsenceSaveResultConflict` object passed as data to `AbsenceSaveResultDialogComponent`,
regardless of whether the conflict originated from `saveAbsenceRange()`, `confirmPhotoAbsences()`,
or `confirmVoiceAbsence()` in `absences.component.ts`.

## R2
WHEN the user clicks "Editar inasistencia" on a conflict row, the system SHALL send
`GET /api/absences` with exactly the query parameters `enrollment_id` (that conflict row's
`enrollmentId`), `date_from`, and `date_to` (both set to that conflict row's `date`).

## R3
IF the request in R2 returns an array containing exactly one absence THEN the system SHALL use
that absence's `id` as the resolved conflicting-absence id for R10's navigation.

## Conflict dialog "Editar" action (AC2)

## R4
`AbsenceSaveResultDialogComponent` SHALL render an "Editar inasistencia" button on every row of
its conflicts list, in addition to the existing "ya registrado como ..." text — one button per
conflict, not one for the whole dialog.

## Edit route (AC3, AC6)

## R5
The system SHALL register a route at `inspectors/absences/edit/:id`, guarded by `moduleGuard`
with `data: { module: 'absences' }` (matching the guard already applied to `inspectors/absences`),
lazy-loading a new `AbsenceEditComponent`.

## R6
The edit route SHALL accept `enrollmentId` and `date` as query parameters (e.g.
`inspectors/absences/edit/42?enrollmentId=7&date=2026-08-31`), in addition to the `:id` route
parameter — a URL containing all three values SHALL be sufficient, on its own (fresh navigation
with no prior application state), to reconstruct the edit screen for that absence.

## R7
WHEN `AbsenceEditComponent` initializes, the system SHALL read `:id` from the route's path
parameters and `enrollmentId`/`date` from its query parameters, and SHALL send
`GET /api/absences` with `enrollment_id`/`date_from`/`date_to` derived from them (same shape as
R2) to fetch the absence's current data — the system SHALL NOT rely on Angular router
navigation `state` (`extras.state`) or any other in-memory-only channel to receive the absence
data, since that would not survive a fresh page load of the same URL.

## R8
IF the response in R7 contains no entry whose `id` matches the route's `:id` parameter THEN the
system SHALL display a "not found" state (message plus a link back to `/inspectors/absences`) and
SHALL NOT render the edit form.

## R9
WHILE the fetch in R7 is in progress, `AbsenceEditComponent` SHALL display a loading indicator
instead of the edit form or the not-found state.

## Navigation from the dialog to the editor (AC4)

## R10
WHEN R3's condition holds, the system SHALL navigate to `inspectors/absences/edit/:id` (using the
resolved id) with `enrollmentId` and `date` query parameters set to that conflict row's values.

## R11
WHEN the navigation in R10 is triggered, the system SHALL close
`AbsenceSaveResultDialogComponent` (`MatDialogRef.close()`) — the underlying Absences page SHALL
NOT remain covered by the dialog once the edit route is active.

## R12
IF R2's request returns zero absences (already deleted by someone else) or more than one (data
inconsistency) THEN the system SHALL show an error notification via `NotificationService.error`
and SHALL NOT navigate — the dialog SHALL remain open.

## Prefill and editable fields (AC4)

## R13
WHEN the absence is successfully resolved per R7, `AbsenceEditComponent` SHALL prefill its date,
type (`F`/`AT`), and notes fields with that absence's current `date`, `type`, and `notes` values,
and SHALL display (read-only) the absence's `studentName`, `course`, and `academicYear`.

## Save (edit) action

## R14
WHEN the user submits the edit form, the system SHALL send `PUT /api/absences/:id` with the
form's current `date`, `type`, and `notes` values.

## R15
IF the edit form's date field is empty THEN the system SHALL disable the save action, mirroring
the existing validation in `absence-dialog.component.ts`'s edit mode.

## R16
WHEN the `PUT` request in R14 succeeds, the system SHALL show a success notification via
`NotificationService.success` and SHALL navigate to `/inspectors/absences`.

## R17
IF the `PUT` request in R14 fails THEN the system SHALL show an error notification via
`NotificationService.error` (using the response's error message when present) and SHALL remain on
the edit screen without navigating.

## Delete action (AC5)

## R18
WHEN the user clicks "Eliminar inasistencia" on the edit screen, the system SHALL open
`ConfirmDialogComponent` before performing any delete request.

## R19
WHERE the absence being edited has `isJustified === true`, the confirmation dialog's message
SHALL state that the linked justification will also be affected by the deletion (mirroring the
existing copy in `absences.component.ts`'s `deleteAbsence()`); WHERE `isJustified === false`, the
confirmation dialog SHALL show the existing generic deletion warning instead.

## R20
WHEN the user confirms deletion in R18's dialog, the system SHALL send
`DELETE /api/absences/:id`; WHEN that request succeeds, the system SHALL show a success
notification and navigate to `/inspectors/absences`; IF that request fails THEN the system SHALL
show an error notification and SHALL remain on the edit screen.

## Cancel action

## R21
WHEN the user clicks "Cancelar" (or the "not found" state's back link) on the edit screen without
having saved or deleted, the system SHALL navigate to `/inspectors/absences` and SHALL NOT send
any `PUT` or `DELETE` request.

## Build & verification (AC7, AC8)

## R22
The implementer SHALL run `pnpm run build` (or `./node_modules/.bin/tsc` if `pnpm` is not on
PATH) and confirm it exits 0. Per `docs/verification.md`, this project has no automated test
suite — verification SHALL be manual against the running stack
(`docker compose up -d --build frontend`), covering the exact scenario from the harness
acceptance criteria: create an `F` absence for a student, attempt to create an `AT` absence for
the same student on the same date (conflict), click "Editar inasistencia" on the conflict row,
confirm the edit screen loads prefilled with the `F` absence, delete it, return to the Manual tab,
retry creating the `AT` absence, and confirm it is created without a conflict.
