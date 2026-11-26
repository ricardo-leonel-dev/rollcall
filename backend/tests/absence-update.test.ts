import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import absenceRouter from '../src/controllers/absence.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const TEST_INST_PREFIX = '__test_aupd_inst_';
const TEST_USER_PREFIX = 'testuser_aupd_';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;
let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}${process.pid}_${Date.now()}_${counter}`;
}

async function cleanup(): Promise<void> {
  // The audit table is append-only, so its rows only go away with the purge
  // flag set inside the very transaction that deletes them.
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
  await byInstitution('absences');
  await byInstitution('student_withdrawals');
  await byInstitution('withdrawal_reasons');
  await byInstitution('enrollments');
  await byInstitution('students');
  await byInstitution('academic_years');
  await byInstitution('courses');
  await AppDataSource.query(
    `DELETE FROM user_courses WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM user_modules WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await deleteTestUsersByPrefix(TEST_USER_PREFIX);
  await AppDataSource.query(`DELETE FROM institutions WHERE name LIKE $1`, inst);
}

async function insertRow(sql: string, params: unknown[]): Promise<number> {
  const [row] = await AppDataSource.query(sql, params);
  return Number(row.id);
}

interface Fixture {
  token: string;
  userId: number;
  institutionId: number;
  enrollmentId: number;
  absenceId: number;
}

async function createFixture(): Promise<Fixture> {
  const institutionId = await insertRow(
    `INSERT INTO institutions (name, is_active) VALUES ($1, true) RETURNING id`,
    [uniqueName(TEST_INST_PREFIX)],
  );
  const courseId = await insertRow(
    `INSERT INTO courses (name, institution_id, shift, is_active) VALUES ($1, $2, 'MATUTINA', true) RETURNING id`,
    [uniqueName('__test_aupd_course_'), institutionId],
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
  const enrollmentId = await insertRow(
    `INSERT INTO enrollments (student_id, course_id, academic_year_id, institution_id, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [studentId, courseId, yearId, institutionId],
  );
  const absenceId = await insertRow(
    `INSERT INTO absences (institution_id, enrollment_id, date, type, notes) VALUES ($1, $2, '2026-03-02', 'F', 'Original') RETURNING id`,
    [institutionId, enrollmentId],
  );
  const { token, id: userId } = await createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName: 'superadmin',
    institutionId: null,
  });
  return { token, userId, institutionId, enrollmentId, absenceId };
}

async function put(token: string, institutionId: number, id: number, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/absences/${id}`, {
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

async function eventsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT event_type, entity_type, entity_id, actor_user_id, payload
       FROM domain_events WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function absenceRow(id: number): Promise<any> {
  const [row] = await AppDataSource.query(
    `SELECT id, enrollment_id, date::text AS date, type, notes, photo_source AS "photoSource"
       FROM absences WHERE id = $1`,
    [id],
  );
  return row;
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

// A trigger that rejects the event insert of one institution: the edit that
// writes the event has to roll back with it.
async function installFailingEventTrigger(institutionId: number): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_absupd_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_absupd_fail_event()`);
  await AppDataSource.query(
    `CREATE OR REPLACE FUNCTION test_absupd_fail_event() RETURNS trigger AS $$
     BEGIN
       IF NEW.institution_id = ${institutionId} THEN
         RAISE EXCEPTION 'domain event insert failed';
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER trg_test_absupd_fail_event
       BEFORE INSERT ON domain_events
       FOR EACH ROW EXECUTE FUNCTION test_absupd_fail_event()`,
  );
}

async function removeFailingEventTrigger(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_absupd_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_absupd_fail_event()`);
}

before(async () => {
  await AppDataSource.initialize();
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/absences', absenceRouter);
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

test('editing an absence records one event with both snapshots and the actor', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.absenceId, { type: 'AT', notes: 'Tarde' });
  assert.equal(res.status, 200);

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'AbsenceUpdated');
  assert.equal(event.entity_type, 'absence');
  assert.equal(Number(event.entity_id), fx.absenceId);
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.deepEqual(event.payload, {
    before: { id: fx.absenceId, enrollmentId: fx.enrollmentId, date: '2026-03-02', type: 'F', notes: 'Original' },
    after: { id: fx.absenceId, enrollmentId: fx.enrollmentId, date: '2026-03-02', type: 'AT', notes: 'Tarde' },
  });
});

test('editing an absence records the change of a single field', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.absenceId, { date: '2026-03-03' });
  assert.equal(res.status, 200);

  const [event] = await eventsOf(fx.institutionId);
  assert.ok(event, 'the edit was recorded');
  assert.deepEqual(event.payload.before, {
    id: fx.absenceId, enrollmentId: fx.enrollmentId, date: '2026-03-02', type: 'F', notes: 'Original',
  });
  assert.deepEqual(event.payload.after, {
    id: fx.absenceId, enrollmentId: fx.enrollmentId, date: '2026-03-03', type: 'F', notes: 'Original',
  });
});

