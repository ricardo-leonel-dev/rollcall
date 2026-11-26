import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import enrollmentRouter from '../src/controllers/enrollment.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const TEST_INST_PREFIX = '__test_enru_inst_';
const TEST_USER_PREFIX = 'testuser_enru_';

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
  await AppDataSource.query(
    `DELETE FROM user_courses WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM user_courses WHERE academic_year_id IN (SELECT id FROM academic_years WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1))`,
    inst,
  );
  await byInstitution('student_withdrawals');
  await byInstitution('enrollments');
  await byInstitution('guardians');
  await byInstitution('withdrawal_reasons');
  await byInstitution('students');
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

async function createCourse(institutionId: number): Promise<number> {
  return insertRow(
    `INSERT INTO courses (name, institution_id, shift, is_active) VALUES ($1, $2, 'MATUTINA', true) RETURNING id`,
    [uniqueName('__test_enru_course_'), institutionId],
  );
}

async function createAcademicYear(institutionId: number, active: boolean): Promise<number> {
  return insertRow(
    `INSERT INTO academic_years (name, institution_id, start_date, end_date, is_active)
     VALUES ($1, $2, '2026-01-01', '2026-12-31', $3) RETURNING id`,
    [`Y${++counter}`, institutionId, active],
  );
}

async function createStudent(institutionId: number): Promise<number> {
  return insertRow(
    `INSERT INTO students (name, institution_id, is_active) VALUES ($1, $2, true) RETURNING id`,
    [uniqueName('ALUMNO '), institutionId],
  );
}

async function createGuardian(institutionId: number): Promise<number> {
  return insertRow(
    `INSERT INTO guardians (name, institution_id, is_active) VALUES ($1, $2, true) RETURNING id`,
    [uniqueName('TUTOR '), institutionId],
  );
}

const ROSTER_NUMBER = 7;
const STUDENT_PHONE = '0999999999';
const STUDENT_EMAIL = 'alumno@example.test';

async function createEnrollment(
  institutionId: number,
  courseId: number,
  yearId: number,
  studentId: number,
  guardianId: number | null = null,
): Promise<number> {
  return insertRow(
    `INSERT INTO enrollments (student_id, course_id, academic_year_id, institution_id, guardian_id,
                              roster_number, student_phone, student_email, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING id`,
    [studentId, courseId, yearId, institutionId, guardianId, ROSTER_NUMBER, STUDENT_PHONE, STUDENT_EMAIL],
  );
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

async function put(token: string, institutionId: number, id: number, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/enrollments/${id}`, {
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

async function enrollmentRow(id: number): Promise<any> {
  const [row] = await AppDataSource.query(
    `SELECT id, student_id, course_id, academic_year_id, guardian_id, roster_number,
            student_phone, student_email, is_active
       FROM enrollments WHERE id = $1`,
    [id],
  );
  return row;
}

interface Fixture {
  token: string;
  userId: number;
  institutionId: number;
  courseId: number;
  yearId: number;
  studentId: number;
  guardianId: number;
  enrollmentId: number;
}

async function createFixture(): Promise<Fixture> {
  const institutionId = await createInstitution();
  const courseId = await createCourse(institutionId);
  const yearId = await createAcademicYear(institutionId, false);
  const studentId = await createStudent(institutionId);
  const guardianId = await createGuardian(institutionId);
  const enrollmentId = await createEnrollment(institutionId, courseId, yearId, studentId, guardianId);
  const { token, id: userId } = await createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName: 'superadmin',
    institutionId: null,
  });
  return { token, userId, institutionId, courseId, yearId, studentId, guardianId, enrollmentId };
}

// The values the audit snapshot has to carry for the enrollment of a fixture.
function snapshotOf(fx: Fixture, rosterNumber: number = ROSTER_NUMBER) {
  return {
    id: fx.enrollmentId,
    studentId: fx.studentId,
    courseId: fx.courseId,
    academicYearId: fx.yearId,
    guardianId: fx.guardianId,
    rosterNumber,
    studentPhone: STUDENT_PHONE,
    studentEmail: STUDENT_EMAIL,
    isActive: true,
  };
}

// A trigger that rejects the event insert of one institution: the edit that
// writes the event has to roll back with it.
async function installFailingEventTrigger(institutionId: number): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enru_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enru_fail_event()`);
  await AppDataSource.query(
    `CREATE OR REPLACE FUNCTION test_enru_fail_event() RETURNS trigger AS $$
     BEGIN
       IF NEW.institution_id = ${institutionId} THEN
         RAISE EXCEPTION 'domain event insert failed';
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER trg_test_enru_fail_event
       BEFORE INSERT ON domain_events
       FOR EACH ROW EXECUTE FUNCTION test_enru_fail_event()`,
  );
}

