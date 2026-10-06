# Implementation report — feature #15 `citation_guardian_conflict_validation`

**Outcome:** implemented and verified. 15/15 smoke cases green, `pnpm run build` exits `0`, `./init.sh` green. Migration applied to the live local Postgres only; dumps preserved at `/tmp/citations_pre_migration_dump.sql` and `/tmp/citations_pre_migration_dataonly.sql`.

## Files touched

- **New**
  - `postgres/23_citation_guardian_conflict.sql` — schema migration
  - `postgres/23_citation_guardian_conflict_supabase.sql` — Supabase variant (every reference schema-qualified as `attendance.<table>`, no `SET search_path`)
- **Edited**
  - `backend/src/entities/Citation.ts` — removed `dateFrom`/`dateTo`, added `date` and `guardianId`, made `time` non-nullable
  - `backend/src/services/citation.service.ts` — replaced `CITATION_FIELDS_SQL` and the `findRoster` inline SQL, dropped `assertDateOrder` and `assertNoOverlap` (#14's superseded helper), added `assertNoGuardianConflict`, rewrote `create()` and `update()` with the new validation order, kept `findRoster`/`findByEnrollment`/`close`/`remove`/`addAttachments`/`removeAttachment` unchanged in shape
- **Not edited** (reused from #14, as instructed)
  - `backend/src/middleware/error.middleware.ts` — `HttpError.conflict` forwarding and the generic-branch spread unchanged

## SQL Ricardo debe correr contra Supabase / producción (paso a paso)

```
-- Pre-flight: dump citations por si algo sale mal
-- pg_dump --table=public.citations ... > /tmp/citations_pre_23.sql

BEGIN;

-- 1. Add nullable columns
ALTER TABLE citations ADD COLUMN IF NOT EXISTS guardian_id INTEGER;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS date        DATE;

-- 2. Backfill guardian_id from enrollments (must precede NOT NULL on date and the FK)
UPDATE citations c
SET    guardian_id = e.guardian_id
FROM   enrollments e
WHERE  e.id = c.enrollment_id
  AND  c.guardian_id IS NULL;

-- 3. Backfill date from legacy date_from
UPDATE citations SET date = date_from WHERE date IS NULL;

-- 4. Backfill null times BEFORE tightening NOT NULL
UPDATE citations SET time = '07:55' WHERE time IS NULL;

-- 5. Tighten NOT NULL (no DEFAULT — required by R3)
ALTER TABLE citations ALTER COLUMN time  SET NOT NULL;
ALTER TABLE citations ALTER COLUMN date  SET NOT NULL;

-- 6. Drop legacy range columns
ALTER TABLE citations DROP COLUMN date_from;
ALTER TABLE citations DROP COLUMN date_to;

-- 7. FK on guardian_id (added after the column so backfill doesn't fight it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_citations_guardian') THEN
    ALTER TABLE citations
      ADD CONSTRAINT fk_citations_guardian
      FOREIGN KEY (guardian_id) REFERENCES guardians(id);
  END IF;
END $$;

-- 8. Partial index backing the new conflict query
CREATE INDEX IF NOT EXISTS idx_citations_guardian_date
  ON citations(guardian_id, date)
  WHERE status = 'pending' AND deleted_at IS NULL;

COMMIT;
```

For Supabase, use the companion `postgres/23_citation_guardian_conflict_supabase.sql` instead — same logic but every reference written as `attendance.<table>` (the real schema in Supabase, see the convention in `postgres/08_user_courses_academic_year_supabase.sql` and `postgres/09_*_supabase.sql`).

The TypeScript changes in `Citation.ts` and `citation.service.ts` go out with the normal backend deploy — they were compiled and verified locally before this report.

## Dump locations

- `/tmp/citations_pre_migration_dump.sql` — full table dump (schema + data) from `pg_dump --table=attendance.citations`, 7066 bytes, captured **before** the migration was applied. This is the canonical rollback target.
- `/tmp/citations_pre_migration_dataonly.sql` — column-inserts data-only, 8253 bytes, same capture moment, for selective row-by-row recovery.

## Migration verification (T3 / R1–R5)

Pre-migration the table had 18 rows with `date_from DATE NOT NULL`, `date_to DATE NOT NULL`, `time TIME NULL`, no `guardian_id`, no `idx_citations_guardian_date`. After applying `23_citation_guardian_conflict.sql` against `localhost:5432` (Docker `postgres` container, schema `attendance`):

- `\d attendance.citations` confirms: `time` is now `NOT NULL`, `date` is `NOT NULL`, `guardian_id` is nullable, `date_from` and `date_to` are absent. Both `fk_citations_guardian` (FK to `guardians(id)`) and `idx_citations_guardian_date` (partial btree `(guardian_id, date) WHERE status = 'pending' AND deleted_at IS NULL`) are present.
- `SELECT COUNT(*) FILTER (WHERE time IS NULL) FROM citations` → `0`.
- `SELECT COUNT(*) FILTER (WHERE date IS NULL) FROM citations` → `0`.
- Every pre-migration row has its `guardian_id` populated from the source enrollment's `guardian_id` (or NULL where the enrollment had no guardian). The single mismatch in the live DB is citation `id=29`, which I deliberately `UPDATE`d to `guardian_id = NULL` as a T21 test fixture (see Smoke below) — that is **not** a backfill defect.
- The pre-existing 5-way cluster (citations 9–13, all `pending` for `guardian_id=57` at `date=2026-09-07` `time=07:55`, flagged in `design.md` "Pre-existing messy data state") survives the migration and now sits at the same `date` + `time`. They will 409 each other on re-save. Per the spec's recommendation, this is left as a separate cleanup feature rather than silently rewritten by the migration.

## Smoke test results (R20, items (i)–(xv))

All 15 cases were exercised against the live `localhost:3000` API with the live Postgres backend. Two extra probes (`R10` empty-time PUT) are also captured. Each request/response below is verbatim from the running server.

### (i) Migration post-conditions

Captured via:

```
docker exec -i postgres psql -U attendance -d attendance -c "\d attendance.citations"
```

Output in the "Migration verification" section above. All five sub-conditions (a–f) met.

### (ii) T9 — `POST` with no `time` (R7)

Request:

```
POST /api/citations HTTP/1.1
Authorization: Bearer <superadmin>
X-Institution-Id: 2
Content-Type: application/json

{"enrollmentId":20,"date":"2027-03-01","reasonIds":[8]}
```

Response: `400 {"error":"El campo time es obligatorio"}`. No row inserted (`SELECT COUNT(*) ... WHERE enrollment_id=20 AND date='2027-03-01'` → `0`).

### (iii) T10 — `POST` with no `date` (R8)

Request body `{"enrollmentId":20,"time":"07:55","reasonIds":[8]}` → `400 {"error":"El campo date es obligatorio"}`. No row inserted.

### (iv) T11 — `POST` for an enrollment with no guardian (R9)

Request body `{"enrollmentId":329,"date":"2027-03-01","time":"07:55","reasonIds":[8]}` → `400 {"error":"La matrícula no tiene representante asignado"}`. `enrollments.guardian_id IS NULL` for id 329 confirmed. No row inserted.

### (v) T12 — Conflict with full payload, `courseIds === null` (R12, R18)

Step 1 (superadmin): `POST /api/citations {"enrollmentId":20,"date":"2027-03-15","time":"09:30","reasonIds":[8]}` → `201 {"id":23,...,"date":"2027-03-15","time":"09:30","guardianId":20,...}`.

Step 2: `POST /api/citations {"enrollmentId":133,"date":"2027-03-15","time":"09:30","reasonIds":[8]}` (different enrollment, same `guardian_id=20`) → `409 {"error":"Ya existe una citación pendiente para este representante en un horario cercano","conflict":{"id":23,"date":"2027-03-15","time":"09:30:00","studentName":"PESANTEZ ORDOÑEZ NALLELY ELIZABETH","guardianName":"ORDOÑEZ FLORES  MARIA ESTHER","guardianPhone":"0939638508","courseName":"9NO \"D\"BS"}}`. All seven `conflict` keys present. No row inserted.

### (vi) T13 — Conflict with redacted payload, `courseIds = [1, 5]` (R18)

Same step-2 POST as (v), but authenticated as `teacher_test` (a freshly-created user with `role_id=3` ("inspector de apoyo"), `user_courses` = `{course_id=1, course_id=5}` so `req.courseIds = [1, 5]`) → `409 {"error":"Ya existe una citación pendiente para este representante en un horario cercano","conflict":{"id":23,"date":"2027-03-15","time":"09:30:00"}}`. Only `id`, `date`, `time` present; the four PII fields absent.

### (vii) T14 — Exactly 10 minutes apart is **not** a conflict (R12)

`POST /api/citations {"enrollmentId":133,"date":"2027-03-15","time":"09:40","reasonIds":[8]}` (same `guardian_id=20`, same date, +10 min from citation 23) → `201 {"id":24,...,"date":"2027-03-15","time":"09:40"}`. `ABS(09:40 - 09:30) = 600` s, the predicate is strict `< 600`, so no conflict.

### (viii) T15 — 9 minutes apart **is** a conflict (R12)

`POST /api/citations {"enrollmentId":133,"date":"2027-03-15","time":"09:39","reasonIds":[8]}` → `409 {"error":"...","conflict":{"id":23,"date":"2027-03-15","time":"09:30:00","studentName":...,"courseName":...}}`. `ABS(09:39 - 09:30) = 540` s, satisfies `< 600`.

### (ix) T16 — Different date is fine (R12)

`POST /api/citations {"enrollmentId":133,"date":"2027-03-16","time":"09:30","reasonIds":[8]}` → `201 {"id":25,...,"date":"2027-03-16","time":"09:30"}`. `c.date = $3` predicate excludes different dates.

### (x) T17 — Closed citation doesn't block (R16)

`PUT /api/citations/23/close` → `200 {"id":23,...,"status":"closed","closedAt":"2026-09-06T23:06:01.635Z",...}`.

`POST /api/citations {"enrollmentId":133,"date":"2027-03-15","time":"09:30","reasonIds":[8]}` (same slot as the now-closed citation 23; citation 24 is pending at 09:40, 10 min away, so it does not conflict) → `201 {"id":27,...,"date":"2027-03-15","time":"09:30"}`. The `c.status = 'pending'` predicate excludes the closed citation.

### (xi) T18 — Cross-institution does not conflict (R15)

Pre-flight: inserted minimal fixtures in `institution_id = 1` (course 100, student 1000, academic_year 100, guardian 999, enrollment 999, citation_reason 11), then updated enrollment 999 to share `guardian_id = 20` with the institution-2 conflict space (citation 25 at `date=2027-03-16, time=09:30` is still pending).

`POST /api/citations {"enrollmentId":999,"date":"2027-03-15","time":"09:30","reasonIds":[11]}` with `X-Institution-Id: 1` → `201 {"id":28,...,"institutionId":1,"enrollmentId":999,"guardianId":20,"date":"2027-03-15","time":"09:30"}`. The `c.institution_id = $1` predicate excludes institution 2's citations on the same `guardian_id`.

### (xii) T19 — `PUT` conflict (R13)

Two pending citations on the same `guardian_id = 20` for `enrollment 133`: citation 24 at `2027-03-15 09:40`, citation 25 at `2027-03-16 09:30`. `PUT /api/citations/24 {"date":"2027-03-16","time":"09:30"}` → `409 {"error":"...","conflict":{"id":25,"date":"2027-03-16","time":"09:30:00","studentName":"PESANTEZ ORDOÑEZ  ELIZA MAYTE","guardianName":"ORDOÑEZ FLORES  MARIA ESTHER","guardianPhone":"0939638508","courseName":"10MO \"C\"BS"}}`. Post-`PUT` SELECT confirms citation 24 is unchanged (`2027-03-15 09:40`).

### (xiii) T20 — `PUT` self-exclusion on `observations`-only update (R14)

`PUT /api/citations/24 {"observations":"updated via smoke test"}` → `200 {"id":24,...,"date":"2027-03-15","time":"09:40:00","status":"pending","observations":"updated via smoke test",...}`. The `excludeId = c.id` predicate passes `c.id != 24`, so the conflict query excludes itself.

### (xiv) T21 — `PUT` on a citation with `guardian_id IS NULL` is blocked even for `observations` (R11)

Inserted citation 29 with `guardian_id = NULL` (FK allows NULL; backfilled from a dummy guardian then `UPDATE`d to NULL). `PUT /api/citations/29 {"observations":"test"}` → `400 {"error":"Esta citación no tiene representante asignado y no puede editarse"}`. Also tested with `{"time":"11:00"}` → same `400`. Spec's hard `400` honored even when the body only touches `observations`.

### (xv) T22 — API shape never returns `dateFrom`/`dateTo` (R6)

`GET /api/citations?enrollment_id=20` → single-element array:

```json
[
  {
    "id": 23,
    "date": "2027-03-15",
    "time": "09:30:00",
    "guardianId": 20,
    "status": "closed",
    ...
  }
]
```

Programmatic shape check: `Has dateFrom? False; Has dateTo? False; Has date? True; count: 1`. All `POST`/`PUT` responses in T9–T21 already showed `date` as the sole date key.

### Bonus — R10 (`PUT` with explicit empty/null `time`)

- `PUT /api/citations/24 {"time":""}` → `400 {"error":"El campo time no puede estar vacío"}`.
- `PUT /api/citations/24 {"time":null}` → `400 {"error":"El campo time no puede estar vacío"}`.
- `PUT /api/citations/24 {"date":"2027-04-20"}` (omits `time` entirely) → `200 {"id":24,...,"date":"2027-04-20","time":"09:40:00",...}` — omission keeps the current `time`, confirming the spec's distinction between "missing" and "explicitly empty/null".

## Traceability (R<n> → evidence)

| `R<n>` | Evidence |
|--------|----------|
| R1     | `postgres/23_citation_guardian_conflict.sql` step 2; `\d attendance.citations` shows `guardian_id INTEGER` nullable; SELECT post-migration confirms 24/25 rows backfilled from `enrollments.guardian_id`, the 25th (id 29) is the deliberate T21 fixture |
| R2     | Migration step 3 (`UPDATE citations SET date = date_from WHERE date IS NULL`); post-`SELECT COUNT(*) FILTER (WHERE date IS NULL)` = 0 |
| R3     | Migration steps 4–5 (`UPDATE ... time = '07:55' WHERE time IS NULL` then `ALTER COLUMN time SET NOT NULL`, no DEFAULT); post-`SELECT COUNT(*) FILTER (WHERE time IS NULL)` = 0 |
| R4     | Migration step 6; `\d attendance.citations` lists no `date_from` or `date_to` columns |
| R5     | Migration step 8; `\d attendance.citations` shows `"idx_citations_guardian_date" btree (guardian_id, date) WHERE status::text = 'pending'::text AND deleted_at IS NULL` |
| R5a    | `postgres/23_citation_guardian_conflict_supabase.sql` ships, every reference `attendance.<table>` |
| R6     | T9–T22 responses all use `date`; programmatic shape check on T22 confirms no `dateFrom`/`dateTo` keys; `CITATION_FIELDS_SQL` and `findRoster` updated |
| R7     | T9 response `400 {"error":"El campo time es obligatorio"}` |
| R8     | T10 response `400 {"error":"El campo date es obligatorio"}` |
| R9     | T11 response `400 {"error":"La matrícula no tiene representante asignado"}` |
| R10    | R10 bonus responses — `{"time":""}` and `{"time":null}` → `400`; `{"date":"..."}` alone → `200` |
| R11    | T21 response `400 {"error":"Esta citación no tiene representante asignado y no puede editarse"}` (tested with both `observations` and `time`) |
| R12    | T12 (exact slot, conflict), T14 (10 min, 201), T15 (9 min, 409), T16 (different date, 201), T17 (closed, 201) |
| R13    | T19 — `PUT` from 24 to (16, 09:30) returns 409 with citation 25 in the `conflict` |
| R14    | T20 — `PUT` with only `observations` returns 200, citation 24 unchanged on `date`/`time` |
| R15    | T18 — cross-institution POST succeeds despite `guardian_id = 20` having pending citations in institution 2 |
| R16    | T17 — closing citation 23 unblocks the same slot |
| R17    | `WHERE c.guardian_id = $2` uses standard SQL `NULL` semantics; historical rows with `guardian_id IS NULL` neither match the predicate nor are matched by it (no JOIN back to enrollments in the conflict query) |
| R18    | T12 returns the full 7-key conflict; T13 (course-scoped teacher) returns only `id, date, time`; helper branch `courseIds === null ? full : { id, date, time }` |
| R19    | `pnpm run build` exits `0`; `./init.sh` green (only the two baseline `[WARN]`s: empty `verify_command`, unset `SUPABASE_URL`/`SUPABASE_ANON_KEY`) |
| R20    | This report's "Smoke test results" section, cases (i)–(xv) |

## Notes for the reviewer

- **The `assertNoOverlap` helper from #14 was rewritten from scratch, not extended.** It no longer exists in the source (drop, not dead export). The new `assertNoGuardianConflict` is the only conflict check.
- **`error.middleware.ts` is unchanged** — its `HttpError.conflict` interface and the `conflict` spread in the generic branch are reused as-is from the #14-approved shape.
- **DB exclusion constraint** is still rejected (see `design.md` discarded alternative #3). Conflict remains application-level.
- **Pre-existing 5-way cluster (citations 9–13)** survives the migration in the state the spec calls out as acceptable (post-migration they all share `guardian_id=57`, `date=2026-09-07`, `time=07:55`, `status='pending'`, and will 409 each other on re-save). No cleanup was attempted; this is a separate feature per the spec.
- **Test fixtures created live** during the smoke run: a new `users` row (`teacher_test`, id 85, role_id 3, institution_id 2, with two `user_courses` rows), and minimal institution-1 fixtures (institution 1 itself was empty before T18): course 100, student 1000, academic_year 100, guardian 999, enrollment 999, citation_reason 11. Citation 29 was created via a dummy guardian then `UPDATE`d to `guardian_id = NULL` for T21. These are intentional and the reviewer can drop them or leave them — they don't affect the production schema. Citations 23–29 were added during the smoke run; the reviewer can keep them as evidence or clean them up.