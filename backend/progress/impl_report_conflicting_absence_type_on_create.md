# Implementer handoff — feature 7: `report_conflicting_absence_type_on_create`

Session 12, implementer, 2026-08-31. Spec already approved by Ricardo Aguilar (recorded in
`harness.db` before this session opened). Implementation walked T1 → T5 in order; the only
code change is in `src/services/absence.service.ts`. `src/controllers/absence.controller.ts`
was inspected and intentionally left unchanged (T3).

## Scope of change

- `src/services/absence.service.ts` — `createRange` (R1–R7, R9)
- `src/controllers/absence.controller.ts` — inspected, **no change** (R9)
- `progress/impl_report_conflicting_absence_type_on_create.md` — this file (R8 traceability)

`git diff --stat HEAD -- specs/ progress/ src/` shows only:

```
src/services/absence.service.ts | 25 +++++++++++++++++++++----
1 file changed, 21 insertions(+), 4 deletions(-)
```

No spec, controller, or DB-schema changes.

## Traceability (every R is covered)

| `R<n>` | Covered by | Verification artefact |
|---|---|---|
| R1 (`created` semantics unchanged) | T1, T2, T4 | Case (iii) `created: 2` for two brand-new dates; case (iv) `created: 1` for the restored 09-15. |
| R2 (`skipped` semantics unchanged) | T1, T2, T4 | Case (i-b) `skipped: 3`; case (ii) `skipped: 3`; case (iii) `skipped: 2`; case (iv) `skipped: 3`. |
| R3 (same-type → `conflict: false`) | T1, T2, T4 | Case (i-b) all three entries `conflict: false, existingType: "F"`. |
| R4 (different-type → `conflict: true`) | T1, T2, T4 | Case (ii) all three entries `conflict: true, existingType: "F"`; case (iii) 09-17 entry `conflict: true, existingType: "AT"`. |
| R5 (`skippedDetails.length === skipped`) | T1, T2, T4 | Each case's response: `(i-b) 3 === 3`, `(ii) 3 === 3`, `(iii) 2 === 2`, `(iv) 3 === 3`. |
| R6 (ascending date order) | T1, T2, T4 | Every response array in this file is `[09-07, 09-08, 09-09]`, `[09-15, 09-17]`, or `[09-14, 09-16, 09-17]` — strictly ascending. |
| R7 (empty array, not null/undefined) | T1, T2, T4 | Case (i-a), (iii seed F), (iii seed AT) all show `"skippedDetails":[]`. |
| R8 (manual smoke test) | T4 | The four cases below, captured verbatim. |
| R9 (build / no new TS errors) | T2, T3, T5 | `node_modules/.bin/tsc -p .` exits 0; `./init.sh` ends green. |

## T1 + T2: source change

The single edit in `src/services/absence.service.ts` is exactly the shape from
`design.md`'s "Exact code shape" section. Verbatim final code around the touch points:

```ts
export async function createRange(institutionId: number, courseIds: number[] | null, data: {
  enrollmentId: number; type: 'F' | 'AT'; dateFrom: string; dateTo: string; notes?: string;
}, createdByUserId: number | null = null): Promise<{
  created: number;
  skipped: number;
  skippedDetails: Array<{ date: string; existingType: 'F' | 'AT'; conflict: boolean }>;
}> {
  // ...
  const existingRows = await AppDataSource.query(
    `SELECT date::text AS date, type FROM absences WHERE enrollment_id = $1 AND date = ANY($2) AND deleted_at IS NULL`,
    [data.enrollmentId, days]
  );
  const existingTypeByDate = new Map<string, 'F' | 'AT'>(
    existingRows.map((r: { date: string; type: 'F' | 'AT' }) => [r.date, r.type])
  );
  const existingDates = new Set(existingTypeByDate.keys());
  const toCreate = days.filter(d => !existingDates.has(d));
  const skippedDetails = days
    .filter(d => existingDates.has(d))
    .map(date => {
      const existingType = existingTypeByDate.get(date)!;
      return { date, existingType, conflict: existingType !== data.type };
    });
  // ... soft-deleted / restore / insert / transaction unchanged ...
  return {
    created: toCreate.length,
    skipped: days.length - toCreate.length,
    skippedDetails,
  };
}
```

Nothing else in the function changed: `softDeletedRows`, `softDeletedByDate`, `toRestore`,
`toInsert`, and the transaction body are byte-for-byte identical to the pre-feature version.

