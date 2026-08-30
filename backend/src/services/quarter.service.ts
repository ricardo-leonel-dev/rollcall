import { EntityManager, IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { AcademicYear } from '../entities/AcademicYear';
import { Quarter } from '../entities/Quarter';

const repo = () => AppDataSource.getRepository(Quarter);

const MAX_NAME_LENGTH = 60;

type DateRange = { startDate: string | null; endDate: string | null };

// Un trimestre siempre pertenece al año lectivo activo de la institución,
// resuelto server-side con la misma consulta que usa institution.middleware.ts
// — nunca desde un academic_year_id enviado por el cliente.
async function findActiveAcademicYear(institutionId: number) {
  const ay = await AppDataSource.getRepository(AcademicYear).findOne({
    where: { institutionId, isActive: true, deletedAt: IsNull() },
  });
  if (!ay) throw Object.assign(new Error('No hay año lectivo activo'), { status: 404 });
  return ay;
}

// Un año lectivo sin fechas propias todavía no tiene contra qué validar a sus
// trimestres, y una fecha de trimestre ausente no puede salirse de nada.
function assertWithinAcademicYear(academicYear: DateRange, range: DateRange) {
  if (!academicYear.startDate || !academicYear.endDate) return;
  const outside =
    (range.startDate !== null && range.startDate < academicYear.startDate) ||
    (range.endDate !== null && range.endDate > academicYear.endDate);
  if (outside) {
    throw Object.assign(
      new Error(`Las fechas del trimestre deben estar dentro del año lectivo (${academicYear.startDate} a ${academicYear.endDate})`),
      { status: 400 }
    );
  }
}

// Solo participan los trimestres que ya tienen ambas fechas: uno con fechas
// nulas no define un rango con el que solaparse.
async function assertNoOverlap(em: EntityManager, academicYearId: number, excludeId: number | null, range: DateRange) {
  if (!range.startDate || !range.endDate) return;
  const siblings = await em.find(Quarter, { where: { academicYearId, deletedAt: IsNull() } });
  for (const s of siblings) {
    if (s.id === excludeId || !s.startDate || !s.endDate) continue;
    if (range.startDate <= s.endDate && range.endDate >= s.startDate) {
      throw Object.assign(
        new Error(`Las fechas se solapan con ${s.name} (${s.startDate} a ${s.endDate})`),
        { status: 400 }
      );
    }
  }
}

function assertValidDates(range: DateRange): void {
  if (range.startDate === null || range.endDate === null) {
    throw Object.assign(
      new Error('El período debe tener fecha de inicio y fecha de fin.'),
      { status: 400 }
    );
  }
}

function assertValidName(name: unknown): string {
  if (typeof name !== 'string') throw Object.assign(new Error('El nombre del período no puede estar vacío'), { status: 400 });
  const trimmed = name.trim();
  if (!trimmed) throw Object.assign(new Error('El nombre del período no puede estar vacío'), { status: 400 });
  if (trimmed.length > MAX_NAME_LENGTH) throw Object.assign(new Error(`El nombre del período no puede superar ${MAX_NAME_LENGTH} caracteres`), { status: 400 });
  return trimmed;
}

function assertValidSequenceNumber(n: unknown): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw Object.assign(new Error('sequenceNumber debe ser un entero positivo'), { status: 400 });
  }
  return n;
}

async function nextSequenceNumber(em: EntityManager, academicYearId: number): Promise<number> {
  const siblings = await em.find(Quarter, { where: { academicYearId, deletedAt: IsNull() } });
  return siblings.reduce((max, s) => Math.max(max, s.sequenceNumber), 0) + 1;
}

// El academic_year_id, cuando se provee, es elegido por el cliente (a
// diferencia de create/update/remove, que siempre resuelven el año activo
// server-side) — por eso se valida explícitamente que pertenezca a la
// institución del usuario autenticado antes de listar sus trimestres. Un id
// inexistente o de otra institución responde 404 (no 403), igual que
// academic-year.service.ts#findById: no hay necesidad de distinguir "no
// existe" de "no es tuyo" frente al cliente.
async function findOwnedAcademicYear(institutionId: number, academicYearId: number) {
  const ay = await AppDataSource.getRepository(AcademicYear).findOne({
    where: { id: academicYearId, institutionId, deletedAt: IsNull() },
  });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  return ay;
}

export async function findAllForYear(institutionId: number, academicYearId?: number) {
  const ay = academicYearId !== undefined
    ? await findOwnedAcademicYear(institutionId, academicYearId)
    : await findActiveAcademicYear(institutionId);
  return repo().find({
    where: { academicYearId: ay.id, institutionId, deletedAt: IsNull() },
    order: { sequenceNumber: 'ASC' },
  });
}

