import { AppDataSource } from '../data-source';

export async function getSummary(institutionId: number, courseIds: number[] | null, courseId?: number, academicYearId?: number, dateFrom?: string, dateTo?: string) {
  const filters: string[] = ['a.deleted_at IS NULL', 'm.deleted_at IS NULL', 'a.institution_id = $1'];
  const params: any[] = [institutionId];
  let i = 2;
  if (courseIds !== null) { filters.push(`m.course_id = ANY($${i++})`); params.push(courseIds); }
  if (courseId)       { filters.push(`m.course_id = $${i++}`);        params.push(courseId); }
  if (academicYearId) { filters.push(`m.academic_year_id = $${i++}`); params.push(academicYearId); }
  let dateFromIdx: number | undefined;
  let dateToIdx: number | undefined;
  if (dateFrom)        { dateFromIdx = i; filters.push(`a.date >= $${i++}`); params.push(dateFrom); }
  if (dateTo)          { dateToIdx = i;   filters.push(`a.date <= $${i++}`); params.push(dateTo); }

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
      e.name AS "studentName", m.roster_number AS "rosterNumber", c.id AS "courseId", c.name AS course,
      COUNT(*) FILTER (WHERE a.type = 'F'  AND NOT EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)) AS "totalAbsences",
      COUNT(*) FILTER (WHERE a.type = 'AT' AND NOT EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)) AS "totalTardies",
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)) AS "totalJustified",
      COALESCE((
        SELECT json_agg(json_build_object(
          'date', a2.date,
          'type', a2.type,
          'isJustified', EXISTS (SELECT 1 FROM justification_absences ja2 WHERE ja2.absence_id = a2.id)
        ) ORDER BY a2.date)
        FROM absences a2
        WHERE a2.enrollment_id = m.id AND a2.deleted_at IS NULL
          ${dateFromIdx ? `AND a2.date >= $${dateFromIdx}` : ''}
          ${dateToIdx   ? `AND a2.date <= $${dateToIdx}`   : ''}
      ), '[]') AS breakdown
    FROM absences a
    JOIN enrollments m     ON m.id = a.enrollment_id
    JOIN students e        ON e.id = m.student_id
    JOIN courses c         ON c.id = m.course_id
    WHERE ${where}
    GROUP BY e.id, e.name, m.roster_number, m.id, c.id, c.name
    HAVING COUNT(*) FILTER (WHERE a.type = 'F'  AND NOT EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)) > 0
        OR COUNT(*) FILTER (WHERE a.type = 'AT' AND NOT EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id)) > 0
    ORDER BY "totalAbsences" DESC, "totalTardies" DESC
    LIMIT 10
  `, params);

  const byCourse = await AppDataSource.query(`
    SELECT c.name AS course,
           COUNT(*) FILTER (WHERE a.type = 'F')  AS "totalAbsences",
           COUNT(*) FILTER (WHERE a.type = 'AT') AS "totalTardies"
    FROM absences a
    JOIN enrollments m ON m.id = a.enrollment_id
    JOIN courses c     ON c.id = m.course_id
    WHERE ${where}
    GROUP BY c.id, c.name
    ORDER BY c.name
  `, params);

  const absencesByDay = await AppDataSource.query(`
    SELECT a.date::text AS date, COUNT(*) AS count
    FROM absences a
    JOIN enrollments m ON m.id = a.enrollment_id
    WHERE ${where}
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
    byCourse: byCourse.map((r: any) => ({ course: r.course, totalAbsences: parseInt(r.totalAbsences), totalTardies: parseInt(r.totalTardies) })),
    absencesByDay: absencesByDay.map((r: any) => ({ date: r.date, count: parseInt(r.count) })),
  };
}