test('an edit that changes no field of the snapshot records no event', async (t) => {
  const cases: Array<{ name: string; body: unknown; expectRow?: (row: any) => void }> = [
    { name: 'the same values again', body: { type: 'F', notes: 'Original' } },
    { name: 'only the photo source', body: { photoSource: 'camera' }, expectRow: (row) => assert.equal(row.photoSource, 'camera') },
    { name: 'an empty body', body: {} },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      const fx = await createFixture();

      const res = await put(fx.token, fx.institutionId, fx.absenceId, c.body);
      assert.equal(res.status, 200, 'the edit is still a valid operation');

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');

      const row = await absenceRow(fx.absenceId);
      assert.ok(row, 'the absence is still there');
      assert.equal(row.type, 'F');
      assert.equal(row.notes, 'Original');
      if (c.expectRow) c.expectRow(row);
    });
  }
});

test('a rejected edit records no event and keeps its status code', async (t) => {
  const cases: Array<{ name: string; prepare?: (fx: Fixture) => Promise<number>; body: unknown; status: number; message: string }> = [
    {
      name: 'an invalid type',
      body: { type: 'X' },
      status: 400,
      message: 'Invalid type. Only F or AT',
    },
    {
      name: 'an unknown absence',
      prepare: async () => 99999999,
      body: { notes: 'Tarde' },
      status: 404,
      message: 'Absence not found',
    },
    {
      name: 'an absence of another institution',
      prepare: async () => {
        const otherInstitution = await insertRow(
          `INSERT INTO institutions (name, is_active) VALUES ($1, true) RETURNING id`,
          [uniqueName(TEST_INST_PREFIX)],
        );
        const otherCourse = await insertRow(
          `INSERT INTO courses (name, institution_id, shift, is_active) VALUES ($1, $2, 'MATUTINA', true) RETURNING id`,
          [uniqueName('__test_aupd_course_'), otherInstitution],
        );
        const otherYear = await insertRow(
          `INSERT INTO academic_years (name, institution_id, start_date, end_date, is_active)
           VALUES ($1, $2, '2026-01-01', '2026-12-31', false) RETURNING id`,
          [`Y${++counter}`, otherInstitution],
        );
        const otherStudent = await insertRow(
          `INSERT INTO students (name, institution_id, is_active) VALUES ($1, $2, true) RETURNING id`,
          [uniqueName('ALUMNO '), otherInstitution],
        );
        const otherEnrollment = await insertRow(
          `INSERT INTO enrollments (student_id, course_id, academic_year_id, institution_id, is_active)
           VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [otherStudent, otherCourse, otherYear, otherInstitution],
        );
        return insertRow(
          `INSERT INTO absences (institution_id, enrollment_id, date, type) VALUES ($1, $2, '2026-03-05', 'F') RETURNING id`,
          [otherInstitution, otherEnrollment],
        );
      },
      body: { notes: 'Tarde' },
      status: 404,
      message: 'Absence not found',
    },
    {
      name: 'a deleted absence',
      prepare: async (fx) => {
        await AppDataSource.query(`UPDATE absences SET deleted_at = NOW() WHERE id = $1`, [fx.absenceId]);
        return fx.absenceId;
      },
      body: { notes: 'Tarde' },
      status: 404,
      message: 'Absence not found',
    },
    {
      name: 'the absence of a withdrawn enrollment',
      prepare: async (fx) => {
        await withdrawEnrollment(fx.institutionId, fx.enrollmentId);
        return fx.absenceId;
      },
      body: { notes: 'Tarde' },
      status: 409,
      message: 'La matrícula está retirada',
    },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      const fx = await createFixture();
      const targetId = c.prepare ? await c.prepare(fx) : fx.absenceId;

      const res = await put(fx.token, fx.institutionId, targetId, c.body);
      assert.equal(res.status, c.status, 'the status code is the one of today');
      assert.equal(res.body?.error, c.message, 'the error message is the one of today');

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
    });
  }
});

test('a failing event insert rolls the edit back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await put(fx.token, fx.institutionId, fx.absenceId, { notes: 'Cambio' });
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const row = await absenceRow(fx.absenceId);
    assert.equal(row.notes, 'Original', 'the edit was rolled back');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('the answer of an edit keeps the shape of the absence', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.absenceId, { notes: 'Tarde' });
  assert.equal(res.status, 200);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'createdAt', 'createdByUserId', 'date', 'deletedAt', 'enrollmentId', 'id',
    'institutionId', 'isActive', 'notes', 'photoSource', 'type', 'updatedAt',
  ], 'the answer carries the absence and nothing else');

  assert.equal(res.body.id, fx.absenceId);
  assert.equal(res.body.enrollmentId, fx.enrollmentId);
  assert.equal(res.body.institutionId, fx.institutionId);
  assert.equal(res.body.date, '2026-03-02');
  assert.equal(res.body.type, 'F');
  assert.equal(res.body.notes, 'Tarde', 'the answer carries the new value');
  assert.equal(res.body.photoSource, null);
  assert.equal(res.body.createdByUserId, null);
  assert.equal(res.body.isActive, true);
  assert.equal(res.body.deletedAt, null);
  assert.ok(res.body.createdAt, 'the answer carries the creation date');
  assert.ok(res.body.updatedAt, 'the answer carries the update date');
});

test('a malformed date is rejected and leaves the absence untouched', async (t) => {
  for (const date of ['2026/03/03', '03-03-2026', '2026-3-3', 'mañana', '']) {
    await t.test(JSON.stringify(date), async () => {
      const fx = await createFixture();

      const res = await put(fx.token, fx.institutionId, fx.absenceId, { date, notes: 'Cambio' });
      assert.equal(res.status, 400);

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
      const row = await absenceRow(fx.absenceId);
      assert.equal(row.date, '2026-03-02');
      assert.equal(row.notes, 'Original');
    });
  }
});

test('a date that does not exist in the calendar is rejected and leaves the absence untouched', async (t) => {
  for (const date of ['2026-02-30', '2026-13-01', '2026-04-31', '2027-02-29', '2026-00-10']) {
    await t.test(date, async () => {
      const fx = await createFixture();

      const res = await put(fx.token, fx.institutionId, fx.absenceId, { date, notes: 'Cambio' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid date. Use YYYY-MM-DD');

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
      const row = await absenceRow(fx.absenceId);
      assert.equal(row.date, '2026-03-02');
      assert.equal(row.notes, 'Original');
    });
  }
});

test('a leap day is a valid date for an edit', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.absenceId, { date: '2028-02-29' });
  assert.equal(res.status, 200);

  const [event] = await eventsOf(fx.institutionId);
  assert.ok(event, 'the edit was recorded');
  assert.equal(event.payload.after.date, '2028-02-29');
  assert.equal((await absenceRow(fx.absenceId)).date, '2028-02-29');
});

test('an edit made by someone else between the read and the write is rejected', async () => {
  const fx = await createFixture();
  // Another session changes the row and keeps it locked; the request reads the
  // committed snapshot, then waits on that lock. Once the other session
  // commits, the conditioned write no longer matches the snapshot it read.
  const other = AppDataSource.createQueryRunner();
  await other.connect();
  try {
    await other.startTransaction();
    await other.query(`UPDATE absences SET notes = 'Otro' WHERE id = $1`, [fx.absenceId]);

    const pending = put(fx.token, fx.institutionId, fx.absenceId, { notes: 'Mio' });

    let waiting = false;
    for (let i = 0; i < 100 && !waiting; i++) {
      const rows = await AppDataSource.query(
        `SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE 'UPDATE %absences%'`,
      );
      waiting = rows.length > 0;
      if (!waiting) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(waiting, 'the request reached its write and waits on the other session');
    await other.commitTransaction();

    const res = await pending;
    assert.equal(res.status, 409);
    assert.equal(res.body?.error, 'La falta fue modificada por otra persona, recarga');

    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
    assert.equal((await absenceRow(fx.absenceId)).notes, 'Otro', 'the other edit is kept');
  } finally {
    if (other.isTransactionActive) await other.rollbackTransaction();
    await other.release();
  }
});
