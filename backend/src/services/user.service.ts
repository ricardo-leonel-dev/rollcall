import bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';

const repo = () => AppDataSource.getRepository(User);

export async function findAll() {
  const users = await repo().find({ where: { deletedAt: null as any }, order: { username: 'ASC' } });
  return users.map(u => { const { passwordHash, ...rest } = u; return rest; });
}

export async function findById(id: number) {
  const u = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!u) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  return u;
}

export async function create(data: {
  username: string; password: string; fullName?: string;
  email?: string; roleId?: number;
}) {
  const passwordHash = await bcrypt.hash(data.password, 10);
  const u = repo().create({
    username: data.username,
    passwordHash,
    fullName: data.fullName ?? null,
    email: data.email ?? null,
    roleId: data.roleId ?? null,
    isActive: true,
  });
  const saved = await repo().save(u);
  const { passwordHash: _, ...rest } = saved;
  return rest;
}

export async function update(id: number, data: Partial<{
  password: string; fullName: string; email: string; roleId: number; isActive: boolean;
}>) {
  const u = await findById(id);
  if (data.password) u.passwordHash = await bcrypt.hash(data.password, 10);
  if (data.fullName !== undefined)  u.fullName = data.fullName;
  if (data.email !== undefined)     u.email    = data.email;
  if (data.roleId !== undefined)    u.roleId   = data.roleId;
  if (data.isActive !== undefined)  u.isActive = data.isActive;
  const saved = await repo().save(u);
  const { passwordHash: _, ...rest } = saved;
  return rest;
}

export async function remove(id: number) {
  const u = await findById(id);
  u.deletedAt = new Date();
  u.isActive = false;
  await repo().save(u);
}
