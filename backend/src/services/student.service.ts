import { AppDataSource } from '../data-source';
import { Student } from '../entities/Student';
import { ILike, IsNull } from 'typeorm';

const repo = () => AppDataSource.getRepository(Student);

export async function findAll(institutionId: number, search?: string) {
  const where: any = { institutionId, deletedAt: IsNull() };
  if (search) where.name = ILike(`%${search}%`);
  return repo().find({ where, order: { name: 'ASC' } });
}

export async function findById(institutionId: number, id: number) {
  const s = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!s) throw Object.assign(new Error('Student not found'), { status: 404 });
  return s;
}

export async function create(institutionId: number, data: {
  name: string; idNumber?: string; gender?: string;
  birthDate?: string;
}) {
  const s = repo().create({ ...data, institutionId, name: data.name.toUpperCase() });
  return repo().save(s);
}

export async function update(institutionId: number, id: number, data: Partial<{
  name: string; idNumber: string; gender: string;
  birthDate: string; isActive: boolean;
}>) {
  const s = await findById(institutionId, id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(s, data);
  return repo().save(s);
}

export async function remove(institutionId: number, id: number) {
  const s = await findById(institutionId, id);
  s.deletedAt = new Date();
  s.isActive = false;
  await repo().save(s);
}