## T3: controller inspected, no change

`src/controllers/absence.controller.ts` line 23:

```
router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.createRange(req.institutionId!, req.courseIds ?? null, req.body, req.user?.id ?? null)));
```

The handler forwards `svc.createRange(...)`'s resolved value as the 201 JSON body
verbatim — there is no controller-level response shaping to update, so widening the
service's return type is enough to add `skippedDetails` to the wire response. The file
was inspected and intentionally left unchanged (R9).

## T4: manual smoke test (R8) — request/response verbatim

Stack: `docker compose up -d backend` (image rebuilt via `docker compose build backend`,
see T5). Auth: superadmin JWT (`roleId=11`, `institutionId=null`, `create` on
`absences`); requests sent with `X-Institution-Id: 2` so `institutionMiddleware`
resolves `req.institutionId=2`; `req.courseIds=null` (superadmin, sees all courses).
Target: `enrollmentId=1` in institution 2, course 1, academic year 1.

All `POST /api/absences` calls below are run via `curl` against `http://localhost:3000`;
all `DELETE` calls are the same.

### Case (i) — same-type skip (R3)

Seed: create `F` for 2026-09-07 (Mon) → 2026-09-09 (Wed).

```
REQUEST: POST /api/absences
BODY:    {"enrollmentId":1,"type":"F","dateFrom":"2026-09-07","dateTo":"2026-09-09","notes":"case (i) seed"}
RESPONSE: {"created":3,"skipped":0,"skippedDetails":[]}
```

Replay: same range, same type — expect all three dates in `skippedDetails` with
`conflict: false`.

```
REQUEST: POST /api/absences
BODY:    {"enrollmentId":1,"type":"F","dateFrom":"2026-09-07","dateTo":"2026-09-09","notes":"case (i) replay"}
RESPONSE: {"created":0,"skipped":3,"skippedDetails":[{"date":"2026-09-07","existingType":"F","conflict":false},{"date":"2026-09-08","existingType":"F","conflict":false},{"date":"2026-09-09","existingType":"F","conflict":false}]}
```

