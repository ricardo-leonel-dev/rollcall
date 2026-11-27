import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import citationRouter from '../src/controllers/citation.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const TEST_INST_PREFIX = '__test_citde_inst_';
const TEST_USER_PREFIX = 'testuser_citde_';

const CITATION_DATE = '2026-03-05';
const CITATION_TIME = '07:55';
const OTHER_DATE = '2026-03-06';
const OTHER_TIME = '09:00';
const OBSERVATIONS = 'Llegó tarde';

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
    `DELETE FROM citation_citation_reasons WHERE citation_id IN (SELECT id FROM citations WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1))`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM citation_attachments WHERE citation_id IN (SELECT id FROM citations WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1))`,
    inst,
  );
  await byInstitution('citations');
  await byInstitution('citation_reasons');
  await byInstitution('student_withdrawals');
  await byInstitution('withdrawal_reasons');
  await byInstitution('enrollments');
  await byInstitution('guardians');
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
    [uniqueName('__test_citde_course_'), institutionId],
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

async function createReason(institutionId: number): Promise<number> {
  return insertRow(
    `INSERT INTO citation_reasons (institution_id, name, severity) VALUES ($1, $2, 'medium') RETURNING id`,
    [institutionId, uniqueName('Motivo ')],
  );
}

async function createEnrollment(
  institutionId: number,
  courseId: number,
  yearId: number,
  studentId: number,
  guardianId: number | null = null,
): Promise<number> {
  return insertRow(
    `INSERT INTO enrollments (student_id, course_id, academic_year_id, institution_id, guardian_id, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [studentId, courseId, yearId, institutionId, guardianId],
  );
}

async function createCitation(
  institutionId: number,
  enrollmentId: number,
  guardianId: number,
  reasonIds: number[],
  date = CITATION_DATE,
  time = CITATION_TIME,
): Promise<number> {
  const id = await insertRow(
    `INSERT INTO citations (institution_id, enrollment_id, guardian_id, date, time, status, observations, is_active)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, true) RETURNING id`,
    [institutionId, enrollmentId, guardianId, date, time, OBSERVATIONS],
  );
  for (const reasonId of reasonIds) {
    await AppDataSource.query(
      `INSERT INTO citation_citation_reasons (citation_id, citation_reason_id) VALUES ($1, $2)`,
      [id, reasonId],
    );
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

interface Fixture {
  token: string;
  userId: number;
  institutionId: number;
  courseId: number;
  yearId: number;
  studentId: number;
  guardianId: number;
  enrollmentId: number;
  reasonIds: number[];
  citationId: number;
}

async function createFixture(): Promise<Fixture> {
  const institutionId = await createInstitution();
  const courseId = await createCourse(institutionId);
  const yearId = await createAcademicYear(institutionId, true);
  const studentId = await createStudent(institutionId);
  const guardianId = await createGuardian(institutionId);
  const enrollmentId = await createEnrollment(institutionId, courseId, yearId, studentId, guardianId);
  const reasonIds = [await createReason(institutionId), await createReason(institutionId)];
  const citationId = await createCitation(institutionId, enrollmentId, guardianId, reasonIds);
  const { token, id: userId } = await createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName: 'superadmin',
    institutionId: null,
  });
  return { token, userId, institutionId, courseId, yearId, studentId, guardianId, enrollmentId, reasonIds, citationId };
}

// The values the audit snapshot has to carry for the citation of a fixture.
function snapshotOf(fx: Fixture, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: fx.citationId,
    enrollmentId: fx.enrollmentId,
    guardianId: fx.guardianId,
    date: CITATION_DATE,
    time: `${CITATION_TIME}:00`,
    status: 'pending',
    observations: OBSERVATIONS,
    reasonIds: [...fx.reasonIds].sort((a, b) => a - b),
    ...over,
  };
}

