# Review — feature 1

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md` all present and non-placeholder; `./init.sh` exits 0 ending with `[OK]    Environment ready.`
- C2: [x] — Only feature #1 is `in_progress` (one row from `harness.sh status`); the open session (#1) reflects current work; no stale leftovers.
- C3: [x] — `Quarter` interface correctly placed in `core/models/index.ts` (line 9-21); `QuarterService` in `core/services/quarter.service.ts`; dialog in `features/admin/`. All new components are `standalone: true` with `ChangeDetectionStrategy.OnPush`; mutable state is signal-based (`drafts`, `saving`, `validationErrors`, `isValid`). HTTP calls use `firstValueFrom` + `try/catch`; user-facing errors routed through `NotificationService`. No new runtime dependencies introduced. Inline `template`/`styles` (no `.html`/`.css` siblings). No stray `console.log`/`print` or unjustified TODOs.
- C4: [x] — `pnpm run build` (`./node_modules/.bin/ng build --configuration production`) ran successfully with `EXIT_CODE=0`. All warnings (NG8102/NG8107 in absences/dashboard/justifications/students, `@import` ordering in `src/styles.css`, per-component style-budget overruns in calendar/layout/login/export-config/justification-create) are pre-existing in unrelated files; none originate from `src/app/core/services/quarter.service.ts`, `src/app/features/admin/quarters-dialog.component.ts`, `src/app/features/admin/admin.component.ts`, `src/app/features/admin/academic-year-dialog.component.ts`, or `src/app/core/models/index.ts`. (No automated test suite exists in this project per `docs/verification.md` and `CHECKPOINTS.md` C4's own caveat — applied as documented, not treated as a defect.)
- C5: [x] — Session is still open (waiting on this review); once `log-out` runs after this approval the feature will reflect `done`. No stray untracked/temporary files (only the expected `progress/` snapshot files, which are the standard harness bookkeeping).
- C6: N/A — feature has `sdd=0`, spec-driven development does not apply.

## Acceptance walkthrough

- [x] Users with permission on `academic_years` resource can create/update the 3 quarter periods from the academic year option — entry-point icon button on the active AY row in `src/app/features/admin/admin.component.ts:134-136` (`<button mat-icon-button ... (click)="openQuartersDialog(y)">`), handler `openQuartersDialog` at `admin.component.ts:502-513` opens `QuartersDialogComponent`; backend `requirePermission('academic_years', ...)` is the canonical gate, frontend just exposes the affordance.
- [x] Client-side validation prevents overlapping quarter dates — `src/app/features/admin/quarters-dialog.component.ts:161-172` pairwise overlap check inside the `validationErrors` computed signal (`!(a.end < b.start || a.start > b.end)`).
- [x] Client-side validation prevents quarter dates outside the academic year's date range — `src/app/features/admin/quarters-dialog.component.ts:132-158` (per-quarter start ≤ end + start ≥ AY start + end ≤ AY end, with continue); range is shown up-front in the dialog header at `quarters-dialog.component.ts:74-77`; save button is disabled while invalid via `[disabled]="!isValid() || saving()"` at `quarters-dialog.component.ts:113`.
- [x] UI surfaces/prompts adjustment when the academic year's dates change and existing quarters become invalid — `src/app/features/admin/admin.component.ts:477-500` (`warnIfQuartersOutOfRange`) runs after every successful AY edit (`openYearDialog` wires it in at `admin.component.ts:459-470`); on the active year, after dates change, it fetches quarters, surfaces a warning toast with offending names/ranges, and auto-opens the quarters dialog with the updated range baked in (`openQuartersDialog({ ...original, startDate: updated.startDate, endDate: updated.endDate })`).
- [x] Consumes the new backend endpoints — `src/app/core/services/quarter.service.ts:23-33` issues `GET /api/quarters`, `POST /api/quarters`, `PUT /api/quarters/:id` via `HttpClient` + `firstValueFrom`. The dialog loops over the 3 fixed names and dispatches `update` for existing rows vs. `create` for missing rows in `src/app/features/admin/quarters-dialog.component.ts:202-214`.

## Required Changes (if applicable)

None.

## Notes (optional)

- `src/app/features/admin/admin.component.ts:497-499` swallows a possible `quarterService.getAll()` failure with an empty `catch {}`. It is annotated with a comment (`// best-effort UX warning; server-side 409 still protects integrity`) which makes the intent deliberate, and it is the prototype pattern called out in `docs/conventions.md`'s "best-effort UX warning" style rather than a hidden `console.error`. Server is the source of truth for this check, so this is defensible — flagging only for awareness, not as a defect.
- `src/app/features/admin/quarters-dialog.component.ts` uses a `styles:` block (lines 33-65) in addition to inline template styles. This matches the existing `admin.component.ts` pattern (lines 35-59), so it is consistent — not a deviation.
- The first-build output (no `pnpm` available in this reviewer's environment) was reproduced by invoking `./node_modules/.bin/ng build --configuration production` directly, with the same exit code (0) and the same warning set; the implementer's claim that the build is green is verified, not taken on prose.
- Implementer did not run Level-3 manual smoke (no `docker compose` available in their session). The wiring, validation, and error surfacing all read correctly end-to-end, but a real smoke test before merge is still recommended per `docs/verification.md` (the reviewer notes this as a project-process observation, not a defect).
- `Quarter` interface in `src/app/core/models/index.ts:9-21` matches the backend entity shape (`academicYearId`, `institutionId`, `sequenceNumber`, `isActive`, `createdAt`/`updatedAt` included) — clean DTO, no missing fields surfaced by the dialog.