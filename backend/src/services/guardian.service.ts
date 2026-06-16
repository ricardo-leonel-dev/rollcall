import { AppDataSource } from '../data-source';
import { Guardian } from '../entities/Guardian';
import { ILike } from 'typeorm';

const repo = () => AppDataSource.getRepository(Guardian);

export async function findAll(search?: string) {
  const where: any = { deletedAt: null as any };
  if (search) where.name = ILike(`%${search}%`);
  return repo().find({ where, order: { name: 'ASC' } });
}

export async function findById(id: number) {
  const g = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!g) throw Object.assign(new Error('Guardian not found'), { status: 404 });
  return g;
}

export async function create(data: {
  name: string; idNumber?: string; phone?: string;
  whatsappLink?: string; email?: string;
}) {
  const g = repo().create({ ...data, name: data.name.toUpperCase() });
  return repo().save(g);
}

export async function update(id: number, data: Partial<{
  name: string; idNumber: string; phone: string;
  whatsappLink: string; email: string; isActive: boolean;
}>) {
  const g = await findById(id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(g, data);
  return repo().save(g);
}

export async function remove(id: number) {
  const g = await findById(id);
  g.deletedAt = new Date();
  g.isActive = false;
  await repo().save(g);
}
