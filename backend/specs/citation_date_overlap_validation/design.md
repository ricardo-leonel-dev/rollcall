# Design — Validate overlapping scheduled date ranges when creating or editing citations

## Files to touch

### Edited
- `src/services/citation.service.ts` — add an `assertNoOverlap` helper and call it from `create` and
  `update`, after the existing `assertDateOrder`/`assertEnrollmentInScope`/`assertReasonIds` checks
  (see "Validation order" below).
- `src/middleware/error.middleware.ts` — forward an optional `conflict` field from a thrown error's
  generic branch (R11).

### None
- No new entity, no new migration, no new route. `citations.status`/`citations.closed_at` already
  exist (feature #9's migration); this feature only adds an additional read (a `SELECT` against
  `citations`) inside the existing `create`/`update` service functions.

## `assertNoOverlap` (`citation.service.ts`)

```ts
async function assertNoOverlap(
  enrollmentId: number,
  dateFrom: string,
  dateTo: string,
  excludeId?: number,
): Promise<void> {
  const rows = await AppDataSource.query(
    `
    SELECT c.id, c.date_from::text AS "dateFrom", c.date_to::text AS "dateTo", c.time,
           v.full_name AS "studentName", v.guardian_name AS "guardianName",
           v.guardian_phone AS "guardianPhone"
    FROM citations c
    JOIN v_enrollments_detail v ON v.enrollment_id = c.enrollment_id
    WHERE c.enrollment_id = $1
      AND c.deleted_at IS NULL
      AND c.status = 'pending'
      AND c.date_from <= $3 AND c.date_to >= $2
      AND ($4::integer IS NULL OR c.id != $4)
    ORDER BY c.date_from ASC, c.id ASC
    LIMIT 1
    `,
    [enrollmentId, dateFrom, dateTo, excludeId ?? null],
  );
  if (rows.length > 0) {
    throw Object.assign(new Error('Ya existe una citación pendiente que se superpone con este rango de fechas'), {
      status: 409,
      conflict: rows[0],
    });
  }
}
```

`create` calls it as `await assertNoOverlap(data.enrollmentId, data.dateFrom, data.dateTo)` right
after `assertEnrollmentInScope` (so the enrollment is confirmed in-scope before the overlap query
runs) and before `assertReasonIds` (an invalid `reasonIds` array on an otherwise-conflicting request
still reports the date conflict first, since a caller fixing the date first is the more actionable
order — this ordering is not independently tested by any `R<n>` since both failures can't be
distinguished by a single test without also changing the other field, but is documented here so the
implementer and reviewer agree on it).

`update` calls it as `await assertNoOverlap(c.enrollmentId, nextDateFrom, nextDateTo, id)` right after
computing `nextDateFrom`/`nextDateTo` and calling `assertDateOrder` on them, before the
`reasonIds !== undefined ? await assertReasonIds(...) : undefined` line — same rationale, and it
naturally reuses the already-loaded `c.enrollmentId` from `findOwned`.

The join to `v_enrollments_detail` (rather than a second round-trip to `Enrollment`/`Student`/
`Guardian`) mirrors `findRoster`'s existing use of that view for the same three fields
(`full_name`/`guardian_name`/`guardian_phone`) — no new query shape is introduced.

