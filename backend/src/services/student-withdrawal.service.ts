import { AppDataSource } from '../data-source';
import { recordEvents, LOCAL_TIME_ZONE } from './domain-event.service';
import { isStatsVisibility, StatsVisibility } from './enrollment-withdrawal';

const MAX_NOTES_LENGTH = 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface WithdrawalActor {
  id: number;
  fullName: string | null;
}

export interface WithdrawalItem {
  id: number;
  enrollmentId: number;
  studentId: number;
  studentName: string;
  idNumber: string | null;
  courseId: number;
  courseName: string;
  academicYearId: number;
  academicYear: string;
  withdrawalDate: string;
  reason: { id: number; name: string };
  notes: string | null;
  statsVisibility: StatsVisibility;
  withdrawnAt: string;
  withdrawnBy: WithdrawalActor | null;
  revertedAt: string | null;
  revertedBy: WithdrawalActor | null;
}

export interface ReasonCount {
  reasonId: number;
  reasonName: string;
  count: number;
}

export interface WithdrawalQuery {
  status?: unknown;
  academic_year_id?: unknown;
  course_id?: unknown;
  reason_id?: unknown;
  student_id?: unknown;
  date_from?: unknown;
  date_to?: unknown;
}

export interface WithdrawalStatsQuery {
  academic_year_id?: unknown;
  course_id?: unknown;
}

type WithdrawalSnapshot = {
  id: number;
  enrollmentId: number;
  studentId: number;
  academicYearId: number;
  courseId: number;
  reasonId: number;
  withdrawalDate: string;
  notes: string | null;
  statsVisibility: StatsVisibility;
  revertedAt: string | null;
};

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { status: 400 });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404 });
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { status: 409 });
}

