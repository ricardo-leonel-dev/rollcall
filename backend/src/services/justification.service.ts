import { AppDataSource } from '../data-source';
import { Justification } from '../entities/Justification';
import { JustificationAbsence } from '../entities/JustificationAbsence';
import { Absence } from '../entities/Absence';

const repo = () => AppDataSource.getRepository(Justification);
const jaRepo = () => AppDataSource.getRepository(JustificationAbsence);
const absRepo = () => AppDataSource.getRepository(Absence);

export async function findAll(enrollmentId?: number) {
  const sql = `
    SELECT j.*,
      COALESCE(json_agg(ja.absence_id) FILTER (WHERE ja.absence_id IS NOT NULL), '[]') AS absence_ids
    FROM justifications j
    LEFT JOIN justification_absences ja ON ja.justification_id = j.id
    WHERE j.deleted_at IS NULL
    ${enrollmentId ? `AND j.enrollment_id = ${enrollmentId}` : ''}
    GROUP BY j.id
    ORDER BY j.created_at DESC
  `;
  return AppDataSource.query(sql);
}

export async function findById(id: number) {
  const j = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!j) throw Object.assign(new Error('Justification not found'), { status: 404 });
  return j;
}

export async function create(data: {
  enrollmentId: number; reason: string;
  notifiedBy?: string; absenceIds: number[];
}) {
  if (!data.absenceIds?.length) {
    throw Object.assign(new Error('At least one absence is required'), { status: 400 });
  }

  for (const absId of data.absenceIds) {
    const abs = await absRepo().findOne({ where: { id: absId, deletedAt: null as any } });
    if (!abs) throw Object.assign(new Error(`Absence ${absId} not found`), { status: 404 });
    if (abs.enrollmentId !== data.enrollmentId) {
      throw Object.assign(new Error(`Absence ${absId} does not belong to this enrollment`), { status: 400 });
    }
    if (!['A', 'AT'].includes(abs.type)) {
      throw Object.assign(new Error(`Invalid absence type: ${abs.type}`), { status: 400 });
    }
    const exists = await jaRepo().findOne({ where: { absenceId: absId } });
    if (exists) throw Object.assign(new Error(`Absence ${absId} is already justified`), { status: 409 });
  }

  return AppDataSource.transaction(async (em) => {
    const j = em.create(Justification, {
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

export async function update(id: number, data: {
  reason?: string; notifiedBy?: string; absenceIds?: number[];
}) {
  const j = await findById(id);

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

export async function remove(id: number) {
  const j = await findById(id);

  return AppDataSource.transaction(async (em) => {
    await em.delete(JustificationAbsence, { justificationId: id });
    j.deletedAt = new Date();
    j.isActive = false;
    await em.save(j);
  });
}
