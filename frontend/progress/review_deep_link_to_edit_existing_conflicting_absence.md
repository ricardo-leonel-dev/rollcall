# Review — feature 16 (`deep_link_to_edit_existing_conflicting_absence`)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json` + `harness.db` present; `docs/architecture.md`,
  `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md` all present;
  `./init.sh` ends with `[OK] Environment ready`.
- C2: [x] — `scripts/harness.sh status` shows only feature 16 `in_progress`;
  session 26 is the live session for this feature; the spec doc is the durable
  record since this project has no automated test suite
  (`docs/conventions.md` "Tests"); the implementer's report
  (`progress/impl_deep_link_to_edit_existing_conflicting_absence.md`) is present
  and traces R1–R22 to concrete code anchors.
- C3: [x] — 3 files modified, 1 new file, no new top-level folders under
  `src/app`; uses `inject()`, `OnPush`, `standalone: true`, signals
  (`resolving`, `state`, `saving`), `firstValueFrom(await ...)`; no new runtime
  deps (all imports are already in `package.json`); no `console.log`/`TODO`
  leftovers; no constructor DI; no absolute API hosts; no NgModule.
- C4: [x] — `./node_modules/.bin/ng build --configuration production` exits 0;
  the only warnings emitted are pre-existing baseline (NG8102/NG8107 in
  unrelated files, `@import` order in `src/styles.css:1040`, the bundle initial
  budget overrun that pre-dates this feature, per-component CSS budget
  warnings on `login`/`layout`/`calendar`/`absences`/`justification-create-dialog`/
  `export-config-dialog`). None are attributable to the new
  `absence-edit.component.ts` (it's ~1.1 kB of inline styles, under the 2 kB
  budget). Per `docs/verification.md`, the project has no automated test suite
  yet — Level 1 (build) is the applicable mandatory check and it passes. The
  T20 manual smoke plan covers the full AC scenario.
- C5: [x] (deferred to leader) — the session is still `open`; C5 only
  finalizes after the leader runs `log-out` post-approval, which is the
  correct sequence.
- C6: [x] — `specs/deep_link_to_edit_existing_conflicting_absence/{requirements.md,
  design.md,tasks.md}` all exist on disk (approved by Ricardo Aguilar);
  `requirements.md` uses strict EARS for every R1–R22 with stable ids;
  `tasks.md` marks all 20 tasks `[x]` and every `R<n>` maps to a concrete,
  code-verified anchor (see Spec coverage table below).

## Spec coverage table (R<n> vs. code anchor, verified directly)

