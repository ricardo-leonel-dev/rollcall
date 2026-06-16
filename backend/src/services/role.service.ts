import { AppDataSource } from '../data-source';
import { Role } from '../entities/Role';
import { RolePermission } from '../entities/RolePermission';

const repo = () => AppDataSource.getRepository(Role);
const permRepo = () => AppDataSource.getRepository(RolePermission);

export async function findAll() {
  return repo().find({ where: { deletedAt: null as any }, order: { name: 'ASC' } });
}

export async function findById(id: number) {
  const r = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!r) throw Object.assign(new Error('Rol no encontrado'), { status: 404 });
  return r;
}

export async function create(data: { name: string; description?: string }) {
  const r = repo().create({ name: data.name.toLowerCase(), description: data.description ?? null });
  return repo().save(r);
}

export async function update(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>) {
  const r = await findById(id);
  Object.assign(r, data);
  return repo().save(r);
}

export async function remove(id: number) {
  const r = await findById(id);
  r.deletedAt = new Date();
  r.isActive = false;
  await repo().save(r);
}

export async function getPermissions(roleId: number) {
  return permRepo().find({ where: { roleId }, order: { resource: 'ASC' } });
}

export async function updatePermissions(roleId: number, perms: Array<{
  resource: string; canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean;
}>) {
  return AppDataSource.transaction(async (em) => {
    for (const p of perms) {
      await em.upsert(RolePermission, {
        roleId,
        resource: p.resource,
        canRead: p.canRead,
        canCreate: p.canCreate,
        canUpdate: p.canUpdate,
        canDelete: p.canDelete,
      }, ['roleId', 'resource']);
    }
    return em.find(RolePermission, { where: { roleId }, order: { resource: 'ASC' } });
  });
}
