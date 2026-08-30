# Tasks — Fix PDF / Excel export dialogs to use real quarter data instead of equal-thirds guess

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom.
Every `T<n>` lists the file(s) it touches, the `R<n>` requirement(s) it
advances, and a verifiable done-condition. The implementer checks these off
in order; the reviewer rejects the feature if any are left `[ ]` without a
documented, reviewer-accepted justification in
`progress/impl_fix_export_dialogs_use_real_quarters.md`.

- [x] T1 (R1, R16) **Explore + document the equal-thirds algorithm in both
      dialogs.** Read `src/app/features/student-report/excel-export-dialog.component.ts`
      and `src/app/features/student-report/export-config-dialog.component.ts`
      and confirm by line: (a) the `setDefaultTrimester(year)` private method
      (Excel: lines 151-164; PDF: lines 385-398) computes an equal-thirds
      `bounds` array and writes `dateFrom`/`dateTo` to the synthetic index;
      (b) the `selectTrimester(i)` private method (Excel: lines 166-176;
      PDF: lines 400-410) uses the same equal-thirds logic for explicit
      pill clicks; (c) the `activeTrimester: signal<number | null>` field
      (Excel: line 135; PDF: line 363) is bound to `[class.active]`
      against `=== i` and cleared by both `(ngModelChange)` handlers on
      the date pickers (Excel: lines 88 + 95; PDF: lines 248 + 255); (d) the
      pill row's `@for` loop (Excel: lines 100-106; PDF: lines 260-266)
      uses `['Primer', 'Segundo', 'Tercer']`; (e) the PDF-only
      `getTrimesterName()` private method (PDF: lines 412-422) computes the
      title suffix from a midpoint inside the equal-thirds bounds. Done:
      the five observations are written as bullet points at the top of
      `progress/spec_fix_export_dialogs_use_real_quarters.md` (so the
      reviewer can confirm without re-running grep).

