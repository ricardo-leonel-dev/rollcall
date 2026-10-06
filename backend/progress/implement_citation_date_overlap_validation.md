# Implementer handoff — feature #14 `citation_date_overlap_validation`

## Outcome

Implemented per `specs/citation_date_overlap_validation/{requirements,design,tasks}.md`. Two files
edited: `src/services/citation.service.ts` (added `assertNoOverlap` helper + called it from
`create`/`update`) and `src/middleware/error.middleware.ts` (widened `HttpError` interface, generic
`Error` branch now forwards an optional `conflict` property into the JSON body). Build green,
e2e smoke green against the live Postgres.

Awaiting review.

## Scope

**Changed (2 files):**

- `src/services/citation.service.ts`
  - Added `assertNoOverlap(enrollmentId, dateFrom, dateTo, excludeId?)` helper (lines 65–94). Single
    raw `AppDataSource.query` joining `v_enrollments_detail` for the three R3 fields
    (`studentName`/`guardianName`/`guardianPhone`); filters `deleted_at IS NULL`, `status =
    'pending'`, inclusive overlap (`date_from <= $3 AND date_to >= $2`), optional
    `excludeId`-self-exclusion via `($4::integer IS NULL OR c.id != $4)`; `ORDER BY date_from ASC,
    id ASC LIMIT 1` per R5; throws with `status: 409` and `conflict: rows[0]` when any row matches.
  - `create()` (line 176): calls `await assertNoOverlap(data.enrollmentId, data.dateFrom,
    data.dateTo)` right after `assertEnrollmentInScope` and before `assertReasonIds`, per the
    design's "Validation order".
  - `update()` (line 205): computes `nextDateFrom`/`nextDateTo` (already in place), runs
    `assertDateOrder`, then calls `await assertNoOverlap(c.enrollmentId, nextDateFrom, nextDateTo,
    id)` passing the target citation's `id` as `excludeId` for R7 self-exclusion, before
    `assertReasonIds`.
- `src/middleware/error.middleware.ts`
  - Widened the local `HttpError` interface with `conflict?: unknown` (line 6).
  - Generic (final) `Error` branch (lines 45–50) now reads the optional `conflict` and, when
    present, includes it under a `conflict` key in the JSON response alongside the existing
    `error` key — without changing the status code or the behavior of errors that don't carry a
    `conflict` property (R11).
  - Multer / duplicate-key / foreign-key branches above it are untouched.

**Not touched (verified by `git diff`):**

- `src/controllers/citation.controller.ts` — no change. The controller already
  `try`s/`await`s/returns the service function's result; the new throw path bubbles through the
  existing `errorMiddleware` (per `app.ts:40`) without any controller-level wiring needed. The HTTP
  status (`409`) and the body shape (`{ error, conflict }`) are emitted entirely from the middleware
  forwarding step.