async function removeFailingEventTrigger(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enru_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enru_fail_event()`);
}

before(async () => {
  await AppDataSource.initialize();
  // The course-scoping fixture needs user_courses.academic_year_id, which the
  // seeded schema does not carry (the migration that adds it targets another
  // schema). Added here so a course-scoped caller can be exercised.
  await AppDataSource.query(`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS academic_year_id INTEGER`);

  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/enrollments', enrollmentRouter);
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

test('editing an enrollment records one event with both snapshots and the actor', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.enrollmentId, { rosterNumber: 12 });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'EnrollmentUpdated');
  assert.equal(event.entity_type, 'enrollment');
  assert.equal(Number(event.entity_id), fx.enrollmentId);
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.deepEqual(event.payload, {
    before: snapshotOf(fx),
    after: snapshotOf(fx, 12),
  });
});

test('editing a single field of an enrollment records the change of that field', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.enrollmentId, { studentPhone: '0988888888' });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const [event] = await eventsOf(fx.institutionId);
  assert.ok(event, 'the edit was recorded');
  assert.equal(event.event_type, 'EnrollmentUpdated');
  assert.equal(event.payload.before.studentPhone, STUDENT_PHONE);
  assert.equal(event.payload.after.studentPhone, '0988888888');
  assert.equal(event.payload.after.rosterNumber, ROSTER_NUMBER, 'the untouched fields keep their value');
  assert.equal(event.payload.before.rosterNumber, ROSTER_NUMBER);
});

test('changing the guardian of an enrollment is recorded', async () => {
  const fx = await createFixture();
  const otherGuardianId = await createGuardian(fx.institutionId);

  const res = await put(fx.token, fx.institutionId, fx.enrollmentId, { guardianId: otherGuardianId });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const [event] = await eventsOf(fx.institutionId);
  assert.ok(event, 'the edit was recorded');
  assert.equal(event.event_type, 'EnrollmentUpdated');
  assert.equal(event.payload.before.guardianId, fx.guardianId);
  assert.equal(event.payload.after.guardianId, otherGuardianId);
});

test('an edit that changes no field of the snapshot records no event', async (t) => {
  const cases: Array<{ name: string; body: (fx: Fixture) => unknown }> = [
    { name: 'the same roster number again', body: () => ({ rosterNumber: ROSTER_NUMBER }) },
    { name: 'the same guardian again', body: (fx) => ({ guardianId: fx.guardianId }) },
    { name: 'the same phone again', body: () => ({ studentPhone: STUDENT_PHONE }) },
    { name: 'an empty body', body: () => ({}) },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      await cleanup();
      const fx = await createFixture();

      const res = await put(fx.token, fx.institutionId, fx.enrollmentId, c.body(fx));
      assert.equal(res.status, 200, 'the edit is still a valid operation');

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
      const row = await enrollmentRow(fx.enrollmentId);
      assert.equal(row.roster_number, ROSTER_NUMBER, 'the enrollment keeps its values');
      assert.equal(row.student_phone, STUDENT_PHONE);
      assert.equal(row.guardian_id, fx.guardianId);
    });
  }
});

test('a rejected edit records no event and keeps its status code', async (t) => {
  const cases: Array<{
    name: string;
    target: (fx: Fixture) => Promise<number>;
    body: (fx: Fixture) => unknown;
    status: number;
    message: string;
  }> = [
    {
      name: 'an unknown enrollment',
      target: async () => 99999999,
      body: () => ({ rosterNumber: 12 }),
      status: 404,
      message: 'Enrollment not found',
    },
    {
      name: 'an enrollment of another institution',
      target: async () => {
        const otherInstitution = await createInstitution();
        const otherCourse = await createCourse(otherInstitution);
        const otherYear = await createAcademicYear(otherInstitution, false);
        const otherStudent = await createStudent(otherInstitution);
        return createEnrollment(otherInstitution, otherCourse, otherYear, otherStudent);
      },
      body: () => ({ rosterNumber: 12 }),
      status: 404,
      message: 'Enrollment not found',
    },
    {
      name: 'a guardian that does not exist',
      target: async (fx) => fx.enrollmentId,
      body: () => ({ guardianId: 99999999 }),
      status: 404,
      message: 'Guardian not found',
    },
    {
      name: 'a guardian of another institution',
      target: async (fx) => fx.enrollmentId,
      body: async () => {
        const otherInstitution = await createInstitution();
        return { guardianId: await createGuardian(otherInstitution) };
      },
      status: 404,
      message: 'Guardian not found',
    },
    {
      name: 'the enrollment of a withdrawn student',
      target: async (fx) => {
        await withdrawEnrollment(fx.institutionId, fx.enrollmentId);
        return fx.enrollmentId;
      },
      body: () => ({ rosterNumber: 12 }),
      status: 409,
      message: 'La matrícula está retirada',
    },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      await cleanup();
      const fx = await createFixture();
      const targetId = await c.target(fx);

      const res = await put(fx.token, fx.institutionId, targetId, await c.body(fx));
      assert.equal(res.status, c.status, JSON.stringify(res.body));
      assert.ok(
        String(res.body?.error).includes(c.message),
        `the error message is the one of today (${res.body?.error})`,
      );

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
      const row = await enrollmentRow(fx.enrollmentId);
      assert.equal(row.roster_number, ROSTER_NUMBER, 'the enrollment keeps its values');
      assert.equal(row.guardian_id, fx.guardianId);
    });
  }
});

test('an enrollment outside the course scope of the caller is rejected and records no event', async () => {
  const institutionId = await createInstitution();
  const courseId = await createCourse(institutionId);
  const otherCourseId = await createCourse(institutionId);
  const yearId = await createAcademicYear(institutionId, true);
  const studentId = await createStudent(institutionId);
  const enrollmentId = await createEnrollment(institutionId, courseId, yearId, studentId);

  const { token, id: userId } = await createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName: 'admin',
    institutionId,
  });
  await AppDataSource.query(
    `INSERT INTO user_courses (user_id, course_id, academic_year_id) VALUES ($1, $2, $3)`,
    [userId, otherCourseId, yearId],
  );

  const res = await put(token, institutionId, enrollmentId, { rosterNumber: 12 });
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.ok(
    String(res.body?.error).includes('Enrollment not found'),
    `the error message is the one of today (${res.body?.error})`,
  );

  assert.equal((await eventsOf(institutionId)).length, 0, 'no event was recorded');
  const row = await enrollmentRow(enrollmentId);
  assert.equal(row.roster_number, ROSTER_NUMBER, 'the enrollment keeps its values');
});

test('a failing event insert rolls the edit back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await put(fx.token, fx.institutionId, fx.enrollmentId, { rosterNumber: 12 });
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const row = await enrollmentRow(fx.enrollmentId);
    assert.equal(row.roster_number, ROSTER_NUMBER, 'the edit was rolled back');
    assert.equal(row.student_phone, STUDENT_PHONE);
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('the answer of an edit keeps the shape of the enrollment', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.enrollmentId, { rosterNumber: 12 });
  assert.equal(res.status, 200);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'academicYearId', 'courseId', 'createdAt', 'createdByUserId', 'deletedAt',
    'guardianId', 'id', 'institutionId', 'isActive', 'rosterNumber',
    'studentEmail', 'studentId', 'studentPhone', 'updatedAt',
  ], 'the answer carries the enrollment and nothing else');

  assert.equal(res.body.id, fx.enrollmentId);
  assert.equal(res.body.studentId, fx.studentId);
  assert.equal(res.body.courseId, fx.courseId);
  assert.equal(res.body.academicYearId, fx.yearId);
  assert.equal(res.body.institutionId, fx.institutionId);
  assert.equal(res.body.guardianId, fx.guardianId);
  assert.equal(res.body.rosterNumber, 12, 'the answer carries the new value');
  assert.equal(res.body.studentPhone, STUDENT_PHONE);
  assert.equal(res.body.studentEmail, STUDENT_EMAIL);
  assert.equal(res.body.isActive, true);
  assert.equal(res.body.deletedAt, null);
  assert.equal(res.body.createdByUserId, null);
  assert.ok(res.body.createdAt, 'the answer carries the creation date');
  assert.ok(res.body.updatedAt, 'the answer carries the update date');
});
