# Design — Citations CRUD, attachments, and pending-detection

## Dependency on feature #9 (`citation_reasons_management`)

This feature's code only compiles and runs once feature #9 is implemented: its
`src/entities/{Citation,CitationCitationReason,CitationAttachment}.ts` files must exist and be
registered in `src/data-source.ts`, and its migration (`postgres/21_citation_reasons.sql`, per that
feature's `design.md` — see that feature's "Migration numbering" note for why it's `21`, not `20`)
must have created the `citations`, `citation_citation_reasons`, and `citation_attachments` tables.
Feature #9's `design.md` already documents this: "No edits to `Citation`/`CitationCitationReason`/
`CitationAttachment` beyond creating the entity files — they have no service/controller in this
feature (see feature #10, `citations_crud_and_attachments` ...)". **This feature adds zero new
entity files** — it only imports the three entities feature #9 already defines.

If, when this feature is claimed for implementation, feature #9 is not yet `done` (entities not on
disk, migration not applied), this is a **same-repo sequencing dependency**, not a cross-project one
— `AGENTS.md` §8's `block`/Notion flow does not apply here. The correct move is to implement and
land feature #9 first (or, if instructed to proceed anyway, report the ordering problem via
`append-log` rather than duplicating feature #9's entities/migration into this feature's own files).

## Files to touch

### New
- `src/services/citation.service.ts` — `findRoster`, `findByEnrollment`, `create`, `update`,
  `close`, `remove`, `addAttachments`, `removeAttachment` (+ private validation helpers), mirroring
  `justification.service.ts`'s shape (raw-SQL nested listing + repo-based CRUD + attachment
  hard-delete-row-and-unlink pattern) and `absence.service.ts`'s `assertEnrollmentInScope` helper.
- `src/controllers/citation.controller.ts` — thin router mirroring `justification.controller.ts`'s
  exact shape, including its multer setup (storage config, `ALLOWED_MIME`, limits) verbatim except
  for the upload directory name.
- `postgres/22_citations_permissions.sql` (see "Migration numbering" below) — seeds `role_permissions`
  for the new `citaciones` resource (R30, R31). No schema DDL: all four tables already exist after
  feature #9's migration, and no additional index is needed (see "Discarded alternatives" #2 for
  why).

### Edited
- `src/routes/index.ts` — import and mount `citationRouter` at `/citations` (R33).
- `src/services/user.service.ts` — add `'citations'` to `MODULE_KEYS` (R32).
- `src/app.ts` — create `uploads/citaciones` on startup, next to the existing `avatarsDir`/
  `logosDir`/`justificationsDir` bootstrap (R34).

## Migration numbering

Same situation feature #9's `design.md` already documented for itself: `postgres/` on disk currently
tops out at `19_quarters_softdelete_legacy_null_dates.sql`; feature #8 reserves `20_...` in its own
spec but that file doesn't exist yet; feature #9 reserves `21_citation_reasons.sql` in its own spec
but that file *also* doesn't exist yet (feature #9 is `spec_ready`, not yet implemented, as of this
writing). This feature's migration is therefore tentatively `22_citations_permissions.sql` — the
next number after feature #9's reserved `21`. **Whichever of #8/#9/#10 is actually implemented
first must re-check `ls postgres/` for the real highest-numbered file on disk before writing its
migration, and take the next free number if its reserved one is already taken (by a third feature
landing first) or already written with different content** — same caveat feature #9's `design.md`
already states, repeated here because it applies symmetrically to this feature's own number. This
migration has no `CREATE TABLE`/`ALTER TABLE`, only an `INSERT ... SELECT` into the pre-existing
`role_permissions` table, so it has **no ordering dependency on feature #9's migration actually
having run first** — it would succeed even if applied before `21_citation_reasons.sql`, since
`role_permissions` has no foreign key to any `citaciones`-schema table. The sequencing dependency
that matters is the *code* (entities/service/controller), not this migration file.

## Migration (`22_citations_permissions.sql`)