The `$4::integer IS NULL OR c.id != $4` guard is what makes `excludeId` optional without a second SQL
string; `create` never passes it (a brand-new citation can't conflict with itself), `update` always
does.

## `error.middleware.ts` — forwarding `conflict`

Only the generic (final) branch changes — the Multer/duplicate-key/foreign-key branches above it are
untouched:

```ts
if (err instanceof Error) {
  if (err.message.includes('duplicate key') || err.message.includes('unique')) {
    res.status(409).json({ error: 'Registro duplicado', detail: err.message });
    return;
  }
  if (err.message.includes('violates foreign key')) {
    res.status(409).json({ error: 'Referencia inválida', detail: err.message });
    return;
  }
  const conflict = (err as HttpError & { conflict?: unknown }).conflict;
  res.status((err as HttpError).status ?? 500).json({
    error: err.message,
    ...(conflict !== undefined ? { conflict } : {}),
  });
  return;
}
```

`HttpError`'s interface gains an optional `conflict?: unknown` field alongside its existing
`status?: number`, matching how the file already types `status` loosely rather than introducing a
per-error-kind class hierarchy (see `docs/architecture.md`'s "Error handling" — the established
pattern across 52 call sites is a plain `Object.assign(new Error(...), { status })`; this only widens
that same convention to one more optional field, not a new mechanism).

## Validation order in `create`/`update`

1. `assertDateOrder` (own range sane) — unchanged, first.
2. `assertEnrollmentInScope` (enrollment exists, in tenant/course scope) — unchanged, second.
3. **`assertNoOverlap`** (new) — third, using the now-confirmed-in-scope `enrollmentId`.
4. `assertReasonIds` (reasons exist, in scope) — unchanged, fourth.
5. Transactional insert/update — unchanged, last.

Placing the overlap check before `assertReasonIds` means a request with both an invalid `reasonIds`
array *and* an overlapping date range reports the date conflict (`409`) rather than the reasons
error (`404`) — an arbitrary but now-fixed order, called out here since no single `R<n>` can test
both failures at once without conflating them.

## Discarded alternatives

1. **Enforce this with a Postgres exclusion constraint** (`EXCLUDE USING gist (enrollment_id WITH =,
   daterange(date_from, date_to, '[]') WITH &&) WHERE (status = 'pending' AND deleted_at IS NULL)`,
   requiring the `btree_gist` extension) instead of an application-level `SELECT` + throw. Rejected:
   this project's established pattern for "reject a request whose data conflicts with existing rows"
   is application-level validation with a friendly, translatable message (see `assertReasonIds`,
   `assertDateOrder`, and `report_conflicting_absence_type_on_create`'s `skippedDetails` approach) —
   `errorMiddleware` only auto-maps raw Postgres errors it can recognize by a stable message
   substring (`duplicate key`/`unique`, `violates foreign key`); a custom exclusion-constraint
   violation message is not one of those, so the DB error would either need a third
   message-substring branch added to `errorMiddleware` (coupling that shared file to citation-specific
   constraint wording) or would surface as an ugly raw `500`. It also cannot carry the
   student/guardian `conflict` payload R3 requires — Postgres constraint violation messages are
   plain text, not structured JSON. An app-level check trivially returns exactly the shape R3 needs.
   A DB-level constraint remains a reasonable defense-in-depth addition for concurrent double-submits
   (see "Flagged for the human reviewer" below) but is out of scope for this feature.
2. **Compare `time` in addition to the date range** (e.g. two citations only conflict if their
   `[dateFrom, dateTo]` ranges overlap *and* their `time` values are equal or both null). Rejected:
   the feature description frames this purely as a *date range* overlap ("reject a new date range
   overlapping an existing ... citation"), and `dateFrom`/`dateTo` already represent an inclusive
   multi-day window while `time` is a single optional instant inside it (not a range) — there is no
   well-defined way to compare "does this instant fall outside that other citation's window" that
   doesn't degenerate back into the same date-range check for the common single-day case. Comparing
   `time` would also let two `pending` citations be scheduled for the exact same multi-day range with
   different `time`s, silently pass validation, and still visually clash on any calendar/roster view
   that only renders by date. Flagged below for a second look in case the intent was actually
   same-day-different-time citations being allowed.
3. **Report all overlapping citations in an array** (`conflicts: [...]`) instead of a single
   `conflict` object (R5). Rejected: the acceptance criteria says "the conflicting citation's
   dates/time/student/representative" (singular), and every other `409`-with-detail precedent in
   this codebase (`errorMiddleware`'s `detail` field, `citations_crud_and_attachments`'s single-record
   responses) returns one focal record, not a list — a single, deterministically-chosen conflict
   (earliest `dateFrom`, then lowest `id`) is enough for the frontend counterpart
   (`citation_overlap_conflict_ui`) to render one clear message per its own acceptance criteria
   ("identifying the conflicting citation", singular).
4. **Skip the overlap check in `update` when the request body does not include `dateFrom`/`dateTo` at
   all** (only run it when the caller is actually trying to change dates). Rejected: `update` already
   runs `assertDateOrder` unconditionally on the *effective* range (whether or not `dateFrom`/`dateTo`
   is present in the body) — mirroring that same "always validate the effective range" shape for the
   overlap check keeps the two checks consistent and closes a gap where a legacy pending citation
   created *before* this feature shipped could otherwise never be caught by the new invariant. R7's
   self-exclusion (`excludeId`) is what makes this safe: an update that leaves dates untouched can
   never conflict with itself, only with a genuinely different overlapping citation.

## Flagged for the human reviewer

- **`time` is intentionally excluded from the overlap comparison** (discarded alternative #2 above).
  If the actual intent is to allow same-day citations at different times (e.g. a 9am and a 2pm
  meeting on the same date), this design would incorrectly block the second one — please confirm
  date-only overlap is what's wanted before implementation.
- **No DB-level constraint is added** (discarded alternative #1) — under concurrent double-submission
  (two requests for the same enrollment racing past the application-level check simultaneously) it is
  theoretically possible for two overlapping `pending` citations to both get created, since the
  `SELECT` + insert is not wrapped in a `SERIALIZABLE` transaction or protected by a row lock. This
  mirrors the existing codebase's general posture (e.g. `absences`' own `UNIQUE(enrollment_id, date)`
  constraint is a rare exception, not the norm) — flagged in case citation scheduling is high-traffic
  enough to warrant closing that race with a real constraint in a follow-up.
- **`conflict.guardianPhone` may be `null`** (an enrollment can have no `guardian_id`, per
  `v_enrollments_detail`'s `LEFT JOIN guardians`) — the frontend counterpart should handle a missing
  representative phone/name gracefully; this design does not substitute a placeholder string for it.
