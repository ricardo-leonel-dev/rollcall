import { AppDataSource } from '../data-source';

export async function getSummary(institutionId: number, courseIds: number[] | null, courseId?: number, academicYearId?: number) {
  const filters: string[] = ['a.deleted_at IS NULL', 'm.deleted_at IS NULL', 'a.institution_id = $1'];
  const params: any[] = [institutionId];
  let i = 2;
  if (courseIds !== null) { filters.push(`m.course_id = ANY($${i++})`); params.push(courseIds); }
  if (courseId)       { filters.push(`m.course_id = $${i++}`);        params.push(courseId); }
  if (academicYearId) { filters.push(`m.academic_year_id = $${i++}`); params.push(academicYearId); }

  const where = filters.join(' AND ');

  const [totals] = await AppDataSource.query(`
    SELECT
      COUNT(*) FILTER (WHERE a.type = 'F')  AS total_absences,
      COUNT(*) FILTER (WHERE a.type = 'AT') AS total_tardies,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)) AS justified_count,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)) AS unjustified_count
    FROM absences a
    JOIN enrollments m ON m.id = a.enrollment_id
    WHERE ${where}
  `, params);

  const topStudents = await AppDataSource.query(`
    SELECT
      e.name AS "studentName", m.roster_number AS "rosterNumber", c.name AS course,
      COUNT(*) FILTER (WHERE a.type = 'F')  AS "totalAbsences",
      COUNT(*) FILTER (WHERE a.type = 'AT') AS "totalTardies"
    FROM absences a
    JOIN enrollments m     ON m.id = a.enrollment_id
    JOIN students e        ON e.id = m.student_id
    JOIN courses c         ON c.id = m.course_id
    WHERE ${where}
      AND NOT EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)
    GROUP BY e.id, e.name, m.roster_number, c.name
    ORDER BY "totalAbsences" DESC, "totalTardies" DESC
    LIMIT 10
  `, params);

  const lastThirtyDays = await AppDataSource.query(`
    SELECT a.date::text AS date, COUNT(*) AS count
    FROM absences a
    JOIN enrollments m ON m.id = a.enrollment_id
    WHERE ${where}
      AND a.date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY a.date
    ORDER BY a.date
  `, params);

  const totalAbs = parseInt(totals.total_absences ?? '0');
  const totalTar = parseInt(totals.total_tardies ?? '0');
  const justified = parseInt(totals.justified_count ?? '0');
  const unjustified = parseInt(totals.unjustified_count ?? '0');
  const total = totalAbs + totalTar;

  return {
    totalAbsences: totalAbs,
    totalTardies: totalTar,
    justifiedCount: justified,
    unjustifiedCount: unjustified,
    justifiedPercent: total > 0 ? Math.round((justified / total) * 100) : 0,
    topStudents,
    absencesByDay: lastThirtyDays.map((r: any) => ({ date: r.date, count: parseInt(r.count) })),
  };
}