```sql
SET search_path TO attendance, public;

INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT id, 'citaciones', TRUE, TRUE, TRUE, TRUE
FROM roles
WHERE name IN ('admin', 'rector', 'superadmin', 'inspector de apoyo', 'inspector general')
ON CONFLICT (role_id, resource) DO NOTHING;
```

Role names are the *current* ones after migration `09_inspector_apoyo_general.sql` renamed
`inspector` -> `inspector de apoyo` and added `inspector general` — there is no role literally named
`inspector` in this schema anymore. See "Flagged for the human reviewer" below: the acceptance
criteria's shorthand "inspector/inspector-general" is interpreted as these two exact role names.

## Service (`citation.service.ts`)

```ts
import { AppDataSource } from '../data-source';
import { In, IsNull } from 'typeorm';
import { Citation } from '../entities/Citation';
import { CitationCitationReason } from '../entities/CitationCitationReason';
import { CitationAttachment } from '../entities/CitationAttachment';
import { CitationReason } from '../entities/CitationReason';
import { Enrollment } from '../entities/Enrollment';
import fs from 'fs';
import path from 'path';

const repo = () => AppDataSource.getRepository(Citation);
const ccrRepo = () => AppDataSource.getRepository(CitationCitationReason);
const attRepo = () => AppDataSource.getRepository(CitationAttachment);

const ATTACHMENTS_DIR = path.join(process.cwd(), 'uploads', 'citaciones');
const attachmentUrl = (fileName: string) => `/api/uploads/citaciones/${fileName}`;

const CITATION_FIELDS_SQL = `
  c.id, c.date_from::text AS "dateFrom", c.date_to::text AS "dateTo", c.time,
  c.status, c.observations, c.closed_at AS "closedAt", c.closed_by_user_id AS "closedByUserId",
  c.created_by_user_id AS "createdByUserId", c.created_at AS "createdAt",
  COALESCE((
    SELECT json_agg(ccr.citation_reason_id)
    FROM citation_citation_reasons ccr
    WHERE ccr.citation_id = c.id
  ), '[]') AS "reasonIds"
`;

async function assertEnrollmentInScope(institutionId: number, courseIds: number[] | null, enrollmentId: number): Promise<Enrollment> {
  const enrollment = await AppDataSource.getRepository(Enrollment).findOne({ where: { id: enrollmentId, institutionId } });
  if (!enrollment || (courseIds !== null && !courseIds.includes(enrollment.courseId))) {
    throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  }
  return enrollment;
}

async function assertReasonIds(institutionId: number, reasonIds: unknown): Promise<number[]> {
  if (!Array.isArray(reasonIds) || reasonIds.length === 0) {
    throw Object.assign(new Error('Debe seleccionar al menos un motivo'), { status: 400 });
  }
  const ids = [...new Set(reasonIds.map(Number))];
  const found = await AppDataSource.getRepository(CitationReason).find({
    where: { id: In(ids), institutionId, deletedAt: IsNull() },
  });
  if (found.length !== ids.length) {
    throw Object.assign(new Error('Uno o más motivos no existen'), { status: 404 });
  }
  return ids;
}

function assertDateOrder(dateFrom: string, dateTo: string) {
  if (dateFrom > dateTo) {
    throw Object.assign(new Error('dateFrom must be on or before dateTo'), { status: 400 });
  }
}

async function findOwned(institutionId: number, courseIds: number[] | null, id: number): Promise<Citation> {
  const c = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!c) throw Object.assign(new Error('Citation not found'), { status: 404 });
  if (courseIds !== null) await assertEnrollmentInScope(institutionId, courseIds, c.enrollmentId);
  return c;
}

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
          ), '[]')
        ) ORDER BY c.date_from DESC)
        FROM citations c
        WHERE c.enrollment_id = v.enrollment_id AND c.deleted_at IS NULL
      ), '[]') AS citations
    FROM v_enrollments_detail v
    WHERE v.institution_id = $1 AND v.course_id = $2 AND v.academic_year_id = $3
    ORDER BY v.roster_number
  `;
  return AppDataSource.query(sql, [institutionId, courseId, academicYearId]);
}