| Requirement | Status | Code anchor |
|---|---|---|
| R1 — `enrollmentId` added to every `AbsenceSaveResultConflict` regardless of origin | implemented | `AbsenceSaveResultConflict.enrollmentId: number` at `absence-save-result-dialog.component.ts:16`; thread-through at `absences.component.ts:1034, 1110, 1279` |
| R2 — Edit click sends `GET /api/absences?enrollment_id=&date_from=&date_to=` | implemented | `editConflict()` GET call at `absence-save-result-dialog.component.ts:184-186` |
| R3 — exactly-one-match resolves id | implemented | `matches.length !== 1` guard at `absence-save-result-dialog.component.ts:187-189` |
| R4 — per-row "Editar inasistencia" button | implemented | `absence-save-result-dialog.component.ts:124-133` (button + `hourglass_top`/`edit` icon swap) |
| R5 — route registered with `moduleGuard` + `data: { module: 'absences' }` | implemented | `app.routes.ts:39` |
| R6 — URL self-sufficient on fresh load (no router `state` dependency) | implemented | `absence-edit.component.ts:148-150` reads `:id`/`enrollmentId`/`date` from `paramMap`/`queryParamMap` snapshot; no `history.state` dependency |
| R7 — fetches via same shape as R2 from `route.snapshot.paramMap`/`queryParamMap` | implemented | `absence-edit.component.ts:156-158` |
| R8 — not-found state when no row matches `:id` | implemented | `not-found` render at `absence-edit.component.ts:65-75`; `:160` for empty match, `:152` for missing params, `:167` for fetch failure |
| R9 — loading state while fetch in progress | implemented | `.spinner-center` + `.spinner` at `absence-edit.component.ts:58-63` |
| R10 — navigate to `inspectors/absences/edit/:id?enrollmentId=&date=` on resolve | implemented | `router.navigate([...], { queryParams: {...} })` at `absence-save-result-dialog.component.ts:192-194` |
| R11 — `MatDialogRef.close()` before navigation | implemented | `dialogRef.close()` at `:191` runs before the `await router.navigate(...)` at `:192-194` |
| R12 — zero/multi-row result shows error and does not navigate | implemented | guard at `absence-save-result-dialog.component.ts:187-189`; catch block at `:195-197` |
| R13 — prefill date/type/notes from `Absence`, show read-only studentName/course/academicYear | implemented | prefill at `absence-edit.component.ts:161-164`; read-only render at `:78-89` |
| R14 — `PUT /api/absences/:id` with date/type/notes | implemented | `absence-edit.component.ts:175-179` |
| R15 — save disabled when `date` empty | implemented | `[disabled]="saving() || !date"` at `absence-edit.component.ts:125` |
| R16 — success → notify + navigate to `/inspectors/absences` | implemented | `notify.success` at `:180`, `router.navigateByUrl('/inspectors/absences')` at `:181` |
| R17 — failure → notify, stay | implemented | `notify.error(err?.error?.error ?? 'No se pudo guardar')` at `:183`; no navigation in catch |
| R18 — `ConfirmDialogComponent` opened before delete | implemented | `absence-edit.component.ts:189-198` opens dialog before any DELETE call |
| R19 — `isJustified`-conditional message lifted verbatim from `absences.component.ts:deleteAbsence()` | implemented | text at `absence-edit.component.ts:192-194` is byte-identical to `absences.component.ts:1161-1163` |
| R20 — `DELETE /api/absences/:id`; success → notify + navigate; failure → notify, stay | implemented | `absence-edit.component.ts:198-210` |
| R21 — Cancelar navigates with no PUT/DELETE | implemented | `cancel()` at `absence-edit.component.ts:213-215` is a single `router.navigateByUrl` call, no HTTP |
| R22 — build green + manual smoke | implemented | build exit 0; smoke plan documented in `progress/impl_deep_link_to_edit_existing_conflicting_absence.md` § T20 (7 steps verbatim from `tasks.md`) |

## Verification commands run

- `./node_modules/.bin/ng build --configuration production` — **exit 0**.
  Warnings emitted are all pre-existing baseline (NG8102/NG8107 nullish-coalescing
  warnings in `justifications.component.ts`, `student-history-dialog.component.ts`,
  `student-history.component.ts`, `student-management.component.ts`;
  `@import` order in `src/styles.css:1040`; bundle initial budget overrun that
  pre-dates this feature; per-component CSS budget warnings on `login`,
  `layout`, `calendar`, `absences`, `justification-create-dialog`,
  `export-config-dialog`). None originate from `absence-edit.component.ts`.
- `./init.sh` — exits 0, `[OK] Environment ready`.
- `git status --short` — exactly the 3 modified files in the diff, the new
  `absence-edit.component.ts`, the new spec dir, and the new
  `progress/impl_deep_link_to_edit_existing_conflicting_absence.md` — no stray
  files.
- `git diff src/app/features/absences/absences.component.ts` — exactly the 3
  line-level changes the implementer claims, no scope creep.
- `grep -n 'enrollmentId' /home/rileo/ai-personal/frontend/src/app/core/models/index.ts`
  — `VoiceAbsenceResult.enrollmentId` (`:275`), `PhotoAbsenceItem.enrollmentId`
  (`:284`) confirmed; both already carry the field at the call sites T3 and T4
  consume, so no model widening was needed.
- `grep -n 'dateStringToDate' /home/rileo/ai-personal/frontend/src/app/shared/utils/date.util.ts`
  — line 1: `dateStringToDate(s: string | null | undefined): Date | null`
  exists and is used correctly in `absence-edit.component.ts:162`.
- Verbatim copy check — `absence-edit.component.ts:192-194` matches
  `absences.component.ts:1161-1163` byte-for-byte. R19 holds.