export async function findByIdForActiveYear(institutionId: number, quarterId: number) {
  const ay = await findActiveAcademicYear(institutionId);
  const q = await repo().findOne({
    where: { id: quarterId, academicYearId: ay.id, institutionId, deletedAt: IsNull() },
  });
  if (!q) throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });
  return q;
}

export async function create(institutionId: number, data: {
  name: string; sequenceNumber?: number;
  startDate?: string | null; endDate?: string | null; description?: string | null;
}) {
  const name = assertValidName(data.name);

  return AppDataSource.transaction(async (em) => {
    const ay = await em.getRepository(AcademicYear).findOne({
      where: { institutionId, isActive: true, deletedAt: IsNull() },
    });
    if (!ay) throw Object.assign(new Error('No hay año lectivo activo'), { status: 404 });

    const sequenceNumber = data.sequenceNumber !== undefined
      ? assertValidSequenceNumber(data.sequenceNumber)
      : await nextSequenceNumber(em, ay.id);

    const range: DateRange = { startDate: data.startDate ?? null, endDate: data.endDate ?? null };
    assertValidDates(range);
    assertWithinAcademicYear(ay, range);
    await assertNoOverlap(em, ay.id, null, range);

    const q = em.create(Quarter, {
      academicYearId: ay.id,
      institutionId: ay.institutionId,
      name,
      sequenceNumber,
      startDate: range.startDate,
      endDate: range.endDate,
      description: data.description ?? null,
      isActive: true,
    });
    return em.save(q);
  });
}

// name/academicYearId/institutionId are still server-only (institutionId and
// academicYearId are derived; only the explicitly whitelisted configurable
// fields are taken from the request body, never via Object.assign(entity, data)
// on an untyped req.body).
export async function update(institutionId: number, id: number, data: Partial<{
  name: string; sequenceNumber: number;
  startDate: string | null; endDate: string | null; description: string | null;
}>) {
  const ay = await findActiveAcademicYear(institutionId);
  const q = await repo().findOne({ where: { id, academicYearId: ay.id, institutionId, deletedAt: IsNull() } });
  if (!q) throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });

  if (data.name !== undefined) q.name = assertValidName(data.name);
  if (data.sequenceNumber !== undefined) q.sequenceNumber = assertValidSequenceNumber(data.sequenceNumber);

  const range: DateRange = {
    startDate: data.startDate !== undefined ? data.startDate : q.startDate,
    endDate: data.endDate !== undefined ? data.endDate : q.endDate,
  };
  assertValidDates(range);
  assertWithinAcademicYear(ay, range);
  await assertNoOverlap(AppDataSource.manager, ay.id, q.id, range);

  if (data.startDate !== undefined) q.startDate = range.startDate;
  if (data.endDate !== undefined) q.endDate = range.endDate;
  if (data.description !== undefined) q.description = data.description;
  return repo().save(q);
}

export async function remove(institutionId: number, id: number): Promise<void> {
  const ay = await findActiveAcademicYear(institutionId);
  const q = await repo().findOne({ where: { id, academicYearId: ay.id, institutionId, deletedAt: IsNull() } });
  if (!q) throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });
  await repo().update({ id }, { deletedAt: new Date(), isActive: false });
}

const DEFAULT_QUARTER_NAMES = ['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre'];

export async function seedQuarters(em: EntityManager, academicYearId: number): Promise<void> {
  const ay = await em.findOne(AcademicYear, { where: { id: academicYearId } });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  const quarters = DEFAULT_QUARTER_NAMES.map((name, i) => em.create(Quarter, {
    academicYearId,
    institutionId: ay.institutionId,
    name,
    sequenceNumber: i + 1,
    startDate: null,
    endDate: null,
    isActive: true,
  }));
  await em.save(quarters);
}

export async function cascadeSoftDeleteQuarters(em: EntityManager, academicYearId: number): Promise<void> {
  await em.update(Quarter, { academicYearId, deletedAt: IsNull() }, { deletedAt: new Date(), isActive: false });
}

export async function assertQuartersFitAcademicYearRange(em: EntityManager, academicYearId: number, startDate: string | null, endDate: string | null): Promise<void> {
  const quarters = await em.find(Quarter, {
    where: { academicYearId, deletedAt: IsNull() },
    order: { sequenceNumber: 'ASC' },
  });
  const offending = quarters.filter(q => {
    if (startDate !== null && q.startDate !== null && q.startDate < startDate) return true;
    if (endDate !== null && q.endDate !== null && q.endDate > endDate) return true;
    return false;
  });
  if (offending.length) {
    const detail = offending.map(q => `${q.name} (${q.startDate} a ${q.endDate})`).join(', ');
    throw Object.assign(
      new Error(`Las nuevas fechas del año lectivo dejarían fuera de rango: ${detail}`),
      { status: 409 }
    );
  }
}