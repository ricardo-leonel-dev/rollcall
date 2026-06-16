import { AppDataSource } from '../data-source';
import { Course } from '../entities/Course';

const repo = () => AppDataSource.getRepository(Course);

export async function findAll() {
  return repo().find({
    where: { deletedAt: null as any },
    order: { name: 'ASC' },
  });
}

export async function findById(id: number) {
  const c = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!c) throw Object.assign(new Error('Course not found'), { status: 404 });
  return c;
}

export async function create(data: { name: string; shift?: string }) {
  const c = repo().create({
    name: data.name.toUpperCase(),
    shift: (data.shift ?? 'MATUTINA').toUpperCase(),
  });
  return repo().save(c);
}

export async function update(id: number, data: Partial<{ name: string; shift: string; isActive: boolean }>) {
  const c = await findById(id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(c, data);
  return repo().save(c);
}

export async function remove(id: number) {
  const c = await findById(id);
  c.deletedAt = new Date();
  c.isActive = false;
  await repo().save(c);
}
