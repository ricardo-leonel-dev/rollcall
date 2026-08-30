# Tasks — Mandatory quarter dropdown on Absences and Justifications list views

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>`
lists the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable
done-condition. The implementer checks these off in order; the reviewer rejects the
feature if any are left `[ ]` without a documented, reviewer-accepted justification in
`progress/impl_quarter_selector_on_list_views.md`.

- [x] T1 (R1, R3, R13) **Explore + confirm integration points.** Read the current
      `src/app/features/absences/absences.component.ts` and
      `src/app/features/justifications/justifications.component.ts` and confirm: (a)
      both already inject `AcademicYearContextService` and read `selected()?.id` into
      `selYear` in their `ngOnInit`; (b) neither currently imports
      `QuarterSelectorComponent` (grep returns 0 matches in either file); (c) the
      page-level `.filter-bar` div on Absences sits above the four-tab `mat-tab-group`
      and contains only the "Curso" `mat-form-field`, while the same div on
      Justifications has the rounded-top styling and contains only "Curso" too; (d)
      Absences' Listado sub-filter row already binds `[(ngModel)]="dateFrom"` and
      `[(ngModel)]="dateTo"` to `<mat-datepicker>` inputs (the seed destination for
      R2 — no new fields are added on Absences); (e) Justifications has no date
      pickers on the page at all (so R9's `selQuarterStart`/`selQuarterEnd` fields
      will be the only date source for those loaders). Done: the five observations
      are written as bullet points at the top of
      `progress/impl_quarter_selector_on_list_views.md` (so the reviewer can confirm
      without re-running grep).

- [x] T2 (R1) **Add the selector to `absences.component.ts`'s template.** Import
      `QuarterSelectorComponent` from
      `../../shared/components/quarter-selector/quarter-selector.component` (extend the
      existing import block per `docs/conventions.md`'s "Local: shared components"
      order) and `Quarter` from `../../core/models/index` (extend the existing
      `core/models/index` import). Add `QuarterSelectorComponent` to the existing
      `@Component.imports` array. Place `<app-quarter-selector
      (quarterChange)="onQuarterChange($event)" />` as the **first child** of the
      page-level `.filter-bar` div, immediately before the existing "Curso"
      `mat-form-field` (so the dropdown sits **next to** the course selector, per
      the 2026-08-30 user-amendment "seed-not-override model" note). Done: opening
      the Absences page in the running app renders the dropdown to the left of
      "Curso", pre-selected to the foundation's `defaultQuarterId` (verify by
      reading the dropdown's visible text — should match the Dashboard's dropdown
      for the same year); `grep -nE 'app-quarter-selector|QuarterSelectorComponent' absences.component.ts`
      returns ≥ 2 matches (the import + the template tag + the `@Component.imports`
      array entry).

- [x] T3 (R2, R4, R12) **Add the handler to `absences.component.ts`.** Extend the
      existing `date.util` import (`dateToDateString` is already imported — add
      `dateStringToDate` to the same import statement). In the class body, add the
      handler:
      ```ts
      onQuarterChange(q: Quarter | null): void {
        if (!q || !q.startDate || !q.endDate) return;       // R12 — defensive layer
        // Same-quarter re-selection is a no-op on the pickers (R2 — mirror the
        // export pill's "clicking the active pill is a no-op" behavior).
        // Read the current selection from QuarterContextService (do NOT inject
        // it directly into this component — see R13 and the foundation's
        // "Reuse, don't reimplement" constraint). Compare to q.id and return
        // early if equal. (The implementer may cache the previous id in a local
        // field initialized to null; the comparison contract is the same.)
        this.dateFrom = dateStringToDate(q.startDate);       // R2 — seed the Listado picker
        this.dateTo   = dateStringToDate(q.endDate);         //     (overwrites manual edits since last quarter pick)
        this.voiceLogsLoaded = false;                         // force Historial refresh on next visit
        this.onFiltersChange();                               // Foto / Manual / Listado
        this.loadTodayAbsences();                             // Foto "marked-today" badges
        if (this.selectedTabIndex === 4) this.loadVoiceLogs(); // Historial if currently open
      }
      ```
      Note: Absences does **NOT** add `selQuarterStart`/`selQuarterEnd` fields (R9 —
      the existing `dateFrom`/`dateTo` pickers serve the same role). Done:
      `grep -nE 'onQuarterChange' absences.component.ts` returns ≥ 1 match; the
      no-op branch (R12) is the first statement in the handler; the same-quarter
      no-op guard is the second statement; the picker writes follow.

- [x] T4 (R10, R11) **Touch `absences.component.ts`'s loaders as documented.** In
      `loadAbsences()`, the two existing `if (this.dateFrom)`/`if (this.dateTo)`
      lines **stay as-is** — no precedence logic, no "scope wins" branch — because
      under the seed model the pickers ARE the source of truth (R10). In
      `loadTodayAbsences()`, replace the two `date_from=${today}` / `date_to=${today}`
      lines with `date_from=${dateToDateString(this.dateFrom)}` /
      `date_to=${dateToDateString(this.dateTo)}` — the quarter seed gives the user a
      meaningful single-day query when the picked quarter is one day long, or a
      range query otherwise (when the pickers are null at first render, the
      `dateToDateString(null)` value becomes the literal string "null", matching
      today's broken-state behavior on the existing path; R3 explicitly preserves
      that initial state, so do not "fix" it here). Add a one-line comment on
      `clearFilters()` (the only comment allowed by `docs/conventions.md` because
      it explains the non-obvious why): `"// 'Limpiar' is local to the Listado
      sub-filters — the page-level quarter dropdown (R11) is preserved; the user
      can re-seed by re-selecting a quarter."`. Done: `loadAbsences()` references
      `this.dateFrom` / `this.dateTo` (unchanged from today); `loadTodayAbsences()`
      references `this.dateFrom` / `this.dateTo` instead of `today`; `clearFilters()`
      contains the one-line comment and does NOT reference any quarter field
      (R11 — quarter selection is preserved across the local Listado reset).

