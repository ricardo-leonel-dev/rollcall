import { IsNull, Not } from 'typeorm';
import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../data-source';
import { Justification } from '../entities/Justification';
import { JustificationAbsence } from '../entities/JustificationAbsence';
import { JustificationAttachment } from '../entities/JustificationAttachment';
import { Absence } from '../entities/Absence';
import { Enrollment } from '../entities/Enrollment';
import { recordEvents } from './domain-event.service';
import { notWithdrawnSql, visibleRecordSql, assertEnrollmentNotWithdrawn } from './enrollment-withdrawal';

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
  dateFrom?: string,
  dateTo?: string,
) {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (dateFrom !== undefined && !DATE_RE.test(dateFrom)) {
    throw Object.assign(new Error('date_from debe tener formato YYYY-MM-DD'), { status: 400 });
  }
  if (dateTo !== undefined && !DATE_RE.test(dateTo)) {
    throw Object.assign(new Error('date_to debe tener formato YYYY-MM-DD'), { status: 400 });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw Object.assign(new Error('date_from debe ser menor o igual a date_to'), { status: 400 });
  }

  const params: any[] = [institutionId];
  let dateFromIdx: number | undefined;
  let dateToIdx: number | undefined;
  if (dateFrom) { params.push(dateFrom); dateFromIdx = params.length; }
  if (dateTo)   { params.push(dateTo);   dateToIdx   = params.length; }

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

  // AC #1: filtra por al menos una falta vinculada dentro del rango (solo si dateFrom/dateTo están presentes).
  let dateFilter = '';
  if (dateFromIdx || dateToIdx) {
    dateFilter = `
    AND EXISTS (
      SELECT 1 FROM justification_absences ja
      JOIN absences a ON a.id = ja.absence_id
      WHERE ja.justification_id = j.id
        AND a.deleted_at IS NULL
        AND ${visibleRecordSql('j.enrollment_id', 'a.date')}
        ${dateFromIdx ? `AND a.date >= $${dateFromIdx}` : ''}
        ${dateToIdx   ? `AND a.date <= $${dateToIdx}`   : ''}
    )`;
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
        JOIN absences a ON a.id = ja.absence_id
        WHERE ja.justification_id = j.id
          AND ${visibleRecordSql('j.enrollment_id', 'a.date')}
      ), '[]') AS "absenceIds",
      COALESCE((
        SELECT json_agg(json_build_object('id', a.id, 'date', a.date) ORDER BY a.date)
        FROM justification_absences ja
        JOIN absences a ON a.id = ja.absence_id
        WHERE ja.justification_id = j.id
          AND ${visibleRecordSql('j.enrollment_id', 'a.date')}
      ), '[]') AS "absenceDates",
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
    AND (${notWithdrawnSql('j', 'enrollment_id')} OR EXISTS (
      SELECT 1 FROM justification_absences ja
      JOIN absences av ON av.id = ja.absence_id
      WHERE ja.justification_id = j.id AND av.deleted_at IS NULL
        AND ${visibleRecordSql('j.enrollment_id', 'av.date')}
    ))
    ${dateFilter}
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

// The audit snapshot carries the business fields only — the technical ones
// (createdAt/updatedAt/isActive/deletedAt) would change the meaning of the
// record on every later read.
function justificationSnapshot(
  j: { id: number; enrollmentId: number; reason: string; notifiedBy: string | null },
  absenceIds: number[],
) {
  return {
    id: j.id,
    enrollmentId: j.enrollmentId,
    reason: j.reason,
    notifiedBy: j.notifiedBy ?? null,
    absenceIds,
  };
}

type JustificationSnapshot = ReturnType<typeof justificationSnapshot>;

// Only the fields the snapshot carries count as a change: the linked
// absences are part of it, so relinking a justification is recorded too.
function justificationChanged(before: JustificationSnapshot, after: JustificationSnapshot): boolean {
  return before.id !== after.id
    || before.enrollmentId !== after.enrollmentId
    || before.reason !== after.reason
    || before.notifiedBy !== after.notifiedBy
    || before.absenceIds.length !== after.absenceIds.length
    || before.absenceIds.some((absenceId, i) => absenceId !== after.absenceIds[i]);
}

// An update re-links the absences it already holds, so its own links must not
// count as "already justified".
async function assertAbsencesLinkable(
  institutionId: number,
  enrollmentId: number,
  absenceIds: number[],
  justificationId: number | null = null,
): Promise<void> {
  for (const absId of absenceIds) {
    const abs = await absRepo().findOne({ where: { id: absId, institutionId, deletedAt: IsNull() } });
    if (!abs) throw Object.assign(new Error(`Absence ${absId} not found`), { status: 404 });
    if (abs.enrollmentId !== enrollmentId) {
      throw Object.assign(new Error(`Absence ${absId} does not belong to this enrollment`), { status: 400 });
    }
    if (!['F', 'AT'].includes(abs.type)) {
      throw Object.assign(new Error(`Invalid absence type: ${abs.type}`), { status: 400 });
    }
    const exists = await jaRepo().findOne({
      where: justificationId === null
        ? { absenceId: absId }
        : { absenceId: absId, justificationId: Not(justificationId) },
    });
    if (exists) throw Object.assign(new Error(`Absence ${absId} is already justified`), { status: 409 });
  }
}

