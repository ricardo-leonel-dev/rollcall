# impl_backend_acepta_date_from_date_to_en_get_api_justifications

Feature #6 — `GET /api/justifications` accepts optional `date_from` / `date_to`
query params that filter to justifications having at least one linked,
non-soft-deleted absence whose `absence.date` falls within the inclusive range.

## Files changed

- `src/controllers/justification.controller.ts` (lines 39-46) — parse
  `date_from` / `date_to` from `req.query` as strings (no `+` cast) and forward
  to the service. Empty-string values collapse to `undefined` (matching the
  absence controller's pattern).
- `src/services/justification.service.ts` (lines 27-146) — extend `findAll`
  signature with `dateFrom?: string, dateTo?: string`; add top-of-function
  validation (`DATE_RE = /^\d{4}-\d{2}-\d{2}$/`, both 400s, lexicographic
  `dateFrom > dateTo` check); push `dateFrom`/`dateTo` into `params` *first*
  (right after `[institutionId]`) and record their `$N` indices; inject an
  `EXISTS (SELECT 1 FROM justification_absences ja JOIN absences a ...)`
  clause into the outer `WHERE` only when `dateFromIdx || dateToIdx` is
  truthy, placed after `j.deleted_at IS NULL` so the soft-delete short-circuit
  stays early. The clause is built into a `let dateFilter = ''` string
  (declared at lines 74-86) and interpolated into the `WHERE` at line 134,
  mirroring the `courseFilter` / `specificCourseFilter` /
  `academicYearFilter` / `enrollmentFilter` pattern in the same function.

`absenceIds` / `absenceDates` correlated subqueries intentionally untouched
— the explore agent flagged that the existing `absenceDates` subquery does not
filter `a.deleted_at IS NULL`, but per the feature brief that fix is out of
scope.

## Smoke test

Backend reachable at `http://localhost:3000` (Docker). Superadmin
(`superadmin` / `Admin2026!`) JWT obtained against `institution_id=2`
("Tia Blanquita", the only institution with data). The local source was
built with `npx tsc`, the new `dist/services/justification.service.js` and
`dist/controllers/justification.controller.js` were `docker cp`'d into the
running container, and the container was restarted via `docker restart
backend` so the live API picks up the new code (no docker-compose mount).

### Baseline

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  http://localhost:3000/api/justifications
```

- count: **194** (matches expectation).

### Range filter (both params, narrow window)

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  "http://localhost:3000/api/justifications?date_from=2026-07-06&date_to=2026-07-07"
```

- count: **11**
- every returned row has at least one linked absence date of `2026-07-06`
  or `2026-07-07`:
  - 187 / 184 / 183 / 182 / 181 / 179 / 163 -> `2026-07-06`
  - 180 / 162 / 161 -> `2026-07-07`
  - 175 -> `[2026-07-06, 2026-07-07, 2026-07-08]` (range match on the first
    two, included by the `EXISTS` clause — exactly the spec behaviour).
- no rows whose absence dates fall entirely outside the range are included.

### Lower bound only

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  "http://localhost:3000/api/justifications?date_from=2026-07-06"
```

- count: **17** (all justifications with >= 1 linked absence on or after
  2026-07-06).

### Upper bound only

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  "http://localhost:3000/api/justifications?date_to=2026-05-31"
```

- count: **65** (all justifications with >= 1 linked absence on or before
  2026-05-31).

### No params (regression)

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  http://localhost:3000/api/justifications
```

- count: **194** (matches baseline — no regression).

### Empty params (`?date_from=&date_to=`)

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  "http://localhost:3000/api/justifications?date_from=&date_to="
```

- count: **194** (empty string collapses to `undefined` — same as no params).

### Invalid range (`date_from > date_to`)

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  "http://localhost:3000/api/justifications?date_from=2026-12-31&date_to=2026-01-01"
```

- HTTP **400**
- body: `{"error":"date_from debe ser menor o igual a date_to"}`

### Invalid format

```
curl -H "Authorization: Bearer <jwt>" -H "X-Institution-Id: 2" \
  "http://localhost:3000/api/justifications?date_from=not-a-date"
```

- HTTP **400**
- body: `{"error":"date_from debe tener formato YYYY-MM-DD"}`

Same error, swapped, for `date_to=not-a-date` (not re-printed to keep this
file short — confirmed independently).

## Acceptance criteria checklist

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Range filter on `Absence.date` via `JustificationAbsence` (194 -> 11 with narrow window) | PASS | "Range filter" section above. |
| 2 | `date_from` only — inclusive lower bound | PASS | "Lower bound only" section above (17 rows >= 2026-07-06). |
| 3 | `date_to` only — inclusive upper bound | PASS | "Upper bound only" section above (65 rows <= 2026-05-31). |
| 4 | No params — full 194, no regression | PASS | "No params (regression)" section above. |
| 5 | `date_from > date_to` -> HTTP 400 with Spanish-neutral message | PASS | "Invalid range" section above. |
| 6 | Malformed date -> HTTP 400 | PASS | "Invalid format" section above. |
| 7 | Filter is on `Absence.date` (not `Justification.createdAt`) | PASS | SQL uses `a.date >= $N` / `a.date <= $N` inside `EXISTS (... JOIN absences a ...)`. Verified by sample row 175 (linked absence on 2026-07-08) being included when range is `2026-07-06..2026-07-07` — createdAt filter would have excluded it depending on when the row was created. |
| 8 | Soft-deleted justifications AND absences excluded | PASS | outer `WHERE j.deleted_at IS NULL` unchanged; new `EXISTS` clause explicitly adds `AND a.deleted_at IS NULL`. |
| 9 | Smoke test documented with before/after counts | PASS | This file. |

## Open questions / deferrals

- The existing `absenceDates` correlated subquery at
  `src/services/justification.service.ts` (the one returning `a.date` to the
  client) still does not filter `a.deleted_at IS NULL` — flagged by the
  explore agent. Out of scope for this feature; left untouched. A future
  ticket could clean that up.

## Round 2 — review fix

Reviewer (session 10, verdict `changes_requested`) flagged that the new
`EXISTS (... justification_absences ...)` block was being appended to the
outer `WHERE` unconditionally: with no date params supplied, any
justification that had zero live `justification_absences` rows would
silently disappear from `GET /api/justifications`. Reachable via
`PUT /api/justifications/:id {"absenceIds": []}` (the `update()` function
has no non-empty guard at lines 211-217, unlike `create()` at lines
159-161). The 194 → 194 baseline only passed because the current dataset
happens to have no such row — data-dependent, not structural.

### Fix applied

`src/services/justification.service.ts` lines 74-86 — replaced the
hard-coded `AND EXISTS (...)` (old lines 120-127) with a computed
`dateFilter` string that is empty when no date param is supplied:

```ts
// AC #1: filtra por al menos una falta vinculada dentro del rango (solo si dateFrom/dateTo están presentes).
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

Interpolated as `${dateFilter}` at line 134 (the position the hard-coded
`AND EXISTS (...)` used to occupy). Mirrors the gating style of
`courseFilter` / `specificCourseFilter` / `academicYearFilter` /
`enrollmentFilter` already in the same function.

No other lines touched: the `update()` non-empty guard (flagged in the
review) is intentionally left for a future ticket — not this feature's
job. `absenceIds` / `absenceDates` / `attachments` correlated subqueries
also untouched. Controller unchanged from round 1.

### Re-verification

Build (must be 0):

```
npx tsc --noEmit -p tsconfig.json
# exit 0, no output
npx tsc
# exit 0, no output, dist/ updated
```

Deployed the rebuilt `dist/services/justification.service.js` to the live
container via `docker cp dist/services/justification.service.js
backend:/app/dist/services/justification.service.js`, then
`docker restart backend`. Controller unchanged from round 1, no
`docker cp` needed for it.

Fresh smoke (same superadmin JWT + `X-Institution-Id: 2` as round 1):

| Call | Round 1 count | Round 2 count | Pass |
|---|---|---|---|
| `GET /api/justifications` (no params) | 194 | **194** | yes |
| `GET /api/justifications?date_from=2026-07-06&date_to=2026-07-07` | 11 | **11** | yes |
| `GET /api/justifications?date_from=2026-07-06` | 17 | **17** | yes |
| `GET /api/justifications?date_from=2026-12-31&date_to=2026-01-01` | HTTP 400 `{"error":"date_from debe ser menor o igual a date_to"}` | **HTTP 400, same body** | yes |
| `GET /api/justifications?date_from=not-a-date` | HTTP 400 `{"error":"date_from debe tener formato YYYY-MM-DD"}` | **HTTP 400, same body** | yes |

### Stretch — synthetic orphan proof

Done. Inserted a synthetic justification into `attendance.justifications`
with no `justification_absences` rows linked:

```sql
INSERT INTO attendance.justifications
  (enrollment_id, institution_id, reason, notified_by)
VALUES (2, 2, 'TEST_ORPHAN_ROUND2', 'synthetic');
-- INSERT 0 1
```

Ran the no-params `GET /api/justifications` — count went 194 → **195**,
the synthetic row (id 197, `absenceIds: []`) was visible. This is
exactly what the original code would have suppressed. Then deleted the
synthetic row and re-ran the same call — count back to **194**.

```sql
DELETE FROM attendance.justifications WHERE reason = 'TEST_ORPHAN_ROUND2';
-- DELETE 1
```

Proof the original blocker is fixed, not just data-dependent.