- [x] T2 (R1, R4, R5, R8, R9, R16) **Wire `QuarterContextService` into the
      Excel dialog and replace the equal-thirds pill row.** In
      `excel-export-dialog.component.ts`: import `QuarterContextService`
      (extend the existing service-import block per
      `docs/conventions.md`'s ordering) and `Quarter` (extend the existing
      `core/models/index` import). Add a private readonly
      `quarterContext = inject(QuarterContextService)` field next to the
      existing `academicYearContext` injection. Replace the
      `activeTrimester: signal<number | null>(null)` field with
      `activeQuarterId: signal<number | null>(null)`. Replace the pill
      row's `@for (t of ['Primer', 'Segundo', 'Tercer']; track t; let i =
      $index)` loop with the new `getDatedQuarters()` iteration over real
      `q.name` labels and `[class.active]="activeQuarterId() === q.id"`
      binding (see `design.md`'s "Per-dialog integration pattern" for the
      exact template shape). Add the `getDatedQuarters()` helper method
      (or computed signal — implementer's choice; see
      `design.md`'s "Signal/computed wiring") returning
      `this.quarterContext.quarters().filter(q => q.startDate && q.endDate)`.
      Done: opening the Excel export dialog renders N pills for the
      currently selected AY, each labeled with the real configured
      `q.name` in `sequenceNumber` order; `grep -nE "activeTrimester|setDefaultTrimester|selectTrimester|'Primer'|'Segundo'|'Tercer'" excel-export-dialog.component.ts`
      returns **0** matches (all three private methods deleted, the index
      field renamed, the literal array replaced).

- [x] T3 (R4, R6, R7, R14, R16) **Add the apply handlers + ngOnInit change
      to the Excel dialog.** In `excel-export-dialog.component.ts`:
      replace `setDefaultTrimester(year)` with `applyDefaultQuarter()`
      reading `this.quarterContext.defaultQuarterId()` (R7); replace
      `selectTrimester(i)` with `applyQuarter(q: Quarter | null)`
      implementing the partial-date no-op guard then
      `dateFrom`/`dateTo`/`activeQuarterId` writes (R6, R10); update the
      pill `(click)` binding to call `applyQuarter(q)` (R4); update
      `ngOnInit` to call `this.applyDefaultQuarter()` instead of
      `this.setDefaultTrimester(active)` (R7); leave the two
      `(ngModelChange)="activeQuarterId.set(null)"` lines on the date
      pickers unchanged (R14). Done: `grep -nE
      "applyDefaultQuarter|applyQuarter|activeQuarterId|dateStringToDate" excel-export-dialog.component.ts`
      returns ≥ 6 matches; selecting a pill writes the quarter's dates to
      the Desde/Hasta pickers and highlights the pill; selecting a
      pill on an undefined quarter is a silent no-op; editing a picker
      clears the highlight.

- [x] T4 (R2, R15) **Add the empty-state note to the Excel dialog.** In
      `excel-export-dialog.component.ts`'s template, wrap the
      `.trimester-row` `<div>` in the `@if (getDatedQuarters().length ===
      0) { <div class="trimester-empty-note">…</div> } @else { <div
      class="trimester-row">…</div> }` chain from `design.md`'s template
      snippet. Add the `.trimester-empty-note` class rule to the
      component's `styles: [...]` block: `font-size: 12px; color:
      var(--muted-strong); line-height: 1.5; background: var(--paper-deep);
      border: 1px solid var(--border-soft); border-radius:
      var(--radius-md); padding: 10px 12px; margin-top: 8px;` (R2). Done:
      on a year with zero configured quarters (or only
      `seedQuarters()`-style null-dated rows), the Excel dialog renders
      the empty note instead of pills, and the date pickers remain
      user-editable (R15 — partial-date quarters are filtered out);
      `grep -nE "trimester-empty-note" excel-export-dialog.component.ts`
      returns ≥ 2 matches (template + styles).

- [x] T5 (R1, R4, R5, R12, R13, R16) **Apply the T2 changes to the PDF
      dialog.** Same set of changes as T2/T3/T4 to
      `export-config-dialog.component.ts`: inject
      `QuarterContextService`, replace `activeTrimester` with
      `activeQuarterId`, replace `setDefaultTrimester`/`selectTrimester`
      with `applyDefaultQuarter`/`applyQuarter(q)`, replace the pill row
      with the real-quarters iteration, add the empty-state note, keep
      the `(ngModelChange)="activeQuarterId.set(null)"` lines on the
      pickers. Additionally (R12, R13): replace `getTrimesterName()` with
      `getTitleSection()` (returns the uppercase matched `Quarter.name`
      or `'PERÍODO PERSONALIZADO'`); update the single call site in
      `printReport()` (`const trimesterName = this.getTitleSection();`).
      No change to the PDF title template itself — it still reads
      `${mainTitle} ${trimesterName} — ${escapeHtml(courseReport.course.name.toUpperCase())}`,
      so a quarter named `Q1` now produces `FALTAS Q1 — <courseName>`
      and a manually-edited range produces `FALTAS PERÍODO PERSONALIZADO
      — <courseName>`. Done: `grep -nE "activeTrimester|setDefaultTrimester|selectTrimester|getTrimesterName|'Primer'|'Segundo'|'Tercer'" export-config-dialog.component.ts`
      returns **0** matches (all three replaced, the literal array gone);
      `grep -nE "getTitleSection|applyDefaultQuarter|applyQuarter|getDatedQuarters|trimester-empty-note" export-config-dialog.component.ts`
      returns ≥ 6 matches; the PDF report's title uses the real quarter's
      name when a pill is active.

- [x] T6 (R3) **Confirm year-switch reactive reload flows into both
      dialogs.** Read-only verification step — no code change in either
      dialog. Confirm by reading `core/services/quarter-context.service.ts`
      that the foundation's `effect(() => { const ayId =
      this.academicYearContext.selectedId(); if (this._loaded() && ayId
      !== null) this.load(); })` block (lines 48-53) re-runs `load()` on
      AY changes; and confirm by reading both dialogs' templates that the
      pill row iterates `getDatedQuarters()` (which calls
      `quarterContext.quarters()` directly — no cached snapshot), so a
      year switch reactively re-renders the pill row the next time the
      dialog is opened. Done: a one-line note in
      `progress/impl_fix_export_dialogs_use_real_quarters.md`'s T6
      observation block confirms both (no edits to either dialog).

- [x] T7 (R17) **Run `pnpm run build` and confirm zero new warnings.**
      Run `pnpm run build` (and `./init.sh` to confirm the harness is
      still green). Done: `pnpm run build` exits `0` with no new
      warnings attributable to the two files this feature modifies
      (`export-config-dialog.component.ts`,
      `excel-export-dialog.component.ts`); the pre-existing
      `[WARN]`s for empty `verify_command` and unset `SUPABASE_URL` from
      `./init.sh` are unchanged from baseline (T14 of the foundation's
      exit behavior is the reference). `grep -nE "#[0-9a-fA-F]{3,8}"`
      on the two modified files returns the **same set of pre-existing
      hex matches** as before T2 — no new hex colors added by this
      feature.

- [x] T8 (R18) **Smoke-verify both dialogs against the running stack.**
      Bring up the docker compose stack if not already running
      (`docker ps`), log in as `superadmin` / `Admin2026!` against
      `http://localhost`, and exercise R18's nine sub-bullets (i)–(ix):
      (i) PDF dialog pill row labels match the configured quarters'
      real names; (ii) Excel dialog same; (iii) click → dates write to
      pickers + pill highlights; (iv) edit picker → highlight clears;
      (v) N quarters render N pills; (vi) zero-configured-year → empty
      note + usable pickers; (vii) PDF title uses real quarter's
      uppercase name when active, `PERÍODO PERSONALIZADO` when pickers
      manually edited; (viii) AY switch reloads the pill row on next
      open; (ix) `seedQuarters()` partial-date rows show empty-note
      (the test institution's freshly-created AY requires creating a
      new AY via `POST /api/academic-years` if one is not already in the
      DB — see the foundation's T15 cleanup path; no DB rollback
      needed beyond deleting the AY via the admin UI's
      `DELETE /api/academic-years/:id` action). Done: each observation
      is recorded as a labeled bullet in T8's section of
      `progress/impl_fix_export_dialogs_use_real_quarters.md`.

