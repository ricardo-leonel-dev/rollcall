# Design — Export endpoint accepts quarter selection

See `docs/architecture.md` (layers, error-handling convention, institution-scoping rules) and
`docs/conventions.md` (naming, thrown-error shape) for the baseline this design builds on. This
feature only adds a new optional query parameter and its validation/forwarding path — it does not
change the shape of the existing `date_from`/`date_to`/`course_ids`/`academic_year_id` handling, and
it does not touch `excel-service` (a separate Go project); it only sends the two new query parameters
(`quarter_sequence`, `quarter_name`) that `excel-service`'s own pending feature
`export_selects_the_correct_trimester_sheet` documents as the parameters it will read.

## Files to touch

| File | Change |
|---|---|
| `src/services/quarter.service.ts` | Add an exported `findByIdForActiveYear(institutionId: number, quarterId: number): Promise<Quarter>` helper (R3, R4). |
| `src/services/export.service.ts` | Add an optional `quarterId?: number` parameter to `exportExcel(...)`. When supplied, resolve it via `quarter.service.ts#findByIdForActiveYear`, validate it against the request's `academicYearId` (R5), and append `quarter_sequence`/`quarter_name` to the `excel-service` URL (R6, R7). When omitted, URL construction is byte-for-byte unchanged (R1). |
| `src/controllers/export.controller.ts` | Parse the optional `quarter_id` query parameter, validate it is a positive integer (R2), and pass it through to `svc.exportExcel(...)`. |

No entity, migration, or route-mounting change — `Quarter` (feature 1) already has every column this
feature needs (`id`, `academicYearId`, `institutionId`, `name`, `sequenceNumber`, `deletedAt`), and
`GET /api/export/excel` is already mounted and permission-checked.

## `src/services/quarter.service.ts`

```ts
// Reuses findActiveAcademicYear (already used by findAllForActiveYear/create/update) so a caller
// with no active academic year gets the exact same 404 ('No hay año lectivo activo') as every other
// quarter-scoped operation, instead of a new, differently-worded error path.
export async function findByIdForActiveYear(institutionId: number, quarterId: number): Promise<Quarter> {
  const ay = await findActiveAcademicYear(institutionId);
  const q = await repo().findOne({
    where: { id: quarterId, academicYearId: ay.id, institutionId, deletedAt: IsNull() },
  });
  if (!q) throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });
  return q;
}
```

This is the same single-query shape `update()` already uses two lines above it in the same file
(`repo().findOne({ where: { id, academicYearId: ay.id, institutionId, deletedAt: IsNull() } })`) — no
new query pattern introduced. `institutionId` and `deletedAt: IsNull()` in the same `where` cover R4's
"belongs to the institution" and "non-deleted" clauses in one round trip; `academicYearId: ay.id`
(the *active* year, resolved server-side, never client-supplied) covers "belongs to the active
academic year".

## `src/services/export.service.ts`

```ts
import * as quarterService from './quarter.service';

export async function exportExcel(
  institutionId: number,
  courseIds: number[],
  academicYearId: number,
  dateFrom: string,
  dateTo: string,
  signers: Signer[] = [],
  quarterId?: number,
): Promise<Response> {
  const signersParam = signers.length
    ? '&signers=' + encodeURIComponent(JSON.stringify(signers))
    : '';

  let quarterParam = '';
  if (quarterId !== undefined) {
    const quarter = await quarterService.findByIdForActiveYear(institutionId, quarterId); // R3, R4
    if (quarter.academicYearId !== academicYearId) { // R5
      throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });
    }
    quarterParam = `&quarter_sequence=${quarter.sequenceNumber}&quarter_name=${encodeURIComponent(quarter.name)}`; // R6
  }

  const url = `${EXCEL_URL()}/export/excel?institution_id=${institutionId}&course_ids=${courseIds.join(',')}&academic_year_id=${academicYearId}&date_from=${dateFrom}&date_to=${dateTo}${signersParam}${quarterParam}`; // R1, R7
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`Error en excel-service: ${text}`), { status: resp.status });
  }
  return resp;
}
```

The R5 mismatch check reuses the same `'Trimestre no encontrado'` message as R4 (rather than a
different "quarter belongs to a different year" message) — from the caller's point of view both are
"the `quarter_id` you gave me doesn't resolve for this export request," and the codebase's existing
`Course`/`AcademicYear` ownership checks (`enrollment.service.ts`) use the same one-message-per-
resource-type pattern rather than distinguishing "doesn't exist" from "exists but not yours."

