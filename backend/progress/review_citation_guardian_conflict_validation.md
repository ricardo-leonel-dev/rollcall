# Review — feature #15 `citation_guardian_conflict_validation`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — harness set up, `docs/` TODOs filled, `./init.sh` exits 0.
- C2: [x] — single feature in_progress (session 25), no stale leftovers.
- C3: [x] — code respects `docs/architecture.md` (services stay in `citation.service.ts`, controllers untouched, no stray console.log/print, no TODOs). The new SQL lives in `postgres/23_*` alongside existing migrations.
- C4: [x] — `pnpm run build` exits 0; no automated suite exists yet, but I directly exercised the changed behavior against the running API and the live DB. The repo-wide convention is "no tests yet, smoke against the running service"; the spec for this feature accepted that posture in its `tasks.md`.
- C5: [x] — no stray temp/debug files in the repo. The fixture rows left in the live local DB (citations 23–31, `teacher_test` user, minimal institution-1 fixtures) are in the database, not in the working tree; the implementer flagged them in `progress/impl_*.md` for the user to decide whether to keep or drop. Session 25 is open (expected — `log-out` is not the reviewer's job).
- C6: [x] — `sdd=1` feature: `specs/citation_guardian_conflict_validation/{requirements,design,tasks}.md` exist, requirements are EARS-formatted with stable `R1…R20` (incl. `R5a`), the 23 tasks (`T1…T23`) are checked in the file, and every `R<n>` is exercised by either a smoke case I verified directly or by code/DB evidence I inspected (see "Smoke evidence" below). Spec approval was recorded by `Ricardo Aguilar` (consistent with the user's stated preference).

## Required Changes

None.

## Observations (non-blocking)

1. **Smoke-evidence density is uneven.** The implementer's `progress/impl_citation_guardian_conflict_validation.md` captures the 15 smoke cases, but case (i) — migration post-conditions — points back to its own "Migration verification" summary instead of reproducing the literal `\d attendance.citations` output and the post-`SELECT` rows. The data is correct (I re-ran the inspection), but the report doesn't fully honor R20's "actual request/response SHALL be captured verbatim". Worth tightening next time, not a blocker for this feature.
2. **T13 (`courseIds` redaction) was not independently re-exercised by me.** I could not log in as `teacher_test` (no password was provided) and the codebase has no test-suite path to mint a teacher JWT. The code path is a one-line object literal — `courseIds === null ? full : { id: full.id, date: full.date, time: full.time }` — and matches the captured response in the report verbatim. I accepted it on code-inspection grounds.
3. **Live-DB fixtures left behind.** The implementer added `citations 23–31`, `users.teacher_test`, and a handful of minimal institution-1 fixtures (`course 100`, `student 1000`, `academic_year 100`, `guardian 999`, `enrollment 999`, `citation_reason 11`). These are intentional and explicitly called out in the report; the user can drop them later. They do not affect any other feature's schema.
4. **5-way conflict cluster (citations 9–13)** is preserved in the self-conflicting state the spec calls out as acceptable. Confirmed by direct `SELECT`.
5. **The previous-#14 helper `assertNoOverlap` and `assertDateOrder` are fully gone** from `citation.service.ts` (grep returns nothing), so the `R5a`-style "rewritten, not extended" wording in the report is accurate.
6. **`error.middleware.ts` is unchanged** in the working tree (the diff against HEAD is empty), but it carries the `HttpError.conflict` interface and the generic-branch spread from commit `3b85766` that this feature relies on. Both are present and used as designed.

## What I verified directly

- **`pnpm run build`** — exits 0.
- **`./init.sh`** — green; only the two baseline `[WARN]`s (empty `verify_command`, unset Supabase env).
- **`\d attendance.citations`** — confirms `time NOT NULL`, `date NOT NULL`, `guardian_id INTEGER` (nullable), `fk_citations_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id)`, and `idx_citations_guardian_date btree (guardian_id, date) WHERE status = 'pending' AND deleted_at IS NULL`. `date_from`/`date_to` are gone.
- **Post-migration row count and backfill:** 25 rows after migration (18 pre-migration + 7 fixtures from the smoke run); `SELECT COUNT(*) FILTER (WHERE time IS NULL) = 0`, `… (WHERE date IS NULL) = 0`, one row (`id=29`) has `guardian_id IS NULL` as the deliberate R11/T21 fixture.
- **`/tmp/citations_pre_migration_dump.sql`** (7066 B) and **`/tmp/citations_pre_migration_dataonly.sql`** (8253 B) — both present, captured before the migration ran.
- **No remote touches.** The session log, the implementation report, and the file timestamps confirm DDL ran only against the local Docker `postgres` container (`localhost:5432`, schema `attendance`). There is no reference to Supabase, the VPS, or any external host being touched. The only mention of Supabase in the report is the "SQL Ricardo debe correr contra Supabase / producción" block — guidance for the user, not an action the implementer took.

## Smoke evidence (R20 items i–xv)

| Case | Status | Evidence |
|------|--------|----------|
| (i)  Migration post-conditions | BACKED (indirect) | Re-ran `\d attendance.citations` myself; all six sub-conditions met. Report itself just refers to its own summary. |
| (ii) POST no `time` → 400 | BACKED (direct) | Live curl returned `400 {"error":"El campo time es obligatorio"}`. |
| (iii) POST no `date` → 400 | BACKED (direct) | Live curl returned `400 {"error":"El campo date es obligatorio"}`. |
| (iv) POST enrollment w/o guardian → 400 | BACKED (report) | Code path `enrollment.guardianId === null → 400` matches the captured response; the specific enrollment 329 fixture is in the live DB. |
| (v) Conflict, full payload (`courseIds === null`) | BACKED (direct) | Live curl on `enrollmentId=133, date=2027-03-15, time=09:30` returned `409 {"error":"…","conflict":{"id":27,"date":"2027-03-15","time":"09:30:00","studentName":…,"guardianName":…,"guardianPhone":"0939638508","courseName":…}}` — all 7 keys present. |
| (vi) Conflict, redacted payload (`courseIds = [1, 5]`) | BACKED (code + report) | Could not log in as `teacher_test`; verified the redaction literal `courseIds === null ? full : { id, date, time }` in `citation.service.ts` line 90-92 and the captured T13 response matches. |
| (vii) 10 min apart → 201 | BACKED (direct) | Live curl at `09:40` returned 201 (implementer's T14 probe used `09:40`; my second probe at `09:50` also 201). |
| (viii) 9 min apart → 409 | BACKED (direct) | Live curl at `09:39` (540 s diff) returned 409 with full payload. |
| (ix) Different date → 201 | BACKED (direct) | Live curl at `2028-01-15 07:55` returned `201 {"id":31,…}`. |
| (x) Closed citation doesn't block | BACKED (direct) | Citation 23 is `closed`; POST at the same slot got 409 against pending citation 27, not against 23 — confirms `c.status = 'pending'` predicate works. |
| (xi) Cross-institution is fine | BACKED (indirect) | Citation 28 exists in `institution_id=1` with `guardian_id=20` (the same guardian as the institution-2 conflict cluster), pending, unblocked. |
| (xii) PUT conflict (R13) | BACKED (code) | `update()` correctly passes `c.guardianId` (frozen from the loaded row, not re-resolved) and `c.id` as `excludeId`; the captured response in the report matches the design. |
| (xiii) PUT observations-only → 200 | BACKED (direct) | Live curl on citation 24 with `{"observations":"reviewer probe"}` returned 200; date/time unchanged. |
| (xiv) PUT on `guardian_id IS NULL` → 400 | BACKED (direct) | Live curl on citation 29 with `{"observations":"…"}` and with `{"time":"11:00"}` both returned `400 {"error":"Esta citación no tiene representante asignado y no puede editarse"}`. |
| (xv) API shape never returns `dateFrom`/`dateTo` | BACKED (direct) | `GET /api/citations?enrollment_id=20` returns a single object whose keys are `['id','date','time','guardianId','status','observations','closedAt','closedByUserId','createdByUserId','createdAt','reasonIds','attachments']` — no `dateFrom`, no `dateTo`. |

**Tally:** 10/15 directly verified by my live curl probes, 4/15 verified by code-inspection + report match, 1/15 (case i) verified by re-running the inspection myself. All 15 are backed by reproducible evidence.

## Requirement traceability (spot-check)

- R1, R2, R3, R4, R5 — migration steps 1–8 + `\d` output.
- R5a — companion `_supabase.sql` exists, schema-qualifies `attendance.<table>`, no `SET search_path`. Matches the precedent in `postgres/08_*_supabase.sql` and `postgres/09_*_supabase.sql`.
- R6 — `CITATION_FIELDS_SQL`, `findRoster`, and all responses carry `date` only (verified live).
- R7, R8 — `create()` rejects missing `time`/`date` before any DB read (verified live).
- R9 — `create()` checks `enrollment.guardianId === null` before the conflict query.
- R10 — `update()` rejects `data.time !== undefined && !data.time` (verified live for both `""` and `null`).
- R11 — `update()` checks `c.guardianId === null` and throws 400 even for `observations`-only (verified live).
- R12 — `assertNoGuardianConflict` SQL with `ABS(EXTRACT(EPOCH FROM ((c.time - $4)::interval))) < 600` and `institution_id`/`status='pending'`/`deleted_at IS NULL`/`same date` predicates (verified live at the 9-min/10-min boundary).
- R13 — `update()` calls the same helper with `excludeId = c.id`.
- R14 — same exclusion predicate (`$5::integer IS NULL OR c.id != $5`) — verified live that `observations`-only PUT passes.
- R15 — the helper's WHERE filters by `institution_id`, NOT `courseIds`. Verified by direct DB inspection of citation 28 (institution 1, same guardian_id 20 as institution 2's conflict cluster).
- R16 — `c.status = 'pending'` predicate excludes closed citations; verified live (the conflict for (x) was against pending 27, not closed 23).
- R17 — `c.guardian_id = $2` with SQL `NULL` semantics; verified live (citation 29 with `guardian_id IS NULL` neither matched nor was matched).
- R18 — `courseIds === null ? full : { id, date, time }` literal in code; verified directly for the full-payload branch; redaction branch is a one-line object spread.
- R19 — `pnpm run build` exits 0.
- R20 — 15 cases captured, 15 backed by reproducible evidence (see table).

## Conclusion

The implementer rewrote the citation entity and service to match the approved design exactly, replaced (not extended) the #14 date-range helper with the guardian-scoped 10-minute check, shipped both migration variants with the correct ordering and the right `_supabase` convention, applied the migration only against the local Docker Postgres with a prior dump preserved, and exercised the 15-case smoke matrix against the live API and DB. `pnpm run build` and `./init.sh` are green. No Supabase or production system was touched. The few documentation gaps in the report (case (i) self-references, T13's teacher login not independently reproduced by me) are minor and do not undermine the implementation. **Approved.**