function invalidQuery(): Error {
  return badRequest('Parámetros de consulta inválidos');
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function single(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

// A calendar date, not just a well-shaped string: 2026-02-30 is not a date.
function isRealDate(raw: string): boolean {
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function parseQueryInt(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const raw = single(value);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw invalidQuery();
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw invalidQuery();
  return parsed;
}

function parseQueryDate(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const raw = single(value);
  if (typeof raw !== 'string' || !DATE_RE.test(raw) || !isRealDate(raw)) throw invalidQuery();
  return raw;
}

function parseStatus(value: unknown): 'active' | 'reverted' | 'all' {
  if (value === undefined) return 'active';
  const raw = single(value);
  if (raw === 'active' || raw === 'reverted' || raw === 'all') return raw;
  throw invalidQuery();
}

function rowsOf(result: any): any[] {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function isActiveWithdrawalViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; driverError?: { code?: string; constraint?: string } } | null;
  const code = e?.driverError?.code ?? e?.code;
  if (code !== '23505') return false;
  const constraint = e?.driverError?.constraint ?? e?.constraint;
  return !constraint || constraint === 'uq_student_withdrawals_active_enrollment';
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return new Date(value as string | Date).toISOString();
}

function toItem(row: any): WithdrawalItem {
  return {
    id: Number(row.id),
    enrollmentId: Number(row.enrollment_id),
    studentId: Number(row.student_id),
    studentName: row.student_name,
    idNumber: row.id_number ?? null,
    courseId: Number(row.course_id),
    courseName: row.course_name,
    academicYearId: Number(row.academic_year_id),
    academicYear: row.academic_year,
    withdrawalDate: row.withdrawal_date,
    reason: { id: Number(row.reason_id), name: row.reason_name },
    notes: row.notes ?? null,
    statsVisibility: row.stats_visibility,
    withdrawnAt: toIso(row.created_at)!,
    withdrawnBy: row.withdrawn_by_id === null || row.withdrawn_by_id === undefined
      ? null
      : { id: Number(row.withdrawn_by_id), fullName: row.withdrawn_by_name ?? null },
    revertedAt: toIso(row.reverted_at),
    revertedBy: row.reverted_by_id === null || row.reverted_by_id === undefined
      ? null
      : { id: Number(row.reverted_by_id), fullName: row.reverted_by_name ?? null },
  };
}

const ITEM_SELECT = `
  SELECT w.id, w.enrollment_id, w.reason_id,
         to_char(w.withdrawal_date, 'YYYY-MM-DD') AS withdrawal_date,
         w.notes, w.stats_visibility, w.created_at, w.reverted_at,
         e.student_id, e.course_id, e.academic_year_id,
         s.name AS student_name, s.id_number,
         c.name AS course_name,
         ay.name AS academic_year,
         r.name AS reason_name,
         wu.id AS withdrawn_by_id, wu.full_name AS withdrawn_by_name,
         ru.id AS reverted_by_id, ru.full_name AS reverted_by_name
    FROM student_withdrawals w
    JOIN enrollments e ON e.id = w.enrollment_id
    JOIN students s ON s.id = e.student_id
    JOIN courses c ON c.id = e.course_id
    JOIN academic_years ay ON ay.id = e.academic_year_id
    JOIN withdrawal_reasons r ON r.id = w.reason_id
    LEFT JOIN users wu ON wu.id = w.withdrawn_by_user_id
    LEFT JOIN users ru ON ru.id = w.reverted_by_user_id`;

// A soft-deleted enrollment or student was a mistake: its withdrawals do not
// count and are not listed.
const BASE_CONDITIONS = ['w.institution_id = $1', 'e.deleted_at IS NULL', 's.deleted_at IS NULL'];

async function fetchItems(params: unknown[], conditions: string[], orderBy: string): Promise<WithdrawalItem[]> {
  const rows = await AppDataSource.query(
    `${ITEM_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
    params,
  );
  return rows.map(toItem);
}

function snapshotOf(row: any, revertedAt: string | null): WithdrawalSnapshot {
  return {
    id: Number(row.id),
    enrollmentId: Number(row.enrollment_id),
    studentId: Number(row.student_id),
    academicYearId: Number(row.academic_year_id),
    courseId: Number(row.course_id),
    reasonId: Number(row.reason_id),
    withdrawalDate: row.withdrawal_date,
    notes: row.notes ?? null,
    statsVisibility: row.stats_visibility,
    revertedAt,
  };
}

export async function withdraw(
  institutionId: number,
  courseIds: number[] | null,
  actorUserId: number | null,
  body: unknown,
): Promise<WithdrawalItem> {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const enrollmentId = data.enrollmentId;
  if (!isPositiveInt(enrollmentId)) throw notFound('Enrollment not found');

  const enrollments = await AppDataSource.query(
    `SELECT e.id, e.student_id, e.course_id, e.academic_year_id,
            to_char(ay.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(ay.end_date, 'YYYY-MM-DD') AS end_date
       FROM enrollments e
       JOIN academic_years ay ON ay.id = e.academic_year_id
      WHERE e.id = $1 AND e.institution_id = $2 AND e.deleted_at IS NULL`,
    [enrollmentId, institutionId],
  );
  const enrollment = enrollments[0];
  if (!enrollment) throw notFound('Enrollment not found');
  if (courseIds !== null && !courseIds.includes(Number(enrollment.course_id))) {
    throw notFound('Enrollment not found');
  }

  let notes: string | null = null;
  if (data.notes !== undefined && data.notes !== null) {
    if (typeof data.notes !== 'string') throw badRequest('Las observaciones no pueden superar 1000 caracteres');
    const trimmed = data.notes.trim();
    if (trimmed.length > MAX_NOTES_LENGTH) throw badRequest('Las observaciones no pueden superar 1000 caracteres');
    notes = trimmed.length ? trimmed : null;
  }

  let statsVisibility: StatsVisibility = 'until_withdrawal';
  if (data.statsVisibility !== undefined) {
    if (!isStatsVisibility(data.statsVisibility)) throw badRequest('statsVisibility inválido');
    statsVisibility = data.statsVisibility;
  }

  const [todayRow] = await AppDataSource.query(
    `SELECT (now() AT TIME ZONE '${LOCAL_TIME_ZONE}')::date::text AS today`,
  );
  const today: string = todayRow.today;

  let withdrawalDate = today;
  if (data.withdrawalDate !== undefined && data.withdrawalDate !== null) {
    if (typeof data.withdrawalDate !== 'string' || !DATE_RE.test(data.withdrawalDate) || !isRealDate(data.withdrawalDate)) {
      throw badRequest('withdrawalDate debe tener formato YYYY-MM-DD');
    }
    if (data.withdrawalDate > today) throw badRequest('La fecha de retiro no puede ser futura');
    withdrawalDate = data.withdrawalDate;
  }
  if (enrollment.start_date && withdrawalDate < enrollment.start_date) {
    throw badRequest('La fecha de retiro debe estar dentro del año lectivo');
  }
  if (enrollment.end_date && withdrawalDate > enrollment.end_date) {
    throw badRequest('La fecha de retiro debe estar dentro del año lectivo');
  }

  const reasonId = data.reasonId;
  if (!isPositiveInt(reasonId)) throw badRequest('El motivo del retiro es obligatorio');
  const reasons = await AppDataSource.query(
    `SELECT 1 FROM withdrawal_reasons
      WHERE id = $1 AND institution_id = $2 AND deleted_at IS NULL AND is_active`,
    [reasonId, institutionId],
  );
  if (!reasons.length) throw badRequest('Motivo de retiro inválido');

  const active = await AppDataSource.query(
    `SELECT 1 FROM student_withdrawals WHERE enrollment_id = $1 AND reverted_at IS NULL LIMIT 1`,
    [enrollmentId],
  );
  if (active.length) throw conflict('La matrícula ya está retirada');

  let withdrawalId = 0;
  try {
    withdrawalId = await AppDataSource.transaction(async (em) => {
      const inserted = rowsOf(await em.query(
        `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date, notes, stats_visibility, withdrawn_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [institutionId, enrollmentId, reasonId, withdrawalDate, notes, statsVisibility, actorUserId],
      ));
      const id = Number(inserted[0].id);

      const snapshot: WithdrawalSnapshot = {
        id,
        enrollmentId,
        studentId: Number(enrollment.student_id),
        academicYearId: Number(enrollment.academic_year_id),
        courseId: Number(enrollment.course_id),
        reasonId,
        withdrawalDate,
        notes,
        statsVisibility,
        revertedAt: null,
      };

      await recordEvents(em, [{
        institutionId,
        eventType: 'StudentWithdrawn',
        entityType: 'student_withdrawal',
        entityId: id,
        actorUserId,
        payload: { before: null, after: snapshot },
      }]);

      return id;
    });
  } catch (err) {
    // Two concurrent withdrawals of the same enrollment: the partial unique
    // index caught the second one.
    if (isActiveWithdrawalViolation(err)) throw conflict('La matrícula ya está retirada');
    throw err;
  }

  const items = await fetchItems(
    [institutionId, withdrawalId],
    [...BASE_CONDITIONS, 'w.id = $2'],
    'w.id DESC',
  );
  return items[0];
}

