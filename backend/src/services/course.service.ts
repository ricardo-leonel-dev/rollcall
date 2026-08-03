import { AppDataSource } from '../data-source';
import { Course } from '../entities/Course';
import { Enrollment } from '../entities/Enrollment';
import { In, IsNull } from 'typeorm';
import { cascadeSoftDeleteEnrollment } from './enrollment.service';

const repo = () => AppDataSource.getRepository(Course);

export const SHIFTS = ['MATUTINA', 'VESPERTINA', 'NOCTURNA'] as const;
export type Shift = typeof SHIFTS[number];

export async function findAll(institutionId: number, courseIds: number[] | null) {
  const where: any = { institutionId, deletedAt: IsNull() };
  if (courseIds !== null) where.id = In(courseIds);
  return repo().find({ where, order: { name: 'ASC' } });
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  if (courseIds !== null && !courseIds.includes(id)) {
    throw Object.assign(new Error('Course not found'), { status: 404 });
  }
  const c = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!c) throw Object.assign(new Error('Course not found'), { status: 404 });
  return c;
}

export async function create(institutionId: number, data: { name: string; fullName?: string; paralelo?: string; shift?: string }) {
  const shift = (data.shift ?? 'MATUTINA').toUpperCase();
  if (!SHIFTS.includes(shift as Shift)) {
    throw Object.assign(new Error('Jornada inválida'), { status: 400 });
  }
  const c = repo().create({
    institutionId,
    name: data.name.toUpperCase(),
    fullName: data.fullName?.toUpperCase() ?? null,
    paralelo: data.paralelo?.toUpperCase() ?? null,
    shift,
  });
  return repo().save(c);
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{ name: string; fullName: string; paralelo: string; shift: string; isActive: boolean }>) {
  const c = await findById(institutionId, courseIds, id);
  if (data.name) data.name = data.name.toUpperCase();
  if (data.fullName) data.fullName = data.fullName.toUpperCase();
  if (data.paralelo) data.paralelo = data.paralelo.toUpperCase();
  if (data.shift) {
    data.shift = data.shift.toUpperCase();
    if (!SHIFTS.includes(data.shift as Shift)) {
      throw Object.assign(new Error('Jornada inválida'), { status: 400 });
    }
  }
  Object.assign(c, data);
  return repo().save(c);
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number) {
  await findById(institutionId, courseIds, id);
  await AppDataSource.transaction(async (em) => {
    const enrollments = await em.find(Enrollment, { where: { courseId: id, deletedAt: IsNull() } });
    for (const e of enrollments) await cascadeSoftDeleteEnrollment(em, e.id);
    await em.update(Course, { id }, { deletedAt: new Date(), isActive: false });
  });
}