## `src/controllers/export.controller.ts`

```ts
const { course_ids, academic_year_id, date_from, date_to, quarter_id } = req.query as Record<string, string>;
// ...existing course_ids/academic_year_id/date_from/date_to checks, unchanged...

let quarterId: number | undefined;
if (quarter_id !== undefined) {
  quarterId = parseInt(quarter_id, 10);
  if (isNaN(quarterId) || quarterId <= 0) { // R2
    res.status(400).json({ error: 'quarter_id debe ser un entero positivo' });
    return;
  }
}

const signers = await getSigners(req.institutionId);
const ocrResp = await svc.exportExcel(req.institutionId, courseIds, +academic_year_id, date_from, date_to, signers, quarterId);
```

Format validation (`isNaN`/`<= 0`) stays in the controller, matching this exact file's existing
`course_ids` parsing (also done inline in the controller, not delegated to a service) — see "Discarded
alternatives" below for why the *ownership* check is not also done here. `req.courseIds` (the
per-course scoping filter) is not consulted for `quarter_id` — quarters are institution/academic-year
scoped, not course-scoped, so there is nothing course-level to check, unlike the existing `course_ids`
validation a few lines above.

## Discarded alternatives

1. **Validate `quarter_id` ownership directly in the controller with a raw
   `AppDataSource.query()`/repo call, instead of adding `quarter.service.ts#findByIdForActiveYear`.**
   Rejected: `docs/architecture.md` is explicit that controllers are "thin ... No business logic
   here" and all DB reads belong in `services/`. It would also duplicate the exact lookup shape
   `quarter.service.ts#update` already has, instead of reusing it.
2. **Only check that the resolved quarter belongs to the institution's active academic year (R3, R4),
   without comparing it against the request's own `academic_year_id` query parameter (R5).**
   Rejected: `GET /api/export/excel` already accepts `academic_year_id` as an independent,
   client-supplied parameter that is never itself validated against "the active year." Without R5, a
   caller could supply a `quarter_id` from the active year alongside an unrelated `academic_year_id`
   (e.g. a stale or historical one), and the export would silently carry a quarter label that doesn't
   correspond to the exported data's actual year. The extra check is one integer comparison on an
   already-fetched row — no new query — and turns a silent mismatch into an explicit 404.
3. **Allow `quarter_id` to reference any of the institution's academic years, not just the active
   one, via `repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } })` (no
   `academicYearId` filter) and drop R5 in favor of trusting whatever year the quarter itself
   belongs to.** Rejected: no existing endpoint in this codebase exposes quarters of a non-active
   academic year — `GET /api/quarters` (feature 1) only ever lists the active year's quarters, and
   `quarter.service.ts` has no "by academic year" lookup today. Introducing implicit historical-quarter
   support as a side effect of the export endpoint, with no corresponding way to *list* those quarters
   first, would be a capability not requested by this feature's acceptance criteria (it explicitly
   scopes validation to "the requesting institution's active academic year"). If historical exports
   ever need this, it should be its own feature extending `quarter.service.ts` broadly, not a one-off
   carve-out inside `export.service.ts`.
4. **Send only `quarter_name` (not `quarter_sequence`) to `excel-service`, relying on name-to-sheet
   matching.** Rejected: `excel-service`'s own pending sibling feature
   (`export_selects_the_correct_trimester_sheet`, `excel-service/state/features/001-*.md`) documents
   its handler as accepting "a trimester indicator (`quarter_sequence` and/or `quarter_name`)" —
   sending both lets that side match on whichever is more robust (sequence order isn't sensitive to
   exact name/diacritics matching the template's sheet names) without this feature needing to guess
   which one it will actually use.
5. **Respond with HTTP 403 instead of 404 for an out-of-scope `quarter_id` (R3–R5), per the task
   description's "return 403/404."** Rejected in favor of 404 only: this exact controller already
   returns 404 (`'Course not found'`) for a `course_ids` value outside the caller's scope, and every
   other cross-tenant ownership check in this codebase (`enrollment.service.ts`'s `Course`/
   `AcademicYear`/`Guardian` lookups) uses 404, never 403, to avoid confirming a resource's existence
   in another tenant. The only 403 in the codebase today (`user.service.ts`, superadmin role
   assignment) is an unrelated privilege-escalation check, not a tenant-scoping one — not a precedent
   to extend here.