export async function revert(
  institutionId: number,
  courseIds: number[] | null,
  actorUserId: number | null,
  id: number,
): Promise<WithdrawalItem> {
  if (!isPositiveInt(id)) throw notFound('Retiro no encontrado');

  const rows = await AppDataSource.query(
    `SELECT w.id, w.enrollment_id, w.reason_id,
            to_char(w.withdrawal_date, 'YYYY-MM-DD') AS withdrawal_date,
            w.notes, w.stats_visibility, w.reverted_at,
            e.student_id, e.course_id, e.academic_year_id
       FROM student_withdrawals w
       JOIN enrollments e ON e.id = w.enrollment_id AND e.deleted_at IS NULL
      WHERE w.id = $1 AND w.institution_id = $2`,
    [id, institutionId],
  );
  const row = rows[0];
  if (!row) throw notFound('Retiro no encontrado');
  if (courseIds !== null && !courseIds.includes(Number(row.course_id))) {
    throw notFound('Retiro no encontrado');
  }
  if (row.reverted_at !== null) throw conflict('El retiro ya fue revertido');

  const before = snapshotOf(row, null);

  const revertedAt = await AppDataSource.transaction(async (em) => {
    const updated = rowsOf(await em.query(
      `UPDATE student_withdrawals SET reverted_at = now(), reverted_by_user_id = $2
        WHERE id = $1 AND reverted_at IS NULL RETURNING reverted_at`,
      [id, actorUserId],
    ));
    if (!updated.length) throw conflict('El retiro ya fue revertido');
    const revertedAt = toIso(updated[0].reverted_at)!;

    await recordEvents(em, [{
      institutionId,
      eventType: 'StudentReinstated',
      entityType: 'student_withdrawal',
      entityId: Number(id),
      actorUserId,
      payload: { before, after: { ...before, revertedAt } },
    }]);

    return revertedAt;
  });

  const items = await fetchItems(
    [institutionId, Number(id)],
    [...BASE_CONDITIONS, 'w.id = $2'],
    'w.id DESC',
  );
  return items[0];
}

