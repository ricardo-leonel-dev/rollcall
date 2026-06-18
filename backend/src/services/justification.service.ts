import { AppDataSource } from '../data-source';
import { Justification } from '../entities/Justification';
import { JustificationAbsence } from '../entities/JustificationAbsence';
import { Absence } from '../entities/Absence';
import { Enrollment } from '../entities/Enrollment';

const repo = () => AppDataSource.getRepository(Justification);
const jaRepo = () => AppDataSource.getRepository(JustificationAbsence);
const absRepo = () => AppDataSource.getRepository(Absence);

async function assertEnrollmentInScope(institutionId: number, courseIds: number[] | null, enrollmentId: number): Promise<Enrollment> {
  const enrollment = await AppDataSource.getRepository(Enrollment).findOne({ where: { id: enrollmentId, institutionId } });
  if (!enrollment || (courseIds !== null && !courseIds.includes(enrollment.courseId))) {
    throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  }
  return enrollment;
}

export async function findAll(institutionId: number, courseIds: number[] | null, enrollmentId?: number) {
  const params: any[] = [institutionId];
  let courseFilter = '';
  if (courseIds !== null) {
    params.push(courseIds);
    courseFilter = `AND e.course_id = ANY($${params.length})`;
  }
  let enrollmentFilter = '';
  if (enrollmentId) {
    params.push(enrollmentId);
    enrollmentFilter = `AND j.enrollment_id = $${params.length}`;
  }

  const sql = `
    SELECT j.*,
      COALESCE(json_agg(ja.absence_id) FILTER (WHERE ja.absence_id IS NOT NULL), '[]') AS absence_ids
    FROM justifications j
    JOIN enrollments e ON e.id = j.enrollment_id
    LEFT JOIN justification_absences ja ON ja.justification_id = j.id
    WHERE j.institution_id = $1 AND j.deleted_at IS NULL
    ${courseFilter}
    ${enrollmentFilter}
    GROUP BY j.id
    ORDER BY j.created_at DESC
  `;
  return AppDataSource.query(sql, params);
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  const j = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
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
    const abs = await absRepo().findOne({ where: { id: absId, institutionId, deletedAt: null as any } });
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

  return AppDataSource.transaction(async (em) => {
    await em.delete(JustificationAbsence, { justificationId: id });
    j.deletedAt = new Date();
    j.isActive = false;
    await em.save(j);
  });
}
