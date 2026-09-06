# Tasks — Guardian-scoped 10-minute conflict validation for citations

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists
the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition.
The implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]`
without a documented, reviewer-accepted justification in
`progress/impl_citation_guardian_conflict_validation.md`.

This project has no automated test framework (`docs/verification.md`) — traceability here is
satisfied the same way it was for features #7/#9/#10/#13/#14: a `pnpm run build` pass plus a
manual smoke test against the live API and the live DB, with verbatim request/response captured
in `progress/impl_citation_guardian_conflict_validation.md`.

- [ ] T1 (R1, R2, R3, R4, R5) Create `postgres/23_citation_guardian_conflict.sql` exactly as
      shown in `design.md`'s "Migration shape" section — add `guardian_id` and `date` nullable,
      backfill `guardian_id` from `enrollments.guardian_id`, backfill `date` from `date_from`,
      backfill `time = '07:55'` for null rows, `ALTER COLUMN time SET NOT NULL`,
      `ALTER COLUMN date SET NOT NULL`, drop `date_from` and `date_to`, add the
      `fk_citations_guardian` FK constraint guarded by `IF NOT EXISTS`, create
      `idx_citations_guardian_date` partial index.

- [ ] T2 (R5a) Create `postgres/23_citation_guardian_conflict_supabase.sql` with the same logic
      but every `citations`/`enrollments`/`guardians` reference rewritten to
      `attendance.<table>` (no `SET search_path`), matching the convention in
      `postgres/09_justification_attachments_supabase.sql`.

- [ ] T3 (R1, R2, R4, R6) Apply the migration against the live DB and verify with SELECTs that:
      (a) every row has `guardian_id` set or `NULL` (matches the source enrollment's
      `guardian_id`); (b) `date` is populated and equals the legacy `date_from` for every row;
      (c) `time IS NOT NULL` for every row; (d) `\d citations` no longer lists `date_from` or
      `date_to`; (e) `\d citations` lists `idx_citations_guardian_date` with the partial WHERE
      clause; (f) `\d citations` lists `fk_citations_guardian` referencing `guardians(id)`.
      Capture the verbatim output in `progress/impl_citation_guardian_conflict_validation.md`.

- [ ] T4 (R6, R19) Update `src/entities/Citation.ts`: remove `dateFrom` and `dateTo` columns,
      add `date` as `@Column({ name: 'date', type: 'date' }) date!: string`, change `time` from
      `string | null` to `string` (the DB is `NOT NULL` after R3), add `guardianId` as
      `@Column({ name: 'guardian_id', type: 'integer', nullable: true }) guardianId!: number |
      null`. Build: `pnpm run build` exits `0` after this step (the entity compiles against the
      post-migration schema).

- [ ] T5 (R6, R12, R15, R17, R18) Update `src/services/citation.service.ts`:
      (a) replace `CITATION_FIELDS_SQL` so it selects `c.date::text AS "date"` (instead of
      `dateFrom`/`dateTo`) and `c.guardian_id AS "guardianId"`;
      (b) update the `findRoster` inline SQL similarly and change its `ORDER BY c.date_from
      DESC` to `ORDER BY c.date DESC`;
      (c) remove `assertDateOrder` (no longer needed — single `date` field);
      (d) remove the legacy `assertNoOverlap` helper from #14 entirely (do not extend, do not
      keep as a dead export);
      (e) add `assertNoGuardianConflict(institutionId, guardianId, date, time, courseIds,
      excludeId?)` exactly as shown in `design.md`'s "`assertNoGuardianConflict`" section,
      with the `ABS(EXTRACT(EPOCH FROM ((c.time - $4)::interval))) < 600` predicate and the
      `courseIds === null ? full : { id, date, time }` redaction switch.

- [ ] T6 (R6, R7, R8, R9, R12) Update `create()` in `citation.service.ts`: change the `data`
      parameter shape from `{ enrollmentId, dateFrom, dateTo, time?, ... }` to
      `{ enrollmentId, date, time, ... }`. Validate locally (in this order, per
      `design.md`'s "Validation order"): (1) `time` missing/empty → `400` (R7); (2) `date`
      missing/empty → `400` (R8); (3) `enrollment.guardianId === null` → `400` with message
      "La matrícula no tiene representante asignado" (R9); (4) existing
      `assertEnrollmentInScope`; (5) new `assertNoGuardianConflict(institutionId,
      enrollment.guardianId, date, time, courseIds)` (no `excludeId` — brand-new citation
      can't conflict with itself); (6) existing `assertReasonIds`. Inside the transaction,
      insert with `guardianId: enrollment.guardianId` (snapshot, not JOINed later).

- [ ] T7 (R6, R10, R11, R13, R14) Update `update()` in `citation.service.ts`: change the
      `data` parameter shape to `{ date?, time?, ... }`. Validate locally: (1) `data.time !==
      undefined && !data.time` (explicit empty/null but not omission) → `400` (R10); (2)
      existing `findOwned`; (3) `c.guardianId === null` → `400` with message "Esta citación no
      tiene representante asignado y no puede editarse" (R11). Compute `nextDate = data.date ??
      c.date`, `nextTime = data.time ?? c.time`, then call `assertNoGuardianConflict(institutionId,
      c.guardianId, nextDate, nextTime, courseIds, c.id)` (R14 — pass `c.id` as `excludeId`).
      Continue with existing `assertReasonIds` and transactional save.

- [ ] T8 (R19) Run `pnpm run build` (or `node_modules/.bin/tsc -p .` if `pnpm` isn't available).
      Done: exits `0` with no new TypeScript errors attributable to `Citation.ts`,
      `citation.service.ts`, or the migration files.

- [ ] T9 (R20-ii, R7) Manual smoke test, missing `time` on POST: `POST /api/citations` with
      `enrollmentId, date, reasonIds` but no `time` → `400`; confirm via subsequent `GET` that
      no row was created. Capture verbatim request/response.

- [ ] T10 (R20-iii, R8) Manual smoke test, missing `date` on POST: `POST /api/citations` with
      `enrollmentId, time, reasonIds` but no `date` → `400`; confirm via subsequent `GET` that
      no row was created. Capture verbatim request/response.

- [ ] T11 (R20-iv, R9) Manual smoke test, enrollment without guardian: `POST /api/citations`
      for an `enrollmentId` whose `enrollments.guardian_id IS NULL` → `400`; confirm no row was
      created. Capture verbatim request/response.

- [ ] T12 (R20-v, R12, R18) Manual smoke test, conflict with full payload (courseIds null):
      create a `pending` citation for `enrollmentId = E1` with `date = D`, `time = T`; then
      `POST` a second citation for a *different* `enrollmentId = E2` (which shares the same
      `enrollments.guardian_id = G`) with `date = D`, `time = T` → `409` with a `conflict`
      object containing `id, date, time, studentName, guardianName, guardianPhone, courseName`.
      Confirm via `GET` that no second row was created. Capture verbatim request/response.

- [ ] T13 (R20-vi, R18) Manual smoke test, conflict with redacted payload (course-scoped):
      repeat T12's setup, but call the service with `courseIds = [<a single course id>]` (e.g.
      through a teacher JWT) → `409` whose `conflict` contains only `id, date, time`
      (`studentName`, `guardianName`, `guardianPhone`, `courseName` absent). Capture verbatim
      request/response.

- [ ] T14 (R20-vii, R12) Manual smoke test, exactly 10 minutes apart is NOT a conflict:
      create a `pending` citation for `enrollmentId = E1` with `date = D`, `time = 07:55`; then
      `POST` a second citation for a different `enrollmentId` sharing the same
      `enrollments.guardian_id` with `date = D`, `time = 08:05` → `201` (created). Capture
      verbatim request/response.

- [ ] T15 (R20-viii, R12) Manual smoke test, 9 minutes apart IS a conflict: with T14's first
      citation in place, `POST` a third citation for a different enrollment sharing the same
      `enrollments.guardian_id` with `date = D`, `time = 08:04` → `409`. Capture verbatim
      request/response.

- [ ] T16 (R20-ix, R12) Manual smoke test, different date: with T14's citations in place,
      `POST` a fourth citation for a different enrollment sharing the same
      `enrollments.guardian_id` with `date = D + 1 day`, `time = 07:55` → `201`. Capture
      verbatim request/response.

- [ ] T17 (R20-x, R16) Manual smoke test, closed citation doesn't block: close the citation
      from T12 (`PUT /:id/close`), then `POST` a new citation for the same `guardian_id`,
      same `date`, same `time` → `201`, no `409`. Capture verbatim request/response.

- [ ] T18 (R20-xi, R15) Manual smoke test, cross-institution is fine: identify or create a
      `guardian_id = G2` in a different institution that overlaps (enrollment, date, time)
      with one of the citations above; `POST` a citation for that other institution's
      enrollment → `201`. Capture verbatim request/response (or the institution-mismatch
      `404` from `assertEnrollmentInScope`, whichever comes first, and confirm the conflict
      check did not fire).

- [ ] T19 (R20-xii, R13) Manual smoke test, PUT conflict: create two `pending` citations A and
      B for different enrollments sharing the same `enrollments.guardian_id`, both at
      `time = 07:55` on different dates; `PUT` A's `time` to `07:56` on B's date → `409`
      with `conflict` describing B; confirm via `GET` that A's `time` is unchanged. Capture
      verbatim request/response.

- [ ] T20 (R20-xiii, R14) Manual smoke test, self-exclusion on PUT: `PUT` citation A from T19
      with only `{ observations: 'updated' }` (no `date`, no `time`) → `200`, not rejected
      as conflicting with itself. Capture verbatim request/response.

- [ ] T21 (R20-xiv, R11) Manual smoke test, historical null-guardian PUT blocked: identify
      (or create) a `citations` row with `guardian_id IS NULL` and try `PUT /:id` with any
      body (even `{ observations: 'x' }`) → `400`. Capture verbatim request/response.

- [ ] T22 (R20-xv, R6) Manual smoke test, API shape: `GET /api/citations?enrollment_id=E1`
      returns citations whose every entry has a `date` key and no `dateFrom` or `dateTo`
      keys; the `POST`/`PUT` responses from T9–T21 also have `date` only. Capture one
      verbatim list response.

- [ ] T23 (R20-i, R19) Final `./init.sh` and `pnpm run build` re-run: both green; the only
      `[WARN]`s are the two pre-existing baseline ones (empty `verify_command`, unset
      `SUPABASE_URL`). Capture the init output.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>`  | Covered by |
|---------|------------|
| R1      | T1, T3, T4 |
| R2      | T1, T3 |
| R3      | T1, T3 |
| R4      | T1, T3 |
| R5      | T1, T3 |
| R5a     | T2 |
| R6      | T3, T4, T5, T6, T7, T22 |
| R7      | T6, T9 |
| R8      | T6, T10 |
| R9      | T6, T11 |
| R10     | T7, (implicit: no T devoted — exercised as part of the PUT smoke in T19/T20/T21) |
| R11     | T7, T21 |
| R12     | T5, T6, T12, T14, T15, T16, T17 |
| R13     | T7, T19 |
| R14     | T7, T20 |
| R15     | T5, T18 |
| R16     | T17 |
| R17     | T5 (SQL NULL semantics in `c.guardian_id = $2`) |
| R18     | T5, T12, T13 |
| R19     | T8, T23 |
| R20     | T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23 |