export async function updateStatsVisibility(
  institutionId: number,
  courseIds: number[] | null,
  actorUserId: number | null,
  id: number,
  data: { statsVisibility?: unknown },
): Promise<WithdrawalItem> {
  if (!isPositiveInt(id)) throw notFound('Retiro no encontrado');

  const rows = await AppDataSource.query(
    `SELECT w.id, w.enrollment_id, w.reason_id,
            to_char(w.withdrawal_date, 'YYYY-MM-DD') AS withdrawal_date,
            w.notes, w.stats_visibility, w.reverted_at,
            e.student_id, e.course_id, e.academic_year_id
       FROM student_withdrawals w
       JOIN enrollments e ON e.id = w.enrollment_id AND e.deleted_at IS NULL
      WHERE w.id = $1 AND w.institution_id = $2`,
    [id, institutionId],
  );
  const row = rows[0];
  if (!row) throw notFound('Retiro no encontrado');
  if (courseIds !== null && !courseIds.includes(Number(row.course_id))) {
    throw notFound('Retiro no encontrado');
  }
  if (row.reverted_at !== null) throw conflict('El retiro ya fue revertido');

  if (!isStatsVisibility(data.statsVisibility)) throw badRequest('statsVisibility inválido');
  const statsVisibility = data.statsVisibility;

  const before = snapshotOf(row, null);

  if (before.statsVisibility === statsVisibility) {
    const items = await fetchItems(
      [institutionId, Number(id)],
      [...BASE_CONDITIONS, 'w.id = $2'],
      'w.id DESC',
    );
    return items[0];
  }

  await AppDataSource.transaction(async (em) => {
    const updated = rowsOf(await em.query(
      `UPDATE student_withdrawals SET stats_visibility = $2
        WHERE id = $1 AND reverted_at IS NULL RETURNING id`,
      [id, statsVisibility],
    ));
    if (!updated.length) throw conflict('El retiro ya fue revertido');

    await recordEvents(em, [{
      institutionId,
      eventType: 'WithdrawalVisibilityChanged',
      entityType: 'student_withdrawal',
      entityId: Number(id),
      actorUserId,
      payload: { before, after: { ...before, statsVisibility } },
    }]);
  });

  const items = await fetchItems(
    [institutionId, Number(id)],
    [...BASE_CONDITIONS, 'w.id = $2'],
    'w.id DESC',
  );
  return items[0];
}

