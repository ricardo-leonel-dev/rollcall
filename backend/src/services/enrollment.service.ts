import { AppDataSource } from '../data-source';
import { Enrollment } from '../entities/Enrollment';

const repo = () => AppDataSource.getRepository(Enrollment);

export async function findAll(courseId?: number, academicYearId?: number) {
  return AppDataSource.query(
    `SELECT * FROM v_enrollments_detail
     WHERE TRUE
     ${courseId ? `AND course_id = ${courseId}` : ''}
     ${academicYearId ? `AND academic_year_id = ${academicYearId}` : ''}
     ORDER BY roster_number NULLS LAST, full_name`
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