export async function findByEnrollment(institutionId: number, courseIds: number[] | null, enrollmentId: number, status?: string) {
  if (status !== undefined && !['pending', 'closed'].includes(status)) {
    throw Object.assign(new Error("status debe ser 'pending' o 'closed'"), { status: 400 });
  }
  await assertEnrollmentInScope(institutionId, courseIds, enrollmentId);

  const conditions = ['c.enrollment_id = $1', 'c.deleted_at IS NULL'];
  const params: any[] = [enrollmentId];
  if (status) { conditions.push(`c.status = $2`); params.push(status); }

  return AppDataSource.query(
    `SELECT ${CITATION_FIELDS_SQL} FROM citations c WHERE ${conditions.join(' AND ')} ORDER BY c.date_from DESC`,
    params
  );
}

export async function create(institutionId: number, courseIds: number[] | null, data: {
  enrollmentId: number; dateFrom: string; dateTo: string; time?: string; observations?: string; reasonIds: unknown;
}, createdByUserId: number | null = null) {
  assertDateOrder(data.dateFrom, data.dateTo);
  await assertEnrollmentInScope(institutionId, courseIds, data.enrollmentId);
  const reasonIds = await assertReasonIds(institutionId, data.reasonIds);

  return AppDataSource.transaction(async (em) => {
    const c = em.create(Citation, {
      institutionId,
      enrollmentId: data.enrollmentId,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      time: data.time ?? null,
      observations: data.observations ?? null,
      createdByUserId,
    });
    const saved = await em.save(c);
    for (const reasonId of reasonIds) {
      await em.save(em.create(CitationCitationReason, { citationId: saved.id, citationReasonId: reasonId }));
    }
    return saved;
  });
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{
  dateFrom: string; dateTo: string; time: string | null; observations: string | null; reasonIds: unknown;
}>) {
  const c = await findOwned(institutionId, courseIds, id);

  const nextDateFrom = data.dateFrom ?? c.dateFrom;
  const nextDateTo = data.dateTo ?? c.dateTo;
  assertDateOrder(nextDateFrom, nextDateTo);

  const reasonIds = data.reasonIds !== undefined ? await assertReasonIds(institutionId, data.reasonIds) : undefined;

  if (data.dateFrom !== undefined) c.dateFrom = data.dateFrom;
  if (data.dateTo !== undefined) c.dateTo = data.dateTo;
  if (data.time !== undefined) c.time = data.time;
  if (data.observations !== undefined) c.observations = data.observations;

  return AppDataSource.transaction(async (em) => {
    await em.save(c);
    if (reasonIds !== undefined) {
      await em.delete(CitationCitationReason, { citationId: id });
      for (const reasonId of reasonIds) {
        await em.save(em.create(CitationCitationReason, { citationId: id, citationReasonId: reasonId }));
      }
    }
    return c;
  });
}

export async function close(institutionId: number, courseIds: number[] | null, id: number, closedByUserId: number | null) {
  const c = await findOwned(institutionId, courseIds, id);
  if (c.status === 'closed') {
    throw Object.assign(new Error('La citación ya está cerrada'), { status: 409 });
  }
  c.status = 'closed';
  c.closedAt = new Date();
  c.closedByUserId = closedByUserId;
  return repo().save(c);
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number) {
  await findOwned(institutionId, courseIds, id);
  await repo().update({ id }, { deletedAt: new Date(), isActive: false });
}

export async function addAttachments(institutionId: number, courseIds: number[] | null, citationId: number, files: Express.Multer.File[]) {
  await findOwned(institutionId, courseIds, citationId);
  const rows = files.map(f => attRepo().create({
    citationId,
    fileName: f.filename,
    originalName: f.originalname,
    mimeType: f.mimetype,
  }));
  const saved = await attRepo().save(rows);
  return saved.map(a => ({ ...a, url: attachmentUrl(a.fileName) }));
}

