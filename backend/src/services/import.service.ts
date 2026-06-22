import { IsNull } from 'typeorm';
import * as XLSX from 'xlsx';
import { AppDataSource } from '../data-source';
import { Course } from '../entities/Course';
import { Student } from '../entities/Student';
import { Guardian } from '../entities/Guardian';
import { Enrollment } from '../entities/Enrollment';
import { AcademicYear } from '../entities/AcademicYear';
import { buildWhatsappLink } from './guardian.service';

function normalizeStr(s: string | null | undefined): string {
  return (s ?? '').toString().trim().toUpperCase();
}

// Excel guarda cédula y teléfono como número, no texto — el formato de celda les
// pone el cero inicial solo para mostrarlos (ej. "0991606679"), pero el valor real
// que se lee llega sin él. No se puede asumir un largo fijo (cédula son 10 dígitos,
// pero teléfono varía entre celular de 10 y fijo de 9) — siempre se pierde exactamente
// un solo cero inicial, nunca más, así que basta con reponerlo si falta.
function padDigits(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed) && !trimmed.startsWith('0')) {
    return '0' + trimmed;
  }
  return trimmed;
}

export async function importRoster(institutionId: number, buffer: Buffer): Promise<{
  coursesProcessed: number; studentsCreated: number; studentsUpdated: number;
  enrollmentsCreated: number; enrollmentsUpdated: number; guardiansUpdated: number;
  errors: string[];
}> {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const courseRepo   = AppDataSource.getRepository(Course);
  const studentRepo  = AppDataSource.getRepository(Student);
  const guardianRepo = AppDataSource.getRepository(Guardian);
  const enrollRepo   = AppDataSource.getRepository(Enrollment);
  const ayRepo       = AppDataSource.getRepository(AcademicYear);

  const activeYear = await ayRepo.findOne({ where: { institutionId, isActive: true, deletedAt: IsNull() } });
  if (!activeYear) throw Object.assign(new Error('No active academic year found'), { status: 400 });

  const stats = {
    coursesProcessed: 0, studentsCreated: 0, studentsUpdated: 0,
    enrollmentsCreated: 0, enrollmentsUpdated: 0, guardiansUpdated: 0,
    errors: [] as string[],
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 7) continue;

    const headers = (rows[5] as any[]).map(h => normalizeStr(String(h)));
    const colIndexAll = (...needles: string[]) => headers.findIndex(h => needles.every(n => h.includes(n)));
    const colIndex = (name: string) => colIndexAll(name);

    const colNum    = colIndex('N°') >= 0 ? colIndex('N°') : colIndex('NO');
    const colCed    = colIndex('CEDULA');
    const colName   = colIndex('APELLIDOS');
    const colSex    = colIndex('SEXO');
    const colBirth  = colIndex('NACIMIENTO');
    const colEnroll = colIndex('MATRICULADO');

    // El Excel trae columnas separadas para estudiante y representante que comparten
    // la misma palabra clave (TELEFONO / CORREO) — hace falta el segundo substring
    // para no confundir el teléfono/correo del estudiante con el del representante.
    const colGuard       = colIndexAll('REPRESENTANTE', 'LEGAL');
    const colStudPhone   = colIndexAll('TELEFONO', 'ESTUDIANTE');
    const colStudEmail   = colIndexAll('CORREO', 'ESTUDIANTE');
    const colGuardPhone  = colIndexAll('TELEFONO', 'REPRESENTANTE');
    const colGuardEmail  = colIndexAll('CORREO', 'REPRESENTANTE');

    const courseName = normalizeStr(sheetName);
    let course = await courseRepo.findOne({ where: { institutionId, name: courseName, deletedAt: IsNull() } });
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
        const idNumber = rawCed ? padDigits(rawCed) : undefined;
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

        const studentPhoneRaw = colStudPhone  >= 0 ? String(row[colStudPhone]  ?? '').trim() : '';
        const studentEmail    = colStudEmail  >= 0 ? String(row[colStudEmail]  ?? '').trim() || null : null;
        const guardPhoneRaw    = colGuardPhone >= 0 ? String(row[colGuardPhone] ?? '').trim() : '';
        const guardEmail       = colGuardEmail >= 0 ? String(row[colGuardEmail] ?? '').trim() || null : null;
        const studentPhone = studentPhoneRaw ? padDigits(studentPhoneRaw) : null;
        const guardPhone    = guardPhoneRaw ? padDigits(guardPhoneRaw) : null;

        let student: Student | null = null;
        if (idNumber) student = await studentRepo.findOne({ where: { institutionId, idNumber, deletedAt: IsNull() } });
        if (!student) student = await studentRepo.findOne({ where: { institutionId, name: rawName, deletedAt: IsNull() } });

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
            guardian = await guardianRepo.findOne({ where: { institutionId, name: guardName, deletedAt: IsNull() } });
            if (!guardian) {
              guardian = guardianRepo.create({
                institutionId,
                name: guardName,
                phone: guardPhone,
                email: guardEmail,
                whatsappLink: buildWhatsappLink(guardPhone),
              });
              guardian = await guardianRepo.save(guardian);
            } else {
              let guardianChanged = false;
              if (guardPhone && guardian.phone !== guardPhone) {
                guardian.phone = guardPhone;
                guardian.whatsappLink = buildWhatsappLink(guardPhone);
                guardianChanged = true;
              }
              if (guardEmail && guardian.email !== guardEmail) {
                guardian.email = guardEmail;
                guardianChanged = true;
              }
              if (guardianChanged) {
                guardian = await guardianRepo.save(guardian);
                stats.guardiansUpdated++;
              }
            }
          }
        }

        const existing = await enrollRepo.findOne({
          where: {
            institutionId, studentId: student.id, courseId: course.id,
            academicYearId: activeYear.id, deletedAt: IsNull(),
          },
        });

        const num = colNum >= 0 ? parseInt(String(row[colNum] ?? '0')) || null : null;
        const enrolled = colEnroll >= 0 ? String(row[colEnroll] ?? '').trim().toUpperCase() !== 'NO' : true;

        if (!existing) {
          await enrollRepo.save(enrollRepo.create({
            institutionId,
            studentId: student.id,
            courseId: course.id,
            academicYearId: activeYear.id,
            guardianId: guardian?.id ?? null,
            rosterNumber: num,
            isEnrolled: enrolled,
            studentPhone,
            studentEmail,
          }));
          stats.enrollmentsCreated++;
        } else {
          let enrollmentChanged = false;
          if (num !== null && existing.rosterNumber !== num) { existing.rosterNumber = num; enrollmentChanged = true; }
          if (existing.isEnrolled !== enrolled) { existing.isEnrolled = enrolled; enrollmentChanged = true; }
          if (studentPhone && existing.studentPhone !== studentPhone) { existing.studentPhone = studentPhone; enrollmentChanged = true; }
          if (studentEmail && existing.studentEmail !== studentEmail) { existing.studentEmail = studentEmail; enrollmentChanged = true; }
          if (guardian && existing.guardianId !== guardian.id) { existing.guardianId = guardian.id; enrollmentChanged = true; }
          if (enrollmentChanged) {
            await enrollRepo.save(existing);
            stats.enrollmentsUpdated++;
          }
        }
      } catch (err: any) {
        stats.errors.push(`Row ${r + 1}: ${err.message}`);
      }
    }
  }

  return stats;
}
