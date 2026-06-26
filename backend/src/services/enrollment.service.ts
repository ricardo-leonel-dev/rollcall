import { EntityManager, IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Enrollment } from '../entities/Enrollment';
import { Student } from '../entities/Student';
import { Course } from '../entities/Course';
import { AcademicYear } from '../entities/AcademicYear';
import { Guardian } from '../entities/Guardian';
import { Absence } from '../entities/Absence';
import { cascadeSoftDeleteAbsence } from './absence.service';

const repo = () => AppDataSource.getRepository(Enrollment);

export async function cascadeSoftDeleteEnrollment(em: EntityManager, enrollmentId: number): Promise<void> {
  const absences = await em.find(Absence, { where: { enrollmentId, deletedAt: IsNull() } });
  for (const a of absences) await cascadeSoftDeleteAbsence(em, a.id);
  await em.update(Enrollment, { id: enrollmentId }, { deletedAt: new Date(), isActive: false });
}

async function assertOwnership(institutionId: number, courseIds: number[] | null, data: {
  studentId?: number; courseId?: number; academicYearId?: number; guardianId?: number | null;
}) {
  if (data.studentId !== undefined) {
    const s = await AppDataSource.getRepository(Student).findOne({ where: { id: data.studentId, institutionId } });
    if (!s) throw Object.assign(new Error('Student not found'), { status: 404 });
  }
  if (data.courseId !== undefined) {
    if (courseIds !== null && !courseIds.includes(data.courseId)) {
      throw Object.assign(new Error('Course not found'), { status: 404 });
    }
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

export async function findAll(institutionId: number, courseIds: number[] | null, courseId?: number, academicYearId?: number, studentId?: number) {
  const conditions: string[] = ['institution_id = $1'];
  const params: any[] = [institutionId];
  let i = 2;
  if (courseIds !== null)  { conditions.push(`course_id = ANY($${i++})`); params.push(courseIds); }
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
       ROW_NUMBER() OVER (PARTITION BY course_id, academic_year_id ORDER BY full_name) AS "rosterNumber",
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
     ORDER BY academic_year_id DESC, full_name`,
    params
  );
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  const e = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!e || (courseIds !== null && !courseIds.includes(e.courseId))) {
    throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  }
  return e;
}

export async function create(institutionId: number, courseIds: number[] | null, data: {
  studentId: number; courseId: number; academicYearId: number;
  guardianId?: number; rosterNumber?: number; isEnrolled?: boolean;
  studentPhone?: string; studentEmail?: string;
}) {
  await assertOwnership(institutionId, courseIds, data);
  if (!data.rosterNumber) {
    const [row] = await AppDataSource.query(
      `SELECT COALESCE(MAX(roster_number), 0) + 1 AS next
         FROM enrollments
        WHERE course_id = $1 AND academic_year_id = $2 AND deleted_at IS NULL`,
      [data.courseId, data.academicYearId]
    );
    data.rosterNumber = Number(row.next);
  }
  const e = repo().create({ ...data, institutionId });
  return repo().save(e);
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{
  guardianId: number; rosterNumber: number; isEnrolled: boolean;
  studentPhone: string; studentEmail: string; isActive: boolean;
}>) {
  const e = await findById(institutionId, courseIds, id);
  if (data.guardianId !== undefined) await assertOwnership(institutionId, courseIds, { guardianId: data.guardianId });
  Object.assign(e, data);
  return repo().save(e);
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number) {
  await findById(institutionId, courseIds, id);
  await AppDataSource.transaction(em => cascadeSoftDeleteEnrollment(em, id));
}
