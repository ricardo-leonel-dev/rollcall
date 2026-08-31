# Review — feature 13

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `./init.sh` finishes green; `.harness.json` + `harness.db` exist; `docs/{architecture,conventions,verification}.md` and `CHECKPOINTS.md` are populated.
- C2: [x] — harness `status` shows only feature 13 in `in_progress` (DB constraint enforced); open session 19 (leader, 2026-08-31) reflects real, current work on this feature.
- C3: [x] — Diff touches only `src/app/features/absences/absences.component.ts` inside an existing feature folder (no new top-level folder, no new dependency). No new `console.log` or unscoped TODO introduced. Comment is a documented workaround per `docs/conventions.md` §"Comments".
- C4: [x] — `pnpm run build` (run via `npx --no-install ng build --configuration production`) exits 0 with only pre-existing warnings (NG8107 in `student-management`, @import ordering in `styles.css`, CSS budget overages in untouched components — none in `absences.component.ts`'s edited region). This project has no automated test suite (`docs/verification.md` is explicit; `verify_command` unset; init.sh `[WARN]`s not fails). Level 3 manual smoke against `docker compose up` is optional per `docs/verification.md` §"Verification Levels" — see "Recommendations" below.
- C5: [x] — No stray untracked files (only the intended `progress/impl_…` note and the pre-existing `.gitignore`/`scripts/` directories). Session 19 will be closed by the leader after this approval.
- C6: N/A — feature is `sdd=0` per `state/features/013-…md` (no `specs/013-…` directory present; this is correct for `sdd=0` features per `CHECKPOINTS.md` §C6).

## Acceptance criteria

- **AC1 — `loadTodayAbsences()` queries `/api/absences` with `date_from == date_to == local today`, ignoring `this.dateFrom`/`this.dateTo`.** Met. Lines 741-752: `const today = dateToDateString(new Date());` is the only date source used; `this.dateFrom`/`this.dateTo` are no longer referenced inside `loadTodayAbsences()`. The 4-line comment explains the intentional ignore of the instance fields.
- **AC2 — "Falta hoy" badge only when the student has an F absence dated today.** Met. `todayAbsences` signal (line 675) only holds today-dated rows; `markedToday(eId, 'F')` (line 754-756) returns true only when one of those rows has `type === 'F'` and `enrollmentId === eId`.
- **AC3 — "Atraso hoy" badge only when the student has an AT absence dated today.** Met. Same reasoning as AC2 with `type === 'AT'`; template at line 308 calls `markedToday(e.enrollmentId, 'AT')`.
- **AC4 — Listado tab and its `dateFrom`/`dateTo` quarter-scoped filter are untouched.** Met. `loadAbsences()` (lines 758-770) still reads `this.dateFrom`/`this.dateTo`; `onQuarterChange()` (lines 797-807) still seeds them from `q.startDate`/`q.endDate`; `applyDefaultQuarter()` (line 809+) likewise. The only call sites of `dateFrom`/`dateTo` that remain in the file are the Listado-filter paths.

## Listado-tab / `loadAbsences()` regression check

`git diff src/app/features/absences/absences.component.ts` shows the hunk is exclusively in `loadTodayAbsences()`. `loadAbsences()`, `onQuarterChange()`, `applyDefaultQuarter()`, `clearFilters()`, the `dateFrom`/`dateTo` field declarations, the `todayStr()` helper at line 725, and the query-param reading at lines 715-718 are all outside the diff. No regression.

## Timezone correctness

`dateToDateString(d: Date | null): string` in `src/app/shared/utils/date.util.ts` reads `d.getFullYear()`, `d.getMonth()`, `d.getDate()` — all **local** date components (not `toISOString()`, which is UTC). At 22:00 local in any TZ west of UTC on 2026-08-31, `dateToDateString(new Date())` correctly yields `2026-08-31`, matching the user's calendar "today" and the local `Absence.date` strings the UI labels. The pre-existing `todayStr()` helper at line 725 *does* use `toISOString()` (UTC) and would have given `2026-09-01` at that same moment — the implementer correctly avoided it. Flagged in `progress/impl_…` but not blocking.

## Drift from `docs/conventions.md` / `CHECKPOINTS.md`

None. The 4-line comment in `loadTodayAbsences()` qualifies under the "documented workaround / subtle invariant" exception (`docs/conventions.md` §"Comments") — without it, a future reader is likely to "fix" the function back to the buggy form, exactly the trap that produced the bug originally.

## Blocking concerns

None.

## Recommendations (non-blocking, for the leader before log-out)

1. Optional Level 3 manual smoke (`docs/verification.md` §"Level 3") against `docker compose up` to confirm in the browser that:
   - A student with an F dated today shows the "Falta hoy" badge regardless of which quarter is selected.
   - A student with an F dated a different day inside the current quarter does **not** show the badge.
   - The Listado tab's quarter-scoped filter still behaves exactly as before.
   This is the only way to functionally verify the one-line query parameter change end-to-end, since the project has no automated test framework. Not a blocker for `record-review approved` because `docs/verification.md` explicitly states Level 3 is "recommended" rather than mandatory.
2. The pre-existing `todayStr()` UTC bug at line 725 is dead code (no callers in this file) — out of scope for feature 13 per ALCANCE; consider bundling a cleanup in a separate ticket.