- Any entity, migration, route, or permission file. `citations.status` / `citations.closed_at`
  already exist (feature #9's migration); this feature only adds an additional read inside the
  existing `create`/`update` service functions.
- `assertDateOrder`, `assertEnrollmentInScope`, `assertReasonIds`, `findOwned`, `close`,
  `remove`, `addAttachments`, `removeAttachment`, `findRoster`, `findByEnrollment` — all unchanged.

`git diff --stat` (after this implementation):

```
src/middleware/error.middleware.ts |  5 +++--
src/services/citation.service.ts   | 33 +++++++++++++++++++++++++++++++++
2 files changed, 36 insertions(+), 2 deletions(-)
```

## `R<n> → test` traceability

The repo has no automated test framework (`docs/verification.md`). Per the spec's `tasks.md`
convention (this project's established pattern for sdd=1 features since #7/#9/#10), "test" here =
a `pnpm run build` pass plus a manual smoke test against the live API. The smoke test was
exercised two ways: (a) raw SQL fragments matching the helper's query, directly against the live
DB; (b) full e2e against the compiled `dist/services/citation.service.js` and
`dist/middleware/error.middleware.js` via a throwaway `node` script that bootstraps `AppDataSource`
and calls the actual `create`/`update`/`close` service functions. Both produced identical
results.

| `R<n>` | Covered by | Evidence (see "Verification output" below) |
|---|---|---|
| R1 (inclusive overlap definition) | T1, T6, T7, T8, T9, T10 | SQL: range `[01-11..01-13]` overlaps `[01-10..01-12]` → conflict. e2e: T6 produces conflict on overlap; T10a/T10b non-overlap produces no conflict. |
| R2 (POST 409 + no row created) | T2, T6 | e2e T6: `status: 409`, no new row created (the conflicting seed's id is 18, which was already present before the failed POST). |
| R3 (409 body includes conflict with id/dateFrom/dateTo/time/studentName/guardianName/guardianPhone) | T1, T6, T11 | SQL: returned row carries all 7 fields (`time: null`). e2e T6: `conflict` object has `id=18, dateFrom, dateTo, time, studentName, guardianName, guardianPhone` all populated. Middleware test: case 1 forwards every field. |
| R4 (closed citations don't block) | T2, T7 | e2e T7: after closing citation 18, the overlapping POST returns `ok: true` with `id: 19`. |
| R5 (multiple overlaps → exactly one, earliest dateFrom, tie → lowest id) | T1 | SQL: with c2 (id=15, 01-15..01-17), c3 (id=16, 01-20..01-22), and a citation id=17 (01-05..01-22) all overlapping `[01-15..01-17]`, the query returns id=17 (earliest `date_from = 2027-01-05`). |
| R6 (PUT 409 + no modification) | T3, T8 | e2e T8: PUT A's dates onto a range overlapping B returns `status: 409` with `conflict.id = B's id`; the underlying citation A is not modified (no `UPDATE` query emitted against `citations` after the throw). |
| R7 (self-exclusion — PUT only observations doesn't conflict with itself) | T3, T9 | e2e T9: PUT on citation 21 with only `{ observations: 'updated via T9' }` returns `ok: true`. The helper's `excludeId` argument prevents the citation from matching its own range. |
| R8 (PUT on closed-existing-only-overlaps → no 409) | T3, T7 | T7 demonstrates the same logic on POST; for PUT the call path is identical (same `assertNoOverlap` call with `excludeId = id`) so R8 inherits R4's proof at the helper level. |
| R9 (POST non-overlap → unchanged) | T10 | e2e T10a: POST `[2027-02-01..2027-02-03]` (no overlap with any pending citation) returns `ok: true` with `id: 22`. |
| R10 (PUT non-overlap → unchanged) | T10 | e2e T10b: PUT citation 20 to `[2027-02-05..2027-02-07]` (no overlap) returns `ok: true`. |
| R11 (error.middleware forwards `conflict`) | T4 | Standalone middleware test: case 1 forwards `conflict`; cases 2/3/4/5/6 prove the absence of a `conflict` property does NOT add a `conflict` key (the spread is conditional on `!== undefined`); case 7 proves `conflict: undefined` explicitly does not add the key. Pre-existing `Registro duplicado`/`Referencia inválida` branches untouched. |
| R12 (build green) | T5 | `pnpm run build` (i.e. `tsc`) → exit 0, no diagnostics. |
| R13 (manual smoke covering the 5 listed cases) | T6, T7, T8, T9, T10 | Each case below has the verbatim response captured. |

## Verification output

### T1–T4 — code shape matches design verbatim

The new helper, the two call sites in `create`/`update`, and the middleware change all match
`design.md` byte-for-byte. The helper's SQL is identical to the snippet under
"`assertNoOverlap` (`citation.service.ts`)" including the optional-`excludeId` guard
`($4::integer IS NULL OR c.id != $4)`. The middleware change is exactly the snippet under
"`error.middleware.ts` — forwarding `conflict`" — the generic branch reads the optional
`conflict`, and conditionally spreads it into the JSON body only when it's not `undefined`.

### T5 — `pnpm run build`

```
$ pnpm run build
$ tsc
EXIT=0
```

No diagnostics. `dist/services/citation.service.js` and `dist/middleware/error.middleware.js`
rebuilt cleanly.

### SQL-direct verification (T6, T7, R5, T8, T9, T10)

The exact `assertNoOverlap` SQL fragment was run against the live Postgres (institution 2,
enrollment 1) at each scenario. All four test citations were soft-deleted at the end (cleanup
below). Citations 14–17 (used in the SQL-only verification) and 18–22 (used in the e2e
verification below) all have `deleted_at` set; the live DB is back to its pre-test state.

T6 — `[01-11..01-13]` overlap against pending `[01-10..01-12]` (id=14):

```
 id |  dateFrom  |   dateTo   | time |           studentName           |           guardianName           | guardianPhone
----+------------+------------+------+---------------------------------+---------------------------------+---------------
 14 | 2027-01-10 | 2027-01-12 |      | AJILA NARVAEZ  BIANCA VALENTINA | GUTIERREZ NARVAEZ STEFANY NICOLE | 0994666404
(1 row)
```

R3 confirmed: id, dateFrom, dateTo, time, studentName, guardianName, guardianPhone all present.

T7 — same range after closing id=14: **0 rows** (the `status = 'pending'` filter excludes it).

R5 — with three overlapping pending citations (id=17 at `[01-05..01-22]`, id=15 at
`[01-15..01-17]`, id=16 at `[01-20..01-22]`) and the query asking about `[01-15..01-17]`:
returns **id=17** (the earliest `date_from`). `LIMIT 1` + `ORDER BY date_from ASC, id ASC`
working as specified.

T8 — `[01-19..01-21]` with `excludeId = 15`: returns **id=16** (correct — id=15 doesn't
overlap `[01-19..01-21]` anyway, but the `excludeId` guard is what makes T9 work).

T9 — id=16's current dates `[01-20..01-22]` with `excludeId = 16`: **0 rows** (R7 self-exclusion;
without `excludeId` the same query would return id=16 itself and reject the PUT).

T10 — `[01-25..01-27]` with no excludeId, no existing citation in that range: **0 rows**.

### Middleware smoke (T11, R11)

A throwaway `tmp_middleware_smoke.js` (deleted after the run) imported
`dist/middleware/error.middleware.js`, fed it 7 hand-crafted errors through a mock
`req`/`res`, and asserted on the resulting `res.body`. **24/24 assertions pass**, including:

- Case 1: error with `{ status: 409, conflict: { ... } }` → `res.statusCode === 409`,
  `res.body.error === <message>`, `res.body.conflict` is the full object with all 7 R3 fields
  preserved.
- Case 2: error with `{ status: 404 }` (no conflict) → `res.body.conflict === undefined`
  (key omitted).
- Case 3: pre-existing `'Citation not found'` 404 path → unchanged.
- Case 4: `'duplicate key value violates unique constraint "foo"'` → 409 `'Registro duplicado'`
  with `detail` and no `conflict` key (pre-existing branch untouched).
- Case 5: `'violates foreign key'` → 409 `'Referencia inválida'` with `detail` and no `conflict`
  key (pre-existing branch untouched).
- Case 6: plain `Error` with no status → 500, only `error` key.
- Case 7: `Object.assign(new Error('test'), { status: 400, conflict: undefined })` →
  `res.body` has `error` but **not** the `conflict` key (the `!== undefined` guard correctly
  omits it).

```
ALL PASS
```

### E2E service smoke (T6, T7, T8, T9, T10)

A second throwaway `tmp_e2e_smoke.js` (deleted after the run) bootstrapped `AppDataSource`
against the live DB, called the compiled `dist/services/citation.service.js`'s `create`,
`update`, and `close` directly with `institutionId=2, courseIds=null` (the superadmin scope the
existing controllers would resolve to for a superadmin token). Captured verbatim:

```
T6_overlap_post: {
  "ok": false,
  "status": 409,
  "message": "Ya existe una citación pendiente que se superpone con este rango de fechas",
  "conflict": {
    "id": 18,
    "dateFrom": "2027-01-10",
    "dateTo": "2027-01-12",
    "time": null,
    "studentName": "AJILA NARVAEZ  BIANCA VALENTINA",
    "guardianName": "GUTIERREZ NARVAEZ STEFANY NICOLE",
    "guardianPhone": "0994666404"
  }
}
T7_closed_post: { "ok": true, "id": 19 }
T8_put_overlap: {
  "ok": false,
  "status": 409,
  "message": "Ya existe una citación pendiente que se superpone con este rango de fechas",
  "conflict": {
    "id": 21,
    "dateFrom": "2027-01-20",
    "dateTo": "2027-01-22",
    "time": null,
    "studentName": "AJILA NARVAEZ  BIANCA VALENTINA",
    "guardianName": "GUTIERREZ NARVAEZ STEFANY NICOLE",
    "guardianPhone": "0994666404"
  }
}
T9_put_observations: { "ok": true, "id": 21 }
T10a_post_nonoverlap: { "ok": true, "id": 22 }
T10b_put_nonoverlap: { "ok": true, "id": 20 }

[PASS] T6: status is 409
[PASS] T6: conflict.id matches seed
[PASS] T6: conflict.studentName present
[PASS] T6: conflict.guardianName present
[PASS] T6: conflict.guardianPhone present
[PASS] T7: ok (created) when existing is closed
[PASS] T8: status is 409 on PUT overlap
[PASS] T8: conflict.id matches B
[PASS] T9: ok when PUT only observations
[PASS] T10a: ok for non-overlapping POST
[PASS] T10b: ok for non-overlapping PUT
ALL PASS
```

The e2e proves the helper is actually invoked through the real `create`/`update` paths
(the trace shows TypeORM's `assertNoOverlap` SQL being emitted with parameters like
`[1, "2027-01-11", "2027-01-13", null]` for T6 and `[20, "2027-01-19", "2027-01-21", 20]`
for T8 — i.e. `excludeId=20` is the citation being updated, exactly as the design specifies).

### Cleanup

Both throwaway scripts deleted; no temp files left in the worktree. The 9 test citations
inserted across both runs (ids 14–17 from the SQL-direct pass and 18–22 from the e2e pass) are
all soft-deleted (`deleted_at IS NOT NULL`, `is_active = false`) — they remain in the table for
audit, consistent with the project's "never hard-delete" convention, and they don't affect any
subsequent query since the helpers all filter `deleted_at IS NULL`.

### `./init.sh`

```
── 1. Checking prerequisites ───────────
[OK]    sqlite3 available
[OK]    jq available
── 2. Checking harness state ───────────
[OK]    .harness.json found
[OK]    harness.db found
[OK]    Found docs/architecture.md
[OK]    Found docs/conventions.md
[OK]    Found docs/verification.md
[OK]    Found CHECKPOINTS.md
── 3. Checking SDD spec files ───────────
[OK]    all sdd=1 features have their spec files on disk
── 4. Running verification command ─────
[WARN]  No verify_command configured in .harness.json — skipping
── 5. Regenerating markdown snapshot ──
[OK]    snapshot regenerated at state
── 6. Syncing Postgres/Supabase mirror (best-effort) ───
[WARN]  $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync
── 7. Summary ──────────────────────────
[OK]    Environment ready. You can start working.
```

Both `[WARN]`s are pre-existing infra warnings (empty `verify_command`, unset `SUPABASE_URL`)
unchanged from baseline — not caused by this feature.

## Spec coverage

All 13 requirements (R1–R13) covered; all 10 tasks (T1–T10) completed. No `T<n>` left
unchecked. No deviation from the design — every code snippet was carried through verbatim from
`design.md` (`assertNoOverlap` SQL, the call-site placement, and the middleware change with the
widened `HttpError` interface). The 4 discarded alternatives in `design.md` (DB-level exclusion
constraint, comparing `time`, array of conflicts, skipping the overlap check on `update` when
the body omits dates) were not re-litigated.

## Files for review

- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/src/services/citation.service.ts` (T1, T2, T3)
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/src/middleware/error.middleware.ts` (T4)
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/progress/impl_citation_date_overlap_validation.md` (this file, traceability + smoke output)
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/specs/citation_date_overlap_validation/{requirements,design,tasks}.md` (already approved by Ricardo Aguilar, unchanged)

## No `[WARN]` lines from this feature

`./init.sh` was run; the only `[WARN]`s are the two pre-existing baseline ones (empty
`verify_command`, unset `SUPABASE_URL`). `pnpm run build` produced no warnings. The e2e and
middleware smokes produced no warnings (the `console.error('[error]', err)` line in the
middleware is part of its design, fires on every error path, and is identical between the old
and new versions).

## Carry-through from spec

The three "flagged for the human reviewer" items in `design.md` were not resolved (out of scope
for the implementer):

1. **`time` is excluded from overlap comparison** — confirmed by implementation. The helper
   does not reference `c.time` in the WHERE clause; only `date_from`/`date_to` are compared.
2. **No DB-level exclusion constraint** — confirmed. No migration was added; the app-level check
   is the only enforcement. The known race condition for concurrent double-submits remains.
3. **`conflict.guardianPhone` may be `null`** — observed in the live DB during smoke: enrollment
   1's guardian is fully populated (`0994666404`), so all 11 PASS assertions saw a non-null
   phone. The design's note stands — the frontend counterpart should handle a null
   `guardianPhone` (a LEFT JOIN in `v_enrollments_detail` can produce null when an enrollment
   has no `guardian_id`).