async function post(token: string, institutionId: number, body: unknown): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/citations`, {
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

async function put(token: string, institutionId: number, id: number, body: unknown): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/citations/${id}`, {
    method: 'PUT',
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

async function closeCitation(token: string, institutionId: number, id: number): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/citations/${id}/close`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

async function del(token: string, institutionId: number, id: number): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/citations/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
    },
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

async function citationRow(id: number): Promise<any> {
  const [row] = await AppDataSource.query(
    `SELECT id, enrollment_id, guardian_id, date::text AS date, time::text AS time,
            status, observations, is_active, deleted_at
       FROM citations WHERE id = $1`,
    [id],
  );
  return row;
}

async function citationRows(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, date::text AS date, time::text AS time, status, is_active, deleted_at
       FROM citations WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function reasonIdsOf(citationId: number): Promise<number[]> {
  const rows = await AppDataSource.query(
    `SELECT citation_reason_id FROM citation_citation_reasons WHERE citation_id = $1 ORDER BY citation_reason_id`,
    [citationId],
  );
  return rows.map((r: any) => Number(r.citation_reason_id));
}

// A trigger that rejects the event insert of one institution: the write that
// records the event has to roll back with it.
async function installFailingEventTrigger(institutionId: number): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_citde_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_citde_fail_event()`);
  await AppDataSource.query(
    `CREATE OR REPLACE FUNCTION test_citde_fail_event() RETURNS trigger AS $$
     BEGIN
       IF NEW.institution_id = ${institutionId} THEN
         RAISE EXCEPTION 'domain event insert failed';
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER trg_test_citde_fail_event
       BEFORE INSERT ON domain_events
       FOR EACH ROW EXECUTE FUNCTION test_citde_fail_event()`,
  );
}

