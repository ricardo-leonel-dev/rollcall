import { AppDataSource } from '../data-source';

export interface StudentReportItem {
  id: number;
  studentName: string;
  rosterNumber: number | null;
  absences: number;
  tardies: number;
  justified: number;
}

export interface CourseReport {
  course: { id: number; name: string };
  students: StudentReportItem[];
}

export async function getStudentSummary(
  institutionId: number,
  scopedCourseIds: number[] | null,
  requestedCourseIds: number[],
  academicYearId: number,
  dateFrom: string,
  dateTo: string,
): Promise<CourseReport[]> {
  const courseIdsToQuery =
    scopedCourseIds !== null
      ? requestedCourseIds.filter(id => scopedCourseIds.includes(id))
      : requestedCourseIds;

  if (!courseIdsToQuery.length) return [];

  const rows = await AppDataSource.query(
    `SELECT
       c.id            AS "courseId",
       c.name          AS "courseName",
       e.id            AS "studentId",
       e.name          AS "studentName",
       m.roster_number AS "rosterNumber",
       COUNT(a.id) FILTER (WHERE a.type = 'F')  AS "absences",
       COUNT(a.id) FILTER (WHERE a.type = 'AT') AS "tardies",
       COUNT(a.id) FILTER (WHERE EXISTS (
         SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id
       )) AS "justified"
     FROM enrollments m
     JOIN students e ON e.id = m.student_id
     JOIN courses c  ON c.id = m.course_id
     LEFT JOIN absences a
       ON  a.enrollment_id  = m.id
       AND a.deleted_at     IS NULL
       AND a.institution_id = $1
       AND a.date BETWEEN $4 AND $5
     WHERE m.deleted_at     IS NULL
       AND m.institution_id = $1
       AND m.academic_year_id = $2
       AND m.course_id = ANY($3)
     GROUP BY c.id, c.name, e.id, e.name, m.roster_number
     ORDER BY c.name, m.roster_number NULLS LAST, e.name`,
    [institutionId, academicYearId, courseIdsToQuery, dateFrom, dateTo],
  );

  const map = new Map<number, CourseReport>();
  for (const row of rows) {
    if (!map.has(row.courseId)) {
      map.set(row.courseId, { course: { id: row.courseId, name: row.courseName }, students: [] });
    }
    map.get(row.courseId)!.students.push({
      id: row.studentId,
      studentName: row.studentName,
      rosterNumber: row.rosterNumber !== null ? Number(row.rosterNumber) : null,
      absences: Number(row.absences),
      tardies: Number(row.tardies),
      justified: Number(row.justified),
    });
  }

  return [...map.values()];
}
