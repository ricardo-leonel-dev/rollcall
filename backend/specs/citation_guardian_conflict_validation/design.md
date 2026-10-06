# Design — Guardian-scoped 10-minute conflict validation for citations

## Files to touch

### New
- `postgres/23_citation_guardian_conflict.sql` — schema migration: add `citations.guardian_id`
  (nullable, FK to `guardians`), add `citations.date DATE` (backfilled from `date_from`),
  backfill `citations.time = '07:55'` for null rows, set `time NOT NULL`, drop `date_from`/
  `date_to`, add the partial index `idx_citations_guardian_date`.
- `postgres/23_citation_guardian_conflict_supabase.sql` — same logic, schema-qualified as
  `attendance.<table>` per the project's `_supabase.sql` convention (see the existing
  `09_*_supabase.sql`, `08_*_supabase.sql` variants).

### Edited
- `src/entities/Citation.ts` — drop `dateFrom`/`dateTo`, add `date` (NOT NULL `DATE`) and
  `guardianId` (nullable `INTEGER`), change `time` to non-nullable `string` to reflect the DB's
  `NOT NULL`.
- `src/services/citation.service.ts`:
  - `CITATION_FIELDS_SQL` — select `c.date::text AS "date"` (instead of `dateFrom`/`dateTo`) and
    add `c.guardian_id AS "guardianId"`. The `findRoster` query is updated to mirror that and
    `ORDER BY c.date DESC` (was `ORDER BY c.date_from DESC`).
  - Drop `assertDateOrder` — with a single `date` field there's no order to assert.
  - Drop the old `assertNoOverlap` (the #14 date-range helper) — the new rule supersedes it;
    it's replaced by `assertNoGuardianConflict`, not extended.
  - Add `assertNoGuardianConflict(institutionId, guardianId, date, time, courseIds, excludeId?)`
    — single raw `AppDataSource.query` joining `v_enrollments_detail` for the three name fields;
    checks `institution_id`, `status = 'pending'`, `deleted_at IS NULL`, same `guardian_id`, same
    `date`, `ABS(EXTRACT(EPOCH FROM ((c.time - $time)::interval))) < 600`; optional `excludeId`
    via `($6::integer IS NULL OR c.id != $6)` for `update()`'s self-exclusion; orders by
    `c.time ASC, c.id ASC LIMIT 1` to deterministically pick one conflict when several match.
    Throws `409` with `conflict` already redacted by `courseIds`.
  - `create()` — replace the `{ enrollmentId, dateFrom, dateTo, time?, ... }` parameter shape
    with `{ enrollmentId, date, time, ... }`. The `time` field is now mandatory and validated
    locally (R7) before any DB read. The `enrollment.guardian_id` is read off
    `assertEnrollmentInScope`'s returned entity and passed to `assertNoGuardianConflict`; if
    null, R9 throws `400` before the conflict check. The insert sets `c.guardian_id =
    enrollment.guardian_id` (the snapshot, not a JOIN).
  - `update()` — same parameter swap. `nextDate` is `data.date ?? c.date`; `assertNoGuardianConflict`
    is called with `guardianId = c.guardianId` (the stored value, not re-resolved from the
    enrollment — see R11's rationale and "Why `citations.guardian_id` is stored, not JOINed"
    below). `data.time !== undefined && !data.time` throws `400` (R10) before the conflict check.
- `src/controllers/citation.controller.ts` — **no change**. It already passes `req.body`
  verbatim to `create`/`update`; the new field names (`date`, `time`) are picked up by the
  service without controller wiring. `req.body.dateFrom`/`dateTo` are simply ignored, which
  (combined with R7/R8's "missing" check) means old clients sending the legacy keys get a
  `400` for missing `date` — the spec deliberately does not add a separate "legacy key
  rejected" branch.

### Not touched
- `src/middleware/error.middleware.ts` — the `HttpError.conflict` forwarding from #14 is reused
  as-is. No new branch is needed.
- `src/middleware/institution.middleware.ts` — `courseIds` semantics are unchanged; the new
  redaction logic in R18 just reads `req.courseIds ?? null` (passed explicitly into the helper)
  and switches the `conflict` object shape accordingly.
- `src/services/student-history.service.ts` — its `citations` entry is still `{ status:
  'not_implemented' }`, so no migration concern there.
- `role_permissions` / `citaciones` resource — no new permission is needed; the privacy
  redaction rides on the existing `courseIds` from `institutionMiddleware`.

## Migration shape (`postgres/23_citation_guardian_conflict.sql`)

```sql
SET search_path TO attendance, public;

-- 1. Add the new columns nullable so existing rows survive the ALTER.
ALTER TABLE citations ADD COLUMN IF NOT EXISTS guardian_id INTEGER;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS date        DATE;

-- 2. Backfill guardian_id from the enrollment snapshot.
UPDATE citations c
SET    guardian_id = e.guardian_id
FROM   enrollments e
WHERE  e.id = c.enrollment_id
  AND  c.guardian_id IS NULL;

-- 3. Backfill the single date from the legacy date_from.
UPDATE citations SET date = date_from WHERE date IS NULL;

-- 4. Backfill null times BEFORE tightening NOT NULL (order matters, R3).
UPDATE citations SET time = '07:55' WHERE time IS NULL;

-- 5. Now safe to set NOT NULL.
ALTER TABLE citations ALTER COLUMN time  SET NOT NULL;
ALTER TABLE citations ALTER COLUMN date  SET NOT NULL;

-- 6. Drop the legacy range columns.
ALTER TABLE citations DROP COLUMN date_from;
ALTER TABLE citations DROP COLUMN date_to;

-- 7. Add the FK on guardian_id (added after the column so the backfill can run without it
--    blocking historically-orphan rows).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_citations_guardian') THEN
    ALTER TABLE citations
      ADD CONSTRAINT fk_citations_guardian
      FOREIGN KEY (guardian_id) REFERENCES guardians(id);
  END IF;
END $$;

-- 8. Partial index backing R12/R13.
CREATE INDEX IF NOT EXISTS idx_citations_guardian_date
  ON citations(guardian_id, date)
  WHERE status = 'pending' AND deleted_at IS NULL;
```

The `_supabase` variant is the same script with every `citations` / `enrollments` /
`guardians` reference rewritten to `attendance.<table>` (matching the existing
`09_justification_attachments_supabase.sql` pattern — schema-qualified, no `SET search_path`).

## `assertNoGuardianConflict` (`citation.service.ts`)

```ts
async function assertNoGuardianConflict(
  institutionId: number,
  guardianId: number,
  date: string,
  time: string,
  courseIds: number[] | null,
  excludeId?: number,
): Promise<void> {
  const rows = await AppDataSource.query(
    `
    SELECT c.id, c.date::text AS "date", c.time::text AS "time",
           v.full_name      AS "studentName",
           v.guardian_name  AS "guardianName",
           v.guardian_phone AS "guardianPhone",
           v.course         AS "courseName"
    FROM   citations c
    JOIN   v_enrollments_detail v ON v.enrollment_id = c.enrollment_id
    WHERE  c.institution_id = $1
      AND  c.deleted_at IS NULL
      AND  c.status = 'pending'
      AND  c.guardian_id = $2
      AND  c.date = $3
      AND  ABS(EXTRACT(EPOCH FROM ((c.time - $4)::interval))) < 600
      AND  ($6::integer IS NULL OR c.id != $6)
    ORDER  BY c.time ASC, c.id ASC
    LIMIT  1
    `,
    [institutionId, guardianId, date, time, /* $5 unused — keep $5 for future */ null, excludeId ?? null],
  );
  if (rows.length > 0) {
    const full = rows[0];
    const conflict = courseIds === null
      ? full
      : { id: full.id, date: full.date, time: full.time };
    throw Object.assign(
      new Error('Ya existe una citación pendiente para este representante en un horario cercano'),
      { status: 409, conflict },
    );
  }
}
```

Notes:

- `$5` is a placeholder kept for symmetry with the parameter list in case the helper grows a
  fifth predicate later — passing `null` keeps the parameter positions stable without affecting
  the query. If the implementer prefers to drop it, the SQL becomes 5-parameter and
  `excludeId ?? null` moves to `$5`; either is fine.
- The `ABS(EXTRACT(EPOCH FROM ((c.time - $4)::interval))) < 600` is what makes R12 strict: 9
  minutes (540 s) is `< 600` → conflict; 10 minutes (600 s) is `NOT < 600` → no conflict.
- Postgres `TIME - TIME` returns `INTERVAL`; `EXTRACT(EPOCH FROM ...)` returns the total
  seconds, and the `ABS(...)` makes the comparison direction-agnostic.
- The `courseIds === null` redaction switch is inside the helper so the call sites stay
  trivial. The controller already passes `req.courseIds ?? null`, so the helper sees the same
  value.

## Validation order in `create()` / `update()`

`create()`:

1. R7 — `time` present and non-empty → else `400`.
2. R8 — `date` present and parseable → else `400`.
3. R9 — `enrollment.guardian_id IS NOT NULL` → else `400`.
4. (Existing) `assertEnrollmentInScope` — enrollment exists, in tenant/course scope → else `404`.
5. **`assertNoGuardianConflict`** (new, replaces the #14 `assertNoOverlap`) → else `409`.
6. (Existing) `assertReasonIds` — reasons exist, in scope → else `404`.
7. (Existing) Transactional insert with `guardian_id = enrollment.guardian_id` snapshot.

`update()`:

1. R10 — `data.time` is not explicitly empty/null → else `400`.
2. (Existing) `findOwned` — citation exists, in scope → else `404`.
3. R11 — `c.guardianId IS NOT NULL` → else `400`.
4. `nextDate = data.date ?? c.date`, `nextTime = data.time ?? c.time`.
5. **`assertNoGuardianConflict`** (with `excludeId = c.id` and `guardianId = c.guardianId`) →
   else `409`.
6. (Existing) `assertReasonIds` if `reasonIds` is in the body.
7. (Existing) Transactional update.

The `400` checks (R7–R11) deliberately run **before** the `404` checks so that a request with a
malformed body gets the more actionable error first; a citation that doesn't exist *and* is
missing `time` reports the `time` problem, not the missing-citation one.

## Why `citations.guardian_id` is stored, not JOINed

The user's reasoning is recorded in the spec but called out here for the implementer: every
other per-citation consumer (`findRoster`, `findByEnrollment`, the new `assertNoGuardianConflict`)
reads `c.guardian_id` directly off the `citations` row, never re-resolving from `enrollments`.
That's by design — when a staff member issues a citation, the citation's "who is the
representative we expect to show up" answer is fixed at that moment. If the enrollment's
guardian changes a year later (e.g. parent change of custody), the historical record of "who
was summoned" must not silently rewrite itself to the new guardian. This is the same audit
invariant `citations.created_by_user_id` follows and the same one `assertNoGuardianConflict`
needs to make correct: the comparison key is the *historical* guardian, not the current one.

The corollary is that **`update()` does NOT re-fetch the enrollment's current `guardian_id`**
when deciding the conflict key — it uses `c.guardianId` from the loaded citation row. Only
`create()` reads the enrollment (because it's setting the field for the first time).

## Pre-existing "messy" data state (must be documented)

Verified against the live DB on 2026-09-06:

```
SELECT c.id, c.date_from, c.time::text, c.enrollment_id, e.guardian_id
FROM   citations c
JOIN   enrollments e ON e.id = c.enrollment_id
WHERE  c.deleted_at IS NULL AND c.status = 'pending'
ORDER  BY c.date_from, c.time;
```

```
 id | date_from  |   time   | enrollment_id | guardian_id
----+------------+----------+---------------+-------------
  7 | 2026-09-01 | 10:00:00 |            58 |          57
  8 | 2026-09-01 | 10:30:00 |             2 |           2
  9 | 2026-09-07 | 07:55:00 |            58 |          57
 10 | 2026-09-07 | 07:55:00 |            58 |          57
 11 | 2026-09-07 | 07:55:00 |            58 |          57
 12 | 2026-09-07 | 07:55:00 |            58 |          57
 13 | 2026-09-07 | 07:55:00 |            58 |          57
```

After the migration runs (`date := date_from`, `time` unchanged, `guardian_id :=
enrollments.guardian_id`), citations **9–13 become five `pending` rows for the same
`guardian_id = 57` on the same `date = 2026-09-07` at the same `time = 07:55`** — a 5-way
self-conflicting cluster. They were created during a previous validation exercise with
deliberately duplicated timestamps (those rows are test fixtures, not production data — the
live institution's real workflow would not produce them).

Because the conflict check is application-level (no DB constraint), the migration itself does
not fail — it just leaves these 5 rows in a state that would individually 409 each other if
any one of them were re-saved. The spec accepts this state explicitly (it would require
manual cleanup that is out of scope for the migration and out of scope for this feature) and
notes it in R20's smoke test as item (i) — the implementer is expected to verify the cluster
exists after migration and document it, not fix it. If a future cleanup is needed, it's a
separate feature.

## Discarded alternatives

1. **JOIN to `enrollments` on every conflict check instead of storing `guardian_id` on
   `citations`.** Rejected: violates the "audit snapshot" invariant — the conflict key would
   silently shift if the enrollment's guardian changes, and an historical citation would 409
   against a *different* representative than the one originally summoned. Also costs a JOIN
   per `create`/`update` where a stored column is free.
2. **Store `time` as part of a `TIMESTAMPTZ` (a real instant) instead of a `DATE` + `TIME`
   pair.** Rejected: the institution's calendar is local-day (no timezone awareness anywhere
   in the attendance schema); collapsing to a single instant would force a `TZ` decision that
   doesn't exist in this project today. The `DATE` + `TIME` pair is the smallest change that
   still models "calendar day + clock time".
3. **Enforce the rule with a Postgres exclusion constraint** (`EXCLUDE USING gist ((guardian_id
   WITH =), (date WITH =), ((time)::interval WITH &&) ) WHERE status = 'pending' AND
   deleted_at IS NULL`, requiring `btree_gist`). Rejected for the same reasons as #14's
   discarded alternative #1: the codebase's pattern is application-level checks with
   friendly, translatable messages, `errorMiddleware` only auto-maps `duplicate key`/`violates
   foreign key` substrings, and a custom exclusion-constraint violation message would need a
   third branch added to `errorMiddleware` (coupling that shared file to citation-specific
   wording) or surface as a raw `500`. More importantly: a GiST exclusion constraint with
   `interval` ranges and a strict 10-minute window is awkward to express — Postgres `time`
   has no native half-open-interval type, so encoding "diff < 600 s" as a `&&` predicate
   would need a generated `tsrange` column or a `CASE` expression in the constraint, both of
   which complicate the schema for negligible win on a low-throughput staff-driven flow. The
   5-way pre-existing cluster above is concrete evidence the constraint wouldn't have caught
   it anyway (those rows were created by a single bulk INSERT, not a concurrent race). An
   app-level check covers the realistic case.
4. **Use `c.time <> $time AND ABS(...) < 600` (exclusion of exact equality) to allow same-time
   citations through.** Rejected: same-time is a special case of "diff < 10 minutes" (diff
   = 0 < 600); excluding it would let the same staff member double-book a guardian at the
   exact same instant, which is the most extreme form of double-booking the rule is supposed
   to prevent. The spec explicitly wants 9:00 vs 9:09 to conflict, and 9:00 vs 9:09:30
   certainly does — there's no principled reason to carve out 9:00 vs 9:00:00.
5. **Filter the conflict query by `req.courseIds`** (only see citations in courses I teach).
   Rejected: the user's intent is precisely the opposite — the conflict is about the
   guardian's agenda, which is institution-wide regardless of which course I happen to be
   assigned to. A teacher citing a student's parent at 9:00 should still see a 409 if a
   different teacher (different course) already cited the same parent at 9:05; otherwise the
   rule fails its purpose.
6. **Drop the legacy `date_from`/`date_to` columns only after a deprecation period.** Rejected:
   the only consumers are in this repo (controller doesn't reference dates, the two services
   that do are in scope of this feature's edits). The TypeORM entity is updated in the same
   commit, so leaving the columns around would only produce dead columns the application can
   no longer read. The schema-level drop is the cleanest signal that the range model is gone.
7. **Make `time` optional and treat absent `time` as a "no conflict" wildcard.** Rejected: the
   user's intent is that a citation is a scheduled meeting with a representative, and an
   unscheduled meeting isn't a meeting — R7 makes `time` mandatory because otherwise the 409
   rule has nothing to compare against.
8. **Read `conflict.guardianName` etc. from the joining row only when `courseIds === null`**
   (filter columns in SQL with `CASE WHEN $5 IS NULL THEN v.full_name ELSE NULL END`). Rejected:
   hiding the columns via SQL `NULL` would still leak the *fact that a row exists* (the row
   count, the `id`, the `date`, the `time` would all match) — and the implementer would have
   to remember to `COALESCE(... , '')` on the JS side to avoid `JSON.stringify` emitting the
   `null` keys anyway. Plain object-spread redaction in the helper is simpler and provably
   removes the keys from the response body, which is what R18 actually requires.

## Flagged for the human reviewer

- **Pre-existing 5-way conflict cluster (citations 9–13)** — after the migration these 5 rows
  will be in a state that would each 409 any re-save of the other. The migration itself
  succeeds; the spec accepts the state and recommends manual cleanup as a follow-up rather
  than something the migration script silently rewrites (rewriting would be a destructive,
  data-altering decision that doesn't belong in this feature). If the reviewer wants the
  migration to leave the table fully self-consistent (e.g. by closing the older duplicates or
  bumping their `time` by a few minutes), that's a design amendment, not a bug.
- **`id` in the redacted `conflict` payload** — R18 includes `id` in both redactions. The user
  wrote "Sólo fecha y hora" for course-scoped callers, which technically excludes `id`; the
  spec keeps `id` because the frontend needs *something* to correlate the conflict with the
  row that already exists in its list (the alternative — return no `id` and have the frontend
  re-fetch by `date`+`time` — is fragile when several citations share the same slot). `id`
  doesn't disclose a person, so the privacy intent of "only fecha y hora" is preserved in
  practice. If the reviewer wants a stricter redaction, drop `id` from the array branch.
- **No DB-level exclusion constraint** — same posture as #14's flagged item. Concurrent
  double-submits for the same `(guardian_id, date)` race could in theory both pass the app
  check before either INSERTs; the new index makes the check fast, not serializable. The
  codebase's pattern is app-level checks with friendly messages; a GiST exclusion constraint
  is rejected in discarded alternative #3 above with reasons.
- **Historical rows with `guardian_id IS NULL` cannot be edited** — R11 enforces this as a
  hard `400` even when the user is just touching `observations`. The user's wording was
  "no pueden editarse sin representante", which is unambiguous, but a future "I just want to
  fix the typo in observations on this orphan row" feature request would need a separate
  amendment. Flagged in case the reviewer's intent was "edits to scheduling fields fail,
  edits to other fields succeed".
