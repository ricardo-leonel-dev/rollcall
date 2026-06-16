import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { Role } from '../entities/Role';

const JWT_SECRET = () => process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES_IN = () => process.env.JWT_EXPIRES_IN || '8h';

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
    isActive: user.isActive,
  };
}
