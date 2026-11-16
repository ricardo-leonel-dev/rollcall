import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

export const STATS_VISIBILITY_VALUES = ['until_withdrawal', 'until_quarter_start', 'whole_year'] as const;

export type StatsVisibility = typeof STATS_VISIBILITY_VALUES[number];

export function isStatsVisibility(value: unknown): value is StatsVisibility {
  return typeof value === 'string' && (STATS_VISIBILITY_VALUES as readonly string[]).includes(value);
}

export const ENROLLMENT_WITHDRAWN_MESSAGE = 'La matrícula está retirada';

// A withdrawn enrollment leaves the rosters entirely: its records are only
// visible inside the window its withdrawal defines.
export function notWithdrawnSql(alias: string, idColumn = 'id'): string {
  return `NOT EXISTS (SELECT 1 FROM student_withdrawals w_ WHERE w_.enrollment_id = ${alias}.${idColumn} AND w_.reverted_at IS NULL)`;
}

// True when the record dated `dateExpr` is inside the window of its
// enrollment: the enrollment is not withdrawn, or the record is dated on or
// before the last visible day of its withdrawal.
export function visibleRecordSql(enrollmentIdExpr: string, dateExpr: string): string {
  return `NOT EXISTS (
  SELECT 1 FROM student_withdrawals w_
  JOIN enrollments e_ ON e_.id = w_.enrollment_id
  WHERE w_.enrollment_id = ${enrollmentIdExpr} AND w_.reverted_at IS NULL
    AND (w_.stats_visibility = 'whole_year'
         OR COALESCE(${dateExpr} > CASE w_.stats_visibility
              WHEN 'until_quarter_start' THEN COALESCE((
                SELECT q_.start_date - 1 FROM quarters q_
                 WHERE q_.academic_year_id = e_.academic_year_id AND q_.deleted_at IS NULL
                   AND q_.start_date <= w_.withdrawal_date AND q_.end_date >= w_.withdrawal_date
                 ORDER BY q_.start_date ASC LIMIT 1), w_.withdrawal_date)
              ELSE w_.withdrawal_date END, TRUE)))`;
}

export async function assertEnrollmentNotWithdrawn(enrollmentId: number, em?: EntityManager): Promise<void> {
  const sql = `SELECT 1 FROM student_withdrawals WHERE enrollment_id = $1 AND reverted_at IS NULL LIMIT 1`;
  const rows = em ? await em.query(sql, [enrollmentId]) : await AppDataSource.query(sql, [enrollmentId]);
  if (rows.length) {
    throw Object.assign(new Error(ENROLLMENT_WITHDRAWN_MESSAGE), { status: 409 });
  }
}
