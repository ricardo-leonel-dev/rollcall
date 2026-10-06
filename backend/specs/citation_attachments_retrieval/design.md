# Design — Citation attachments retrieval

## Files to touch

### Edited (only one file — no other file changes in scope)
- `src/services/citation.service.ts`:
  - `CITATION_FIELDS_SQL` (used by `findByEnrollment`) — add an `attachments` correlated `json_agg`
    subquery, alongside the existing `reasonIds` one.
  - `findByEnrollment` — after the query, `.map()` each row to attach a computed `url` per
    attachment via the existing `attachmentUrl` helper (mirrors `justification.service.ts#findAll`'s
    post-processing step for `justification_attachments`).
  - `findRoster` — add the same `attachments` subquery inside the nested per-citation
    `json_build_object(...)`, and `.map()` each roster row's `citations` array (and each citation's
    `attachments` array within it) to attach `url` the same way.

No entity, migration, controller, route, or permission changes — `citation_attachments` (see
`postgres/21_citation_reasons.sql`) and the upload/delete code path (`addAttachments`/
`removeAttachment` in `citation.service.ts`, `POST`/`DELETE .../attachments...` in
`citation.controller.ts`) are untouched by this feature (R6, R7).

## `CITATION_FIELDS_SQL` (new)

```ts
const CITATION_FIELDS_SQL = `
  c.id, c.date_from::text AS "dateFrom", c.date_to::text AS "dateTo", c.time,
  c.status, c.observations, c.closed_at AS "closedAt", c.closed_by_user_id AS "closedByUserId",
  c.created_by_user_id AS "createdByUserId", c.created_at AS "createdAt",
  COALESCE((
    SELECT json_agg(ccr.citation_reason_id)
    FROM citation_citation_reasons ccr
    WHERE ccr.citation_id = c.id
  ), '[]') AS "reasonIds",
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', att.id, 'fileName', att.file_name, 'originalName', att.original_name,
      'mimeType', att.mime_type, 'createdAt', att.created_at
    ) ORDER BY att.created_at ASC)
    FROM citation_attachments att
    WHERE att.citation_id = c.id
  ), '[]') AS "attachments"
`;
```

`url` is deliberately **not** computed in this SQL fragment — see "Discarded alternatives" #1 — it is
added afterward in JS via the existing `attachmentUrl` helper, same division of labor
`justification.service.ts` already uses.

## `findByEnrollment` (new)

```ts
export async function findByEnrollment(institutionId: number, courseIds: number[] | null, enrollmentId: number, status?: string) {
  if (status !== undefined && !['pending', 'closed'].includes(status)) {
    throw Object.assign(new Error("status debe ser 'pending' o 'closed'"), { status: 400 });
  }
  await assertEnrollmentInScope(institutionId, courseIds, enrollmentId);

  const conditions = ['c.enrollment_id = $1', 'c.deleted_at IS NULL'];
  const params: any[] = [enrollmentId];
  if (status) { conditions.push(`c.status = $2`); params.push(status); }

  const rows = await AppDataSource.query(
    `SELECT ${CITATION_FIELDS_SQL} FROM citations c WHERE ${conditions.join(' AND ')} ORDER BY c.date_from DESC`,
    params
  );
  return rows.map((r: any) => ({
    ...r,
    attachments: r.attachments.map((a: any) => ({ ...a, url: attachmentUrl(a.fileName) })),
  }));
}
```

Only the trailing `return AppDataSource.query(...)` becomes `const rows = await AppDataSource.query(...)`
plus the `.map()` — the query's `SELECT`/`WHERE`/params are otherwise unchanged (R5).

## `findRoster` (new)

