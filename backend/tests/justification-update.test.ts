import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import justificationRouter from '../src/controllers/justification.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const TEST_INST_PREFIX = '__test_jupd_inst_';
const TEST_USER_PREFIX = 'testuser_jupd_';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;
let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}${process.pid}_${Date.now()}_${counter}`;
}

async function cleanup(): Promise<void> {
  await AppDataSource.transaction(async (em) => {
    await em.query(`SET LOCAL app.domain_events_purge = 'on'`);
    await em.query(
      `DELETE FROM domain_events WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
      [`${TEST_INST_PREFIX}%`],
    );
  });
  const inst = [`${TEST_INST_PREFIX}%`];
  const byInstitution = (table: string) =>
    AppDataSource.query(`DELETE FROM ${table} WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`, inst);
  await AppDataSource.query(
    `DELETE FROM justification_absences WHERE justification_id IN (
        SELECT j.id FROM justifications j JOIN institutions i ON i.id = j.institution_id WHERE i.name LIKE $1)`,
    inst,
  );
  await byInstitution('justifications');
  await byInstitution('absences');
  await byInstitution('student_withdrawals');
  await byInstitution('enrollments');
  await byInstitution('students');
  await byInstitution('withdrawal_reasons');
  await byInstitution('academic_years');
  await byInstitution('courses');
  await deleteTestUsersByPrefix(TEST_USER_PREFIX);
  await AppDataSource.query(`DELETE FROM institutions WHERE name LIKE $1`, inst);
}

async function insertRow(sql: string, params: unknown[]): Promise<number> {
  const [row] = await AppDataSource.query(sql, params);
  return Number(row.id);
}

async function createInstitution(): Promise<number> {
  return insertRow(`INSERT INTO institutions (name, is_active) VALUES ($1, true) RETURNING id`, [uniqueName(TEST_INST_PREFIX)]);
}

