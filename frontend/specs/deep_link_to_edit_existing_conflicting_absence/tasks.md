# Tasks — Deep-link a edición de ausencia existente desde el diálogo de conflictos

Work top-to-bottom; later tasks depend on the interfaces/state added by earlier ones. No backend
work is in this list — see `design.md`'s "Backend dependency reassessment".

## `absences.component.ts` — thread `enrollmentId` through to the dialog

- [x] T1 (R1) Update `AbsenceSaveResultConflict` (in
      `absence-save-result-dialog.component.ts`) to add `enrollmentId: number`.
- [x] T2 (R1) `saveAbsenceRange()`: change the `conflicts:` field passed to
      `AbsenceSaveResultDialogComponent`'s data to
      `partition.conflicts.map(c => ({ ...c, enrollmentId: enrollment.enrollmentId }))`.
- [x] T3 (R1) `confirmVoiceAbsence()`: same change, `enrollmentId: r.enrollmentId`.
- [x] T4 (R1) `confirmPhotoAbsences()`: change the `conflicts:` mapping from
      `conflicts.map(({ date, existingType }) => ({ date, existingType }))` to also include
      `enrollmentId` (already present on the local `conflicts` array entries — stop dropping it).

## `absence-save-result-dialog.component.ts` — "Editar inasistencia" button

- [x] T5 (R4) Add an "Editar inasistencia" button (stroked/text button, `edit` icon) to each
      conflict `<li>`, next to the existing "ya registrado como ..." text.
- [x] T6 (R2, R3, R12) Inject `HttpClient` and `Router`; add `resolving = signal<string | null>(null)`
      and `editConflict(c: AbsenceSaveResultConflict): Promise<void>` per `design.md` — resolves
      the absence id via `GET /api/absences?enrollment_id=&date_from=&date_to=`, shows an error
      notification and does not navigate if the result isn't exactly one row.
- [x] T7 (R10, R11) On a successful resolve, close the dialog (`dialogRef.close()`) then
      `router.navigate(['/inspectors/absences/edit', id], { queryParams: { enrollmentId, date } })`.
- [x] T8 (R4) Bind the per-row button's `[disabled]` to `resolving() === c.date` and show a small
      spinner/disabled state while resolving that row.

## `app.routes.ts` — new route

- [x] T9 (R5, R6) Add `{ path: 'absences/edit/:id', loadComponent: () =>
      import('./features/absences/absence-edit.component').then(m => m.AbsenceEditComponent),
      canActivate: [moduleGuard], data: { module: 'absences' } }` as a sibling of the existing
      `absences` entry inside the `inspectors` children array.

## `absence-edit.component.ts` — new file

- [x] T10 (R7, R9) Create `AbsenceEditComponent` (standalone, `OnPush`) with `state =
      signal<'loading' | 'not-found' | 'ready'>('loading')`; `ngOnInit()` reads `:id` from
      `route.snapshot.paramMap` and `enrollmentId`/`date` from
      `route.snapshot.queryParamMap`, calls `GET /api/absences?enrollment_id=&date_from=&date_to=`,
      and sets `state` to `'not-found'` if params are missing/invalid, the request fails, or no
      returned row's `id` matches `:id`.
- [x] T11 (R13) On a successful fetch, prefill `date`/`type`/`notes` from the matched `Absence`
      and store the full object for read-only display (`studentName`, `course`, `academicYear`);
      set `state` to `'ready'`.
- [x] T12 (R8) Render the `not-found` state as an `.empty-state` block with a link/button back to
      `/inspectors/absences`.
- [x] T13 (R9) Render a loading indicator (matching the `.spinner-center` pattern used elsewhere)
      while `state() === 'loading'`.
- [x] T14 (R13, R14, R15) Render the edit form (date/type/notes, `FormsModule`+`ngModel`,
      `MatDatepickerModule`/`MatSelectModule`/`MatInputModule`, mirroring
      `AbsenceDialogComponent`'s edit-mode fields) when `state() === 'ready'`; disable the save
      action when `date` is empty.
- [x] T15 (R14, R16, R17) Add `save(): Promise<void>` — `PUT /api/absences/:id` with
      `date`/`type`/`notes`; on success, `NotificationService.success` +
      `router.navigateByUrl('/inspectors/absences')`; on failure,
      `NotificationService.error(err?.error?.error ?? '...')`, stay on the page.
- [x] T16 (R18, R19) Add `confirmDelete(): void` — opens `ConfirmDialogComponent` with the
      `isJustified`-conditional message copied from `absences.component.ts`'s `deleteAbsence()`.
- [x] T17 (R20) On confirmation, `DELETE /api/absences/:id`; on success,
      `NotificationService.success` + navigate to `/inspectors/absences`; on failure,
      `NotificationService.error`, stay on the page.
- [x] T18 (R21) Add a "Cancelar" action that navigates to `/inspectors/absences` without any
      `PUT`/`DELETE` call.

## Build & verification

- [x] T19 (R22) Run `pnpm run build` (or `tsc` fallback) and confirm exit code 0.
- [x] T20 (R22) Manual smoke against `docker compose up -d --build frontend`, documented in
      `progress/impl_deep_link_to_edit_existing_conflicting_absence.md`:
      1. Create an `F` absence for a student on a given date (Manual tab).
      2. Attempt to create an `AT` absence for the same student on the same date; confirm the
         conflict dialog opens showing that date as a conflict.
      3. Click "Editar inasistencia" on that row; confirm the dialog closes and the browser
         navigates to `/inspectors/absences/edit/<id>?enrollmentId=<n>&date=<d>` with the edit
         screen prefilled (`F`, correct date, correct student/course).
      4. Reload the browser at that exact URL; confirm the page reconstructs the same prefilled
         state from scratch (proves the deep link is self-sufficient, not reliant on router
         `state`).
      5. Delete the absence from the edit screen; confirm a success toast and navigation back to
         `/inspectors/absences`.
      6. Retry creating the `AT` absence for that student/date; confirm it is created with no
         conflict this time.
      7. Separately, confirm the "not found" state renders correctly by navigating to
         `/inspectors/absences/edit/999999?enrollmentId=1&date=2020-01-01` (or any
         non-matching combination).
