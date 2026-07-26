import { AppDataSource } from '../data-source';
import { Enrollment } from '../entities/Enrollment';

interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

const SUMMARY_LIMIT = 5;

async function assertEnrollmentInScope(institutionId: number, courseIds: number[] | null, enrollmentId: number): Promise<Enrollment> {
  const enrollment = await AppDataSource.getRepository(Enrollment).findOne({ where: { id: enrollmentId, institutionId } });
  if (!enrollment || (courseIds !== null && !courseIds.includes(enrollment.courseId))) {
    throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  }
  return enrollment;
}

async function getEnrollmentDetail(enrollmentId: number) {
  const rows = await AppDataSource.query(
    `SELECT
       enrollment_id    AS "enrollmentId",
       full_name        AS "studentName",
       id_number        AS "idNumber",
       roster_number    AS "rosterNumber",
       course_id        AS "courseId",
       course           AS "courseName",
       academic_year_id AS "academicYearId",
       academic_year    AS "academicYear"
     FROM v_enrollments_detail
     WHERE enrollment_id = $1`,
    [enrollmentId]
  );
  return rows[0];
}

async function fetchAbsenceSummary(institutionId: number, enrollmentId: number, type: 'F' | 'AT', range: DateRange) {
  const conditions = ['a.enrollment_id = $1', 'a.institution_id = $2', 'a.deleted_at IS NULL', 'a.type = $3'];
  const params: any[] = [enrollmentId, institutionId, type];
  let i = 4;
  if (range.dateFrom) { conditions.push(`a.date >= $${i++}`); params.push(range.dateFrom); }
  if (range.dateTo)   { conditions.push(`a.date <= $${i++}`); params.push(range.dateTo); }

  const rows = await AppDataSource.query(
    `SELECT
       a.id, a.date::text AS date, a.created_at AS "createdAt",
       EXISTS (SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id) AS "isJustified"
     FROM absences a
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC`,
    params
  );
  return { total: rows.length, items: rows.slice(0, SUMMARY_LIMIT) };
}

async function fetchJustificationSummary(institutionId: number, enrollmentId: number, range: DateRange) {
  const conditions = ['j.enrollment_id = $1', 'j.institution_id = $2', 'j.deleted_at IS NULL'];
  const params: any[] = [enrollmentId, institutionId];
  let i = 3;

  let dateFilter = '';
  if (range.dateFrom || range.dateTo) {
    const sub = ['ja2.justification_id = j.id'];
    if (range.dateFrom) { sub.push(`a2.date >= $${i++}`); params.push(range.dateFrom); }
    if (range.dateTo)   { sub.push(`a2.date <= $${i++}`); params.push(range.dateTo); }
    dateFilter = `AND EXISTS (SELECT 1 FROM justification_absences ja2 JOIN absences a2 ON a2.id = ja2.absence_id WHERE ${sub.join(' AND ')})`;
  }

  const rows = await AppDataSource.query(
    `SELECT
       j.id, j.reason, j.created_at AS "createdAt",
       COALESCE((
         SELECT json_agg(a.date::text ORDER BY a.date)
         FROM justification_absences ja
         JOIN absences a ON a.id = ja.absence_id
         WHERE ja.justification_id = j.id
       ), '[]') AS "absenceDates"
     FROM justifications j
     WHERE ${conditions.join(' AND ')}
     ${dateFilter}
     ORDER BY j.created_at DESC`,
    params
  );
  return { total: rows.length, items: rows.slice(0, SUMMARY_LIMIT) };
}

export async function getSummary(institutionId: number, courseIds: number[] | null, enrollmentId: number, range: DateRange) {
  await assertEnrollmentInScope(institutionId, courseIds, enrollmentId);

  const [enrollment, absences, tardies, justifications] = await Promise.all([
    getEnrollmentDetail(enrollmentId),
    fetchAbsenceSummary(institutionId, enrollmentId, 'F', range),
    fetchAbsenceSummary(institutionId, enrollmentId, 'AT', range),
    fetchJustificationSummary(institutionId, enrollmentId, range),
  ]);

  return {
    enrollment,
    absences,
    tardies,
    justifications,
    citations: { status: 'not_implemented' },
  };
}

interface TimelineEvent {
  type: 'enrollment' | 'absence' | 'tardy' | 'justification';
  recordedAt: string;
  occurredAt: string | null;
  title: string;
  description: string;
  createdByName: string | null;
  origin: string | null;
}

const monthLabel = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });

// Only "Inspectoría" and "Maestro" have a real system actor today — Tutor(a)/
// Enfermería/DECE are placeholder modules with no role behind them yet, so any
// role not explicitly mapped here still falls back to "Inspectoría", which is
// where nearly every record in the system originates from at the moment.
const ORIGIN_BY_ROLE: Record<string, string> = {
  teacher: 'Maestro',
  rector: 'Inspectoría',
  admin: 'Inspectoría',
  superadmin: 'Inspectoría',
  readonly: 'Inspectoría',
  'inspector de apoyo': 'Inspectoría',
  'inspector general': 'Inspectoría',
};

function originForRole(roleName: string | null): string | null {
  if (!roleName) return null;
  return ORIGIN_BY_ROLE[roleName] ?? 'Inspectoría';
}

interface CreatorRow {
  createdByName: string | null;
  createdByUsername: string | null;
  createdByTitle: string | null;
  createdBySignatureLabel: string | null;
  createdByRole: string | null;
}

