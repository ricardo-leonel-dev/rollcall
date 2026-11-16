import { AppDataSource } from '../data-source';
import { Student } from '../entities/Student';
import { Enrollment } from '../entities/Enrollment';
import { IsNull } from 'typeorm';
import { cascadeSoftDeleteEnrollment } from './enrollment.service';
import { notWithdrawnSql } from './enrollment-withdrawal';

const repo = () => AppDataSource.getRepository(Student);

async function assertStudentInScope(courseIds: number[] | null, studentId: number): Promise<void> {
  if (courseIds === null) return;
  const rows = await AppDataSource.query(
    `SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = ANY($2) AND deleted_at IS NULL LIMIT 1`,
    [studentId, courseIds]
  );
  if (!rows.length) throw Object.assign(new Error('Student not found'), { status: 404 });
}

export async function findAll(institutionId: number, courseIds: number[] | null, search?: string, academicYearId?: number) {
  if (academicYearId !== undefined) {
    const years = await AppDataSource.query(
      `SELECT 1 FROM academic_years WHERE id = $1 AND institution_id = $2 AND deleted_at IS NULL`,
      [academicYearId, institutionId],
    );
    if (!years.length) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  }

  const qb = repo().createQueryBuilder('s')
    .where('s.institution_id = :institutionId', { institutionId })
    .andWhere('s.deleted_at IS NULL');
  if (search) qb.andWhere('s.name ILIKE :search', { search: `%${search}%` });

  // The year and the course scope narrow the list through the enrollments:
  // a student is only listed when it has an enrollment of that year (and of
  // those courses) that is neither deleted nor withdrawn.
  if (academicYearId !== undefined || courseIds !== null) {
    const conditions = ['e.student_id = s.id', 'e.deleted_at IS NULL', notWithdrawnSql('e', 'id')];
    if (academicYearId !== undefined) {
      qb.setParameter('academicYearId', academicYearId);
      conditions.push('e.academic_year_id = :academicYearId');
    }
    if (courseIds !== null) {
      qb.setParameter('courseIds', courseIds);
      conditions.push('e.course_id = ANY(:courseIds)');
    }
    qb.andWhere(`EXISTS (SELECT 1 FROM enrollments e WHERE ${conditions.join(' AND ')})`);
  }

  qb.orderBy('s.name', 'ASC');
  return qb.getMany();
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  const s = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!s) throw Object.assign(new Error('Student not found'), { status: 404 });
  await assertStudentInScope(courseIds, id);
  return s;
}

export async function create(institutionId: number, data: {
  name: string; idNumber?: string; gender?: string;
  birthDate?: string;
}) {
  const s = repo().create({ ...data, institutionId, name: data.name.toUpperCase() });
  return repo().save(s);
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{
  name: string; idNumber: string; gender: string;
  birthDate: string; isActive: boolean;
}>) {
  const s = await findById(institutionId, courseIds, id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(s, data);
  return repo().save(s);
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number) {
  await findById(institutionId, courseIds, id);
  await AppDataSource.transaction(async (em) => {
    const enrollments = await em.find(Enrollment, { where: { studentId: id, deletedAt: IsNull() } });
    for (const e of enrollments) await cascadeSoftDeleteEnrollment(em, e.id);
    await em.update(Student, { id }, { deletedAt: new Date(), isActive: false });
  });
}