export async function removeAttachment(institutionId: number, courseIds: number[] | null, citationId: number, attachmentId: number) {
  await findOwned(institutionId, courseIds, citationId);
  const att = await attRepo().findOne({ where: { id: attachmentId, citationId } });
  if (!att) throw Object.assign(new Error('Attachment not found'), { status: 404 });
  await attRepo().remove(att);
  fs.unlink(path.join(ATTACHMENTS_DIR, att.fileName), () => {});
}
```

`ccrRepo` is declared but, like `justification.service.ts`'s equivalent pattern, reason-link rows
are written via the transactional `EntityManager` (`em.create`/`em.save`), not the module-level
repo — kept for symmetry with `attRepo`/`repo` and in case a future read path needs it directly.

## Controller (`citation.controller.ts`)

```ts
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/citation.service';

const router = Router();
const R = 'citaciones';

const attachmentsDir = path.join(process.cwd(), 'uploads', 'citaciones');
const attachmentStorage = multer.diskStorage({
  destination: attachmentsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const uploadAttachments = multer({
  storage: attachmentStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'));
      return;
    }
    cb(null, true);
  },
});

router.use(requireInstitution);

router.get('/', requirePermission(R,'read'), async (req, res) => {
  const courseId       = req.query.course_id       ? +req.query.course_id       : undefined;
  const academicYearId  = req.query.academic_year_id ? +req.query.academic_year_id : undefined;
  const enrollmentId    = req.query.enrollment_id    ? +req.query.enrollment_id    : undefined;
  const status          = req.query.status as string | undefined;

  if (courseId !== undefined) {
    if (academicYearId === undefined) {
      res.status(400).json({ error: 'academic_year_id es requerido junto con course_id' });
      return;
    }
    res.json(await svc.findRoster(req.institutionId!, req.courseIds ?? null, courseId, academicYearId));
    return;
  }
  if (enrollmentId !== undefined) {
    res.json(await svc.findByEnrollment(req.institutionId!, req.courseIds ?? null, enrollmentId, status));
    return;
  }
  res.status(400).json({ error: 'Debe especificar course_id y academic_year_id, o enrollment_id' });
});

router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.courseIds ?? null, req.body, req.user?.id ?? null)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, req.courseIds ?? null, +req.params.id, req.body)));
router.put('/:id/close', requirePermission(R,'update'), async (req, res) => res.json(await svc.close(req.institutionId!, req.courseIds ?? null, +req.params.id, req.user?.id ?? null)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, req.courseIds ?? null, +req.params.id); res.status(204).send(); });

router.post('/:id/attachments', requirePermission(R,'create'), uploadAttachments.array('files', 5), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) { res.status(400).json({ error: 'Debe adjuntar al menos un archivo' }); return; }
  const result = await svc.addAttachments(req.institutionId!, req.courseIds ?? null, +req.params.id, files);
  res.status(201).json(result);
});

router.delete('/:id/attachments/:attachmentId', requirePermission(R,'delete'), async (req, res) => {
  await svc.removeAttachment(req.institutionId!, req.courseIds ?? null, +req.params.id, +req.params.attachmentId);
  res.status(204).send();
});

