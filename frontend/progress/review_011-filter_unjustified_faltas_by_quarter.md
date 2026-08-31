# Review — feature 11 (`filter_unjustified_faltas_by_quarter`)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json` + `harness.db` present; docs filled in; `./init.sh` ends with `[OK] Environment ready. You can start working.`
- C2: [x] — only feature 11 is `in_progress` (per `scripts/harness.sh status`); session 18 is the live session for this feature and was opened by the leader before the implementer picked it up; no stale leftovers.
- C3: [x] — change is confined to one method on the existing feature component; uses `inject()` (not constructor DI), signals, `OnPush`, inline template, `firstValueFrom(await ...)` — no new deps, no `NgModule`, no new top-level folder, no debug logs, no TODOs.
- C4: [x] — `node_modules/.bin/ng build --configuration production` returns exit 0. The only warnings emitted are pre-existing baseline (NG8107/NG8102 in `student-history`, `student-management`; `@import` order in `src/styles.css:1040`; CSS budget warnings on `login`, `calendar`, `layout`, `justification-create-dialog`). None are attributable to `justifications.component.ts` (verified by grepping the build log for `justifications` — no warnings emitted by this file). Per `docs/verification.md`, the project has no automated test suite yet; Level 1 (build) is the applicable mandatory check, and it passes. Level 3 manual smoke against `docker compose up` was waived by the implementer on the grounds that this change reuses the exact same `/api/absences` + `date_from`/`date_to` HTTP shape that `loadPendingStudents()` already exercises daily since feature 6 — a reasonable argument for a one-method mechanical change; not an APPROVED-blocking concern.
- C5: [x] (deferred to leader) — the session is still `open`; C5 only finalizes after the leader runs `log-out` post-approval, which is the correct sequence.
- C6: N/A — feature 11 is `sdd=0` per `state/features/011-filter_unjustified_faltas_by_quarter.md`, so SDD spec integrity does not apply.

## Required Changes (if applicable)

None.

## Acceptance criteria (cross-checked against `state/features/011-filter_unjustified_faltas_by_quarter.md`)

1. **onStudentCreateChange() agrega date_from=selQuarterStart y date_to=selQuarterEnd (mismo formato que loadPendingStudents)** — ✅ Confirmed. New code at lines 479–486 of `src/app/features/justifications/justifications.component.ts` builds a `params: string[]` with the same `if (this.selQuarterStart && this.selQuarterEnd)` guard and the same `dateToDateString(...)` calls that `loadPendingStudents()` uses at lines 429–432 and `loadHistorial()` at lines 412–415.
2. **Al seleccionar un estudiante en 'Nueva justificación' con un trimestre activo, solo se listan faltas sin justificar cuya date cae dentro del rango del trimestre** — ✅ Follows mechanically from the previous criterion: the request now carries `date_from=<selQuarterStart YYYY-MM-DD>&date_to=<selQuarterEnd YYYY-MM-DD>`, which the backend `absence.service.ts:48` filters with `>=`/`<=` on `a.date`. The picker renders `this.unjustified()` unchanged — only the upstream query is narrower.
3. **Cambiar de trimestre y volver a seleccionar el mismo estudiante recalcula la lista con el nuevo rango** — ✅ `onQuarterChange()` (unchanged) calls `onCourseChange()`, which sets `selStudentCreate = null` and clears `unjustified`. The user must re-select the student; the next `onStudentCreateChange()` reads the now-updated `selQuarterStart`/`selQuarterEnd` and appends the new range. No additional wiring required.
4. **Si el trimestre no tiene startDate/endDate completos, se mantiene el comportamiento actual (no-op / sin filtro)** — ✅ The `if (this.selQuarterStart && this.selQuarterEnd)` guard is byte-for-byte the same guard `loadPendingStudents()` and `loadHistorial()` already use; if either is `null`, no `date_from`/`date_to` params are appended and the request is unscoped — identical to the pre-feature behavior.

## Drift / notes

- No `docs/conventions.md` violations. The change uses `firstValueFrom(await ...)` (not `.subscribe()`), stays inside the existing feature folder, doesn't add a new dependency, doesn't restyle anything.
- The diff is exactly 1 file, 9 insertions / 1 deletion in the function body — matches the implementer's claim and the `git diff --stat` output.
- The sibling `justification-create-dialog.component.ts` has no diff against the previous commit (confirmed via `git diff`).
- Backend support for `dateFrom`/`dateTo` on `GET /api/absences` was shipped earlier (backend feature 6); re-confirmed at `backend/src/services/absence.service.ts:48`.
- The `progress/impl_011-filter_unjustified_faltas_by_quarter.md` traceability map matches the actual diff and the actual file contents (line numbers, function names, guard clauses all check out).

## Files inspected

- `/home/rileo/ai-personal/frontend/CHECKPOINTS.md`
- `/home/rileo/ai-personal/frontend/docs/architecture.md`
- `/home/rileo/ai-personal/frontend/docs/conventions.md`
- `/home/rileo/ai-personal/frontend/docs/verification.md`
- `/home/rileo/ai-personal/frontend/state/features/011-filter_unjustified_faltas_by_quarter.md`
- `/home/rileo/ai-personal/frontend/progress/impl_011-filter_unjustified_faltas_by_quarter.md`
- `/home/rileo/ai-personal/frontend/src/app/features/justifications/justifications.component.ts` (full file, focus on lines 422–491)
- `/home/rileo/ai-personal/frontend/src/app/features/justifications/justification-create-dialog.component.ts` (no diff — confirmed untouched)
- `git diff src/app/features/justifications/justifications.component.ts`
- `git status` / `git diff --stat HEAD`
- `./init.sh` output (passes)
- `node_modules/.bin/ng build --configuration production` (exit 0, no errors, no new warnings attributable to this feature)

Ready for the leader to run `scripts/harness.sh log-out`.