`skippedDetails.length === skipped === 3`. Every entry: `existingType === "F"` (matches
the request's `type: "F"`) and `conflict === false`. Order is ascending (R6).

### Case (ii) — different-type conflict (R4)

Same range 2026-09-07..2026-09-09, now requesting `AT` while the existing rows are `F`.

```
REQUEST: POST /api/absences
BODY:    {"enrollmentId":1,"type":"AT","dateFrom":"2026-09-07","dateTo":"2026-09-09","notes":"case (ii) conflict"}
RESPONSE: {"created":0,"skipped":3,"skippedDetails":[{"date":"2026-09-07","existingType":"F","conflict":true},{"date":"2026-09-08","existingType":"F","conflict":true},{"date":"2026-09-09","existingType":"F","conflict":true}]}
```

`skippedDetails.length === skipped === 3`. Every entry: `existingType === "F"`
(does **not** match `type: "AT"`) and `conflict === true`. Order is ascending (R6).

### Case (iii) — mixed range (R1, R2, R5, R6)

Pre-seed two non-consecutive dates inside a future 4-business-day range:

```
REQUEST: POST /api/absences
BODY:    {"enrollmentId":1,"type":"F","dateFrom":"2026-09-15","dateTo":"2026-09-15","notes":"case (iii) seed F"}
RESPONSE: {"created":1,"skipped":0,"skippedDetails":[]}

REQUEST: POST /api/absences
BODY:    {"enrollmentId":1,"type":"AT","dateFrom":"2026-09-17","dateTo":"2026-09-17","notes":"case (iii) seed AT"}
RESPONSE: {"created":1,"skipped":0,"skippedDetails":[]}
```

Mixed call: range 2026-09-14 (Mon) → 2026-09-17 (Thu), 4 business days, requesting `F`.
Expected breakdown:

- 2026-09-14: new → `created`
- 2026-09-15: existing `F` (same type) → `skipped`, `conflict: false`
- 2026-09-16: new → `created`
- 2026-09-17: existing `AT` (different type) → `skipped`, `conflict: true`

```
REQUEST: POST /api/absences
BODY:    {"enrollmentId":1,"type":"F","dateFrom":"2026-09-14","dateTo":"2026-09-17","notes":"case (iii) mixed"}
RESPONSE: {"created":2,"skipped":2,"skippedDetails":[{"date":"2026-09-15","existingType":"F","conflict":false},{"date":"2026-09-17","existingType":"AT","conflict":true}]}
```

`skippedDetails.length === skipped === 2` (R5). `created=2` covers 09-14 and 09-16, the
two dates NOT in `skippedDetails` (R1). The two entries are in ascending order: 09-15 then
09-17 (R6). The same-type skip (09-15 → existing `F`, requesting `F`) has `conflict:
false` (R3); the different-type skip (09-17 → existing `AT`, requesting `F`) has
`conflict: true` and the correct `existingType: "AT"` (R4).

### Case (iv) — soft-delete + restore (R1, no regression)

Soft-delete the 2026-09-15 row (id=1120) and re-run the same 09-14..09-17 range with
`type=F`. Expected: 09-15 is restored by the existing restore path → counts toward
`created`, NOT in `skippedDetails`. The other three dates remain skipped with the same
shape as case (iii).

```
REQUEST: DELETE /api/absences/1120
RESPONSE: HTTP_CODE:204

REQUEST: POST /api/absences
BODY:    {"enrollmentId":1,"type":"F","dateFrom":"2026-09-14","dateTo":"2026-09-17","notes":"case (iv) restore"}
RESPONSE: {"created":1,"skipped":3,"skippedDetails":[{"date":"2026-09-14","existingType":"F","conflict":false},{"date":"2026-09-16","existingType":"F","conflict":false},{"date":"2026-09-17","existingType":"AT","conflict":true}]}

DB state of absence 1120 (2026-09-15):  deleted_at IS NULL = true
```

`skippedDetails` has exactly the three still-active dates (09-14, 09-16, 09-17); 09-15 is
absent. `created: 1` is the restored date. `skipped: 3` matches `skippedDetails.length`
(R5). The DB-side check confirms the soft-delete was actually undone (`deleted_at` is
NULL again), proving the restore path runs and is unaffected by the new field (R1).

## T5: build + init.sh

`node_modules/.bin/tsc -p .` (equivalent to `pnpm run build`, which is just `tsc` per
`package.json` — `pnpm` itself is not installed in this environment, so the underlying
binary was invoked directly):

```
$ node_modules/.bin/tsc -p .
EXIT=0
```

Zero new TypeScript errors attributable to `src/services/absence.service.ts` or
`src/controllers/absence.controller.ts` (R9).

`./init.sh` (after rebuild + stack restart):

```
── 1. Checking prerequisites ───────────────────────────
[OK]    sqlite3 available
[OK]    jq available

── 2. Checking harness state ───────────────────────────
[OK]    .harness.json found
[OK]    harness.db found
[OK]    Found docs/architecture.md
[OK]    Found docs/conventions.md
[OK]    Found docs/verification.md
[OK]    Found CHECKPOINTS.md

── 3. Checking SDD spec files ───────────────────────────
[OK]    all sdd=1 features have their spec files on disk

── 4. Running verification command ─────────────────────
[WARN]  No verify_command configured in .harness.json — skipping

── 5. Regenerating markdown snapshot ───────────────────
[OK]    snapshot regenerated at state

── 6. Syncing Postgres/Supabase mirror (best-effort) ───
[WARN]  $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync

── 7. Summary ───────────────────────────────────────────
[OK]    Environment ready. You can start working.
```

Both `[WARN]`s are pre-existing infra warnings (empty `verify_command`, unset
`SUPABASE_URL`) and are unchanged from baseline. The session is ready for review.

## Stack state note for the reviewer

`docker compose build backend` + `docker compose up -d backend` were run from
`/home/rileo/ai-personal` to rebuild and restart the `backend` container with the new
`absence.service.ts`. Other services (`frontend`, `excel-service`, `postgres`, `redis`)
were already running and were not touched. The seeded data used in T4 (enrollment 1,
absences on 09-07..09-17) is left in the DB; cleaning it up would just force the
reviewer to re-seed before re-running any smoke test.

## Files in scope (absolute paths)

- `/home/rileo/ai-personal/backend/src/services/absence.service.ts` (T1, T2)
- `/home/rileo/ai-personal/backend/src/controllers/absence.controller.ts` (T3, no change)
- `/home/rileo/ai-personal/backend/progress/impl_report_conflicting_absence_type_on_create.md` (this file, T4 + traceability)
