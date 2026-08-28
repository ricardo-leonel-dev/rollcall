import { EntityManager, IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { AcademicYear } from '../entities/AcademicYear';
import { Quarter } from '../entities/Quarter';

const repo = () => AppDataSource.getRepository(Quarter);

export const QUARTER_NAMES = ['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre'] as const;
export type QuarterName = typeof QUARTER_NAMES[number];

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

export async function findAllForActiveYear(institutionId: number) {
  const ay = await findActiveAcademicYear(institutionId);
  return repo().find({
    where: { academicYearId: ay.id, institutionId, deletedAt: IsNull() },
    order: { sequenceNumber: 'ASC' },
  });
}

export async function create(institutionId: number, data: { name: string; startDate?: string | null; endDate?: string | null; description?: string | null }) {
  const ay = await findActiveAcademicYear(institutionId);
  const index = QUARTER_NAMES.indexOf(data.name as QuarterName);
  if (index === -1) {
    throw Object.assign(new Error(`Nombre de trimestre inválido: debe ser uno de ${QUARTER_NAMES.join(', ')}`), { status: 400 });
  }

  const range: DateRange = { startDate: data.startDate ?? null, endDate: data.endDate ?? null };
  assertWithinAcademicYear(ay, range);
  await assertNoOverlap(AppDataSource.manager, ay.id, null, range);

  const q = repo().create({
    academicYearId: ay.id,
    institutionId: ay.institutionId,
    name: data.name,
    sequenceNumber: index + 1,
    startDate: range.startDate,
    endDate: range.endDate,
    description: data.description ?? null,
    isActive: true,
  });
  return repo().save(q);
}

// name/academicYearId/institutionId/sequenceNumber son inmutables por este
// endpoint: se toman explícitamente solo los campos configurables en lugar de
// hacer Object.assign(q, data) sobre un req.body sin tipar en runtime.
export async function update(institutionId: number, id: number, data: Partial<{ startDate: string | null; endDate: string | null; description: string | null }>) {
  const ay = await findActiveAcademicYear(institutionId);
  const q = await repo().findOne({ where: { id, academicYearId: ay.id, institutionId, deletedAt: IsNull() } });
  if (!q) throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });

  const range: DateRange = {
    startDate: data.startDate !== undefined ? data.startDate : q.startDate,
    endDate: data.endDate !== undefined ? data.endDate : q.endDate,
  };
  assertWithinAcademicYear(ay, range);
  await assertNoOverlap(AppDataSource.manager, ay.id, q.id, range);

  q.startDate = range.startDate;
  q.endDate = range.endDate;
  if (data.description !== undefined) q.description = data.description;
  return repo().save(q);
}

export async function seedQuarters(em: EntityManager, academicYearId: number): Promise<void> {
  const ay = await em.findOne(AcademicYear, { where: { id: academicYearId } });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  const quarters = QUARTER_NAMES.map((name, i) => em.create(Quarter, {
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
