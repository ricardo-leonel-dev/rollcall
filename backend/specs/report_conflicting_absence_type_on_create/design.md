# Design — Reportar conflicto de tipo al crear ausencias en un rango

See `docs/architecture.md` (services own business logic and throw, controllers are thin
pass-throughs) and `docs/conventions.md` (services are plain `async function` modules, camelCase
TS properties over snake_case DB columns, no comments unless they explain a non-obvious *why*).
No test framework exists in this project yet (`docs/conventions.md`'s Tests section,
`docs/verification.md`), so R8 is verified by a documented manual smoke test, the same convention
already used by `specs/backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados/`.

## Files to touch

| File | Change | Requirements |
|---|---|---|
| `src/services/absence.service.ts` | `createRange`'s existing-rows query gains `type`; build a `Map<date, existingType>` alongside the existing `existingDates` `Set`; after determining `toCreate`/`toRestore`/`toInsert` (unchanged), derive `skippedDetails` from the dates in `existingDates` (i.e. `days.filter(d => existingDates.has(d))`, which is exactly `days` minus `toCreate`); return `skippedDetails` alongside the existing `created`/`skipped` fields. Return type widened accordingly. | R1–R7, R9 |
| `src/controllers/absence.controller.ts` | No change needed — the `POST /` handler already does `res.status(201).json(await svc.createRange(...))`, so it forwards whatever shape the service returns. | (none — verified unchanged by inspection) |
| `progress/impl_report_conflicting_absence_type_on_create.md` (new) | Traceability table mapping R1–R9 to the manual smoke test cases in R8, per `docs/specs.md`'s traceability convention. | R8 |

## Exact code shape

Current `createRange` (relevant excerpt, `src/services/absence.service.ts`):

```ts
const existingRows = await AppDataSource.query(
  `SELECT date::text AS date FROM absences WHERE enrollment_id = $1 AND date = ANY($2) AND deleted_at IS NULL`,
  [data.enrollmentId, days]
);
const existingDates = new Set(existingRows.map((r: { date: string }) => r.date));
const toCreate = days.filter(d => !existingDates.has(d));
```

New shape — widen the `SELECT` to also fetch `type`, and build a `Map` from it instead of (or
alongside) the `Set`, since `existingDates` is still needed for the `toCreate` filter and for
`.has()` checks elsewhere:

```ts
const existingRows = await AppDataSource.query(
  `SELECT date::text AS date, type FROM absences WHERE enrollment_id = $1 AND date = ANY($2) AND deleted_at IS NULL`,
  [data.enrollmentId, days]
);
const existingTypeByDate = new Map<string, 'F' | 'AT'>(
  existingRows.map((r: { date: string; type: 'F' | 'AT' }) => [r.date, r.type])
);
const existingDates = new Set(existingTypeByDate.keys());
const toCreate = days.filter(d => !existingDates.has(d));
```

`existingDates`'s only remaining consumers are unchanged (`toCreate` filter, `softDeletedRows`
query source list, `toRestore`/`toInsert` split) — it is left in place rather than replaced by
`existingTypeByDate.has(...)` everywhere, to keep the diff to the two touched lines instead of
rewriting call sites that don't need to change.