async function removeFailingEventTrigger(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_citde_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_citde_fail_event()`);
}

before(async () => {
  await AppDataSource.initialize();

  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/citations', citationRouter);
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

test('creating a citation records one event with the snapshot and the actor', async () => {
  const fx = await createFixture();

  const res = await post(fx.token, fx.institutionId, {
    enrollmentId: fx.enrollmentId,
    date: OTHER_DATE,
    time: OTHER_TIME,
    observations: 'Tardanza',
    reasonIds: [fx.reasonIds[1], fx.reasonIds[0]],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'CitationCreated');
  assert.equal(event.entity_type, 'citation');
  assert.equal(Number(event.entity_id), res.body.id, 'the event names the created citation');
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.equal(event.payload.before, null, 'nothing existed before the creation');
  assert.deepEqual(event.payload.after, {
    id: res.body.id,
    enrollmentId: fx.enrollmentId,
    guardianId: fx.guardianId,
    date: OTHER_DATE,
    time: `${OTHER_TIME}:00`,
    status: 'pending',
    observations: 'Tardanza',
    reasonIds: [...fx.reasonIds].sort((a, b) => a - b),
  }, 'the event carries the citation and its reasons');
});

test('editing a citation records one event with both snapshots and the actor', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.citationId, { observations: 'Salió del salón' });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'CitationUpdated');
  assert.equal(event.entity_type, 'citation');
  assert.equal(Number(event.entity_id), fx.citationId);
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.deepEqual(event.payload, {
    before: snapshotOf(fx),
    after: snapshotOf(fx, { observations: 'Salió del salón' }),
  });
});

test('editing the date of a citation records the change of that field', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.citationId, { date: OTHER_DATE });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const [event] = await eventsOf(fx.institutionId);
  assert.ok(event, 'the edit was recorded');
  assert.equal(event.event_type, 'CitationUpdated');
  assert.equal(event.payload.before.date, CITATION_DATE);
  assert.equal(event.payload.after.date, OTHER_DATE);
  assert.equal(event.payload.before.observations, OBSERVATIONS, 'the untouched fields keep their value');
  assert.equal(event.payload.after.observations, OBSERVATIONS);
});

test('editing the reasons of a citation records the new set of reasons', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.citationId, { reasonIds: [fx.reasonIds[0]] });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const [event] = await eventsOf(fx.institutionId);
  assert.ok(event, 'the edit was recorded');
  assert.equal(event.event_type, 'CitationUpdated');
  assert.deepEqual(event.payload.before.reasonIds, [...fx.reasonIds].sort((a, b) => a - b));
  assert.deepEqual(event.payload.after.reasonIds, [fx.reasonIds[0]]);
});

test('closing a citation records one event with the snapshot and the actor', async () => {
  const fx = await createFixture();

  const res = await closeCitation(fx.token, fx.institutionId, fx.citationId);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'CitationClosed');
  assert.equal(event.entity_type, 'citation');
  assert.equal(Number(event.entity_id), fx.citationId);
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.deepEqual(event.payload, {
    before: snapshotOf(fx),
    after: snapshotOf(fx, { status: 'closed' }),
  });
});

test('deleting a citation records one event with the snapshot and the actor', async () => {
  const fx = await createFixture();

  const res = await del(fx.token, fx.institutionId, fx.citationId);
  assert.equal(res.status, 204, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'CitationDeleted');
  assert.equal(event.entity_type, 'citation');
  assert.equal(Number(event.entity_id), fx.citationId);
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.equal(event.payload.after, null, 'nothing is left after the deletion');
  assert.deepEqual(event.payload.before, snapshotOf(fx));
});

test('an edit that changes no field of the snapshot records no event', async (t) => {
  const cases: Array<{ name: string; body: (fx: Fixture) => unknown }> = [
    { name: 'the same date again', body: () => ({ date: CITATION_DATE }) },
    { name: 'the same time again', body: () => ({ time: CITATION_TIME }) },
    { name: 'the same observations again', body: () => ({ observations: OBSERVATIONS }) },
    { name: 'the same reasons in another order', body: (fx) => ({ reasonIds: [...fx.reasonIds].reverse() }) },
    { name: 'an empty body', body: () => ({}) },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      await cleanup();
      const fx = await createFixture();

      const res = await put(fx.token, fx.institutionId, fx.citationId, c.body(fx));
      assert.equal(res.status, 200, 'the edit is still a valid operation');

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
      const row = await citationRow(fx.citationId);
      assert.equal(row.date, CITATION_DATE, 'the citation keeps its values');
      assert.equal(row.time, `${CITATION_TIME}:00`);
      assert.equal(row.observations, OBSERVATIONS);
      assert.deepEqual(await reasonIdsOf(fx.citationId), [...fx.reasonIds].sort((a, b) => a - b));
    });
  }
});

test('a rejected operation records no event and keeps its status code', async (t) => {
  const cases: Array<{
    name: string;
    prepare?: (fx: Fixture) => Promise<number | void>;
    run: (fx: Fixture, targetId: number) => Promise<{ status: number; body: any }>;
    status: number;
    message: string;
  }> = [
    {
      name: 'the creation of a citation for an enrollment that does not exist',
      run: (fx) => post(fx.token, fx.institutionId, {
        enrollmentId: 99999999, date: OTHER_DATE, time: OTHER_TIME, reasonIds: [fx.reasonIds[0]],
      }),
      status: 404,
      message: 'Enrollment not found',
    },
    {
      name: 'the creation of a citation without reasons',
      run: (fx) => post(fx.token, fx.institutionId, {
        enrollmentId: fx.enrollmentId, date: OTHER_DATE, time: OTHER_TIME, reasonIds: [],
      }),
      status: 400,
      message: 'Debe seleccionar al menos un motivo',
    },
    {
      name: 'the creation of a citation for a withdrawn enrollment',
      prepare: (fx) => withdrawEnrollment(fx.institutionId, fx.enrollmentId),
      run: (fx) => post(fx.token, fx.institutionId, {
        enrollmentId: fx.enrollmentId, date: OTHER_DATE, time: OTHER_TIME, reasonIds: [fx.reasonIds[0]],
      }),
      status: 409,
      message: 'La matrícula está retirada',
    },
    {
      name: 'the editing of a citation that does not exist',
      run: (fx) => put(fx.token, fx.institutionId, 99999999, { observations: 'Otra cosa' }),
      status: 404,
      message: 'Citation not found',
    },
    {
      name: 'the editing of a citation of another institution',
      prepare: async () => {
        const otherInstitution = await createInstitution();
        const otherCourse = await createCourse(otherInstitution);
        const otherYear = await createAcademicYear(otherInstitution, true);
        const otherStudent = await createStudent(otherInstitution);
        const otherGuardian = await createGuardian(otherInstitution);
        const otherEnrollment = await createEnrollment(otherInstitution, otherCourse, otherYear, otherStudent, otherGuardian);
        const otherReason = await createReason(otherInstitution);
        return createCitation(otherInstitution, otherEnrollment, otherGuardian, [otherReason]);
      },
      run: (fx, targetId) => put(fx.token, fx.institutionId, targetId, { observations: 'Otra cosa' }),
      status: 404,
      message: 'Citation not found',
    },
    {
      name: 'the editing of a citation with a reason that does not exist',
      run: (fx) => put(fx.token, fx.institutionId, fx.citationId, { reasonIds: [99999999] }),
      status: 404,
      message: 'Uno o más motivos no existen',
    },
    {
      name: 'the closing of a citation that does not exist',
      run: (fx) => closeCitation(fx.token, fx.institutionId, 99999999),
      status: 404,
      message: 'Citation not found',
    },
    {
      name: 'the closing of an already closed citation',
      prepare: (fx) => closeCitation(fx.token, fx.institutionId, fx.citationId).then(() => undefined),
      run: (fx) => closeCitation(fx.token, fx.institutionId, fx.citationId),
      status: 409,
      message: 'La citación ya está cerrada',
    },
    {
      name: 'the deletion of a citation that does not exist',
      run: (fx) => del(fx.token, fx.institutionId, 99999999),
      status: 404,
      message: 'Citation not found',
    },
    {
      name: 'the deletion of a citation of a withdrawn enrollment',
      prepare: (fx) => withdrawEnrollment(fx.institutionId, fx.enrollmentId),
      run: (fx) => del(fx.token, fx.institutionId, fx.citationId),
      status: 409,
      message: 'La matrícula está retirada',
    },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      await cleanup();
      const fx = await createFixture();
      const targetId = (await c.prepare?.(fx)) ?? fx.citationId;

      const before = (await eventsOf(fx.institutionId)).length;

      const res = await c.run(fx, targetId);
      assert.equal(res.status, c.status, JSON.stringify(res.body));
      assert.ok(
        String(res.body?.error).includes(c.message),
        `the error message is the one of today (${res.body?.error})`,
      );

      const events = await eventsOf(fx.institutionId);
      assert.equal(events.length, before, 'the rejected operation recorded no event');

      const row = await citationRow(fx.citationId);
      assert.equal(row.deleted_at, null, 'the citation was not deleted');
    });
  }
});

test('a failing event insert rolls the creation back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await post(fx.token, fx.institutionId, {
      enrollmentId: fx.enrollmentId,
      date: OTHER_DATE,
      time: OTHER_TIME,
      reasonIds: [fx.reasonIds[0]],
    });
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const rows = await citationRows(fx.institutionId);
    assert.equal(rows.length, 1, 'the citation of the fixture is the only one there');
    assert.equal(rows[0].date, CITATION_DATE, 'the created citation was rolled back');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('a failing event insert rolls the edit back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await put(fx.token, fx.institutionId, fx.citationId, { observations: 'Salió del salón' });
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const row = await citationRow(fx.citationId);
    assert.equal(row.observations, OBSERVATIONS, 'the edit was rolled back');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('a failing event insert rolls the closing back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await closeCitation(fx.token, fx.institutionId, fx.citationId);
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const row = await citationRow(fx.citationId);
    assert.equal(row.status, 'pending', 'the closing was rolled back');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('a failing event insert rolls the deletion back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await del(fx.token, fx.institutionId, fx.citationId);
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    const row = await citationRow(fx.citationId);
    assert.equal(row.is_active, true, 'the deletion was rolled back');
    assert.equal(row.deleted_at, null, 'the citation is still there');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('the answer of a creation keeps the shape of the citation', async () => {
  const fx = await createFixture();

  const res = await post(fx.token, fx.institutionId, {
    enrollmentId: fx.enrollmentId,
    date: OTHER_DATE,
    time: OTHER_TIME,
    reasonIds: [fx.reasonIds[0]],
  });
  assert.equal(res.status, 201);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'closedAt', 'closedByUserId', 'createdAt', 'createdByUserId', 'date', 'deletedAt',
    'enrollmentId', 'guardianId', 'id', 'institutionId', 'isActive', 'observations',
    'time', 'updatedAt',
  ], 'the answer carries the citation and nothing else');

  assert.equal(res.body.enrollmentId, fx.enrollmentId);
  assert.equal(res.body.institutionId, fx.institutionId);
  assert.equal(res.body.guardianId, fx.guardianId);
  assert.equal(res.body.date, OTHER_DATE);
  assert.equal(res.body.time, OTHER_TIME);
  assert.equal(res.body.createdByUserId, fx.userId, 'the answer names the author of the citation');
  assert.ok(res.body.createdAt, 'the answer carries the creation date');
  assert.ok(res.body.updatedAt, 'the answer carries the update date');
});

test('the answer of an edit keeps the shape of the citation', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.citationId, { observations: 'Salió del salón' });
  assert.equal(res.status, 200);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'closedAt', 'closedByUserId', 'createdAt', 'createdByUserId', 'date', 'deletedAt',
    'enrollmentId', 'guardianId', 'id', 'institutionId', 'isActive', 'observations',
    'status', 'time', 'updatedAt',
  ], 'the answer carries the citation and nothing else');

  assert.equal(res.body.id, fx.citationId);
  assert.equal(res.body.enrollmentId, fx.enrollmentId);
  assert.equal(res.body.institutionId, fx.institutionId);
  assert.equal(res.body.guardianId, fx.guardianId);
  assert.equal(res.body.date, CITATION_DATE);
  assert.equal(res.body.observations, 'Salió del salón', 'the answer carries the new value');
  assert.equal(res.body.status, 'pending');
  assert.equal(res.body.isActive, true);
  assert.equal(res.body.deletedAt, null);
  assert.equal(res.body.closedAt, null);
  assert.equal(res.body.closedByUserId, null);
});

test('the answer of a closing keeps the shape of the citation', async () => {
  const fx = await createFixture();

  const res = await closeCitation(fx.token, fx.institutionId, fx.citationId);
  assert.equal(res.status, 200);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'closedAt', 'closedByUserId', 'createdAt', 'createdByUserId', 'date', 'deletedAt',
    'enrollmentId', 'guardianId', 'id', 'institutionId', 'isActive', 'observations',
    'status', 'time', 'updatedAt',
  ], 'the answer carries the citation and nothing else');

  assert.equal(res.body.id, fx.citationId);
  assert.equal(res.body.status, 'closed', 'the answer carries the new status');
  assert.equal(res.body.closedByUserId, fx.userId, 'the answer names the one who closed it');
  assert.ok(res.body.closedAt, 'the answer carries the closing date');
});

test('the answer of a deletion stays empty', async () => {
  const fx = await createFixture();

  const res = await del(fx.token, fx.institutionId, fx.citationId);
  assert.equal(res.status, 204);
  assert.equal(res.text, '', 'the answer carries nothing');
});
