import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import * as XLSX from 'xlsx';
import { AppDataSource } from '../src/data-source';
import enrollmentRouter from '../src/controllers/enrollment.controller';
import importRouter from '../src/controllers/import.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const TEST_INST_PREFIX = '__test_enrulc_inst_';
const TEST_USER_PREFIX = 'testuser_enrulc_';
const STATEMENT_TABLE = 'test_roster_event_statements';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;
let counter = 0;
let shortCounter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}${process.pid}_${Date.now()}_${counter}`;
}

// The academic year carries a short name: its column holds twenty characters.
function uniqueShortName(prefix: string): string {
  shortCounter += 1;
  return `${prefix}${process.pid % 100000}_${shortCounter}`;
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
  await AppDataSource.query(
    `DELETE FROM user_modules WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await byInstitution('student_withdrawals');
  await byInstitution('enrollments');
  await byInstitution('guardians');
  await byInstitution('withdrawal_reasons');
  await byInstitution('students');
  await byInstitution('academic_years');
  await byInstitution('courses');
  await AppDataSource.query(`DELETE FROM ${STATEMENT_TABLE} WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`, inst);
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
    [uniqueName('__test_enrulc_course_'), institutionId],
  );
}

async function createAcademicYear(institutionId: number, active: boolean): Promise<number> {
  return insertRow(
    `INSERT INTO academic_years (name, institution_id, start_date, end_date, is_active)
     VALUES ($1, $2, '2026-01-01', '2026-12-31', $3) RETURNING id`,
    [uniqueShortName('A'), institutionId, active],
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

interface Fixture {
  token: string;
  userId: number;
  institutionId: number;
  courseId: number;
  yearId: number;
  studentId: number;
  freeStudentId: number;
  guardianId: number;
  enrollmentId: number;
}

async function createFixture(): Promise<Fixture> {
  const institutionId = await createInstitution();
  const courseId = await createCourse(institutionId);
  const yearId = await createAcademicYear(institutionId, true);
  const studentId = await createStudent(institutionId);
  // A student without an enrollment: the creation of one for it cannot run
  // into the unique constraint of the enrollment.
  const freeStudentId = await createStudent(institutionId);
  const guardianId = await createGuardian(institutionId);
  const enrollmentId = await createEnrollment(institutionId, courseId, yearId, studentId, guardianId);
  const { token, id: userId } = await createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName: 'superadmin',
    institutionId: null,
  });
  return { token, userId, institutionId, courseId, yearId, studentId, freeStudentId, guardianId, enrollmentId };
}

// The values the audit snapshot has to carry for the enrollment of a fixture.
function snapshotOf(fx: Fixture) {
  return {
    id: fx.enrollmentId,
    studentId: fx.studentId,
    courseId: fx.courseId,
    academicYearId: fx.yearId,
    guardianId: fx.guardianId,
    rosterNumber: ROSTER_NUMBER,
    studentPhone: STUDENT_PHONE,
    studentEmail: STUDENT_EMAIL,
    isActive: true,
  };
}

async function post(token: string, institutionId: number, body: unknown): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/enrollments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

async function del(token: string, institutionId: number, id: number): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/enrollments/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

async function uploadRoster(token: string, institutionId: number, buffer: Buffer): Promise<{ status: number; body: any; text: string }> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), 'roster.xlsx');
  const res = await fetch(`${baseUrl}/api/import/roster`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
    },
    body: form,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

