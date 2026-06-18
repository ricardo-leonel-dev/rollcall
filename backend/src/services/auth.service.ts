import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { Role } from '../entities/Role';

const JWT_SECRET = () => process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES_IN = () => process.env.JWT_EXPIRES_IN || '7d';

export async function login(username: string, password: string) {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { username, isActive: true, deletedAt: null as any } });

  if (!user) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  const roleRepo = AppDataSource.getRepository(Role);
  const role = user.roleId ? await roleRepo.findOne({ where: { id: user.roleId } }) : null;

  const payload = {
    id: user.id,
    username: user.username,
    roleId: user.roleId ?? 0,
    roleName: role?.name ?? '',
    institutionId: user.institutionId,
  };

  const token = jwt.sign(payload, JWT_SECRET(), { expiresIn: JWT_EXPIRES_IN() } as any);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roleName: role?.name ?? null,
      roleId: user.roleId,
      institutionId: user.institutionId,
      avatarUrl: user.avatarUrl,
    },
  };
}

export async function getMe(userId: number) {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });

  const roleRepo = AppDataSource.getRepository(Role);
  const role = user.roleId ? await roleRepo.findOne({ where: { id: user.roleId } }) : null;

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    roleName: role?.name ?? null,
    roleId: user.roleId,
    institutionId: user.institutionId,
    isActive: user.isActive,
    notificationTemplate: user.notificationTemplate,
    avatarUrl: user.avatarUrl,
  };
}

export async function updateMe(userId: number, data: Partial<{ fullName: string; email: string; notificationTemplate: string }>) {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });

  if (data.fullName !== undefined) user.fullName = data.fullName;
  if (data.email !== undefined) user.email = data.email;
  if (data.notificationTemplate !== undefined) user.notificationTemplate = data.notificationTemplate;
  await userRepo.save(user);

  return getMe(userId);
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Contraseña actual incorrecta'), { status: 400 });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await userRepo.save(user);
}

export async function updateAvatar(userId: number, avatarUrl: string) {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });

  // Clean up the previous uploaded file (not a preset) so they don't pile up on disk.
  if (user.avatarUrl?.startsWith('/api/uploads/avatars/')) {
    const oldPath = path.join(process.cwd(), 'uploads', 'avatars', path.basename(user.avatarUrl));
    fs.unlink(oldPath, () => {});
  }

  user.avatarUrl = avatarUrl;
  await userRepo.save(user);

  return getMe(userId);
}
