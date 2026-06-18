import { AppDataSource } from '../data-source';
import { Absence } from '../entities/Absence';
import { Enrollment } from '../entities/Enrollment';

const repo = () => AppDataSource.getRepository(Absence);

interface AbsenceFilters {
  enrollmentId?: number;
  courseId?: number;
  academicYearId?: number;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  isJustified?: string;
}

export async function findAll(institutionId: number, filters: AbsenceFilters) {
  const conditions: string[] = ['a.deleted_at IS NULL', 'm.deleted_at IS NULL', 'a.institution_id = $1'];
  const params: any[] = [institutionId];
  let i = 2;

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

export async function findById(institutionId: number, id: number) {
  const a = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
  if (!a) throw Object.assign(new Error('Absence not found'), { status: 404 });
  return a;
}

export async function create(institutionId: number, data: {
  enrollmentId: number; date: string; type: 'F' | 'AT';
  notes?: string; photoSource?: string;
}) {
  if (!['F', 'AT'].includes(data.type)) {
    throw Object.assign(new Error('Invalid type. Only F or AT'), { status: 400 });
  }
  const enrollment = await AppDataSource.getRepository(Enrollment).findOne({ where: { id: data.enrollmentId, institutionId } });
  if (!enrollment) throw Object.assign(new Error('Enrollment not found'), { status: 404 });

  const a = repo().create({
    institutionId,
    enrollmentId: data.enrollmentId,
    date: data.date,
    type: data.type,
    notes: data.notes ?? null,
    photoSource: data.photoSource ?? null,
  });
  return repo().save(a);
}

export async function update(institutionId: number, id: number, data: Partial<{
  date: string; type: 'F' | 'AT'; notes: string; photoSource: string;
}>) {
  const a = await findById(institutionId, id);
  if (data.type && !['F', 'AT'].includes(data.type)) {
    throw Object.assign(new Error('Invalid type. Only F or AT'), { status: 400 });
  }
  if (data.date)                      a.date        = data.date;
  if (data.type)                      a.type        = data.type;
  if (data.notes !== undefined)       a.notes       = data.notes;
  if (data.photoSource !== undefined) a.photoSource = data.photoSource;
  return repo().save(a);
}

export async function remove(institutionId: number, id: number) {
  const a = await findById(institutionId, id);
  a.deletedAt = new Date();
  a.isActive = false;
  await repo().save(a);
}
