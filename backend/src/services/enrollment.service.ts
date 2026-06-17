import { AppDataSource } from '../data-source';
import { Enrollment } from '../entities/Enrollment';

const repo = () => AppDataSource.getRepository(Enrollment);

export async function findAll(courseId?: number, academicYearId?: number, studentId?: number) {
  const conditions: string[] = [];
  const params: number[] = [];
  let i = 1;
  if (courseId)       { conditions.push(`course_id = $${i++}`);        params.push(courseId); }
  if (academicYearId) { conditions.push(`academic_year_id = $${i++}`); params.push(academicYearId); }
  if (studentId)      { conditions.push(`student_id = $${i++}`);       params.push(studentId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return AppDataSource.query(
    `SELECT
       enrollment_id   AS "enrollmentId",
       academic_year_id AS "academicYearId",
       academic_year   AS "academicYear",
       course_id       AS "courseId",
       course,
       teacher,
       student_id      AS "studentId",
       roster_number   AS "rosterNumber",
       id_number       AS "idNumber",
       full_name       AS "fullName",
       gender,
       birth_date      AS "birthDate",
       age,
       is_enrolled     AS "isEnrolled",
       student_phone   AS "studentPhone",
       student_email   AS "studentEmail",
       guardian_id     AS "guardianId",
       guardian_name   AS "guardianName",
       guardian_phone  AS "guardianPhone",
       whatsapp_link   AS "whatsappLink",
       guardian_email  AS "guardianEmail",
       guardian_id_number AS "guardianIdNumber",
       is_active       AS "isActive"
     FROM v_enrollments_detail
     ${where}
     ORDER BY academic_year_id DESC, roster_number NULLS LAST, full_name`,
    params
  );
}

export async function findById(id: number) {
  const e = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!e) throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  return e;
}

export async function create(data: {
  studentId: number; courseId: number; academicYearId: number;
  guardianId?: number; rosterNumber?: number; isEnrolled?: boolean;
  studentPhone?: string; studentEmail?: string;
}) {
  const e = repo().create(data);
  return repo().save(e);
}

export async function update(id: number, data: Partial<{
  guardianId: number; rosterNumber: number; isEnrolled: boolean;
  studentPhone: string; studentEmail: string; isActive: boolean;
}>) {
  const e = await findById(id);
  Object.assign(e, data);
  return repo().save(e);
}

export async function remove(id: number) {
  const e = await findById(id);
  e.deletedAt = new Date();
  e.isActive = false;
  await repo().save(e);
}
