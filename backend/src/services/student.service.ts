import { AppDataSource } from '../data-source';
import { Student } from '../entities/Student';
import { ILike } from 'typeorm';

const repo = () => AppDataSource.getRepository(Student);

export async function findAll(search?: string) {
  const where: any = { deletedAt: null as any };
  if (search) where.name = ILike(`%${search}%`);
  return repo().find({ where, order: { name: 'ASC' } });
}

export async function findById(id: number) {
  const s = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!s) throw Object.assign(new Error('Student not found'), { status: 404 });
  return s;
}

export async function create(data: {
  name: string; idNumber?: string; gender?: string;
  birthDate?: string;
}) {
  const s = repo().create({ ...data, name: data.name.toUpperCase() });
  return repo().save(s);
}

export async function update(id: number, data: Partial<{
  name: string; idNumber: string; gender: string;
  birthDate: string; isActive: boolean;
}>) {
  const s = await findById(id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(s, data);
  return repo().save(s);
}

export async function remove(id: number) {
  const s = await findById(id);
  s.deletedAt = new Date();
  s.isActive = false;
  await repo().save(s);
}
