import { AppDataSource } from '../data-source';
import { AcademicYear } from '../entities/AcademicYear';
import { Enrollment } from '../entities/Enrollment';
import { cascadeSoftDeleteEnrollment } from './enrollment.service';

const repo = () => AppDataSource.getRepository(AcademicYear);

export async function findAll(institutionId: number) {
  return repo().find({
    where: { institutionId, deletedAt: null as any },
    order: { name: 'DESC' },
  });
}

export async function findById(institutionId: number, id: number) {
  const ay = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  return ay;
}

export async function create(institutionId: number, data: { name: string; startDate?: string; endDate?: string }) {
  const ay = repo().create({
    institutionId,
    name: data.name,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    isActive: true,
  });
  return repo().save(ay);
}

export async function update(institutionId: number, id: number, data: Partial<{ name: string; startDate: string; endDate: string; isActive: boolean }>) {
  const ay = await findById(institutionId, id);
  Object.assign(ay, data);
  return repo().save(ay);
}

export async function remove(institutionId: number, id: number) {
  await findById(institutionId, id);
  await AppDataSource.transaction(async (em) => {
    const enrollments = await em.find(Enrollment, { where: { academicYearId: id, deletedAt: null as any } });
    for (const e of enrollments) await cascadeSoftDeleteEnrollment(em, e.id);
    await em.update(AcademicYear, { id }, { deletedAt: new Date(), isActive: false });
  });
}