async function createEnrollment(institutionId: number): Promise<number> {
  const courseId = await insertRow(
    `INSERT INTO courses (name, institution_id, shift, is_active) VALUES ($1, $2, 'MATUTINA', true) RETURNING id`,
    [uniqueName('__test_jupd_course_'), institutionId],
  );
  const yearId = await insertRow(
    `INSERT INTO academic_years (name, institution_id, start_date, end_date, is_active)
     VALUES ($1, $2, '2026-01-01', '2026-12-31', false) RETURNING id`,
    [`Y${++counter}`, institutionId],
  );
  const studentId = await insertRow(
    `INSERT INTO students (name, institution_id, is_active) VALUES ($1, $2, true) RETURNING id`,
    [uniqueName('ALUMNO '), institutionId],
  );
  return insertRow(
    `INSERT INTO enrollments (student_id, course_id, academic_year_id, institution_id, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [studentId, courseId, yearId, institutionId],
  );
}

async function insertAbsence(institutionId: number, enrollmentId: number, date: string): Promise<number> {
  return insertRow(
    `INSERT INTO absences (institution_id, enrollment_id, date, type) VALUES ($1, $2, $3, 'F') RETURNING id`,
    [institutionId, enrollmentId, date],
  );
}

async function insertJustification(institutionId: number, enrollmentId: number, absenceIds: number[]): Promise<number> {
  const id = await insertRow(
    `INSERT INTO justifications (institution_id, enrollment_id, reason) VALUES ($1, $2, 'Original') RETURNING id`,
    [institutionId, enrollmentId],
  );
  for (const absenceId of absenceIds) {
    await AppDataSource.query(`INSERT INTO justification_absences (justification_id, absence_id) VALUES ($1, $2)`, [id, absenceId]);
  }
  return id;
}

async function withdrawEnrollment(institutionId: number, enrollmentId: number): Promise<void> {
  const reasonId = await insertRow(
    `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, $2) RETURNING id`,
    [institutionId, uniqueName('Motivo ')],
  );
  await AppDataSource.query(
    `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date) VALUES ($1, $2, $3, '2026-07-15')`,
    [institutionId, enrollmentId, reasonId],
  );
}

async function linkedAbsences(justificationId: number): Promise<number[]> {
  const rows = await AppDataSource.query(
    `SELECT absence_id FROM justification_absences WHERE justification_id = $1 ORDER BY absence_id`,
    [justificationId],
  );
  return rows.map((r: any) => Number(r.absence_id));
}

async function reasonOf(justificationId: number): Promise<string> {
  const [row] = await AppDataSource.query(`SELECT reason FROM justifications WHERE id = $1`, [justificationId]);
  return row.reason;
}

async function put(token: string, institutionId: number, id: number, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/justifications/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

interface Fixture {
  token: string;
  institutionId: number;
  enrollmentId: number;
  linkedAbsenceId: number;
  freeAbsenceId: number;
  justificationId: number;
}

async function createFixture(): Promise<Fixture> {
  const institutionId = await createInstitution();
  const enrollmentId = await createEnrollment(institutionId);
  const linkedAbsenceId = await insertAbsence(institutionId, enrollmentId, '2026-03-02');
  const freeAbsenceId = await insertAbsence(institutionId, enrollmentId, '2026-03-03');
  const justificationId = await insertJustification(institutionId, enrollmentId, [linkedAbsenceId]);
  const { token } = await createTestUser({ username: uniqueName(TEST_USER_PREFIX), roleName: 'superadmin', institutionId: null });
  return { token, institutionId, enrollmentId, linkedAbsenceId, freeAbsenceId, justificationId };
}

before(async () => {
  await AppDataSource.initialize();
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/justifications', justificationRouter);
  app.use(errorMiddleware);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await cleanup();
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});

beforeEach(cleanup);

test('updating a justification rejects absences it may not link and keeps its links', async (t) => {
  const cases: Array<{ name: string; status: number; foreignAbsence: (fx: Fixture) => Promise<number> }> = [
    {
      name: 'an absence of another institution',
      status: 404,
      foreignAbsence: async () => {
        const otherInstitution = await createInstitution();
        return insertAbsence(otherInstitution, await createEnrollment(otherInstitution), '2026-03-04');
      },
    },
    {
      name: 'a deleted absence of the same enrollment',
      status: 404,
      foreignAbsence: async (fx) => {
        const id = await insertAbsence(fx.institutionId, fx.enrollmentId, '2026-03-05');
        await AppDataSource.query(`UPDATE absences SET deleted_at = NOW() WHERE id = $1`, [id]);
        return id;
      },
    },
    {
      name: 'an absence of a different enrollment',
      status: 400,
      foreignAbsence: async (fx) =>
        insertAbsence(fx.institutionId, await createEnrollment(fx.institutionId), '2026-03-04'),
    },
    {
      name: 'an absence of a withdrawn enrollment',
      status: 400,
      foreignAbsence: async (fx) => {
        const withdrawn = await createEnrollment(fx.institutionId);
        await withdrawEnrollment(fx.institutionId, withdrawn);
        return insertAbsence(fx.institutionId, withdrawn, '2026-03-04');
      },
    },
    {
      name: 'an absence already justified by another justification',
      status: 409,
      foreignAbsence: async (fx) => {
        const id = await insertAbsence(fx.institutionId, fx.enrollmentId, '2026-03-06');
        await insertJustification(fx.institutionId, fx.enrollmentId, [id]);
        return id;
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      await cleanup();
      const fx = await createFixture();
      const foreign = await c.foreignAbsence(fx);

      const res = await put(fx.token, fx.institutionId, fx.justificationId, {
        reason: 'Cambiado',
        absenceIds: [fx.freeAbsenceId, foreign],
      });

      assert.equal(res.status, c.status, JSON.stringify(res.body));
      assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.linkedAbsenceId]);
      assert.equal(await reasonOf(fx.justificationId), 'Original');
    });
  }
});

test('a justification of a withdrawn enrollment cannot be relinked', async () => {
  const fx = await createFixture();
  await withdrawEnrollment(fx.institutionId, fx.enrollmentId);

  const res = await put(fx.token, fx.institutionId, fx.justificationId, { absenceIds: [fx.freeAbsenceId] });

  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.linkedAbsenceId]);
});

test('updating a justification with valid absences replaces its links', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.justificationId, {
    reason: 'Cambiado',
    absenceIds: [fx.linkedAbsenceId, fx.freeAbsenceId],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await reasonOf(fx.justificationId), 'Cambiado');
  assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.linkedAbsenceId, fx.freeAbsenceId]);

  const swapped = await put(fx.token, fx.institutionId, fx.justificationId, { absenceIds: [fx.freeAbsenceId] });
  assert.equal(swapped.status, 200, JSON.stringify(swapped.body));
  assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.freeAbsenceId]);
});
