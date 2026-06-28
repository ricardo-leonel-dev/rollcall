import { IsNull } from 'typeorm';
import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../data-source';
import { Justification } from '../entities/Justification';
import { JustificationAbsence } from '../entities/JustificationAbsence';
import { JustificationAttachment } from '../entities/JustificationAttachment';
import { Absence } from '../entities/Absence';
import { Enrollment } from '../entities/Enrollment';

const repo = () => AppDataSource.getRepository(Justification);
const jaRepo = () => AppDataSource.getRepository(JustificationAbsence);
const attRepo = () => AppDataSource.getRepository(JustificationAttachment);
const absRepo = () => AppDataSource.getRepository(Absence);

const ATTACHMENTS_DIR = path.join(process.cwd(), 'uploads', 'justifications');
const attachmentUrl = (fileName: string) => `/api/uploads/justifications/${fileName}`;

async function assertEnrollmentInScope(institutionId: number, courseIds: number[] | null, enrollmentId: number): Promise<Enrollment> {
  const enrollment = await AppDataSource.getRepository(Enrollment).findOne({ where: { id: enrollmentId, institutionId } });
  if (!enrollment || (courseIds !== null && !courseIds.includes(enrollment.courseId))) {
    throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  }
  return enrollment;
}

export async function findAll(
  institutionId: number,
  courseIds: number[] | null,
  enrollmentId?: number,
  courseId?: number,
  academicYearId?: number,
) {
  const params: any[] = [institutionId];
  let courseFilter = '';
  if (courseIds !== null) {
    params.push(courseIds);
    courseFilter = `AND e.course_id = ANY($${params.length})`;
  }
  let specificCourseFilter = '';
  if (courseId) {
    params.push(courseId);
    specificCourseFilter = `AND e.course_id = $${params.length}`;
  }
  let academicYearFilter = '';
  if (academicYearId) {
    params.push(academicYearId);
    academicYearFilter = `AND e.academic_year_id = $${params.length}`;
  }
  let enrollmentFilter = '';
  if (enrollmentId) {
    params.push(enrollmentId);
    enrollmentFilter = `AND j.enrollment_id = $${params.length}`;
  }

  // Subqueries correlacionadas (una por array) en vez de LEFT JOIN + GROUP BY:
  // con dos relaciones N:1 (faltas y adjuntos) un JOIN normal produciría un
  // producto cruzado entre ambas antes de agrupar — cada subquery corre
  // aislada por fila de j, sin cruces entre absenceIds y attachments.
  const sql = `
    SELECT
      j.id,
      j.enrollment_id AS "enrollmentId",
      j.institution_id AS "institutionId",
      j.reason,
      j.notified_by AS "notifiedBy",
      j.is_active AS "isActive",
      j.deleted_at AS "deletedAt",
      j.created_at AS "createdAt",
      j.updated_at AS "updatedAt",
      s.name AS "studentName",
      c.name AS "courseName",
      e.course_id AS "courseId",
      e.academic_year_id AS "academicYearId",
      COALESCE((
        SELECT json_agg(ja.absence_id)
        FROM justification_absences ja
        WHERE ja.justification_id = j.id
      ), '[]') AS "absenceIds",
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', att.id,
          'fileName', att.file_name,
          'originalName', att.original_name,
          'mimeType', att.mime_type,
          'createdAt', att.created_at
        ) ORDER BY att.created_at ASC)
        FROM justification_attachments att
        WHERE att.justification_id = j.id
      ), '[]') AS "attachments"
    FROM justifications j
    JOIN enrollments e ON e.id = j.enrollment_id
    JOIN students s ON s.id = e.student_id
    JOIN courses c ON c.id = e.course_id
    WHERE j.institution_id = $1 AND j.deleted_at IS NULL
    ${courseFilter}
    ${specificCourseFilter}
    ${academicYearFilter}
    ${enrollmentFilter}
    ORDER BY j.created_at DESC
  `;
  const rows = await AppDataSource.query(sql, params);
  return rows.map((r: any) => ({
    ...r,
    attachments: r.attachments.map((a: any) => ({ ...a, url: attachmentUrl(a.fileName) })),
  }));
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  const j = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!j) throw Object.assign(new Error('Justification not found'), { status: 404 });
  if (courseIds !== null) await assertEnrollmentInScope(institutionId, courseIds, j.enrollmentId);
  return j;
}

