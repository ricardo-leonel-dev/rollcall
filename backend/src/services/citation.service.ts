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
