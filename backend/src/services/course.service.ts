import { AppDataSource } from '../data-source';
import { Course } from '../entities/Course';
import { In } from 'typeorm';

const repo = () => AppDataSource.getRepository(Course);

export async function findAll(institutionId: number, courseIds: number[] | null) {
  const where: any = { institutionId, deletedAt: null as any };
  if (courseIds !== null) where.id = In(courseIds);
  return repo().find({ where, order: { name: 'ASC' } });
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  if (courseIds !== null && !courseIds.includes(id)) {
    throw Object.assign(new Error('Course not found'), { status: 404 });
  }
  const c = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
  if (!c) throw Object.assign(new Error('Course not found'), { status: 404 });
  return c;
}

export async function create(institutionId: number, data: { name: string; shift?: string }) {
  const c = repo().create({
    institutionId,
    name: data.name.toUpperCase(),
    shift: (data.shift ?? 'MATUTINA').toUpperCase(),
  });
  return repo().save(c);
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{ name: string; shift: string; isActive: boolean }>) {
  const c = await findById(institutionId, courseIds, id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(c, data);
  return repo().save(c);
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number) {
  const c = await findById(institutionId, courseIds, id);
  c.deletedAt = new Date();
  c.isActive = false;
  await repo().save(c);
}