```ts
export async function findRoster(institutionId: number, courseIds: number[] | null, courseId: number, academicYearId: number) {
  if (courseIds !== null && !courseIds.includes(courseId)) {
    throw Object.assign(new Error('Course not found'), { status: 404 });
  }
  const sql = `
    SELECT
      v.enrollment_id AS "enrollmentId",
      v.roster_number AS "rosterNumber",
      v.full_name AS "studentName",
      v.guardian_id AS "guardianId",
      v.guardian_name AS "guardianName",
      v.guardian_phone AS "guardianPhone",
      v.whatsapp_link AS "whatsappLink",
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', c.id, 'dateFrom', c.date_from, 'dateTo', c.date_to, 'time', c.time,
          'status', c.status, 'observations', c.observations,
          'closedAt', c.closed_at, 'closedByUserId', c.closed_by_user_id,
          'createdByUserId', c.created_by_user_id, 'createdAt', c.created_at,
          'reasonIds', COALESCE((
            SELECT json_agg(ccr.citation_reason_id)
            FROM citation_citation_reasons ccr WHERE ccr.citation_id = c.id
          ), '[]'),
          'attachments', COALESCE((
            SELECT json_agg(json_build_object(
              'id', att.id, 'fileName', att.file_name, 'originalName', att.original_name,
              'mimeType', att.mime_type, 'createdAt', att.created_at
            ) ORDER BY att.created_at ASC)
            FROM citation_attachments att WHERE att.citation_id = c.id
          ), '[]')
        ) ORDER BY c.date_from DESC)
        FROM citations c
        WHERE c.enrollment_id = v.enrollment_id AND c.deleted_at IS NULL
      ), '[]') AS citations
    FROM v_enrollments_detail v
    WHERE v.institution_id = $1 AND v.course_id = $2 AND v.academic_year_id = $3
    ORDER BY v.roster_number
  `;
  const rows = await AppDataSource.query(sql, [institutionId, courseId, academicYearId]);
  return rows.map((r: any) => ({
    ...r,
    citations: r.citations.map((c: any) => ({
      ...c,
      attachments: c.attachments.map((a: any) => ({ ...a, url: attachmentUrl(a.fileName) })),
    })),
  }));
}
```

Only the added `'attachments', COALESCE(...)` key inside the citation `json_build_object` and the
trailing `.map()` (two levels: roster row -> `citations` -> `attachments`) are new — every other
field/param/condition is unchanged (R5).

## Discarded alternatives

1. **Compute `url` via SQL string concatenation** (`'/api/uploads/citaciones/' || att.file_name`)
   directly inside the `json_build_object` subqueries, instead of a JS-side `.map()` afterward.
   Rejected: this would duplicate the upload-path literal in two SQL locations (once in
   `CITATION_FIELDS_SQL`, once in `findRoster`) in addition to the existing `attachmentUrl` JS helper,
   and it diverges from `justification.service.ts#findAll`'s established pattern, which always
   computes `url` via a JS `.map()` after the query returns, never inline in SQL. Keeping URL
   construction in the single existing `attachmentUrl` function is more maintainable if the upload
   route prefix or directory name ever changes.

2. **Add a new dedicated endpoint** (e.g. `GET /api/citations/:id/attachments`) instead of embedding
   attachments in `findByEnrollment`/`findRoster`. Rejected: not requested by this feature's
   acceptance criteria, which only asks that `findByEnrollment` and `findRoster` include an
   `attachments` array per citation; the feature description's mention of a missing `GET /:id`
   endpoint is background context explaining why attachments were previously invisible, not a
   requirement of this feature. A new endpoint would also need its own permission story and route
   placement this feature's scope doesn't cover — worth a future feature if a standalone
   attachments-listing endpoint turns out to be needed independently of the two existing list views.

3. **Filter attachments with a `deleted_at IS NULL` condition**, mirroring the soft-delete convention
   used for `citations` themselves and most other entities in this codebase (`docs/architecture.md`'s
   "Rows are never hard deleted" rule). Rejected: `citation_attachments`
   (`postgres/21_citation_reasons.sql`) has no `deleted_at` column at all — `removeAttachment` already
   hard-deletes the row (`attRepo().remove(att)`), a deliberate exception documented in feature #10's
   own design (attachments are a supporting file record, not an audit-trail row like `citations`
   itself). Adding a `deleted_at` column here would be an unrelated schema change outside this
   feature's scope; there is nothing to filter since a removed row is simply gone (R9).

## Flagged for the human reviewer

- The feature's acceptance criteria describes the desired attachment fields as
  `id, file_name, original_name, mime_type, url` (snake_case). This design instead uses
  **camelCase** (`fileName`, `originalName`, `mimeType`) to match every other field this API already
  returns (`dateFrom`, `closedAt`, `createdByUserId`, ...) and `justification.service.ts`'s existing
  `attachments` shape (`fileName`/`originalName`/`mimeType`/`url`), which the frontend's
  `citation_evidence_reload` feature is expected to consume. The acceptance criteria's snake_case
  listing reads as shorthand for the underlying DB column names rather than a literal wire-format
  requirement — please confirm this interpretation before implementation, since the frontend feature
  this unblocks has not been implemented yet and its exact expected field names could not be
  cross-checked in this repository.
