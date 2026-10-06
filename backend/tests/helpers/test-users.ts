import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../../src/data-source';
import { User } from '../../src/entities/User';
import { Role } from '../../src/entities/Role';

const JWT_SECRET = () => process.env.JWT_SECRET || 'secret';

let counter = 0;

export async function createTestUser(opts: {
  username?: string;
  roleName?: string;
  institutionId?: number | null;
}): Promise<{ id: number; username: string; token: string }> {
  counter += 1;
  const username = opts.username ?? `testuser_${process.pid}_${Date.now()}_${counter}`;
  const passwordHash = await bcrypt.hash('TestPass123!', 10);

  let roleId: number | null = null;
  if (opts.roleName) {
    const role = await AppDataSource.getRepository(Role).findOne({ where: { name: opts.roleName } });
    if (!role) throw new Error(`Role '${opts.roleName}' not found — DB not seeded`);
    roleId = role.id;
  }

  const user = AppDataSource.getRepository(User).create({
    username,
    passwordHash,
    fullName: `Test ${username}`,
    roleId,
    institutionId: opts.institutionId ?? null,
    isActive: true,
  });
  const saved = await AppDataSource.getRepository(User).save(user);

  const token = jwt.sign(
    {
      id: saved.id,
      username: saved.username,
      roleId: saved.roleId ?? 0,
      roleName: opts.roleName ?? '',
      institutionId: saved.institutionId,
    },
    JWT_SECRET(),
    { expiresIn: '1h' }
  );

  return { id: saved.id, username: saved.username, token };
}

export async function deleteTestUser(id: number): Promise<void> {
  await AppDataSource.getRepository(User).delete({ id });
}

export async function deleteTestUsersByPrefix(prefix: string): Promise<void> {
  await AppDataSource.getRepository(User)
    .createQueryBuilder()
    .delete()
    .where('username LIKE :prefix', { prefix: `${prefix}%` })
    .execute();
}

export async function getTestUser(id: number) {
  return AppDataSource.getRepository(User).findOne({ where: { id } });
}