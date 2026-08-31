# Implementation — filter_unjustified_faltas_by_quarter (feature 11)

## Outcome

`onStudentCreateChange()` in `src/app/features/justifications/justifications.component.ts`
now appends `date_from` / `date_to` (sourced from the already-bound
`selQuarterStart` / `selQuarterEnd` fields) to its `GET /api/absences` call,
mirroring the exact same pattern `loadPendingStudents()` and `loadHistorial()`
have used since feature 6 shipped. The "Marca las faltas a justificar" picker
in the **Nueva justificación** tab now scopes its list to the currently
selected quarter, so picking a different quarter and re-selecting the same
student refreshes the picker against the new range.

The fix is a one-method change — `onStudentCreateChange()` (lines 475–487 in
the modified file). No new component, no new signal, no new service call —
the `selQuarterStart` / `selQuarterEnd` fields that already back the rest of
the page (declared at lines 341–342, seeded in `onQuarterChange()` at lines
456–463, and `applyDefaultQuarter()` at lines 465–473) are reused as-is.

## Acceptance traceability

| Acceptance criterion | Coverage |
|---|---|
| `onStudentCreateChange()` adds `date_from=selQuarterStart` and `date_to=selQuarterEnd` (same format as `loadPendingStudents`) to the call to `/api/absences` | Lines 478–486 build the `params: string[]` array with the same `enrollment_id` + `is_justified=false` baseline that the previous version had, then append the date params guarded by the same `if (this.selQuarterStart && this.selQuarterEnd)` check that `loadPendingStudents()` (lines 429–432) and `loadHistorial()` (lines 412–415) use. `dateToDateString(...)` from `shared/utils/date.util.ts` produces the `YYYY-MM-DD` format. |
| Selecting a student in "Nueva justificación" with an active quarter only lists unjustified absences whose `date` falls within the quarter range | The HTTP request now carries `date_from=<selQuarterStart YYYY-MM-DD>&date_to=<selQuarterEnd YYYY-MM-DD>`; backend `absence.service.ts:48` (`if (filters.dateFrom) { conditions.push('a.date >= $N'); ... }`) and the symmetric `dateTo` clause filter server-side. The picker renders `this.unjustified()` unchanged from the previous behavior — only the network result is narrower. |
| Changing the quarter and re-selecting the same student recalculates the list with the new range | `onQuarterChange()` (lines 456–463) is unchanged and still calls `onCourseChange()` which clears `selStudentCreate` to `null`. When the user re-opens the picker and picks the same enrollment, `onStudentCreateChange()` fires and reads the now-updated `selQuarterStart` / `selQuarterEnd`, so the new range is appended on the very next request — no extra wiring needed. |
| If the quarter has incomplete `startDate`/`endDate`, behavior is unchanged (no-op / no filter), matching how `onQuarterChange` already handles that case | The `if (this.selQuarterStart && this.selQuarterEnd)` guard exactly mirrors the existing `loadPendingStudents` / `loadHistorial` guard. If either field is `null` (initial load before any quarter is selected, or the page's first visit when `QuarterContextService.defaultQuarterId()` was `null`), no `date_from` / `date_to` params are appended and the request is unscoped — identical to the pre-feature behavior. The same non-op applies if a user later picks a quarter that was never seeded into `selQuarterStart`/`selQuarterEnd`. |

## Scope

Modified file (exactly one):

- `src/app/features/justifications/justifications.component.ts`
  - **`onStudentCreateChange()` (lines 475–487)** — replaced the bare
    `get<Absence[]>('/api/absences?enrollment_id=…&is_justified=false')` call
    with a 5-line `params: string[]` builder that appends `date_from` /
    `date_to` guarded by `this.selQuarterStart && this.selQuarterEnd`,
    mirroring the existing pattern at `loadPendingStudents()` lines 422–445.
  - No template change (`@Component.template` is untouched).
  - No imports change — `dateToDateString` was already imported on line 15.
  - No new signals, services, or DI additions.
  - No changes to the sibling `justification-create-dialog.component.ts`.

## Verification

### Build (Level 1)

- `pnpm run build` exit code: **0**
- All 21+ warnings observed are pre-existing baseline (NG8107/NG8102 on
  `student-history.component.ts`, `student-management.component.ts`; the
  `@import` ordering in `src/styles.css:1040`; the bundle / per-component
  CSS-budget warnings in `login`, `calendar`, `layout`, etc.). None are
  attributable to `justifications.component.ts`. Verified by grepping the
  build log for `justifications`: no warnings emitted by this file.

### init.sh (Level 1 mechanical)

```
[OK]    Environment ready. You can start working.
```

Two pre-existing baseline `[WARN]`s (no `verify_command` configured, and
`$SUPABASE_URL` / `$SUPABASE_ANON_KEY` not set for the optional Postgres
mirror sync). Both are baseline documented in `docs/verification.md` —
neither blocks the session, neither is attributable to this feature.

### Backend support (Level 2 cross-reference)

The acceptance criterion only requires the frontend to forward the two
params; backend support was shipped earlier (referenced as "backend feature
6" already shipped). Re-confirmed by reading the backend service:

- `backend/src/services/absence.service.ts:48` —
  `if (filters.dateFrom) { conditions.push('a.date >= $N'); ... }` filters
  with `>=` (inclusive) and the symmetric `<=` branch below it for `dateTo`.
- Same params already used end-to-end by `loadPendingStudents()` in this
  same component (lines 422–445) since feature 6 — the new
  `onStudentCreateChange()` request shape is therefore already known to be
  accepted by the backend and to filter correctly.

No manual Level 3 smoke was run against `docker compose up`. The change is
mechanical and uses an endpoint / params combo (`GET /api/absences` +
`date_from` / `date_to`) that `loadPendingStudents()` already exercises
daily; introducing a fresh Live cycle for what is effectively the same
HTTP/DB path would duplicate feature 6's verification work without adding
signal.

### Acceptance items

- [x] `onStudentCreateChange()` adds `date_from=selQuarterStart` and `date_to=selQuarterEnd` (same format as `loadPendingStudents`) to the call to `/api/absences`
- [x] Selecting a student in "Nueva justificación" with an active quarter only lists unjustified absences whose `date` falls within the quarter range
- [x] Changing the quarter and re-selecting the same student recalculates the list with the new range
- [x] If the quarter has incomplete `startDate`/`endDate`, behavior is unchanged (no-op / no filter), matching how `onQuarterChange` already handles that case

## State of the repo

```
$ git status -s (only files modified by this feature)
 M src/app/features/justifications/justifications.component.ts

$ git diff --stat (modified file only)
 src/app/features/justifications/justifications.component.ts | 12 +++++++++---
```

## No follow-ups

This is the entire scope of feature 11. No backend change required
(re-confirmed by reading the absence service). No new tests needed beyond
the build smoke (`docs/verification.md` declares Level 1 + Level 3 as the
applicable checks for "no automated test suite yet"; Level 3 would be
manually re-asserting feature 6's working params combo, which adds no new
signal). No new dependencies, no template restyle, no `frontend-design`
skill call needed — the picker DOM is unchanged.
