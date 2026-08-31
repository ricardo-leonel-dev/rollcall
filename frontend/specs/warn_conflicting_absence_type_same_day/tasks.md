# Tasks — Warn when an absence type conflicts with one already registered for the same day

Implementation order matches the data flow: response shape → partition helper → dialog component →
call-site integration (all three flows) → highlight → verification.

- [x] T1 (R1) Widen the `http.post<...>()` generic in `absences.component.ts:919` (and the
      equivalent in the Photo / Voice flows) from `{ created: number; skipped: number }` to
      `{ created: number; skipped: number; skippedDetails: Array<{ date: string;
      existingType: 'F' | 'AT'; conflict: boolean }> }`. No runtime change — only the type
      annotation. Verify with `pnpm run build` (= `./node_modules/.bin/tsc`, strict) that the
      change compiles without errors. Acceptance: R1 — backend contract compiles end-to-end on
      the frontend across all three flows.

- [x] T2 (R3) Add a private `partitionSkipped(response)` helper inside `AbsencesComponent` that
      returns `{ conflicts: Array<{date, existingType}>; idempotents: number }` by filtering
      `response.skippedDetails` on `conflict === true` / `conflict === false` respectively (R3
      §2/§3). The helper MUST NOT re-sort — it relies on the backend's ascending order (verified
      at `backend/src/services/absence.service.ts` post-commit `ae9a7e5`). Acceptance: R3 — used
      by T6 / T7 / T9 / T10 below.

- [x] T3 (R6, R7, R8) Create `src/app/features/absences/absence-save-result-dialog.component.ts`
      as a standalone, `OnPush`, `inject()`-only component that reads its inputs from
      `MAT_DIALOG_DATA` (typed per `AbsenceSaveResultDialogData` in `design.md` "New component
      contract"). Load the `frontend-design` skill BEFORE writing the inline `template:`/`styles:`
      blocks per `docs/architecture.md` "Design Workflow". The component MUST:
      - Render Section 2 ("Conflictos") only when `data.conflicts.length > 0`.
      - For each `data.conflicts[i]`, render `<dateToDateString(d.date)> — ya registrado como <
        typeLabel(d.existingType)>` (R8).
      - Render the R7 explanatory line in a softer colour under Section 2.
      - Render a `Cerrar` footer button (`mat-stroked-button`) bound to `MatDialogRef.close()`.
      Acceptance: R6, R7, R8 — dialog compiles and the Section 2 markup renders in the all-conflict
      case.

- [x] T4 (R4, R11) Extend the dialog from T3 with a header "Enviar WhatsApp" action button that:
      - Renders only when `data.created > 0 && data.whatsappLink` is truthy.
      - Uses `WhatsappIconComponent` (already imported in `absences.component.ts:24`, just re-import
        in the dialog).
      - On click, calls `data.onWhatsapp()` (the closure passed by the parent component in T7/T9/T10),
        which invokes `AbsencesComponent.notifyGuardian(...)` with the same arguments as today
        (R4) and then closes the dialog.
      Acceptance: R4, R11 — WhatsApp action works from the dialog header identically to how it
      works on the toast, regardless of which parent flow opened the dialog.

- [x] T5 (R10, R13) Extend the dialog from T3/T4 with Sections 1 ("Creadas") and 3 ("Idempotentes").
      Render Section 1 only when `data.created > 0`; render Section 3 only when
      `data.idempotents > 0`. Section 3's line is `<data.idempotents> ya estaban registradas con
      el mismo tipo` (count-only, the simpler of the two acceptable choices per R10 §3 and the
      "Open questions" item 1 — if the user wants the full list during approval, swap the count for
      a `<ul>` of dates; no other change is needed). Acceptance: R10, R13 — mixed-case dialog
      renders all three groups without information loss.

- [x] T6 (R2, R5, R9) In `AbsencesComponent.saveAbsenceRange()`, replace lines 923–933 with a
      branch on `conflicts.length === 0`:
      - When zero conflicts: build the toast message exactly as today (`result.skipped > 0 ?
        \`${result.created} registro(s) creado(s), ${result.skipped} ya existían\` :
        \`${result.created} registro(s) creado(s)\``) and call `notify.success(msg, { duration:
        10000, actionLabel: link ? 'Enviar WhatsApp' : undefined, actionIcon: 'whatsapp', onAction:
        link ? () => this.notifyGuardian(link, enrollment.fullName, dateLabel, type,
        enrollment.course) : undefined })`. The toast call MUST be byte-for-byte equivalent to
        the current code path for the no-conflict case — no formatting changes.
      Acceptance: R2, R5, R9 — the no-conflict path preserves today's behaviour exactly.

- [x] T7 (R1, R3, R6, R10, R11, R16) In the same `saveAbsenceRange()`, extend the branch from T6
      with the `else` (conflicts > 0) case. Compute `createdDates = businessDaysBetween(f.dateFrom,
      f.dateTo).filter(d => !result.skippedDetails.some(s => s.date === d))` (where
      `businessDaysBetween` is the same Monday–Friday UTC iterator as the backend's
      `businessDaysInRange` — it MUST match exactly so the created-list dates line up with what
      the backend actually inserted; either copy the helper from
      `backend/src/services/absence.service.ts` into the dialog file as a private function, or
      extract it into `shared/utils/date.util.ts` if the implementer prefers; either is fine —
      flag the choice in `progress/impl_warn_conflicting_absence_type_same_day.md`). Then open:
      ```
      const dialogRef = this.dialog.open(AbsenceSaveResultDialogComponent, {
        width: '480px',
        data: {
          created: result.created,
          createdDates,
          conflicts: partition.conflicts,
          idempotents: partition.idempotents,
          whatsappLink: enrollment.whatsappLink,
          fullName: enrollment.fullName,
          dateLabel,
          type,
          course: enrollment.course,
          onWhatsapp: () => {
            if (enrollment.whatsappLink) {
              this.notifyGuardian(enrollment.whatsappLink, enrollment.fullName, dateLabel, type, enrollment.course);
            }
            dialogRef.close();
          },
        },
      });
      this.pendingHighlight.set({ enrollmentId: enrollment.id, dates: partition.conflicts.map(c => c.date) });
      dialogRef.afterClosed().subscribe(() => { this.applyHighlight(); });
      ```
      DO NOT call `notify.success(...)` in this branch. Acceptance: R1, R3, R6, R10, R11 — the
      conflict / mixed branches open the dialog with the correct payload, and the `onWhatsapp`
      closure captures the `dialogRef` so the dialog closes after the WhatsApp window opens.

