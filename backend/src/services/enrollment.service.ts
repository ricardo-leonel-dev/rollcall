import { AppDataSource } from '../data-source';
import { Enrollment } from '../entities/Enrollment';
import { Student } from '../entities/Student';
import { Course } from '../entities/Course';
import { AcademicYear } from '../entities/AcademicYear';
import { Guardian } from '../entities/Guardian';

const repo = () => AppDataSource.getRepository(Enrollment);

async function assertOwnership(institutionId: number, data: {
  studentId?: number; courseId?: number; academicYearId?: number; guardianId?: number | null;
}) {
  if (data.studentId !== undefined) {
    const s = await AppDataSource.getRepository(Student).findOne({ where: { id: data.studentId, institutionId } });
    if (!s) throw Object.assign(new Error('Student not found'), { status: 404 });
  }
  if (data.courseId !== undefined) {
    const c = await AppDataSource.getRepository(Course).findOne({ where: { id: data.courseId, institutionId } });
    if (!c) throw Object.assign(new Error('Course not found'), { status: 404 });
  }
  if (data.academicYearId !== undefined) {
    const ay = await AppDataSource.getRepository(AcademicYear).findOne({ where: { id: data.academicYearId, institutionId } });
    if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  }
  if (data.guardianId) {
    const g = await AppDataSource.getRepository(Guardian).findOne({ where: { id: data.guardianId, institutionId } });
    if (!g) throw Object.assign(new Error('Guardian not found'), { status: 404 });
  }
}

export async function findAll(institutionId: number, courseId?: number, academicYearId?: number, studentId?: number) {
  const conditions: string[] = ['institution_id = $1'];
  const params: number[] = [institutionId];
  let i = 2;
  if (courseId)       { conditions.push(`course_id = $${i++}`);        params.push(courseId); }
  if (academicYearId) { conditions.push(`academic_year_id = $${i++}`); params.push(academicYearId); }
  if (studentId)      { conditions.push(`student_id = $${i++}`);       params.push(studentId); }

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
     WHERE ${conditions.join(' AND ')}
     ORDER BY academic_year_id DESC, roster_number NULLS LAST, full_name`,
    params
  );
}

export async function findById(institutionId: number, id: number) {
  const e = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
  if (!e) throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  return e;
}

export async function create(institutionId: number, data: {
  studentId: number; courseId: number; academicYearId: number;
  guardianId?: number; rosterNumber?: number; isEnrolled?: boolean;
  studentPhone?: string; studentEmail?: string;
}) {
  await assertOwnership(institutionId, data);
  const e = repo().create({ ...data, institutionId });
  return repo().save(e);
}

export async function update(institutionId: number, id: number, data: Partial<{
  guardianId: number; rosterNumber: number; isEnrolled: boolean;
  studentPhone: string; studentEmail: string; isActive: boolean;
}>) {
  const e = await findById(institutionId, id);
  if (data.guardianId !== undefined) await assertOwnership(institutionId, { guardianId: data.guardianId });
  Object.assign(e, data);
  return repo().save(e);
}

export async function remove(institutionId: number, id: number) {
  const e = await findById(institutionId, id);
  e.deletedAt = new Date();
  e.isActive = false;
  await repo().save(e);
}