export default router;
```

`PUT /:id/close` is placed immediately after `PUT /:id` — Express matches full path segments, so
`:id/close` never collides with the bare `:id` route regardless of declaration order, but grouping
them keeps every `/:id`-scoped verb together for scanability, matching
`docs/conventions.md`'s "controllers often align route tables ... keep that alignment" note.

## Mount point

`src/routes/index.ts`, standard authenticated block, alongside `absenceRouter`/`justificationRouter`:

```ts
import citationRouter from '../controllers/citation.controller';
// ...
router.use('/citations', citationRouter);
```

## `app.ts` bootstrap

```ts
const citationsDir = path.join(process.cwd(), 'uploads', 'citaciones');
fs.mkdirSync(citationsDir, { recursive: true });
```

Added directly after the existing `justificationsDir` block (line 25-26 today).

## `user.service.ts` — `MODULE_KEYS`

```ts
export const MODULE_KEYS = [
  'dashboard',
  'absences', 'absences:manual', 'absences:voice', 'absences:photo',
  'calendar',
  'justifications',
  'students',
  'admin', 'admin:users', 'admin:courses', 'admin:years', 'admin:permissions', 'admin:roster',
  'student-report',
  'citations',
];
```

Appended at the end, matching how `'student-report'` was appended when it was added — no reordering
of existing entries, minimal diff.

## Discarded alternatives

1. **Give `GET /api/citations` two separate routes** (e.g. `GET /api/citations/roster` and
   `GET /api/citations/by-enrollment`) instead of one route that branches on which query params are
   present. Rejected: the acceptance criteria explicitly specifies both shapes under the single
   `GET /api/citations?...` path with different query params — this matches
   `absence.controller.ts`/`justification.controller.ts`'s existing convention of one `GET /` route
   whose behavior narrows based on whichever optional filters are present, rather than introducing a
   new sub-path convention nothing else in this codebase uses.

2. **Add a composite `(enrollment_id, status)` index on `citations`** to speed up the
   pending-detection query, as a small migration addition. Rejected for now: feature #9's migration
   already creates `idx_citations_enrollment ON citations(enrollment_id)`, and a single enrollment is
   expected to accumulate at most a handful of citations across its lifetime (mirroring the existing
   codebase's indexing granularity — e.g. `absences`/`justifications` have no composite covering
   index for their own status-ish filters like `is_justified` either). Flagged for the human
   reviewer: if citation volume per enrollment turns out to be much higher than expected in practice,
   revisit with a real migration at that point rather than speculatively now.

3. **Cascade-delete `citation_citation_reasons` and `citation_attachments` rows when a citation is
   soft-deleted** (mirroring `absence.service.ts#cascadeSoftDeleteAbsence`'s justification-unlinking
   behavior). Rejected: that cascade exists for absences because a `justification` can become
   meaningless once *all* its backing absences are gone. A citation's reason links and attachments
   have no equivalent "orphaned parent" scenario — they only ever belong to the one citation being
   soft-deleted, which itself is preserved (not hard-deleted) for history, so its links/attachments
   stay valid and queryable exactly like `justification.service.ts#remove`'s deliberate choice to
   leave `justification_attachments` untouched ("borrar una justificación nunca debe destruir la
   evidencia que la respaldaba").

4. **Route `PUT /:id/close` before the generic `PUT /:id`** in the controller. Rejected: Express 5
   matches by exact path-segment count, so `/123/close` never matches the `/:id` pattern (which only
   matches a single segment) regardless of route registration order — there's no correctness reason
   to reorder them, only a readability one, which is already satisfied by keeping them adjacent (see
   the controller code above).

## Flagged for the human reviewer

- **Resource/module/directory naming is intentionally mixed English/Spanish**, exactly as specified
  in the acceptance criteria: the HTTP route is English (`/api/citations`), the `MODULE_KEYS` entry
  is English (`'citations'`), but the `role_permissions` resource string and the upload directory are
  Spanish (`'citaciones'`, `uploads/citaciones`) — unlike feature #9, whose resource string
  (`citation-reasons`) is English throughout. This spec follows the acceptance criteria literally
  rather than "fixing" the inconsistency, but it's worth a second look before implementation in case
  it was a typo rather than an intentional choice.
- **Role names for R30**: the acceptance criteria says "admin/rector/superadmin/inspector/
  inspector-general"; this repo's actual role table (post `09_inspector_apoyo_general.sql`) has no
  role literally named `inspector` or `inspector-general` — only `inspector de apoyo` (course-scoped,
  the "block inspector") and `inspector general` (institution-wide). This design maps the shorthand
  to those two exact names. Please confirm that mapping is what was intended.
- **Migration file number (`22_citations_permissions.sql`) is provisional**, exactly like feature #9's
  own `21_citation_reasons.sql` — neither file exists on disk yet since neither feature is
  implemented. Whichever feature is implemented first must re-verify the actual next-free number.
