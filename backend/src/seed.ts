import bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { User } from './entities/User';
import { Role } from './entities/Role';

export async function seedSuperAdmin(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const roleRepo = AppDataSource.getRepository(Role);

  const superAdminRole = await roleRepo.findOne({ where: { name: 'superadmin' } });
  if (!superAdminRole) {
    console.warn('[seed] Rol superadmin no encontrado — ejecutar primero el SQL de migración');
    return;
  }

  const existing = await userRepo.findOne({ where: { roleId: superAdminRole.id } });
  if (existing) return;

  const passwordHash = await bcrypt.hash('Admin2026!', 10);

  await userRepo.save({
    username: 'superadmin',
    passwordHash,
    fullName: 'Administrador de la Plataforma',
    roleId: superAdminRole.id,
    institutionId: null,
    isActive: true,
  });

  console.log('[seed] Usuario superadmin creado — contraseña: Admin2026! (cámbiala después de iniciar sesión)');
}
