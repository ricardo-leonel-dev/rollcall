import bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { User } from './entities/User';
import { Role } from './entities/Role';

export async function seedAdmin(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const roleRepo = AppDataSource.getRepository(Role);

  const existingAdmin = await userRepo.findOne({ where: { username: 'admin' } });
  if (existingAdmin) return;

  const adminRole = await roleRepo.findOne({ where: { name: 'admin' } });
  if (!adminRole) {
    console.warn('[seed] Rol admin no encontrado — ejecutar primero el SQL de migración');
    return;
  }

  const passwordHash = await bcrypt.hash('Admin2026!', 10);

  await userRepo.save({
    username: 'admin',
    passwordHash,
    fullName: 'Administrador del Sistema',
    email: 'admin@tiablanquita.edu.ec',
    roleId: adminRole.id,
    isActive: true,
  });

  console.log('[seed] Usuario admin creado — contraseña: Admin2026!');
}
