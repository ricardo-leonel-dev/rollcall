import bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { Role } from '../entities/Role';
import { Institution } from '../entities/Institution';

const repo = () => AppDataSource.getRepository(User);

async function assertRoleAssignable(roleId: number | undefined, isActorSuperAdmin: boolean) {
  if (!roleId) return;
  const role = await AppDataSource.getRepository(Role).findOne({ where: { id: roleId } });
  if (role?.name === 'superadmin' && !isActorSuperAdmin) {
    throw Object.assign(new Error('Solo un superadmin puede asignar el rol superadmin'), { status: 403 });
  }
}

export async function findAll(institutionId: number) {
  const users = await repo().find({ where: { institutionId, deletedAt: null as any }, order: { username: 'ASC' } });
  return users.map(u => { const { passwordHash, ...rest } = u; return rest; });
}

export async function findById(institutionId: number, id: number) {
  const u = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
  if (!u) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  return u;
}

// targetInstitutionId is null only for a brand-new superadmin account (not
// bound to any institution) — enforced below, never trusted blindly.
export async function create(isActorSuperAdmin: boolean, targetInstitutionId: number | null, data: {
  username: string; password: string; fullName?: string;
  email?: string; roleId?: number;
}) {
  await assertRoleAssignable(data.roleId, isActorSuperAdmin);

  if (targetInstitutionId === null) {
    const role = data.roleId ? await AppDataSource.getRepository(Role).findOne({ where: { id: data.roleId } }) : null;
    if (role?.name !== 'superadmin') {
      throw Object.assign(new Error('institutionId es requerido para este rol'), { status: 400 });
    }
  } else {
    const institution = await AppDataSource.getRepository(Institution).findOne({ where: { id: targetInstitutionId } });
    if (!institution) throw Object.assign(new Error('Institution not found'), { status: 404 });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const u = repo().create({
    username: data.username,
    passwordHash,
    fullName: data.fullName ?? null,
    email: data.email ?? null,
    roleId: data.roleId ?? null,
    institutionId: targetInstitutionId,
    isActive: true,
  });
  const saved = await repo().save(u);
  const { passwordHash: _, ...rest } = saved;
  return rest;
}

export async function update(institutionId: number, isActorSuperAdmin: boolean, id: number, data: Partial<{
  password: string; fullName: string; email: string; roleId: number; isActive: boolean;
}>) {
  await assertRoleAssignable(data.roleId, isActorSuperAdmin);

  const u = await findById(institutionId, id);
  if (data.password) u.passwordHash = await bcrypt.hash(data.password, 10);
  if (data.fullName !== undefined)  u.fullName = data.fullName;
  if (data.email !== undefined)     u.email    = data.email;
  if (data.roleId !== undefined)    u.roleId   = data.roleId;
  if (data.isActive !== undefined)  u.isActive = data.isActive;
  const saved = await repo().save(u);
  const { passwordHash: _, ...rest } = saved;
  return rest;
}

export async function remove(institutionId: number, id: number) {
  const u = await findById(institutionId, id);
  u.deletedAt = new Date();
  u.isActive = false;
  await repo().save(u);
}