// Mirrors how a report signature is built (export-config-dialog.component.ts:
// `[title, fullName].join(' ')` for the name, `signatureLabel` for the role
// line) — reusing the same fields users already fill in to sign reports means
// the timeline shows their actual position ("INSPECTOR GENERAL", "DOCENTE DE
// MATEMÁTICAS"...) instead of a generic role label whenever it's set; the
// role→area mapping is only a fallback for users who never set it.
function creatorFields(row: CreatorRow): { createdByName: string | null; origin: string | null } {
  const baseName = row.createdByName ?? row.createdByUsername ?? null;
  return {
    createdByName: baseName ? [row.createdByTitle, baseName].filter(Boolean).join(' ') : null,
    origin: row.createdBySignatureLabel || originForRole(row.createdByRole),
  };
}

// Reused verbatim across the enrollment/absence/justification timeline
// queries below, each with its own LEFT JOIN users/roles.
const CREATOR_SELECT = `u.full_name AS "createdByName", u.username AS "createdByUsername", u.title AS "createdByTitle", u.signature_label AS "createdBySignatureLabel", r.name AS "createdByRole"`;

export async function getTimeline(institutionId: number, courseIds: number[] | null, enrollmentId: number, range: DateRange): Promise<TimelineEvent[]> {
  await assertEnrollmentInScope(institutionId, courseIds, enrollmentId);
  const enrollment = await getEnrollmentDetail(enrollmentId);

  const enrollmentRow = await AppDataSource.query(
    `SELECT e.created_at AS "createdAt", ${CREATOR_SELECT}
     FROM enrollments e
     LEFT JOIN users u ON u.id = e.created_by_user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE e.id = $1`,
    [enrollmentId]
  );

  const events: TimelineEvent[] = [];

  const createdAt: string | null = enrollmentRow[0]?.createdAt ?? null;
  if (createdAt && (!range.dateFrom || createdAt.slice(0, 10) >= range.dateFrom) && (!range.dateTo || createdAt.slice(0, 10) <= range.dateTo)) {
    events.push({
      type: 'enrollment',
      recordedAt: createdAt,
      occurredAt: createdAt,
      title: 'Matrícula',
      description: `Se matriculó en ${enrollment.courseName} (${enrollment.academicYear})`,
      ...creatorFields(enrollmentRow[0]),
    });
  }

  const absenceConditions = ['a.enrollment_id = $1', 'a.institution_id = $2', 'a.deleted_at IS NULL'];
  const absenceParams: any[] = [enrollmentId, institutionId];
  let i = 3;
  if (range.dateFrom) { absenceConditions.push(`a.date >= $${i++}`); absenceParams.push(range.dateFrom); }
  if (range.dateTo)   { absenceConditions.push(`a.date <= $${i++}`); absenceParams.push(range.dateTo); }

  const absenceRows = await AppDataSource.query(
    `SELECT a.date::text AS date, a.type, a.created_at AS "createdAt", ${CREATOR_SELECT}
     FROM absences a
     LEFT JOIN users u ON u.id = a.created_by_user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE ${absenceConditions.join(' AND ')}
     ORDER BY a.created_at ASC`,
    absenceParams
  );
  for (const r of absenceRows) {
    const isTardy = r.type === 'AT';
    events.push({
      type: isTardy ? 'tardy' : 'absence',
      recordedAt: r.createdAt,
      occurredAt: r.date,
      title: isTardy ? 'Atraso registrado' : 'Falta registrada',
      description: `Se registra ${isTardy ? 'un atraso' : 'una falta'} del ${monthLabel(r.date)}`,
      ...creatorFields(r),
    });
  }

  const justificationConditions = ['j.enrollment_id = $1', 'j.institution_id = $2', 'j.deleted_at IS NULL'];
  const justificationParams: any[] = [enrollmentId, institutionId];
  let k = 3;
  let justificationDateFilter = '';
  if (range.dateFrom || range.dateTo) {
    const sub = ['ja2.justification_id = j.id'];
    if (range.dateFrom) { sub.push(`a2.date >= $${k++}`); justificationParams.push(range.dateFrom); }
    if (range.dateTo)   { sub.push(`a2.date <= $${k++}`); justificationParams.push(range.dateTo); }
    justificationDateFilter = `AND EXISTS (SELECT 1 FROM justification_absences ja2 JOIN absences a2 ON a2.id = ja2.absence_id WHERE ${sub.join(' AND ')})`;
  }

  const justificationRows = await AppDataSource.query(
    `SELECT
       j.created_at AS "createdAt",
       COALESCE((
         SELECT json_agg(a.date::text ORDER BY a.date)
         FROM justification_absences ja
         JOIN absences a ON a.id = ja.absence_id
         WHERE ja.justification_id = j.id
       ), '[]') AS "absenceDates",
       ${CREATOR_SELECT}
     FROM justifications j
     LEFT JOIN users u ON u.id = j.created_by_user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE ${justificationConditions.join(' AND ')}
     ${justificationDateFilter}
     ORDER BY j.created_at ASC`,
    justificationParams
  );
  for (const row of justificationRows) {
    const dates: string[] = row.absenceDates ?? [];
    const label = dates.length === 1
      ? `la falta del ${monthLabel(dates[0])}`
      : dates.length > 1
        ? `las faltas del ${dates.map(monthLabel).join(', ')}`
        : 'la falta asociada';
    events.push({
      type: 'justification',
      recordedAt: row.createdAt,
      occurredAt: null,
      title: 'Justificación',
      description: `Se justificó ${label}`,
      ...creatorFields(row),
    });
  }

  events.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  return events;
}
