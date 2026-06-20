import { IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { AcademicYear } from '../entities/AcademicYear';
import { Enrollment } from '../entities/Enrollment';
import { cascadeSoftDeleteEnrollment } from './enrollment.service';

const repo = () => AppDataSource.getRepository(AcademicYear);

export async function findAll(institutionId: number) {
  return repo().find({
    where: { institutionId, deletedAt: IsNull() },
    order: { name: 'DESC' },
  });
}

export async function findById(institutionId: number, id: number) {
  const ay = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  return ay;
}

// Solo un año lectivo puede estar activo por institución a la vez (también
// forzado por un índice único parcial en BD) — activar uno desactiva
// automáticamente cualquier otro que lo estuviera.
export async function create(institutionId: number, data: { name: string; startDate?: string; endDate?: string }) {
  return AppDataSource.transaction(async (em) => {
    await em.update(AcademicYear, { institutionId, isActive: true }, { isActive: false });
    const ay = em.create(AcademicYear, {
      institutionId,
      name: data.name,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      isActive: true,
    });
    return em.save(ay);
  });
}

export async function update(institutionId: number, id: number, data: Partial<{ name: string; startDate: string; endDate: string; isActive: boolean }>) {
  const ay = await findById(institutionId, id);
  if (data.isActive === true && !ay.isActive) {
    return AppDataSource.transaction(async (em) => {
      await em.update(AcademicYear, { institutionId, isActive: true }, { isActive: false });
      Object.assign(ay, data);
      return em.save(ay);
    });
  }
  Object.assign(ay, data);
  return repo().save(ay);
}

export async function remove(institutionId: number, id: number) {
  await findById(institutionId, id);
  await AppDataSource.transaction(async (em) => {
    const enrollments = await em.find(Enrollment, { where: { academicYearId: id, deletedAt: IsNull() } });
    for (const e of enrollments) await cascadeSoftDeleteEnrollment(em, e.id);
    await em.update(AcademicYear, { id }, { deletedAt: new Date(), isActive: false });
  });
}