export async function create(institutionId: number, courseIds: number[] | null, data: {
  enrollmentId: number; reason: string;
  notifiedBy?: string; absenceIds: number[];
}, createdByUserId: number | null = null) {
  if (!data.absenceIds?.length) {
    throw Object.assign(new Error('At least one absence is required'), { status: 400 });
  }

  await assertEnrollmentInScope(institutionId, courseIds, data.enrollmentId);
  await assertEnrollmentNotWithdrawn(data.enrollmentId);

  await assertAbsencesLinkable(institutionId, data.enrollmentId, data.absenceIds);

  return AppDataSource.transaction(async (em) => {
    const j = em.create(Justification, {
      institutionId,
      enrollmentId: data.enrollmentId,
      reason: data.reason,
      notifiedBy: data.notifiedBy ?? null,
      createdByUserId,
    });
    const saved = await em.save(j);

    for (const absId of data.absenceIds) {
      const ja = em.create(JustificationAbsence, {
        justificationId: saved.id,
        absenceId: absId,
      });
      await em.save(ja);
    }

    await recordEvents(em, [{
      institutionId,
      eventType: 'JustificationCreated',
      entityType: 'justification',
      entityId: saved.id,
      actorUserId: createdByUserId,
      payload: { before: null, after: justificationSnapshot(saved, [...data.absenceIds].sort((a, b) => a - b)) },
    }]);

    return saved;
  });
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: {
  reason?: string; notifiedBy?: string; absenceIds?: number[];
}, actorUserId: number | null = null) {
  // The checks stay outside the transaction: a rejected edit must leave no
  // trace. The snapshot and the links are read again under the row lock.
  const j = await findById(institutionId, courseIds, id);
  await assertEnrollmentNotWithdrawn(j.enrollmentId);
  if (data.absenceIds !== undefined) {
    await assertAbsencesLinkable(institutionId, j.enrollmentId, data.absenceIds, id);
  }

  // The row and its links are read and written through the transaction's
  // manager, so the audit event and the edit share one fate: a failing event
  // insert rolls the edit and the relinking back. The row lock serializes
  // concurrent edits: each one reads the "before" the previous one left and
  // replaces the links whole, so two relinks never merge their sets.
  return AppDataSource.transaction(async (em) => {
    const current = await em.findOne(Justification, {
      where: { id, institutionId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) throw Object.assign(new Error('Justification not found'), { status: 404 });

    const links = await em.find(JustificationAbsence, { where: { justificationId: id } });
    const currentAbsenceIds = links.map((link) => link.absenceId).sort((a, b) => a - b);

    const before = justificationSnapshot(current, currentAbsenceIds);

    if (data.reason) current.reason = data.reason;
    if (data.notifiedBy !== undefined) current.notifiedBy = data.notifiedBy;

    // The links are sorted so a relinking shows up in the snapshot even when
    // the request lists the same absences in another order.
    const nextAbsenceIds = data.absenceIds !== undefined
      ? [...data.absenceIds].sort((a, b) => a - b)
      : currentAbsenceIds;

    const after = justificationSnapshot(current, nextAbsenceIds);

    await em.save(current);

    if (data.absenceIds !== undefined) {
      await em.delete(JustificationAbsence, { justificationId: id });
      for (const absId of data.absenceIds) {
        const ja = em.create(JustificationAbsence, { justificationId: id, absenceId: absId });
        await em.save(ja);
      }
    }

    // An edit that leaves the snapshot as it was leaves no audit trail: the
    // event says what changed, and nothing changed.
    if (justificationChanged(before, after)) {
      await recordEvents(em, [{
        institutionId,
        eventType: 'JustificationUpdated',
        entityType: 'justification',
        entityId: id,
        actorUserId,
        payload: { before, after },
      }]);
    }

    return current;
  });
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number, actorUserId: number | null = null) {
  const j = await findById(institutionId, courseIds, id);
  await assertEnrollmentNotWithdrawn(j.enrollmentId);

  // Los adjuntos (justification_attachments) se preservan intactos a propósito:
  // borrar una justificación nunca debe destruir la evidencia que la respaldaba.
  return AppDataSource.transaction(async (em) => {
    // DELETE ... RETURNING trae las faltas que quedaron enlazadas sin pagar
    // una consulta extra: el snapshot de la auditoría sale de la misma frase.
    const result = await em.query(
      'DELETE FROM justification_absences WHERE justification_id = $1 RETURNING absence_id',
      [id],
    );
    const rows: any[] = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    const absenceIds = rows.map((r: any) => r.absence_id);

    const before = justificationSnapshot(j, absenceIds);
    j.deletedAt = new Date();
    j.isActive = false;
    await em.save(j);

    await recordEvents(em, [{
      institutionId,
      eventType: 'JustificationDeleted',
      entityType: 'justification',
      entityId: id,
      actorUserId,
      payload: { before, after: null },
    }]);
  });
}

export async function addAttachments(
  institutionId: number,
  courseIds: number[] | null,
  justificationId: number,
  files: Express.Multer.File[],
) {
  try {
    const j = await findById(institutionId, courseIds, justificationId);
    await assertEnrollmentNotWithdrawn(j.enrollmentId);
  } catch (err) {
    // The upload is already on disk; a refused write must not leave it there.
    await Promise.allSettled(files.map(f => fs.promises.unlink(f.path)));
    throw err;
  }

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
  const j = await findById(institutionId, courseIds, justificationId);
  await assertEnrollmentNotWithdrawn(j.enrollmentId);

  const att = await attRepo().findOne({ where: { id: attachmentId, justificationId } });
  if (!att) throw Object.assign(new Error('Attachment not found'), { status: 404 });

  await attRepo().remove(att);
  fs.unlink(path.join(ATTACHMENTS_DIR, att.fileName), () => {});
}