export async function findAll(
  institutionId: number,
  courseIds: number[] | null,
  query: WithdrawalQuery,
): Promise<WithdrawalItem[]> {
  const status = parseStatus(query.status);
  const academicYearId = parseQueryInt(query.academic_year_id);
  const courseId = parseQueryInt(query.course_id);
  const reasonId = parseQueryInt(query.reason_id);
  const studentId = parseQueryInt(query.student_id);
  const dateFrom = parseQueryDate(query.date_from);
  const dateTo = parseQueryDate(query.date_to);

  const params: unknown[] = [institutionId];
  const conditions = [...BASE_CONDITIONS];

  if (status === 'active') conditions.push('w.reverted_at IS NULL');
  if (status === 'reverted') conditions.push('w.reverted_at IS NOT NULL');
  if (academicYearId !== undefined) {
    params.push(academicYearId);
    conditions.push(`e.academic_year_id = $${params.length}`);
  }
  if (courseId !== undefined) {
    params.push(courseId);
    conditions.push(`e.course_id = $${params.length}`);
  }
  if (reasonId !== undefined) {
    params.push(reasonId);
    conditions.push(`w.reason_id = $${params.length}`);
  }
  if (studentId !== undefined) {
    params.push(studentId);
    conditions.push(`e.student_id = $${params.length}`);
  }
  if (dateFrom !== undefined) {
    params.push(dateFrom);
    conditions.push(`w.withdrawal_date >= $${params.length}::date`);
  }
  if (dateTo !== undefined) {
    params.push(dateTo);
    conditions.push(`w.withdrawal_date <= $${params.length}::date`);
  }
  if (courseIds !== null) {
    params.push(courseIds);
    conditions.push(`e.course_id = ANY($${params.length})`);
  }

  return fetchItems(params, conditions, 'w.withdrawal_date DESC, w.id DESC');
}

export async function findStudentHistory(
  institutionId: number,
  courseIds: number[] | null,
  studentId: number,
): Promise<WithdrawalItem[]> {
  if (!isPositiveInt(studentId)) throw notFound('Student not found');

  const students = await AppDataSource.query(
    `SELECT 1 FROM students WHERE id = $1 AND institution_id = $2 AND deleted_at IS NULL`,
    [studentId, institutionId],
  );
  if (!students.length) throw notFound('Student not found');

  const params: unknown[] = [institutionId, studentId];
  const conditions = [...BASE_CONDITIONS, 'e.student_id = $2'];

  if (courseIds !== null) {
    const scoped = await AppDataSource.query(
      `SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = ANY($2) AND deleted_at IS NULL LIMIT 1`,
      [studentId, courseIds],
    );
    if (!scoped.length) throw notFound('Student not found');
    params.push(courseIds);
    conditions.push(`e.course_id = ANY($${params.length})`);
  }

  return fetchItems(params, conditions, 'w.created_at DESC, w.id DESC');
}

export async function getStats(
  institutionId: number,
  courseIds: number[] | null,
  query: WithdrawalStatsQuery,
): Promise<{ total: number; byReason: ReasonCount[] }> {
  const academicYearId = parseQueryInt(query.academic_year_id);
  const courseId = parseQueryInt(query.course_id);

  const params: unknown[] = [institutionId];
  const filters: string[] = [];

  if (academicYearId !== undefined) {
    params.push(academicYearId);
    filters.push(`AND e.academic_year_id = $${params.length}`);
  }
  if (courseId !== undefined) {
    params.push(courseId);
    filters.push(`AND e.course_id = $${params.length}`);
  }
  if (courseIds !== null) {
    params.push(courseIds);
    filters.push(`AND e.course_id = ANY($${params.length})`);
  }

  const rows = await AppDataSource.query(
    `WITH counts AS (
       SELECT w.reason_id, COUNT(*)::int AS count
         FROM student_withdrawals w
         JOIN enrollments e ON e.id = w.enrollment_id AND e.deleted_at IS NULL
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
        WHERE w.institution_id = $1 AND w.reverted_at IS NULL
        ${filters.join('\n        ')}
        GROUP BY w.reason_id
     )
     SELECT r.id AS "reasonId", r.name AS "reasonName", COALESCE(c.count, 0) AS count
       FROM withdrawal_reasons r
       LEFT JOIN counts c ON c.reason_id = r.id
      WHERE r.institution_id = $1
        AND ((r.deleted_at IS NULL AND r.is_active) OR c.count IS NOT NULL)
      ORDER BY COALESCE(c.count, 0) DESC, r.name ASC`,
    params,
  );

  const byReason: ReasonCount[] = rows.map((r: any) => ({
    reasonId: Number(r.reasonId),
    reasonName: r.reasonName,
    count: Number(r.count),
  }));

  return { total: byReason.reduce((sum, reason) => sum + reason.count, 0), byReason };
}
