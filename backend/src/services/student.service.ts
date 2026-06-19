import { AppDataSource } from '../data-source';
import { Student } from '../entities/Student';
import { Enrollment } from '../entities/Enrollment';
import { IsNull } from 'typeorm';
import { cascadeSoftDeleteEnrollment } from './enrollment.service';

const repo = () => AppDataSource.getRepository(Student);

async function assertStudentInScope(courseIds: number[] | null, studentId: number): Promise<void> {
  if (courseIds === null) return;
  const rows = await AppDataSource.query(
    `SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = ANY($2) AND deleted_at IS NULL LIMIT 1`,
    [studentId, courseIds]
  );
  if (!rows.length) throw Object.assign(new Error('Student not found'), { status: 404 });
}

export async function findAll(institutionId: number, courseIds: number[] | null, search?: string) {
  const qb = repo().createQueryBuilder('s')
    .where('s.institution_id = :institutionId', { institutionId })
    .andWhere('s.deleted_at IS NULL');
  if (search) qb.andWhere('s.name ILIKE :search', { search: `%${search}%` });
  if (courseIds !== null) {
    qb.andWhere('s.id IN (SELECT student_id FROM enrollments WHERE course_id = ANY(:courseIds) AND deleted_at IS NULL)', { courseIds });
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