async function eventsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT event_type, entity_type, entity_id, actor_user_id, payload
       FROM domain_events WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function enrollmentRows(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, student_id, course_id, academic_year_id, guardian_id, roster_number,
            student_phone, student_email, is_active, deleted_at
       FROM enrollments WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function enrollmentRow(id: number): Promise<any> {
  const [row] = await AppDataSource.query(
    `SELECT id, student_id, course_id, academic_year_id, guardian_id, roster_number,
            student_phone, student_email, is_active, deleted_at
       FROM enrollments WHERE id = $1`,
    [id],
  );
  return row;
}

// A trigger that rejects the event insert of one institution: the write that
// records the event has to roll back with it.
async function installFailingEventTrigger(institutionId: number): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enrulc_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enrulc_fail_event()`);
  await AppDataSource.query(
    `CREATE OR REPLACE FUNCTION test_enrulc_fail_event() RETURNS trigger AS $$
     BEGIN
       IF NEW.institution_id = ${institutionId} THEN
         RAISE EXCEPTION 'domain event insert failed';
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER trg_test_enrulc_fail_event
       BEFORE INSERT ON domain_events
       FOR EACH ROW EXECUTE FUNCTION test_enrulc_fail_event()`,
  );
}

async function removeFailingEventTrigger(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enrulc_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enrulc_fail_event()`);
}

// A trigger that rejects the enrollment of one student: the row that owns it
// fails on its own and the rest of the roster keeps its work.
async function installFailingEnrollmentTrigger(studentName: string): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enrulc_fail_row ON enrollments`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enrulc_fail_row()`);
  await AppDataSource.query(
    `CREATE OR REPLACE FUNCTION test_enrulc_fail_row() RETURNS trigger AS $$
     BEGIN
       IF NEW.student_id IN (SELECT id FROM students WHERE name = '${studentName}') THEN
         RAISE EXCEPTION 'enrollment row failed';
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER trg_test_enrulc_fail_row
       BEFORE INSERT ON enrollments
       FOR EACH ROW EXECUTE FUNCTION test_enrulc_fail_row()`,
  );
}

async function removeFailingEnrollmentTrigger(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enrulc_fail_row ON enrollments`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enrulc_fail_row()`);
}

// Counts how many statements wrote into the audit table and how many rows
// each of them carried: one event per enrollment, one statement for the lot.
async function installStatementCounter(): Promise<void> {
  await AppDataSource.query(
    `CREATE TABLE IF NOT EXISTS ${STATEMENT_TABLE} (
       id SERIAL PRIMARY KEY,
       institution_id INTEGER,
       rows_count INTEGER NOT NULL
     )`,
  );
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enrulc_count_inserts ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enrulc_count_inserts()`);
  await AppDataSource.query(
    `CREATE OR REPLACE FUNCTION test_enrulc_count_inserts() RETURNS trigger AS $$
     DECLARE
       inst INTEGER;
     BEGIN
       SELECT institution_id INTO inst FROM inserted_rows LIMIT 1;
       INSERT INTO ${STATEMENT_TABLE} (institution_id, rows_count)
       VALUES (inst, (SELECT count(*) FROM inserted_rows));
       RETURN NULL;
     END;
     $$ LANGUAGE plpgsql`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER trg_test_enrulc_count_inserts
       AFTER INSERT ON domain_events
       REFERENCING NEW TABLE AS inserted_rows
       FOR EACH STATEMENT EXECUTE FUNCTION test_enrulc_count_inserts()`,
  );
}

