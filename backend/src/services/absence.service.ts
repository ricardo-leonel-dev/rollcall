import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Absence } from '../entities/Absence';
import { Enrollment } from '../entities/Enrollment';
import { JustificationAbsence } from '../entities/JustificationAbsence';
import { Justification } from '../entities/Justification';

const repo = () => AppDataSource.getRepository(Absence);

// Deleting an absence shouldn't leave a justification silently pointing at
// a row that no longer exists — drop the link, and if that was the last
// absence backing a justification, the justification is meaningless on its
// own and gets soft-deleted too.
export async function cascadeSoftDeleteAbsence(em: EntityManager, absenceId: number): Promise<void> {
  const links = await em.find(JustificationAbsence, { where: { absenceId } });
  if (links.length) {
    await em.delete(JustificationAbsence, { absenceId });
    const justificationIds = [...new Set(links.map(l => l.justificationId))];
    for (const justificationId of justificationIds) {
      const remaining = await em.count(JustificationAbsence, { where: { justificationId } });
      if (remaining === 0) {
        await em.update(Justification, { id: justificationId }, { deletedAt: new Date(), isActive: false });
      }
    }
  }
  await em.update(Absence, { id: absenceId }, { deletedAt: new Date(), isActive: false });
}

interface AbsenceFilters {
  enrollmentId?: number;
  courseId?: number;
  academicYearId?: number;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  isJustified?: string;
}

export async function findAll(institutionId: number, courseIds: number[] | null, filters: AbsenceFilters) {
  const conditions: string[] = ['a.deleted_at IS NULL', 'm.deleted_at IS NULL', 'a.institution_id = $1'];
  const params: any[] = [institutionId];
  let i = 2;

  if (courseIds !== null)     { conditions.push(`m.course_id = ANY($${i++})`); params.push(courseIds); }
  if (filters.enrollmentId)   { conditions.push(`a.enrollment_id = $${i++}`);   params.push(filters.enrollmentId); }
  if (filters.courseId)       { conditions.push(`m.course_id = $${i++}`);        params.push(filters.courseId); }
  if (filters.academicYearId) { conditions.push(`m.academic_year_id = $${i++}`); params.push(filters.academicYearId); }
  if (filters.dateFrom)       { conditions.push(`a.date >= $${i++}`);            params.push(filters.dateFrom); }
  if (filters.dateTo)         { conditions.push(`a.date <= $${i++}`);            params.push(filters.dateTo); }
  if (filters.type)           { conditions.push(`a.type = $${i++}`);             params.push(filters.type.toUpperCase()); }

  const justifiedFilter =
    filters.isJustified === 'true'  ? 'AND EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)' :
    filters.isJustified === 'false' ? 'AND NOT EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)' :
    '';

  const sql = `
    SELECT
      a.id, a.enrollment_id AS "enrollmentId", a.date::text AS date, a.type,
      a.notes, a.photo_source AS "photoSource", a.is_active AS "isActive",
      e.name AS "studentName", m.roster_number AS "rosterNumber",
      c.name AS course, al.name AS "academicYear",
      g.phone AS "guardianPhone", g.whatsapp_link AS "whatsappLink",
      EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id) AS "isJustified"
    FROM absences a
    JOIN enrollments m       ON m.id = a.enrollment_id
    JOIN students e          ON e.id = m.student_id
    JOIN courses c           ON c.id = m.course_id
    JOIN academic_years al   ON al.id = m.academic_year_id
    LEFT JOIN guardians g    ON g.id = m.guardian_id
    WHERE ${conditions.join(' AND ')}
    ${justifiedFilter}
    ORDER BY a.date DESC, e.name
  `;
  return AppDataSource.query(sql, params);
}

async function assertEnrollmentInScope(institutionId: number, courseIds: number[] | null, enrollmentId: number): Promise<Enrollment> {
  const enrollment = await AppDataSource.getRepository(Enrollment).findOne({ where: { id: enrollmentId, institutionId } });
  if (!enrollment || (courseIds !== null && !courseIds.includes(enrollment.courseId))) {
    throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  }
  return enrollment;
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  const a = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
  if (!a) throw Object.assign(new Error('Absence not found'), { status: 404 });
  if (courseIds !== null) await assertEnrollmentInScope(institutionId, courseIds, a.enrollmentId);
  return a;
}

// Monday–Friday only between dateFrom/dateTo inclusive — same business-day
// rule already used by excel-service's diasHabiles for the attendance export.
function businessDaysInRange(dateFrom: string, dateTo: string): string[] {
  const [fy, fm, fd] = dateFrom.split('-').map(Number);
  const [ty, tm, td] = dateTo.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  const days: string[] = [];
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

export async function createRange(institutionId: number, courseIds: number[] | null, data: {
  enrollmentId: number; type: 'F' | 'AT'; dateFrom: string; dateTo: string; notes?: string;
}): Promise<{ created: number; skipped: number }> {
  if (!['F', 'AT'].includes(data.type)) {
    throw Object.assign(new Error('Invalid type. Only F or AT'), { status: 400 });
  }
  if (data.dateFrom > data.dateTo) {
    throw Object.assign(new Error('dateFrom must be on or before dateTo'), { status: 400 });
  }
  await assertEnrollmentInScope(institutionId, courseIds, data.enrollmentId);

  const days = businessDaysInRange(data.dateFrom, data.dateTo);
  if (!days.length) {
    throw Object.assign(new Error('El rango no contiene días hábiles'), { status: 400 });
  }

  const existingRows = await AppDataSource.query(
    `SELECT date::text AS date FROM absences WHERE enrollment_id = $1 AND date = ANY($2) AND deleted_at IS NULL`,
    [data.enrollmentId, days]
  );
  const existingDates = new Set(existingRows.map((r: { date: string }) => r.date));
  const toCreate = days.filter(d => !existingDates.has(d));

  if (toCreate.length) {
    await AppDataSource.transaction(async (em) => {
      for (const date of toCreate) {
        const a = em.create(Absence, {
          institutionId,
          enrollmentId: data.enrollmentId,
          date,
          type: data.type,
          notes: data.notes ?? null,
        });
        await em.save(a);
      }
    });
  }

  return { created: toCreate.length, skipped: days.length - toCreate.length };
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{
  date: string; type: 'F' | 'AT'; notes: string; photoSource: string;
}>) {
  const a = await findById(institutionId, courseIds, id);
  if (data.type && !['F', 'AT'].includes(data.type)) {
    throw Object.assign(new Error('Invalid type. Only F or AT'), { status: 400 });
  }
  if (data.date)                      a.date        = data.date;
  if (data.type)                      a.type        = data.type;
  if (data.notes !== undefined)       a.notes       = data.notes;
  if (data.photoSource !== undefined) a.photoSource = data.photoSource;
  return repo().save(a);
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number) {
  await findById(institutionId, courseIds, id);
  await AppDataSource.transaction(em => cascadeSoftDeleteAbsence(em, id));
}