- `ConfirmDialogComponent.severity` defaults to `warn` when not passed
  (`confirm-dialog.component.ts:43`) — the implementer's choice to not pass
  `severity` in `confirmDelete()` matches the existing pattern in
  `absences.component.ts:deleteAbsence()` (also no `severity` field).
- Spec task count — `grep -c '^- \[x\]' specs/deep_link_to_edit_existing_conflicting_absence/tasks.md` = 20, matches the implementer's report.

## Drift / notes

- No `docs/conventions.md` violations. New code uses `firstValueFrom(await ...)`
  inside `try/catch/finally`, stays inside the existing feature folder, doesn't
  add a new runtime dependency, doesn't restyle anything outside the new
  component's own `.edit-card` chrome.
- The new `AbsenceEditComponent` correctly uses the `inject()` function (not
  constructor DI), `OnPush` change detection, inline `template:`/`styles:`
  (no `.html`/`.css` siblings), and signal-backed state where the view depends
  on it (`state`, `saving`). Non-signal fields (`absence`, `date`, `type`,
  `notes`) are bound via `[(ngModel)]` and re-read on the same render pass as
  the `state` signal transitions — same idiom as the existing
  `absence-dialog.component.ts:92-94`.
- The route at `app.routes.ts:39` is a sibling of the existing `absences`
  entry inside the `inspectors` children array (not nested under it). Angular
  sorts routes by segment specificity, so `/inspectors/absences/edit/:id` wins
  over the `absences` prefix for that URL — verified by reading the
  surrounding context (`dashboard`, `absences`, `absences/edit/:id`,
  `justifications`, `student-report`, `citations` are all flat siblings).
- `editConflict()` properly cleans up the `resolving` signal in a `finally`
  block (`absence-save-result-dialog.component.ts:197-199`), so a network
  error or a non-1-match doesn't leave the per-row button permanently
  disabled.
- The "no backend change" claim in the spec is consistent with
  `requirements.md`'s "Backend dependency reassessment" — `PUT`/`DELETE /:id`
  and `GET /api/absences?enrollment_id=&date_from=&date_to=` are all already
  shipped in the sibling backend, no cross-project blocker needed.
- `pnpm` is not on PATH in this sandbox, so the implementer used
  `./node_modules/.bin/ng build --configuration production` as a drop-in
  equivalent — same `ng` invocation, same exit-code semantics.

## Required Changes (if applicable)

None.

## Files inspected

- `/home/rileo/ai-personal/frontend/CHECKPOINTS.md`
- `/home/rileo/ai-personal/frontend/docs/architecture.md`
- `/home/rileo/ai-personal/frontend/docs/conventions.md`
- `/home/rileo/ai-personal/frontend/docs/verification.md`
- `/home/rileo/ai-personal/frontend/specs/deep_link_to_edit_existing_conflicting_absence/{requirements.md,design.md,tasks.md}`
- `/home/rileo/ai-personal/frontend/progress/impl_deep_link_to_edit_existing_conflicting_absence.md`
- `/home/rileo/ai-personal/frontend/src/app/app.routes.ts`
- `/home/rileo/ai-personal/frontend/src/app/features/absences/absence-save-result-dialog.component.ts`
- `/home/rileo/ai-personal/frontend/src/app/features/absences/absences.component.ts` (focus on lines 1034, 1110, 1161-1163, 1279)
- `/home/rileo/ai-personal/frontend/src/app/features/absences/absence-edit.component.ts`
- `/home/rileo/ai-personal/frontend/src/app/features/absences/absence-dialog.component.ts` (reference for edit-mode field shape)
- `/home/rileo/ai-personal/frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts` (reference for `severity` default)
- `/home/rileo/ai-personal/frontend/src/app/shared/utils/date.util.ts` (reference for `dateStringToDate`/`dateToDateString`)
- `/home/rileo/ai-personal/frontend/src/app/core/models/index.ts` (reference for `VoiceAbsenceResult`/`PhotoAbsenceItem`/`Absence` shape)
- `git status` / `git diff --stat HEAD` / `git diff src/app/features/absences/absences.component.ts`
- `./init.sh` output (passes)
- `./node_modules/.bin/ng build --configuration production` (exit 0)

Ready for the leader to run `scripts/harness.sh log-out`.
