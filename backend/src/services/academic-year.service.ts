import { AppDataSource } from '../data-source';
import { AcademicYear } from '../entities/AcademicYear';

const repo = () => AppDataSource.getRepository(AcademicYear);

export async function findAll() {
  return repo().find({
    where: { deletedAt: null as any },
    order: { name: 'DESC' },
  });
}

export async function findById(id: number) {
  const ay = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  return ay;
}

export async function create(data: { name: string; startDate?: string; endDate?: string }) {
  const ay = repo().create({
    name: data.name,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    isActive: true,
  });
  return repo().save(ay);
}

export async function update(id: number, data: Partial<{ name: string; startDate: string; endDate: string; isActive: boolean }>) {
  const ay = await findById(id);
  Object.assign(ay, data);
  return repo().save(ay);
}

export async function remove(id: number) {
  const ay = await findById(id);
  ay.deletedAt = new Date();
  ay.isActive = false;
  await repo().save(ay);
}