- [x] T8 (R3, R4) Re-read `absences.component.ts:917–938` end-to-end and confirm that the
      `created` count + `dateLabel` + `whatsappLink` + `enrollment.fullName` + `type` +
      `enrollment.course` references are unchanged for the no-conflict path (T6), and that the
      refresh (`await Promise.all([this.loadTodayAbsences(), this.loadAbsences()])` on line 934)
      runs in BOTH branches (so the user sees the new rows immediately even when the dialog
      focuses attention on the conflicts). Acceptance: R3, R4 — invariants preserved across
      branches.

- [x] T9 (R12, R14) In `AbsencesComponent.confirmPhotoAbsences()` (lines 867–896), replace the
      existing generic-toast call (the equivalent of lines 923–933 in the Manual flow) with the
      same branch on `conflicts.length === 0`:
      - On zero conflicts, keep today's generic toast verbatim (same message format and same
        options as before — use the photo flow's own variables, not the Manual flow's).
      - On conflicts > 0, open `AbsenceSaveResultDialogComponent` with the photo flow's own
        enrollment context (the student that was confirmed in the preview), the photo-created
        `createdDates` (derived the same way as T7), the same `partition.conflicts` /
        `partition.idempotents`, and an `onWhatsapp` closure that calls `notifyGuardian(...)`
        using the photo enrollment's `whatsappLink` / `fullName` / `course` — then closes the
        dialog. Wire the same `pendingHighlight` signal (with the photo enrollment's id) and call
        `applyHighlight()` in `dialogRef.afterClosed()`.
      The photo preview UI (selectable matches, confidence percentages) is NOT touched — only the
      post-confirm feedback. Acceptance: R12, R14 — photo flow uses the same dialog as Manual,
      photo preview is unchanged.

- [x] T10 (R12, R15) Same shape as T9, applied to `confirmVoiceAbsence()` (lines 1061–1088):
      - Zero conflicts → today's generic toast verbatim (voice flow's own variables).
      - Conflicts > 0 → open the dialog with the voice flow's own enrollment context, wire
        `pendingHighlight` with the voice enrollment's id.
      The voice transcript UX (confidence display, "confirmar" button) is NOT touched. Acceptance:
      R12, R15 — voice flow uses the same dialog, voice transcript is unchanged.

- [x] T11 (R16) Add the `pendingHighlight` signal and `applyHighlight()` method to
      `AbsencesComponent`. `pendingHighlight` is a `signal<{ enrollmentId: number; dates:
      string[] } | null>(null)`. `applyHighlight()` does three things in order:
      1. Switches the active tab to the Listado tab (using the existing `MatTabGroup` API; the
         implementer reads the current template to determine the right `selectedIndex`).
      2. Awaits `loadAbsences()` to ensure the Listado data is fresh for the quarter already
         selected.
      3. For each entry in `pendingHighlight.dates`, finds the row matching that enrollment id
         and date in the rendered Listado DOM (e.g. by `data-enrollment-id` and
         `data-absence-date` attributes the implementer adds to the row template in this same
         PR), adds a transient CSS class (e.g. `flash-conflict`) defined inline in the
         component's `styles:` block (yellow border + pulse animation, 2-second duration), and
         calls `row.scrollIntoView({ behavior: 'smooth', block: 'center' })`. After 2 seconds
         (or via `animationend` listener), removes the class.
      If `pendingHighlight` is null (called by mistake or after a non-conflict flow), the method
      is a no-op. Acceptance: R16 — after closing the conflict dialog from any of the three
      flows, the Listado tab opens, the conflicting rows are scrolled into view and briefly
      highlighted.

- [x] T12 (R13 build & verify across all three flows) Run `pnpm run build` and confirm it exits
      0 (or `./node_modules/.bin/tsc` if `pnpm` is not on PATH). Smoke-test the four scenarios
      manually against the running stack (`docker compose up -d --build backend`), once per
      flow:
      1. Range with all dates new → today's success toast + WhatsApp action (R5, R9); no
         highlight applied.
      2. Range with all dates already registered with the SAME type → today's toast, no
         dialog (R2, R9); no highlight applied.
      3. Range where some dates already have the OPPOSITE type, none created → all-conflict
         dialog with Section 2 + R7 line + no WhatsApp (R6, R7, R8); after close, the
         conflicting rows flash in the Listado (R16).
      4. Range with a mix of created + conflict + idempotent → mixed-case dialog with
         Sections 1/2/3, WhatsApp action in the header (R10, R11); after close, the conflicting
         rows flash in the Listado (R16).
      Repeat scenarios 1–4 once per flow (Manual / Photo / Voice). For Photo and Voice, confirm
      that the pre-existing preview UX (selectable matches / confidence display) is unchanged
      before AND after the conflict dialog opens. Record the smoke steps and outcomes in
      `progress/impl_warn_conflicting_absence_type_same_day.md`. Acceptance: R13 — green
      build, all 12 smoke scenarios (4 × 3 flows) verified manually.
