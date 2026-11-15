import { EntityManager, IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { WithdrawalReason } from '../entities/WithdrawalReason';

const repo = () => AppDataSource.getRepository(WithdrawalReason);

const MAX_NAME_LENGTH = 150;

// Keep this list identical to the one seeded by
// postgres/26_withdrawal_reasons.sql (a test compares them).
export const DEFAULT_WITHDRAWAL_REASONS = [
  'Cambio de domicilio',
  'Cambio de institución educativa',
  'Situación económica',
  'Problemas de salud',
  'Viaje o migración',
  'Bajo rendimiento académico',
  'Motivos disciplinarios',
  'Otro',
] as const;

export async function seedDefaults(manager: EntityManager, institutionId: number): Promise<void> {
  const reasonRepo = manager.getRepository(WithdrawalReason);
  await reasonRepo.save(
    DEFAULT_WITHDRAWAL_REASONS.map((name) =>
      reasonRepo.create({ institutionId, name, description: null, isActive: true }),
    ),
  );
}

function assertValidName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw Object.assign(new Error('El nombre del motivo no puede estar vacío'), { status: 400 });
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw Object.assign(new Error(`El nombre no puede superar ${MAX_NAME_LENGTH} caracteres`), { status: 400 });
  }
  return trimmed;
}

function normalizeDescription(description: unknown): string | null {
  return typeof description === 'string' && description.trim() ? description.trim() : null;
}

async function findOwned(institutionId: number, id: number): Promise<WithdrawalReason> {
  if (!Number.isFinite(id)) {
    throw Object.assign(new Error('Motivo de retiro no encontrado'), { status: 404 });
  }
  const r = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!r) throw Object.assign(new Error('Motivo de retiro no encontrado'), { status: 404 });
  return r;
}

export async function findAll(institutionId: number, _courseIds: number[] | null): Promise<WithdrawalReason[]> {
  return repo().find({ where: { institutionId, deletedAt: IsNull() }, order: { name: 'ASC' } });
}

export async function create(
  institutionId: number,
  _courseIds: number[] | null,
  data: { name?: unknown; description?: unknown },
): Promise<WithdrawalReason> {
  const r = repo().create({
    institutionId,
    name: assertValidName(data.name),
    description: normalizeDescription(data.description),
    isActive: true,
  });
  return repo().save(r);
}

export async function update(
  institutionId: number,
  _courseIds: number[] | null,
  id: number,
  data: { name?: unknown; description?: unknown },
): Promise<WithdrawalReason> {
  const r = await findOwned(institutionId, id);
  if (data.name !== undefined) r.name = assertValidName(data.name);
  if (data.description !== undefined) r.description = normalizeDescription(data.description);
  return repo().save(r);
}

export async function remove(institutionId: number, _courseIds: number[] | null, id: number): Promise<void> {
  await findOwned(institutionId, id);
  await repo().update({ id }, { deletedAt: new Date(), isActive: false });
}
