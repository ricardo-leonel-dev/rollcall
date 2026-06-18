import * as XLSX from 'xlsx';
import { AppDataSource } from '../data-source';
import { Course } from '../entities/Course';
import { Student } from '../entities/Student';
import { Guardian } from '../entities/Guardian';
import { Enrollment } from '../entities/Enrollment';
import { AcademicYear } from '../entities/AcademicYear';

function normalizeStr(s: string | null | undefined): string {
  return (s ?? '').toString().trim().toUpperCase();
}

function padIdNumber(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length < 10) {
    return trimmed.padStart(10, '0');
  }
  return trimmed;
}

export async function importRoster(institutionId: number, buffer: Buffer): Promise<{
  coursesProcessed: number; studentsCreated: number;
  studentsUpdated: number; enrollmentsCreated: number; errors: string[];
}> {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const courseRepo   = AppDataSource.getRepository(Course);
  const studentRepo  = AppDataSource.getRepository(Student);
  const guardianRepo = AppDataSource.getRepository(Guardian);
  const enrollRepo   = AppDataSource.getRepository(Enrollment);
  const ayRepo       = AppDataSource.getRepository(AcademicYear);

  const activeYear = await ayRepo.findOne({ where: { institutionId, isActive: true, deletedAt: null as any } });
  if (!activeYear) throw Object.assign(new Error('No active academic year found'), { status: 400 });

  const stats = { coursesProcessed: 0, studentsCreated: 0, studentsUpdated: 0, enrollmentsCreated: 0, errors: [] as string[] };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 7) continue;

    const headers = (rows[5] as any[]).map(h => normalizeStr(String(h)));
    const colIndex = (name: string) => headers.findIndex(h => h.includes(name));

    const colNum    = colIndex('N°') >= 0 ? colIndex('N°') : colIndex('NO');
    const colCed    = colIndex('CEDULA');
    const colName   = colIndex('APELLIDOS');
    const colSex    = colIndex('SEXO');
    const colBirth  = colIndex('NACIMIENTO');
    const colPhone  = colIndex('TELEFONO');
    const colEmail  = colIndex('EMAIL');
    const colGuard  = colIndex('REPRESENTANTE');
    const colEnroll = colIndex('MATRICULADO');

    const courseName = normalizeStr(sheetName);
    let course = await courseRepo.findOne({ where: { institutionId, name: courseName, deletedAt: null as any } });
    if (!course) {
      course = courseRepo.create({ institutionId, name: courseName, shift: 'MATUTINA' });
      course = await courseRepo.save(course);
    }
    stats.coursesProcessed++;

    for (let r = 6; r < rows.length; r++) {
      const row = rows[r] as any[];
      const rawName = colName >= 0 ? normalizeStr(String(row[colName] ?? '')) : '';
      if (!rawName) continue;

      try {
        const rawCed = colCed >= 0 ? String(row[colCed] ?? '').trim() : '';
        const idNumber = rawCed ? padIdNumber(rawCed) : undefined;
        const gender = colSex >= 0 ? String(row[colSex] ?? '').trim().toUpperCase().charAt(0) : undefined;

        let birthDate: string | undefined;
        if (colBirth >= 0 && row[colBirth]) {
          const raw = row[colBirth];
          if (raw instanceof Date) {
            birthDate = raw.toISOString().split('T')[0];
          } else if (typeof raw === 'string' && raw.includes('/')) {
            const [d, m, y] = raw.split('/');
            birthDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
        }

        let student: Student | null = null;
        if (idNumber) student = await studentRepo.findOne({ where: { institutionId, idNumber, deletedAt: null as any } });
        if (!student) student = await studentRepo.findOne({ where: { institutionId, name: rawName, deletedAt: null as any } });

        if (student) {
          student.name = rawName;
          if (idNumber)  student.idNumber  = idNumber;
          if (gender)    student.gender    = gender;
          if (birthDate) student.birthDate = birthDate;
          await studentRepo.save(student);
          stats.studentsUpdated++;
        } else {
          student = studentRepo.create({ institutionId, name: rawName, idNumber: idNumber ?? null, gender: gender ?? null, birthDate: birthDate ?? null });
          student = await studentRepo.save(student);
          stats.studentsCreated++;
        }

        let guardian: Guardian | null = null;
        if (colGuard >= 0 && row[colGuard]) {
          const guardName = normalizeStr(String(row[colGuard]));
          if (guardName) {
            guardian = await guardianRepo.findOne({ where: { institutionId, name: guardName, deletedAt: null as any } });
            if (!guardian) {
              const phone = colPhone >= 0 ? String(row[colPhone] ?? '').trim() : undefined;
              guardian = guardianRepo.create({
                institutionId,
                name: guardName,
                phone: phone || null,
                whatsappLink: phone ? `https://wa.me/593${phone.replace(/^0/, '')}` : null,
              });
              guardian = await guardianRepo.save(guardian);
            }
          }
        }

        const existing = await enrollRepo.findOne({
          where: {
            institutionId, studentId: student.id, courseId: course.id,
            academicYearId: activeYear.id, deletedAt: null as any,
          },
        });

        if (!existing) {
          const num = colNum >= 0 ? parseInt(String(row[colNum] ?? '0')) || null : null;
          const phone = colPhone >= 0 ? String(row[colPhone] ?? '').trim() || null : null;
          const email = colEmail >= 0 ? String(row[colEmail] ?? '').trim() || null : null;
          const enrolled = colEnroll >= 0 ? String(row[colEnroll] ?? '').trim().toUpperCase() !== 'NO' : true;

          await enrollRepo.save(enrollRepo.create({
            institutionId,
            studentId: student.id,
            courseId: course.id,
            academicYearId: activeYear.id,
            guardianId: guardian?.id ?? null,
            rosterNumber: num,
            isEnrolled: enrolled,
            studentPhone: phone,
            studentEmail: email,
          }));
          stats.enrollmentsCreated++;
        }
      } catch (err: any) {
        stats.errors.push(`Row ${r + 1}: ${err.message}`);
      }
    }
  }

  return stats;
}
