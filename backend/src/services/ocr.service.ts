import { AppDataSource } from '../data-source';
import { Course } from '../entities/Course';
import { AcademicYear } from '../entities/AcademicYear';

const OCR_URL = () => process.env.OCR_SERVICE_URL || 'http://ocr-service:8001';

export async function processPhoto(institutionId: number, courseId: number, academicYearId: number, date: string | undefined, file: Express.Multer.File): Promise<Response> {
  const course = await AppDataSource.getRepository(Course).findOne({ where: { id: courseId, institutionId } });
  if (!course) throw Object.assign(new Error('Course not found'), { status: 404 });
  const ay = await AppDataSource.getRepository(AcademicYear).findOne({ where: { id: academicYearId, institutionId } });
  if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });

  const fd = new FormData();
  fd.append('foto', new Blob([file.buffer]), file.originalname);
  fd.append('course_id', String(courseId));
  fd.append('academic_year_id', String(academicYearId));
  if (date) fd.append('date', date);

  const resp = await fetch(`${OCR_URL()}/process-photo`, { method: 'POST', body: fd });
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`Error en ocr-service: ${text}`), { status: resp.status });
  }
  return resp;
}
