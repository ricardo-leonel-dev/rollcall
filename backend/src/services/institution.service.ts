import { AppDataSource } from '../data-source';
import { Institution } from '../entities/Institution';

const repo = () => AppDataSource.getRepository(Institution);

export async function findAll() {
  return repo().find({ order: { name: 'ASC' } });
}

export async function findById(id: number) {
  const inst = await repo().findOne({ where: { id } });
  if (!inst) throw Object.assign(new Error('Institution not found'), { status: 404 });
  return inst;
}

export async function create(data: { name: string }) {
  const inst = repo().create({ name: data.name, isActive: true });
  return repo().save(inst);
}

export async function update(id: number, data: Partial<{ name: string; isActive: boolean }>) {
  const inst = await findById(id);
  Object.assign(inst, data);
  return repo().save(inst);
}

export async function remove(id: number) {
  const inst = await findById(id);
  inst.isActive = false;
  await repo().save(inst);
}