export async function create(institutionId: number, courseIds: number[] | null, data: {
  enrollmentId: number; reason: string;
  notifiedBy?: string; absenceIds: number[];
}) {
  if (!data.absenceIds?.length) {
    throw Object.assign(new Error('At least one absence is required'), { status: 400 });
  }

  await assertEnrollmentInScope(institutionId, courseIds, data.enrollmentId);

  for (const absId of data.absenceIds) {
    const abs = await absRepo().findOne({ where: { id: absId, institutionId, deletedAt: IsNull() } });
    if (!abs) throw Object.assign(new Error(`Absence ${absId} not found`), { status: 404 });
    if (abs.enrollmentId !== data.enrollmentId) {
      throw Object.assign(new Error(`Absence ${absId} does not belong to this enrollment`), { status: 400 });
    }
    if (!['F', 'AT'].includes(abs.type)) {
      throw Object.assign(new Error(`Invalid absence type: ${abs.type}`), { status: 400 });
    }
    const exists = await jaRepo().findOne({ where: { absenceId: absId } });
    if (exists) throw Object.assign(new Error(`Absence ${absId} is already justified`), { status: 409 });
  }

  return AppDataSource.transaction(async (em) => {
    const j = em.create(Justification, {
      institutionId,
      enrollmentId: data.enrollmentId,
      reason: data.reason,
      notifiedBy: data.notifiedBy ?? null,
    });
    const saved = await em.save(j);

    for (const absId of data.absenceIds) {
      const ja = em.create(JustificationAbsence, {
        justificationId: saved.id,
        absenceId: absId,
      });
      await em.save(ja);
    }

    return saved;
  });
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: {
  reason?: string; notifiedBy?: string; absenceIds?: number[];
}) {
  const j = await findById(institutionId, courseIds, id);

  if (data.reason) j.reason = data.reason;
  if (data.notifiedBy !== undefined) j.notifiedBy = data.notifiedBy;

  return AppDataSource.transaction(async (em) => {
    await em.save(j);

    if (data.absenceIds !== undefined) {
      await em.delete(JustificationAbsence, { justificationId: id });
      for (const absId of data.absenceIds) {
        const ja = em.create(JustificationAbsence, { justificationId: id, absenceId: absId });
        await em.save(ja);
      }
    }

    return j;
  });
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number) {
  const j = await findById(institutionId, courseIds, id);

  // Los adjuntos (justification_attachments) se preservan intactos a propósito:
  // borrar una justificación nunca debe destruir la evidencia que la respaldaba.
  return AppDataSource.transaction(async (em) => {
    await em.delete(JustificationAbsence, { justificationId: id });
    j.deletedAt = new Date();
    j.isActive = false;
    await em.save(j);
  });
}

export async function addAttachments(
  institutionId: number,
  courseIds: number[] | null,
  justificationId: number,
  files: Express.Multer.File[],
) {
  await findById(institutionId, courseIds, justificationId);

  const rows = files.map(f => attRepo().create({
    justificationId,
    fileName: f.filename,
    originalName: f.originalname,
    mimeType: f.mimetype,
  }));
  const saved = await attRepo().save(rows);
  return saved.map(a => ({ ...a, url: attachmentUrl(a.fileName) }));
}

export async function removeAttachment(
  institutionId: number,
  courseIds: number[] | null,
  justificationId: number,
  attachmentId: number,
) {
  await findById(institutionId, courseIds, justificationId);

  const att = await attRepo().findOne({ where: { id: attachmentId, justificationId } });
  if (!att) throw Object.assign(new Error('Attachment not found'), { status: 404 });

  await attRepo().remove(att);
  fs.unlink(path.join(ATTACHMENTS_DIR, att.fileName), () => {});
}
