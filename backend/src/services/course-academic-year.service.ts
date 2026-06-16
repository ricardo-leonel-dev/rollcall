import { AppDataSource } from '../data-source';
import { CourseAcademicYear } from '../entities/CourseAcademicYear';

const repo = () => AppDataSource.getRepository(CourseAcademicYear);

export async function findAll(courseId?: number, academicYearId?: number) {
  const qb = repo().createQueryBuilder('ca')
    .where('ca.deleted_at IS NULL');
  if (courseId)       qb.andWhere('ca.course_id = :courseId', { courseId });
  if (academicYearId) qb.andWhere('ca.academic_year_id = :academicYearId', { academicYearId });
  return qb.getMany();
}

export async function findById(id: number) {
  const ca = await repo().findOne({ where: { id, deletedAt: null as any } });
  if (!ca) throw Object.assign(new Error('Assignment not found'), { status: 404 });
  return ca;
}

export async function create(data: { courseId: number; academicYearId: number; teacher?: string }) {
  const ca = repo().create({
    courseId: data.courseId,
    academicYearId: data.academicYearId,
    teacher: data.teacher ?? null,
  });
  return repo().save(ca);
}

export async function update(id: number, data: Partial<{ teacher: string; isActive: boolean }>) {
  const ca = await findById(id);
  Object.assign(ca, data);
  return repo().save(ca);
}
