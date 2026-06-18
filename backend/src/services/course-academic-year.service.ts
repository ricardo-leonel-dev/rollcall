import { AppDataSource } from '../data-source';
import { CourseAcademicYear } from '../entities/CourseAcademicYear';
import { Course } from '../entities/Course';
import { AcademicYear } from '../entities/AcademicYear';

const repo = () => AppDataSource.getRepository(CourseAcademicYear);

export async function findAll(institutionId: number, courseIds: number[] | null, courseId?: number, academicYearId?: number) {
  const qb = repo().createQueryBuilder('ca')
    .where('ca.deleted_at IS NULL')
    .andWhere('ca.institution_id = :institutionId', { institutionId });
  if (courseIds !== null) qb.andWhere('ca.course_id IN (:...courseIds)', { courseIds });
  if (courseId)       qb.andWhere('ca.course_id = :courseId', { courseId });
  if (academicYearId) qb.andWhere('ca.academic_year_id = :academicYearId', { academicYearId });
  return qb.getMany();
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  const ca = await repo().findOne({ where: { id, institutionId, deletedAt: null as any } });
  if (!ca || (courseIds !== null && !courseIds.includes(ca.courseId))) {
    throw Object.assign(new Error('Assignment not found'), { status: 404 });
  }
  return ca;
}

export async function create(institutionId: number, courseIds: number[] | null, data: { courseId: number; academicYearId: number; teacher?: string }) {
  if (courseIds !== null && !courseIds.includes(data.courseId)) {
    throw Object.assign(new Error('Course not found'), { status: 404 });
  }
  const course = await AppDataSource.getRepository(Course).findOne({ where: { id: data.courseId, institutionId } });
  if (!course) throw Object.assign(new Error('Course not found'), { status: 404 });
  const ay = await AppDataSource.getRepository(AcademicYear).findOne({ where: { id: data.academicYearId, institutionId } });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });

  const ca = repo().create({
    institutionId,
    courseId: data.courseId,
    academicYearId: data.academicYearId,
    teacher: data.teacher ?? null,
  });
  return repo().save(ca);
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{ teacher: string; isActive: boolean }>) {
  const ca = await findById(institutionId, courseIds, id);
  Object.assign(ca, data);
  return repo().save(ca);
}
