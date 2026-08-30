# Tasks — Require full dates on quarters

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists
the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition. The
implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]`
without a documented, reviewer-accepted justification in
`progress/impl_require_full_dates_on_quarters.md`.

- [x] T1 (R1, R2) In `src/app/features/admin/quarters-dialog.component.ts`, inside the
      `validationErrors()` computed's per-draft `for` loop, insert
      `if (!q.startDate || !q.endDate) { errs.set(q.localId, 'El período debe tener fecha de
      inicio y fecha de fin.'); continue; }` immediately after the existing name-length check
      (`if (q.name.trim().length > 60) { ...; continue; }`) and before the existing
      start-before-end check (`if (q.startDate && q.endDate && q.startDate.getTime() >
      q.endDate.getTime())`). Do not move, rename, or alter any other branch in this loop. Done:
      `grep -n "fecha de inicio y" src/app/features/admin/quarters-dialog.component.ts` shows the
      new line positioned between the name-length check and the start-before-end check (verify by
      reading the surrounding lines, not just the grep match); the existing
      `if (q.deleted) continue;` guard at the top of the loop is untouched and therefore still
      exempts deleted drafts from this new check (R2) with no separate mechanism added.

- [x] T2 (R3, R4) Verify by inspection (no code change expected) that `isValid()` and
      `onDraftFieldChange()` are unmodified and that they already compose with T1's new branch:
      `isValid()` still reads `this.validationErrors().size === 0` (R3), and every date input's
      `(ngModelChange)="onDraftFieldChange(draft)"` binding is unchanged (R4). Done: `git diff`
      for this feature shows no changes to `isValid()` or `onDraftFieldChange()` — the only diff
      in the file is T1's inserted branch.

- [x] T3 (R7) Confirm by inspection (no code change expected) that the `if (start && end)` guards
      on the start-before-end check, the two within-academic-year-range check blocks, and the
      `.filter(q => !q.deleted && q.startDate && q.endDate)` guard before the pairwise-overlap
      pass are all unchanged. Add a short comment at the T1 insertion site (or extend the existing
      block comment on `onDraftFieldChange`) documenting that these guards stay intentionally per
      `design.md`'s "Why the `if (start && end)` guards are not removed" section — this is the
      one non-obvious *why* `docs/conventions.md`'s Comments section sanctions here. Done: `git
      diff` shows the 4 downstream guards byte-for-byte unchanged; the new comment is present and
      references the transient mid-edit scenario, not a restatement of what the code already says.

- [x] T4 (R5, R6) Manually open the dialog (or, if a running stack is available per T6, directly
      via the browser) against an academic year that has at least one persisted quarter with a
      `null` `startDate` or `endDate`. **In production today, the easiest way to obtain such a
      row is to create a fresh academic year** (`POST /api/academic-years`) — `seedQuarters()`
      inserts 3 quarters with `startDate: null, endDate: null` for that year — and then open the
      dialog on that year. Historical null-dated rows were soft-deleted by migration
      `postgres/19_quarters_softdelete_legacy_null_dates.sql` and therefore no longer surface
      in `GET /api/quarters`, so they cannot reach the dialog. The dialog itself now blocks
      saving a new null-dated row via the client-side R1 check (and the backend rejects one with
      HTTP 400 anyway), so "seed a null-dated row via PUT to provoke this test" is no longer
      needed. Done: the dialog opens without a console error or blank screen; every affected
      draft's card shows the R1 inline error and the "Guardar períodos" button is disabled
      immediately, before touching any field (R6) — confirmed by inspecting the rendered
      DOM/screenshot before any interaction.

- [x] T5 (R4) Continuing from T4, fill in the missing date on the flagged draft via the
      datepicker. Done: the inline error disappears and the "Guardar períodos" button re-enables
      as soon as the field is filled, with no other field touched — confirms the existing
      `onDraftFieldChange` poke recomputes `validationErrors()` for this new check with no
      additional wiring.

- [x] T6 (R8) Run `pnpm run build` and `./init.sh`. Done: `pnpm run build` exits 0 with no new
      warnings attributable to `quarters-dialog.component.ts`; `./init.sh` ends with `[OK]
      Environment ready` (the two pre-existing `[WARN]`s for empty `verify_command` and unset
      `SUPABASE_URL` are unchanged from baseline).

- [x] T7 (R9) Run the manual smoke test described in `docs/verification.md` Level 3 against a
      running stack (`docker compose up --build` at the monorepo root; log in as a role with
      `update` permission on `academic_years`). Cover at minimum: (i) open the dialog on a
      **freshly-created academic year** (whose 3 seeded quarters from `seedQuarters()` are still
      null-dated) and confirm the error shows immediately on all 3 rows, before any interaction
      (R6); (ii) clear a date on an otherwise-valid draft and confirm the inline error appears
      and "Guardar períodos" disables (R1, R3); (iii) fill the date back in and confirm the
      error clears and the button re-enables (R4); (iv) perform a normal save with every draft
      fully dated and confirm it still succeeds unaffected (non-regression); (v) confirm a draft
      marked for deletion (via "Quitar") with a missing date does NOT block the save (R2);
      (vi) confirm a direct `curl PUT /api/quarters/:id` with `{"startDate": null, "endDate":
      null}` returns HTTP 400 with body containing the same Spanish string the dialog shows
      (non-regression of the new backend enforcement). Capture each observation in
      `progress/impl_require_full_dates_on_quarters.md`'s Traceability section. Done: the
      traceability table covers at least one observation per `R1`–`R9`.

- [x] T8 (R1 alignment) Verify the frontend and backend copies of the missing-dates error string
      are byte-for-byte identical (single shared user-facing message between dialog and wire).
      Run both:
      `grep -n "El período debe tener fecha de inicio y fecha de fin" specs/require_full_dates_on_quarters/requirements.md`
      `grep -rn "El período debe tener fecha de inicio y fecha de fin" ../backend/src/`
      and confirm both return exactly one copy of the string and the strings match character
      for character (verify by reading the matched lines, not just the grep count). Re-validate
      the same two greps after any future change to either copy. Done: both greps return ≥1
      hit, all hits equal the canonical string, and the new T8 sub-section in
      `progress/impl_require_full_dates_on_quarters.md`'s Traceability records the `grep`
      output. If either side drifts, the user would see two different messages for the same
      condition — fix in the same commit that introduces the drift, do not ship the drift.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1, T4, T7, T8 |
| R2 | T1, T7 |
| R3 | T2, T4, T7 |
| R4 | T2, T5, T7 |
| R5 | T4 |
| R6 | T4, T7 |
| R7 | T3 |
| R8 | T6 |
| R9 | T7 |
| R1 alignment (string parity, added in 2026-08-29 re-amend) | T8 |