`skippedDetails` construction, placed right after `toCreate` is computed (order doesn't matter
functionally since it only reads `existingTypeByDate`/`data.type`, but grouping it with the other
`existingDates`-derived values keeps the function's data-flow readable):

```ts
const skippedDetails = days
  .filter(d => existingDates.has(d))
  .map(date => {
    const existingType = existingTypeByDate.get(date)!;
    return { date, existingType, conflict: existingType !== data.type };
  });
```

This is deliberately derived from `days.filter(...)`, not from `toCreate`'s complement or a
separate loop over `existingRows` — `days` is already in ascending chronological order (R6), and
filtering it directly means `skippedDetails` can never drift out of sync with `skipped`'s count
(`days.length - toCreate.length`, R5) since both are built from the same `existingDates` set.

Final return statement:

```ts
return {
  created: toCreate.length,
  skipped: days.length - toCreate.length,
  skippedDetails,
};
```

Return type annotation on the function signature:

```ts
export async function createRange(institutionId: number, courseIds: number[] | null, data: {
  enrollmentId: number; type: 'F' | 'AT'; dateFrom: string; dateTo: string; notes?: string;
}, createdByUserId: number | null = null): Promise<{
  created: number;
  skipped: number;
  skippedDetails: Array<{ date: string; existingType: 'F' | 'AT'; conflict: boolean }>;
}> {
```

Nothing else in `createRange` changes: the soft-delete-restore vs. fresh-insert split
(`toRestore`/`toInsert`), the transaction, and the `UNIQUE(enrollment_id, date)` constraint are
all untouched, satisfying the "no modification to soft-delete/restore behavior" acceptance bullet
by construction — `skippedDetails` only reads from `existingTypeByDate`, it never influences which
dates get restored vs. inserted vs. skipped.

## Verification approach

`pnpm run build` (R9, Level 1 per `docs/verification.md`). R1–R7 are verified via Level 2/3 manual
smoke tests against a running stack (`docker compose up --build`), documented in
`progress/impl_report_conflicting_absence_type_on_create.md`'s Traceability section with the
actual request/response bodies observed for each of R8's four cases (same-type skip,
different-type skip, mixed range, soft-delete restore non-regression).

## Discarded alternatives

1. **Split `skipped` into two separate counters (e.g. `skippedSameType` / `skippedConflict`)
   instead of an itemized `skippedDetails` array, leaving the per-date `existingType` out of the
   response entirely.** Rejected: the acceptance criteria explicitly asks for the existing `type`
   *per date*, not just an aggregate count — a caller with a 10-business-day range containing one
   conflicting date needs to know *which* date conflicts (and with what type) to build a useful
   warning message ("ya existe un atraso el 2026-09-03"), not just "1 of your dates conflicted".
   Two counters would also still leave `created`/`skipped` needing separate handling from any new
   fields, with no net simplicity gain over a single itemized array.
2. **Return an HTTP 409 (or otherwise error out) when any conflicting date is found, instead of
   still creating the non-conflicting dates and reporting conflicts in the response body.**
   Rejected: this would change `createRange`'s existing partial-success semantics for the *entire*
   range — today a caller can request a 20-day range where 18 days are free and 2 already have
   absences, and the 18 free days still get created (`created: 18, skipped: 2`). Turning any
   conflict into a hard failure would be a breaking behavior change for existing callers relying
   on partial creation, not just an additive extension — well outside the acceptance criteria,
   which asks only to make the existing `skipped` bucket more informative.
3. **Add a `conflicts: string[]` array of just the conflicting dates (omitting `existingType` and
   the same-type-skip dates), on the theory that only real conflicts matter to the frontend.**
   Rejected: this loses the same-type/idempotent-skip information entirely, which the acceptance
   criteria asks to distinguish ("para que el frontend pueda avisar... que debe eliminar el
   registro existente antes de crear un tipo distinto el mismo día" implies the frontend also
   needs to *not* warn on the idempotent case, which it can only do by knowing it happened and
   that it wasn't a conflict) — a caller reading only `skipped` would otherwise be unable to tell
   "nothing to report, this day was already exactly what you asked for" from "silently dropped,
   no detail at all" for those dates.

## Assumptions verified while drafting

- `POST /api/absences` (`src/controllers/absence.controller.ts` line 23) passes `req.body`
  straight through to `svc.createRange` and returns whatever it resolves to as the 201 body — no
  controller-level response shaping to update.
- `type` on `Absence` (`src/entities/Absence.ts` line 18-19) is `'F' | 'AT'`, the same union
  `createRange`'s `data.type` parameter already uses — `existingType` can reuse that exact type,
  no new type alias needed.
- The `UNIQUE(enrollmentId, date)` constraint (`src/entities/Absence.ts` line 4) is why a
  different-type conflict can never be silently created today — this is enforced at the DB level
  already and is out of scope to change; this feature is purely about *reporting* the existing
  skip more precisely, not changing which dates get created vs. skipped.
