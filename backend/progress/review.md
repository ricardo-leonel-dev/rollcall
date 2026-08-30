# Review — feature 6 (backend_acepta_date_from_date_to_en_get_api_justifications)

**Verdict:** CHANGES_REQUESTED

## Checkpoints

- C1: [x] `.harness.json`, `harness.db`, all four docs present; `./init.sh` exits 0 (green summary).
- C2: [x] Only feature 6 `in_progress`; open session 10 reflects the current work.
- C3: [ ] ← Reason: `src/services/justification.service.ts:120-127` adds an **unconditional** `EXISTS (... justification_absences ...)` predicate to the base `findAll` query, changing the semantics of the unfiltered listing (out of the feature's scope: it now hides justifications with zero live absence links).
- C4: [x] `npx tsc --noEmit` green (exit 0); smoke test evidence documented in `progress/impl_backend_acepta_date_from_date_to.md`. No automated suite exists in this project (per `CHECKPOINTS.md` C4, `pnpm run build` green is the standing check).
- C5: [ ] ← Session still open pending these changes (expected at review time).
- C6: N/A — feature 6 is `sdd=0`.

## Required Changes

1. `src/services/justification.service.ts:120-127` — gate the new `EXISTS` block behind the presence of a
   date filter, instead of injecting it unconditionally. Change:

   ```
   AND EXISTS ( ... )            // always present
   ```

   to a computed fragment, e.g.

   ```ts
   let dateFilter = '';
   if (dateFromIdx || dateToIdx) {
     dateFilter = `
       AND EXISTS (
         SELECT 1 FROM justification_absences ja
         JOIN absences a ON a.id = ja.absence_id
         WHERE ja.justification_id = j.id
           AND a.deleted_at IS NULL
           ${dateFromIdx ? `AND a.date >= $${dateFromIdx}` : ''}
           ${dateToIdx   ? `AND a.date <= $${dateToIdx}`   : ''}
       )`;
   }
   ```

   and interpolate `${dateFilter}` in the `WHERE`. Rationale: `update()`
   (`src/services/justification.service.ts:205-211`) accepts `absenceIds: []` with no non-empty guard
   (unlike `create()` at line 152-154), so a justification can legitimately end up with zero link rows —
   with the current code it silently disappears from `GET /api/justifications` even with no query params,
   with no way for the user to see or repair it. The 194 → 194 baseline only passes because the current
   dataset happens to have no such row; it is data-dependent, not structural.