async function removeStatementCounter(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_enrulc_count_inserts ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_enrulc_count_inserts()`);
  await AppDataSource.query(`DROP TABLE IF EXISTS ${STATEMENT_TABLE}`);
}

async function statementsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT institution_id, rows_count FROM ${STATEMENT_TABLE} WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

const ROSTER_HEADERS = [
  'N°', 'CEDULA', 'APELLIDOS', 'SEXO', 'NACIMIENTO', 'REPRESENTANTE LEGAL',
  'TELEFONO ESTUDIANTE', 'CORREO ESTUDIANTE', 'TELEFONO REPRESENTANTE', 'CORREO REPRESENTANTE',
];

const FIRST_STUDENT = 'PEREZ PEREZ JUAN';
const SECOND_STUDENT = 'GOMEZ GOMEZ MARIA';

function rosterWorkbook(rows: string[][]): Buffer {
  const aoa: any[][] = [
    ['COLEGIO DE PRUEBAS'],
    ['LISTA DE MATRICULA'],
    [''],
    [''],
    [''],
    ROSTER_HEADERS,
    ...rows,
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '8A');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function rosterRow(rosterNumber: string, idNumber: string, name: string, phone: string, email: string): string[] {
  return [
    rosterNumber, idNumber, name, 'M', '04/05/2010', 'LOPEZ LOPEZ ANA',
    phone, email, '0992222222', 'ana@example.test',
  ];
}

before(async () => {
  await AppDataSource.initialize();
  await installStatementCounter();

  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/enrollments', enrollmentRouter);
  app.use('/api/import', importRouter);
  app.use(errorMiddleware);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await cleanup();
  await removeStatementCounter();
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});

beforeEach(cleanup);

test('creating an enrollment records one event with the snapshot and the actor', async () => {
  const fx = await createFixture();

  const res = await post(fx.token, fx.institutionId, {
    studentId: fx.freeStudentId,
    courseId: fx.courseId,
    academicYearId: fx.yearId,
    guardianId: fx.guardianId,
    rosterNumber: 12,
    studentPhone: STUDENT_PHONE,
    studentEmail: STUDENT_EMAIL,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'EnrollmentCreated');
  assert.equal(event.entity_type, 'enrollment');
  assert.equal(Number(event.entity_id), res.body.id, 'the event names the created enrollment');
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.equal(event.payload.before, null, 'nothing existed before the creation');
  assert.deepEqual(event.payload.after, {
    id: res.body.id,
    studentId: fx.freeStudentId,
    courseId: fx.courseId,
    academicYearId: fx.yearId,
    guardianId: fx.guardianId,
    rosterNumber: 12,
    studentPhone: STUDENT_PHONE,
    studentEmail: STUDENT_EMAIL,
    isActive: true,
  });
});

test('creating an enrollment without a roster number keeps the number the course gives it', async () => {
  const fx = await createFixture();

  const res = await post(fx.token, fx.institutionId, {
    studentId: fx.freeStudentId,
    courseId: fx.courseId,
    academicYearId: fx.yearId,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.rosterNumber, ROSTER_NUMBER + 1, 'the enrollment takes the next number of the course');

  const [event] = await eventsOf(fx.institutionId);
  assert.equal(event.event_type, 'EnrollmentCreated');
  assert.equal(event.payload.after.rosterNumber, ROSTER_NUMBER + 1, 'the event carries the number it was given');
});

test('deleting an enrollment records one event with the snapshot and the actor', async () => {
  const fx = await createFixture();

  const res = await del(fx.token, fx.institutionId, fx.enrollmentId);
  assert.equal(res.status, 204, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'EnrollmentDeleted');
  assert.equal(event.entity_type, 'enrollment');
  assert.equal(Number(event.entity_id), fx.enrollmentId);
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.equal(event.payload.after, null, 'nothing is left after the deletion');
  assert.deepEqual(event.payload.before, snapshotOf(fx));
});

test('the roster import records one event per created enrollment, written in a single statement', async () => {
  const fx = await createFixture();
  const workbook = rosterWorkbook([
    rosterRow('1', '1712345678', FIRST_STUDENT, '0991111111', 'juan@example.test'),
    rosterRow('2', '1712345679', SECOND_STUDENT, '0993333333', 'maria@example.test'),
  ]);

  const res = await uploadRoster(fx.token, fx.institutionId, workbook);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.enrollmentsCreated, 2, 'the import created both enrollments');
  assert.deepEqual(res.body.errors, [], 'the import had no errors');

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 2, 'one event per created enrollment');
  for (const event of events) {
    assert.equal(event.event_type, 'EnrollmentCreated');
    assert.equal(event.entity_type, 'enrollment');
    assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
    assert.equal(event.payload.before, null, 'nothing existed before the creation');
  }

  const rows = await enrollmentRows(fx.institutionId);
  const created = rows.filter((r: any) => r.roster_number === 1 || r.roster_number === 2);
  assert.equal(created.length, 2, 'the import wrote both enrollments');
  const ids = events.map((e: any) => Number(e.entity_id)).sort((a: number, b: number) => a - b);
  assert.deepEqual(ids, created.map((r: any) => Number(r.id)).sort((a: number, b: number) => a - b),
    'every event names one of the created enrollments');

  const statements = await statementsOf(fx.institutionId);
  assert.equal(statements.length, 1, 'the events were written in a single statement');
  assert.equal(Number(statements[0].rows_count), 2, 'the single statement carried both events');
});

test('the roster import records the enrollment it created with the values of the row', async () => {
  const fx = await createFixture();
  const workbook = rosterWorkbook([
    rosterRow('1', '1712345678', FIRST_STUDENT, '0991111111', 'juan@example.test'),
  ]);

  const res = await uploadRoster(fx.token, fx.institutionId, workbook);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const [event] = await eventsOf(fx.institutionId);
  assert.equal(event.event_type, 'EnrollmentCreated');
  const [row] = (await enrollmentRows(fx.institutionId)).filter((r: any) => r.roster_number === 1);
  assert.deepEqual(event.payload.after, {
    id: Number(row.id),
    studentId: Number(row.student_id),
    courseId: Number(row.course_id),
    academicYearId: Number(row.academic_year_id),
    guardianId: Number(row.guardian_id),
    rosterNumber: 1,
    studentPhone: '0991111111',
    studentEmail: 'juan@example.test',
    isActive: true,
  });
});

test('a rejected operation records no event', async (t) => {
  const cases: Array<{
    name: string;
    run: (fx: Fixture) => Promise<{ status: number; body: any }>;
    status: number;
    message: string;
  }> = [
    {
      name: 'the creation of an enrollment of a student that does not exist',
      run: async (fx) => post(fx.token, fx.institutionId, {
        studentId: 99999999,
        courseId: fx.courseId,
        academicYearId: fx.yearId,
      }),
      status: 404,
      message: 'Student not found',
    },
    {
      name: 'the creation of an enrollment in a course of another institution',
      run: async (fx) => {
        const otherInstitution = await createInstitution();
        const otherCourse = await createCourse(otherInstitution);
        return post(fx.token, fx.institutionId, {
          studentId: fx.studentId,
          courseId: otherCourse,
          academicYearId: fx.yearId,
        });
      },
      status: 404,
      message: 'Course not found',
    },
    {
      name: 'the deletion of an enrollment that does not exist',
      run: async (fx) => del(fx.token, fx.institutionId, 99999999),
      status: 404,
      message: 'Enrollment not found',
    },
    {
      name: 'the deletion of an enrollment of another institution',
      run: async (fx) => {
        const otherInstitution = await createInstitution();
        const otherCourse = await createCourse(otherInstitution);
        const otherYear = await createAcademicYear(otherInstitution, true);
        const otherStudent = await createStudent(otherInstitution);
        const otherEnrollment = await createEnrollment(otherInstitution, otherCourse, otherYear, otherStudent);
        return del(fx.token, fx.institutionId, otherEnrollment);
      },
      status: 404,
      message: 'Enrollment not found',
    },
    {
      name: 'the deletion of the enrollment of a withdrawn student',
      run: async (fx) => {
        await withdrawEnrollment(fx.institutionId, fx.enrollmentId);
        return del(fx.token, fx.institutionId, fx.enrollmentId);
      },
      status: 409,
      message: 'La matrícula está retirada',
    },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      await cleanup();
      const fx = await createFixture();

      const res = await c.run(fx);
      assert.equal(res.status, c.status, JSON.stringify(res.body));
      assert.ok(
        String(res.body?.error).includes(c.message),
        `the error message is the one of today (${res.body?.error})`,
      );

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
      const row = await enrollmentRow(fx.enrollmentId);
      assert.equal(row.is_active, true, 'the enrollment keeps its values');
      assert.equal(row.deleted_at, null, 'the enrollment was not deleted');
    });
  }
});

test('a failing event insert rolls the creation back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await post(fx.token, fx.institutionId, {
      studentId: fx.freeStudentId,
      courseId: fx.courseId,
      academicYearId: fx.yearId,
      rosterNumber: 12,
    });
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const rows = await enrollmentRows(fx.institutionId);
    assert.equal(rows.length, 1, 'the enrollment of the fixture is the only one there');
    assert.equal(rows[0].roster_number, ROSTER_NUMBER, 'the created enrollment was rolled back');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('a failing event insert rolls the deletion back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await del(fx.token, fx.institutionId, fx.enrollmentId);
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const row = await enrollmentRow(fx.enrollmentId);
    assert.equal(row.is_active, true, 'the deletion was rolled back');
    assert.equal(row.deleted_at, null, 'the enrollment is still there');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('a failing event insert rolls the roster import back', async () => {
  const fx = await createFixture();
  const workbook = rosterWorkbook([
    rosterRow('1', '1712345678', FIRST_STUDENT, '0991111111', 'juan@example.test'),
    rosterRow('2', '1712345679', SECOND_STUDENT, '0993333333', 'maria@example.test'),
  ]);
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await uploadRoster(fx.token, fx.institutionId, workbook);
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    assert.equal((await enrollmentRows(fx.institutionId)).length, 1, 'only the enrollment of the fixture is left');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('a row that fails in the roster import undoes only itself', async () => {
  const fx = await createFixture();
  const workbook = rosterWorkbook([
    rosterRow('1', '1712345678', FIRST_STUDENT, '0991111111', 'juan@example.test'),
    rosterRow('2', '1712345679', SECOND_STUDENT, '0993333333', 'maria@example.test'),
  ]);
  await installFailingEnrollmentTrigger(SECOND_STUDENT);
  try {
    const res = await uploadRoster(fx.token, fx.institutionId, workbook);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.enrollmentsCreated, 1, 'the row that worked created its enrollment');
    assert.equal(res.body.errors.length, 1, 'the row that failed is reported');
    assert.ok(String(res.body.errors[0]).includes('Row 8'), `the failed row is named (${res.body.errors[0]})`);

    const rows = await enrollmentRows(fx.institutionId);
    assert.equal(rows.length, 2, 'the enrollment of the fixture and the one of the row that worked');
    assert.equal(rows[1].roster_number, 1, 'the row that worked kept its enrollment');

    const events = await eventsOf(fx.institutionId);
    assert.equal(events.length, 1, 'only the row that worked left an event');
    assert.equal(events[0].event_type, 'EnrollmentCreated');
  } finally {
    await removeFailingEnrollmentTrigger();
  }
});

test('the counters of the import count only the work that survived', async () => {
  const fx = await createFixture();
  const workbook = rosterWorkbook([
    rosterRow('1', '1712345678', FIRST_STUDENT, '0991111111', 'juan@example.test'),
    rosterRow('2', '1712345679', SECOND_STUDENT, '0993333333', 'maria@example.test'),
  ]);
  await installFailingEnrollmentTrigger(SECOND_STUDENT);
  try {
    const res = await uploadRoster(fx.token, fx.institutionId, workbook);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const students = await AppDataSource.query(
      `SELECT name FROM students WHERE institution_id = $1 AND name IN ($2, $3)`,
      [fx.institutionId, FIRST_STUDENT, SECOND_STUDENT],
    );
    const enrollments = await AppDataSource.query(
      `SELECT roster_number FROM enrollments WHERE institution_id = $1 AND roster_number IN (1, 2)`,
      [fx.institutionId],
    );

    assert.equal(students.length, 1, 'the student of the row that failed did not survive');
    assert.equal(enrollments.length, 1, 'the enrollment of the row that failed did not survive');

    assert.equal(res.body.studentsCreated, students.length,
      'the counter of created students matches the students that survived');
    assert.equal(res.body.enrollmentsCreated, enrollments.length,
      'the counter of created enrollments matches the enrollments that survived');
    assert.equal(res.body.studentsUpdated, 0, 'no student was updated');
    assert.equal(res.body.enrollmentsUpdated, 0, 'no enrollment was updated');
    assert.equal(res.body.guardiansUpdated, 0, 'no guardian was updated');
    assert.equal(res.body.coursesProcessed, 1, 'the course of the sheet was processed');
    assert.equal(res.body.errors.length, 1, 'the row that failed is reported');
  } finally {
    await removeFailingEnrollmentTrigger();
  }
});

test('the answer of a creation keeps the shape of the enrollment', async () => {
  const fx = await createFixture();

  const res = await post(fx.token, fx.institutionId, {
    studentId: fx.freeStudentId,
    courseId: fx.courseId,
    academicYearId: fx.yearId,
    guardianId: fx.guardianId,
    rosterNumber: 12,
    studentPhone: STUDENT_PHONE,
    studentEmail: STUDENT_EMAIL,
  });
  assert.equal(res.status, 201);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'academicYearId', 'courseId', 'createdAt', 'createdByUserId', 'deletedAt',
    'guardianId', 'id', 'institutionId', 'isActive', 'rosterNumber',
    'studentEmail', 'studentId', 'studentPhone', 'updatedAt',
  ], 'the answer carries the enrollment and nothing else');

  assert.equal(res.body.studentId, fx.freeStudentId);
  assert.equal(res.body.courseId, fx.courseId);
  assert.equal(res.body.academicYearId, fx.yearId);
  assert.equal(res.body.institutionId, fx.institutionId);
  assert.equal(res.body.guardianId, fx.guardianId);
  assert.equal(res.body.rosterNumber, 12);
  assert.equal(res.body.studentPhone, STUDENT_PHONE);
  assert.equal(res.body.studentEmail, STUDENT_EMAIL);
  assert.equal(res.body.isActive, true);
  assert.equal(res.body.deletedAt, null);
  assert.equal(res.body.createdByUserId, fx.userId, 'the answer names the author of the enrollment');
  assert.ok(res.body.createdAt, 'the answer carries the creation date');
  assert.ok(res.body.updatedAt, 'the answer carries the update date');
});

test('the answer of a deletion stays empty', async () => {
  const fx = await createFixture();

  const res = await del(fx.token, fx.institutionId, fx.enrollmentId);
  assert.equal(res.status, 204);
  assert.equal(res.text, '', 'the answer carries nothing');
});

test('the answer of a roster import keeps its counters', async () => {
  const fx = await createFixture();
  const workbook = rosterWorkbook([
    rosterRow('1', '1712345678', FIRST_STUDENT, '0991111111', 'juan@example.test'),
    rosterRow('2', '1712345679', SECOND_STUDENT, '0993333333', 'maria@example.test'),
  ]);

  const res = await uploadRoster(fx.token, fx.institutionId, workbook);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  assert.deepEqual(Object.keys(res.body).sort(), [
    'coursesProcessed', 'enrollmentsCreated', 'enrollmentsUpdated', 'errors',
    'guardiansUpdated', 'studentsCreated', 'studentsUpdated',
  ], 'the answer carries the counters of the import and nothing else');

  assert.equal(res.body.coursesProcessed, 1);
  assert.equal(res.body.studentsCreated, 2);
  assert.equal(res.body.studentsUpdated, 0);
  assert.equal(res.body.enrollmentsCreated, 2);
  assert.equal(res.body.enrollmentsUpdated, 0);
  assert.equal(res.body.guardiansUpdated, 0);
  assert.deepEqual(res.body.errors, []);
});
