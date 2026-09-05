import { IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { CitationReason } from '../entities/CitationReason';

const repo = () => AppDataSource.getRepository(CitationReason);

const MAX_NAME_LENGTH = 150;
const SEVERITIES = ['low', 'medium', 'high'] as const;
type Severity = typeof SEVERITIES[number];

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

function assertValidSeverity(severity: unknown): Severity {
  if (typeof severity !== 'string' || !SEVERITIES.includes(severity as Severity)) {
    throw Object.assign(new Error(`severity debe ser uno de: ${SEVERITIES.join(', ')}`), { status: 400 });
  }
  return severity as Severity;
}

async function findOwned(institutionId: number, id: number): Promise<CitationReason> {
  const r = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!r) throw Object.assign(new Error('Motivo de citación no encontrado'), { status: 404 });
  return r;
}

export async function findAll(institutionId: number, _courseIds: number[] | null) {
  return repo().find({ where: { institutionId, deletedAt: IsNull() }, order: { name: 'ASC' } });
}

export async function create(institutionId: number, _courseIds: number[] | null, data: {
  name: string; severity: string; description?: string | null;
}) {
  const name = assertValidName(data.name);
  const severity = assertValidSeverity(data.severity);
  const r = repo().create({
    institutionId,
    name,
    severity,
    description: data.description?.trim() || null,
    isActive: true,
  });
  return repo().save(r);
}

export async function update(institutionId: number, _courseIds: number[] | null, id: number, data: Partial<{
  name: string; severity: string; description: string | null;
}>) {
  const r = await findOwned(institutionId, id);
  if (data.name !== undefined) r.name = assertValidName(data.name);
  if (data.severity !== undefined) r.severity = assertValidSeverity(data.severity);
  if (data.description !== undefined) r.description = data.description?.trim() || null;
  return repo().save(r);
}

export async function remove(institutionId: number, _courseIds: number[] | null, id: number): Promise<void> {
  await findOwned(institutionId, id);
  await repo().update({ id }, { deletedAt: new Date(), isActive: false });
}