- [x] T5 (R1, R2, R3, R4, R10, R11, R12, R13) **Smoke-verify the Absences wiring
      against the running stack** (full Level-3 manual smoke deferred to T10; this
      T5 is the early "wired up, no crashes" sanity check). Bring up the docker
      compose stack if not already running (`docker compose ps`), log in as
      `superadmin` / `Admin2026!` against `http://localhost`, open `/absences`.
      Confirm: (a) the dropdown renders to the left of "Curso" with the default
      quarter pre-selected; (b) selecting a DIFFERENT fully-dated quarter writes
      its dates to the Listado "Desde"/"Hasta" pickers (verify by reading the
      visible text in the pickers after the click) AND every panel refreshes;
      (c) editing the "Hasta" picker manually after the seed preserves the
      manual value (verify by changing "Hasta" to a later date and seeing the
      Listado table narrow); (d) selecting the SAME quarter currently selected
      after the manual edit does NOT overwrite the manual edit (verify by
      clicking the dropdown's currently-selected entry); (e) clicking "Limpiar"
      in the Listado sub-filter row sets `dateFrom`/`dateTo` to null but does
      NOT reset the dropdown's selection (R11); (f) selecting "Primer Trimestre"
      on the Dashboard first, then navigating to Absences, leaves Absences'
      dropdown showing "Primer Trimestre" (R13 — shared singleton). Done: the
      six observations are written as bullet points in
      `progress/impl_quarter_selector_on_list_views.md`.

- [x] T6 (R5, R7, R13) **Add the selector to `justifications.component.ts`'s template.**
      Import `QuarterSelectorComponent`, `Quarter` (extend the existing
      `core/models/index` import), and `dateStringToDate` from
      `../../shared/utils/date.util`. Add `QuarterSelectorComponent` to the existing
      `@Component.imports` array. Place `<app-quarter-selector
      (quarterChange)="onQuarterChange($event)" />` as the **first child** of the
      page-level `.filter-bar` div, immediately before the existing "Curso"
      `mat-form-field` (next to the course selector, per the 2026-08-30 user-
      amendment note). Done: opening the Justifications page renders the dropdown
      to the left of "Curso", pre-selected to the foundation's default; `grep -nE
      'app-quarter-selector|QuarterSelectorComponent|dateStringToDate' justifications.component.ts`
      returns ≥ 3 matches.

- [x] T7 (R6, R8, R9, R12) **Add the handler + page-level scope fields to
      `justifications.component.ts`.** In the class body (just below the existing
      `selYear`/`selCourse` field block), add `selQuarterStart: Date | null = null`
      and `selQuarterEnd: Date | null = null`. Add the handler:
      ```ts
      onQuarterChange(q: Quarter | null): void {
        if (!q || !q.startDate || !q.endDate) return;       // R12 — defensive layer
        // Same-quarter re-selection is a no-op on selQuarterStart/selQuarterEnd
        // (mirror the export pill's behavior). Compare q.id to the current
        // selection (read via QuarterContextService.selectedId() — do NOT inject
        // the service into this component per R13).
        this.selQuarterStart = dateStringToDate(q.startDate);
        this.selQuarterEnd   = dateStringToDate(q.endDate);
        this.onCourseChange();                              // R6: parallel loadHistorial + loadPendingStudents
      }
      ```
      Done: `grep -nE 'onQuarterChange|selQuarterStart|selQuarterEnd' justifications.component.ts`
      returns ≥ 3 matches; the no-op branch (R12) is the first statement in the
      handler; the same-quarter guard is the second; the field writes follow.

- [x] T8 (R10, R11) **Extend `justifications.component.ts`'s loaders to read the
      quarter scope.** In `loadHistorial()`, after the existing
      `if (this.selYear)`/`if (this.selCourse)` block, append the two
      `date_from`/`date_to` lines from `design.md`'s "Justifications (per-loader
      changes)" section (only when both `selQuarterStart`/`selQuarterEnd` are
      non-null — no fallback, since Justifications has no other date-range input).
      **Smoke check (trivial):** `curl -s -H "Authorization: Bearer $JWT" "$BASE_URL/api/justifications"` should return the institution's
      full set, and the same call with `?date_from=2026-05-04&date_to=2026-05-10`
      should return a smaller set (≤ 5). No "gap to document" — backend support
      for these params is in the shipped `attendance_backend` feature
      `backend_acepta_date_from_date_to_en_get_api_justifications` (see R10).
      In `loadPendingStudents()`, refactor the URL builder
      to use a `params: string[]` array with the same `if (this.selQuarterStart &&
      this.selQuarterEnd)` guard and the `is_justified=false` flag from the
      existing implementation. Done: both loaders reference
      `this.selQuarterStart` / `this.selQuarterEnd`; `loadPendingStudents`'s URL
      still carries `is_justified=false` (verified by `grep -nE 'is_justified=false'`
      returning ≥ 1 match); the smoke-check curl results are recorded in the
      progress file's Traceability.

- [x] T9 (R5, R6, R7, R8, R9, R10, R11, R12, R13) **Smoke-verify the Justifications
      wiring against the running stack** (same shape as T5). Open
      `/justifications`, confirm: (a) the dropdown renders to the left of "Curso"
      with the default pre-selected; (b) selecting a DIFFERENT fully-dated
      quarter narrows both the "Nueva justificación" tab's pending-student list
      and the "Historial" tab's justification cards to that quarter's date
      range (the `selQuarterStart`/`selQuarterEnd` fields are written and the
      loaders read them — verify by reading the visible data); (c) selecting
      the SAME quarter currently selected does NOT mutate `selQuarterStart`/
      `selQuarterEnd` (no loader call fires); (d) selecting "Todos los cursos"
      in the "Curso" `mat-select` does NOT reset the quarter's range (R11);
      (e) the "Filtrar por estudiante" `mat-select` in the Historial tab still
      works alongside the new quarter scope. Done: the five observations are
      written as bullet points in `progress/impl_quarter_selector_on_list_views.md`.

- [x] T10 (R3, R7, R12, R14, R15) **Build + full smoke.** Run `pnpm run build`
      and confirm exit `0` with no new warnings attributable to the two
      modified files. Run `./init.sh` and confirm `[OK] Environment ready` (the
      pre-existing `[WARN]`s for empty `verify_command` and unset `SUPABASE_URL`
      are unchanged from baseline). Run the manual smoke from R15 against the
      running stack and document each observation in
      `progress/impl_quarter_selector_on_list_views.md`'s Traceability section,
      mirroring the structure of `progress/impl_quarter_selector_foundation.md`'s
      Traceability table (one row per `R<n>` with file:line + evidence + the
      R15 sub-bullet that covers it). At minimum cover R15's nine sub-bullets
      (i)–(ix), including the partial-date path (R15 sub-bullet viii). The
      partial-date smoke path is:
      1. Switch to the "Tia Blanquita" test institution (via the superadmin
         institution switcher or by being already logged in as a Tia Blanquita
         user).
      2. Create a fresh academic year via the admin UI: open the Admin page,
         click "Nuevo año lectivo", fill in the name + start/end dates, save.
         The admin UI calls `POST /api/academic-years` (verified by reading
         `src/app/features/admin/admin.component.ts`'s createAcademicYear path);
         this also triggers `seedQuarters()` server-side, which inserts 3
         null-dated rows for the new AY.
      3. Open the Justifications or Absences page scoped to the fresh AY
         (set the academic-year context to the new AY via the top-bar AY
         selector — the AY will appear in the dropdown once created).
      4. Confirm the quarter dropdown renders with the foundation's "no usable
         period" fallback state (the foundation's R14–R17 contract covers this
         rendering — verify by reading the dropdown's visible text and by
         inspecting `QuarterContextService.quarters()` for the AY).
      5. If the dropdown still offers the partial-date quarters as selectable
         options (the foundation does NOT filter them out — they're manually
         selectable per R11 of the foundation but excluded from the default
         computation), click one and confirm: R12 fires — no picker mutation,
         no field mutation, no `loadXxx()` call, no toast.
      6. Clean up: switch back to the Tia Blanquita active AY and delete the
         fresh AY via the admin UI's delete action (which calls
         `DELETE /api/academic-years/:id` per `admin.component.ts`'s delete path).
         If the admin UI does not surface a delete button for an AY with
         partial-date quarters (because `seedQuarters()` cascade rules differ),
         document the data-migration rollback path in
         `progress/impl_quarter_selector_on_list_views.md` (e.g. "soft-delete the
         AY + its quarters manually via SQL" — see
         `postgres/19_quarters_softdelete_legacy_null_dates.sql` for the
         established pattern). If a Playwright smoke is desired for CI later
         (the foundation's `scripts/qsf-smoke.mjs` is reusable but
         Dashboard-only — it would need a new script under
         `scripts/qsolv-smoke.mjs` for Absences + Justifications), note it in
         the progress file as a possible follow-up; do not block this feature on
         it. Done: every row of the traceability table references a concrete
         `R<n>` and the table covers at least one observation per `R1`–`R15`;
         R15 sub-bullets (i)–(ix) are all exercised against the running stack;
         the partial-date AY is created and cleaned up as documented above.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T2 |
| R2 | T3, T5, T10 |
| R3 | T5, T10 |
| R4 | T5, T10 |
| R5 | T6 |
| R6 | T7, T9, T10 |
| R7 | T9, T10 |
| R8 | T9, T10 |
| R9 | T7 |
| R10 | T4, T5, T8, T9, T10 |
| R11 | T4, T5, T9 |
| R12 | T3, T7, T10 |
| R13 | T2, T5, T6, T9 |
| R14 | T10 |
| R15 | T10 |
