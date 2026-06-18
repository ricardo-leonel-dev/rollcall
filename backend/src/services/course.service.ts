import { AppDataSource } from '../data-source';
import { Course } from '../entities/Course';

const repo = () => AppDataSource.getRepository(Course);

export async function findAll(institutionId: number) {
  return repo().find({
    where: { institutionId, deletedAt: null as any },
    order: { name: 'ASC' },
  });
}

export async function findById(institutionId: number, id: number) {
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

export async function update(institutionId: number, id: number, data: Partial<{ name: string; shift: string; isActive: boolean }>) {
  const c = await findById(institutionId, id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(c, data);
  return repo().save(c);
}

export async function remove(institutionId: number, id: number) {
  const c = await findById(institutionId, id);
  c.deletedAt = new Date();
  c.isActive = false;
  await repo().save(c);
}
