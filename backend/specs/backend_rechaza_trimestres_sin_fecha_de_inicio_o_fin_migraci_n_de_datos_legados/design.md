# Design — Backend rechaza trimestres sin fecha de inicio o fin + migración de datos legados

See `docs/architecture.md` (controller/service separation, services-throw-not-respond, no
class-based services, central `errorMiddleware` mapping), `docs/conventions.md` (services as plain
`async function` modules, `Object.assign(new Error('...'), { status: 400 })` for client-facing
failures, no comments unless they explain a non-obvious *why*), and `docs/specs.md` (EARS,
`R<n>`/`T<n>` traceability, `mark-spec-ready` gate). See the sibling frontend mirror
`/home/rileo/ai-personal/frontend/specs/require_full_dates_on_quarters/` for the exact
client-side validation message and ordering this spec mirrors server-side.

The existing `src/services/quarter.service.ts` already exposes
`assertValidName`/`assertWithinAcademicYear`/`assertNoOverlap` as small throw-on-failure helpers
called from `create`/`update`; the new date-presence check slots into that same pattern, between
`assertValidName` and the existing range/overlap helpers (R5). The controller also gets a thin
pre-call presence check so an explicit `null` never reaches the service at all (defense-in-depth
per the user's request).

## Files to touch

| File | Change | Requirements |
|---|---|---|
| `postgres/19_quarters_softdelete_legacy_null_dates.sql` (new, monorepo-root `postgres/`, sibling to `17_quarters.sql` and `18_quarters_relax_constraints.sql`) | Idempotent soft-delete UPDATE per R1; uses `SET search_path TO attendance, public;` exactly like `17_quarters.sql` and `18_quarters_relax_constraints.sql`. | R1, R2 |
| `src/services/quarter.service.ts` | Add `assertValidDates(range: DateRange): void` helper that throws `Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 })` when `range.startDate` or `range.endDate` is `null`. Call it inside `create` (after `assertValidName`, before `assertWithinAcademicYear`/`assertNoOverlap`) and inside `update` (after the name/sequenceNumber setters, on the post-merge `range` built from `data.startDate ?? q.startDate`/`data.endDate ?? q.endDate`, before `assertWithinAcademicYear`/`assertNoOverlap`). No other public signatures change. | R3, R4, R5 |
| `src/controllers/quarter.controller.ts` | In the `POST` handler, after `requirePermission` and before `svc.create`, check that `req.body.startDate` and `req.body.endDate` are not `null`/`undefined`; if either is, `next(Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 }))` (matches the service helper's throw shape). In the `PUT` handler, after `requirePermission` and before `svc.update`, check that the request body does not explicitly send `startDate: null` or `endDate: null` (the body may still *omit* both keys — that case is intentionally left to the service's post-merge check); same throw shape if it does. Both checks are 2-line `if`s; they reuse the same Spanish message string so a future log/audit grep matches both layers. | R3, R4, R5 |
| `progress/impl_backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados.md` (new) | Traceability table mapping R1–R9 to the manual smoke tests in R8, per `docs/specs.md` traceability convention (same shape as `progress/impl_relax_quarter_naming_and_count_constraints.md`). | R8 |

The controller change is intentionally *not* a duplication of `assertValidDates`: the controller's
job is to reject the explicit-`null` case from the wire format before the service does any work,
and the service's job is to be the authoritative choke point that also catches the "legacy row,
body omits dates" case for `update`. Both throw with the same shape so `errorMiddleware` continues
to handle them identically.

## Exact code shape

`assertValidDates` (new helper in `quarter.service.ts`, mirrors the surrounding helpers' shape —
private, no export, throws on failure, returns `void` on success):

```ts
function assertValidDates(range: DateRange): void {
  if (range.startDate === null || range.endDate === null) {
    throw Object.assign(
      new Error('El período debe tener fecha de inicio y fecha de fin.'),
      { status: 400 }
    );
  }
}
```

`create` — new call inserted after `assertValidName` and before `assertWithinAcademicYear`:

```ts
const name = assertValidName(data.name);

return AppDataSource.transaction(async (em) => {
  // ...existing active-academic-year + sequenceNumber resolution unchanged...

  const range: DateRange = { startDate: data.startDate ?? null, endDate: data.endDate ?? null };
  assertValidDates(range);                                   // <-- new (R3, R5)
  assertWithinAcademicYear(ay, range);
  await assertNoOverlap(em, ay.id, null, range);
  // ...rest unchanged...
});
```

`update` — new call inserted after the name/sequenceNumber setters, on the post-merge `range`,
before `assertWithinAcademicYear`:

```ts
// existing: name + sequenceNumber setters
const range: DateRange = {
  startDate: data.startDate !== undefined ? data.startDate : q.startDate,
  endDate:   data.endDate   !== undefined ? data.endDate   : q.endDate,
};
assertValidDates(range);                                     // <-- new (R4, R5)
assertWithinAcademicYear(ay, range);
await assertNoOverlap(AppDataSource.manager, ay.id, q.id, range);
// ...rest unchanged...
```

Why `assertValidDates(range)` (post-merge) and not `assertValidDates(data)` directly in `update`:
R4 is about the **persisted** state, not the request body — a PUT that omits both dates but the
existing row already has both must continue to save, and a PUT that sends `{"endDate": null}`
against a row whose `startDate` is also already null must fail because the post-merge state still
has a null. The existing `range` already encodes the post-merge values; `assertValidDates(range)`
is the only place that satisfies R4 correctly without duplicating the merge logic.

Controller — `POST` handler, two new lines after `requirePermission` and before `svc.create`:

```ts
if (req.body.startDate == null || req.body.endDate == null) {
  return next(Object.assign(
    new Error('El período debe tener fecha de inicio y fecha de fin.'),
    { status: 400 }
  ));
}
```

Controller — `PUT` handler, two new lines after `requirePermission` and before `svc.update`. The
check is intentionally `=== null` only (not `== null`) so an omitted key is **not** rejected here —
the service's post-merge check owns the "legacy row, body omits dates" case (R4):

```ts
if (req.body.startDate === null || req.body.endDate === null) {
  return next(Object.assign(
    new Error('El período debe tener fecha de inicio y fecha de fin.'),
    { status: 400 }
  ));
}
```

## Migration (`19_quarters_softdelete_legacy_null_dates.sql`) shape

One UPDATE, matching the `SET search_path` + statement style of `17_quarters.sql` and
`18_quarters_relax_constraints.sql` (no explicit `BEGIN`/`COMMIT` — a single `UPDATE` is
atomic in Postgres by default). Soft-deletes every active quarter whose `start_date` or
`end_date` is null; leaves `name`, `sequence_number`, and `academic_year_id` untouched so the
soft-deleted row remains identifiable in audit / data-fix queries:

```sql
-- Soft-delete every quarter that has null start_date or end_date; the dates are
-- unrecoverable (no inference), so these rows are removed from the active set.
-- See spec §R1/R2.
SET search_path TO attendance, public;

UPDATE quarters
SET deleted_at = NOW(), is_active = false
WHERE deleted_at IS NULL
  AND (start_date IS NULL OR end_date IS NULL);

-- R2 post-condition (run separately by the implementer as the verification step):
-- SELECT count(*) FROM quarters WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS NULL);
-- expected: 0
```

The migration is idempotent because `WHERE deleted_at IS NULL` is no longer satisfied after the
first application: any row that would be soft-deleted already has `deleted_at IS NOT NULL`, so a
second `psql` application matches zero rows. The implementer can confirm this in T1's smoke run
by re-applying the script and observing zero rows updated.

## Verification approach

`pnpm run build` (R9, Level 1 per `docs/verification.md`). There is no automated test suite in
this project yet (see `docs/verification.md` and `docs/conventions.md`'s Tests section), so R3/R4/R6/R7
are verified by Level 2/3 manual smoke tests in `progress/impl_*.md`, same convention as feature
3's `progress/impl_relax_quarter_naming_and_count_constraints.md`. The implementer exercises R8's
seven cases against `docker compose up --build`, including applying
`postgres/19_quarters_softdelete_legacy_null_dates.sql` via `psql` against a database that has at
least one institution with a mix of dated and null-dated quarters, and confirming the
post-condition query returns 0.

## Discarded alternatives

1. **Add a `CHECK (start_date IS NOT NULL AND end_date IS NOT NULL)` constraint to the `quarters`
   table in the same migration (defense-in-depth at the DB level).** Rejected: the service layer
   is already the single point of mutation for this table — every write goes through
   `create()`/`update()`, both of which will validate (R3/R4). Adding a CHECK constraint
   duplicates the invariant in two places and creates ordering coupling between the data-fix
   migration (R1) and the structural change: the migration's soft-delete branch must run before
   the constraint is added, otherwise the constraint fires on the very rows the migration is
   trying to soft-delete. Keeping the columns nullable matches the existing schema (17/18 don't
   add NOT NULL either), keeps the migration self-contained, and the service+controller checks
   are already sufficient because there is no other write path. If a future feature needs to
   lock the invariant at the DB level for non-service callers, it can do so then, on its own
   migration.
2. **Run the date-presence check only in `quarter.controller.ts` (skip the service-layer
   check).** Rejected: this would mean a future caller that bypasses the controller (e.g. a
   future `seedQuarters`-style internal entrypoint, or a `seedQuarters` import that already
   exists in the repo) could reintroduce null dates; the service layer is the authoritative
   choke point. The controller check is the *first* gate; the service check is the *last* gate.
   Both run, in that order.
3. **Infer dates by partitioning `academic_year.start_date..end_date` into N slices by
   `sequence_number`, then soft-delete only what cannot be inferred.** Rejected: a quarter's
   intended dates carry semantic meaning ("Q1 of the 2026 academic year starts the day classes
   resume, not necessarily Jan 1") that no purely-arithmetic partition can recover. Inferring
   wrong dates silently is worse than not having the row at all: the institution would later
   try to edit a quarter that has dates it never agreed to. Soft-delete is reversible (the
   row stays in the table with `deleted_at` set, the institution can see what was removed and
   ask for a manual restore if needed); inferring wrong dates is not. Keeping the migration
   minimal — soft-delete only — also makes it trivially idempotent and reviewable.
4. **Have the migration leave `start_date`/`end_date` null and let the new controller+service
   checks fail all subsequent edits to those rows, on the rationale that "the institution can
   re-enter the dates manually".** Rejected: that would lock the institution out of editing a
   quarter whose dates were never entered (the dialog already blocks saving in that state
   pre-migration, per the sibling frontend feature), and the only way out would be a direct
   SQL update — a worse user experience than inferring-or-soft-deleting, which is the whole
   point of A0. Even with the controller check in front, the *server* still can't save a
   quarter that lacks both dates, so an institution that "just enters the dates" still
   can't without a SQL hand-fix.

## Assumptions verified while drafting

- The quarter resource already uses `authMiddleware` + `institutionMiddleware` + `requirePermission`
  (`src/controllers/quarter.controller.ts` line 7-9, line 11-25). R3/R4 therefore inherit
  tenant-scoping and permission gating unchanged — no new middleware wiring, no new
  `req.institutionId` plumbing.
- `errorMiddleware` already maps `Error` with `status: 400` to HTTP 400
  (`docs/architecture.md` §3, `docs/conventions.md` Error Handling). The new throws in both
  controller and service are consumed unchanged.
- The frontend dialog's exact error message is
  `El período debe tener fecha de inicio y fecha de fin.` (frontend mirror spec R1). Both
  layers use that same string verbatim, so the dialog and the API surface the same message and
  a future log/audit grep will match both sides.
- `assertWithinAcademicYear`/`assertNoOverlap` already short-circuit when `range.startDate` or
  `range.endDate` is null (lines 26 and 41 of `quarter.service.ts`). With R5's order, the new
  `assertValidDates` runs first and rejects those cases before those helpers ever see them, so
  their internal null-guards remain load-bearing only for the pre-validation code path
  (e.g. `assertQuartersFitAcademicYearRange`, which is called from
  `academic-year.service.ts#update` and intentionally must remain null-tolerant — out of scope).
