# Tasks — Pre-filtrar Listado desde el diálogo de conflictos de ausencia

All tasks touch only `src/app/features/absences/absences.component.ts`. Work top-to-bottom; later
tasks depend on the state/interfaces added by earlier ones.

- [x] T1 (R1) Add the `StudentFilter` interface and the `readonly studentFilter =
      signal<StudentFilter | null>(null)` field to the component.
- [x] T2 (R1, R14) Change `loadAbsences()` to branch on `this.studentFilter()`: when set, send only
      `enrollment_id`/`date_from`/`date_to`; when null, keep today's
      `course_id`/`academic_year_id`/`date_from`/`date_to`/`type` params unchanged (verify the
      Manual/Foto/Voz tabs, which don't call `loadAbsences()`, are untouched).
- [x] T3 (R4) Add `studentSuggestions(): Enrollment[]`, filtering `enrollments()` by `studentSearch`
      (case-insensitive substring on `fullName`), capped to 8 results.
- [x] T4 (R2) Add `displayEnrollment(e: Enrollment | string): string` for `matAutocomplete`'s
      `[displayWith]`.
- [x] T5 (R1, R2, R9) Add `selectStudentFilter(enrollment: Enrollment): void` — builds a
      `StudentFilter` from the enrollment plus the Listado's own `dateFrom`/`dateTo` pickers
      (fallback to today's date if both are empty), sets `studentSearch` to the full name, calls
      `loadAbsences()`.
- [x] T6 (R10) Add `clearStudentFilter(): void` — clears `studentFilter`, resets `studentSearch`,
      calls `loadAbsences()`.
- [x] T7 (R3, R9) Wire the "Buscar estudiante" input to `MatAutocomplete`: import
      `MatAutocompleteModule`, add the `<mat-autocomplete>` template block with
      `(optionSelected)="selectStudentFilter($event.option.value)"`, bind the input's
      `[matAutocomplete]`. Confirm typing without selecting a suggestion still only drives
      `filteredAbsences()`'s existing client-side narrowing (no regression).
- [x] T8 (R10) Render the "Filtrando por ... [x]" chip only while `studentFilter()` is set, wired
      to `clearStudentFilter()`.
- [x] T9 (R11) Update the "Aplicar filtros" button handler and `clearFilters()` to clear
      `studentFilter` (set to `null`) before/as part of their existing behaviour.
- [x] T10 (R12) Add `this.studentFilter.set(null)` at the top of `onFiltersChange()`.
- [x] T11 (R5, R6) Add `studentName: string` to the `PendingHighlight` interface; update the three
      `_pendingHighlight.set(...)` call sites (`saveAbsenceRange`, `confirmPhotoAbsences` — via the
      existing `grouped` map, `confirmVoiceAbsence`) to include it, using each flow's
      already-in-scope student name (`enrollment.fullName`, `item.studentName`/`c.studentName`,
      `r.studentName` respectively).
- [x] T12 (R5, R6, R7, R8) Rewrite `applyHighlight()`: keep the `if (!target) return;` guard (R8),
      derive `dateFrom`/`dateTo` as min/max of the sorted conflict dates, set `studentFilter`
      accordingly, set `studentSearch`, switch to tab index 3, `await this.loadAbsences()`, then
      keep the existing flash/scroll loop over `target.dates` unchanged.
- [x] T13 (R13, R14) Confirm (read-only check, no code change expected) that the
      `ngOnInit`/course-query-param entry point used by `dashboard.component.ts`/
      `justifications.component.ts`/`student-history-dialog.component.ts` is untouched by T1–T12 —
      it must keep seeding `studentSearch` as free text via `params.get('student')`, never
      `studentFilter`.
- [x] T14 (R15) Run `pnpm run build` (or `tsc` fallback) and confirm exit code 0.
- [x] T15 (R15) Manual smoke against `docker compose up -d --build frontend`, documented in
      `progress/impl_prefilter_listado_from_conflict.md`:
      1. Pick a student manually from the new picker on the Listado tab; confirm the network
         request carries `enrollment_id`/`date_from`/`date_to` and none of
         `course_id`/`academic_year_id`/`type`.
      2. Trigger a same-day-type conflict (any of Manual/Foto/Voz) and confirm closing the dialog
         auto-filters the Listado to that student/date-range and still flashes the row(s).
      3. Click the filter chip's close button; confirm the Listado returns to the full
         quarter listing (general filters, no `enrollment_id`).
      4. Switch course or quarter while a student filter is active; confirm it is cleared and the
         general filters apply cleanly (no stale `enrollment_id` in the next request).
      5. Confirm the pre-existing dashboard/justifications "jump to student" links into `/absences`
         still work unchanged (free-text seed, not the new picker's server filter).