- [x] T9 (R18) **Traceability table.** Build the per-`R<n>`
      traceability table in
      `progress/impl_fix_export_dialogs_use_real_quarters.md` mirroring
      the foundation's table shape (`R<n>` → file:line + evidence + the
      R18 sub-bullet that covers it). At minimum: every row references
      a concrete `R<n>` (R1 through R18); R18's nine sub-bullets each
      map to at least one observation recorded in T8; partial-date
      path (R15 + R18 ix) is exercised against the running stack or
      documented as not exercisable in this environment with a clear
      "evidence: code review" note. Done: the table covers every
      `R<n>` (R1–R18) with file:line refs; the reviewer can spot-check
      each row without re-running the smoke.

- [x] T10 (R18) **Final review and clean-up.** Confirm: no TODOs left
      in the two modified files; no debug `console.log`/`console.warn`s
      left behind (the foundation's T1 left a temporary
      `console.log` for signal verification — there is no equivalent
      here since there are no new signals to test in this feature); no
      unrelated files changed. Run `./init.sh` once more and confirm
      `[OK] Environment ready`. Done: `git diff --stat` against the
      session-start commit shows changes confined to
      `excel-export-dialog.component.ts` and
      `export-config-dialog.component.ts` (and the new
      `specs/fix_export_dialogs_use_real_quarters/*` and
      `progress/impl_fix_export_dialogs_use_real_quarters.md` files);
      the changes are clean for the reviewer to validate.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1  | T2, T5 |
| R2  | T4 |
| R3  | T6 |
| R4  | T2, T3, T5 |
| R5  | T2, T5 |
| R6  | T3, T5 |
| R7  | T3, T5 |
| R8  | T2, T5 |
| R9  | T2, T5 |
| R10 | T3, T5 |
| R11 | T3, T5 |
| R12 | T5 |
| R13 | T5 |
| R14 | T3, T5 |
| R15 | T4, T5 |
| R16 | T1, T2, T3, T5 |
| R17 | T7 |
| R18 | T8, T9, T10 |
