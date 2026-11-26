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

const TEST_INST_PREFIX = '__test_juev_inst_';
const TEST_USER_PREFIX = 'testuser_juev_';

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
    [uniqueName('__test_juev_course_'), institutionId],
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

async function eventsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT event_type, entity_type, entity_id, actor_user_id, payload
       FROM domain_events WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

interface Fixture {
  token: string;
  userId: number;
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
  const { token, id: userId } = await createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName: 'superadmin',
    institutionId: null,
  });
  return { token, userId, institutionId, enrollmentId, linkedAbsenceId, freeAbsenceId, justificationId };
}

// A trigger that rejects the event insert of one institution: the edit that
// writes the event has to roll back with it.
async function installFailingEventTrigger(institutionId: number): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_juev_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_juev_fail_event()`);
  await AppDataSource.query(
    `CREATE OR REPLACE FUNCTION test_juev_fail_event() RETURNS trigger AS $$
     BEGIN
       IF NEW.institution_id = ${institutionId} THEN
         RAISE EXCEPTION 'domain event insert failed';
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER trg_test_juev_fail_event
       BEFORE INSERT ON domain_events
       FOR EACH ROW EXECUTE FUNCTION test_juev_fail_event()`,
  );
}

async function removeFailingEventTrigger(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS trg_test_juev_fail_event ON domain_events`);
  await AppDataSource.query(`DROP FUNCTION IF EXISTS test_juev_fail_event()`);
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

test('editing a justification records one event with both snapshots and the actor', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.justificationId, { reason: 'Cambiado' });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'JustificationUpdated');
  assert.equal(event.entity_type, 'justification');
  assert.equal(Number(event.entity_id), fx.justificationId);
  assert.equal(Number(event.actor_user_id), fx.userId, 'the event names the caller');
  assert.deepEqual(event.payload, {
    before: {
      id: fx.justificationId,
      enrollmentId: fx.enrollmentId,
      reason: 'Original',
      notifiedBy: null,
      absenceIds: [fx.linkedAbsenceId],
    },
    after: {
      id: fx.justificationId,
      enrollmentId: fx.enrollmentId,
      reason: 'Cambiado',
      notifiedBy: null,
      absenceIds: [fx.linkedAbsenceId],
    },
  });
});

test('editing a justification records the change of a single field', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.justificationId, { notifiedBy: 'Tutor' });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const [event] = await eventsOf(fx.institutionId);
  assert.ok(event, 'the edit was recorded');
  assert.equal(event.event_type, 'JustificationUpdated');
  assert.equal(event.payload.before.notifiedBy, null);
  assert.equal(event.payload.after.notifiedBy, 'Tutor');
  assert.equal(event.payload.before.reason, 'Original', 'the untouched fields keep their value');
  assert.equal(event.payload.after.reason, 'Original');
});

test('relinking the absences of a justification is recorded', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.justificationId, { absenceIds: [fx.freeAbsenceId] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.freeAbsenceId], 'the links were replaced');

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 1, 'exactly one event was recorded');
  const [event] = events;
  assert.equal(event.event_type, 'JustificationUpdated');
  assert.deepEqual(event.payload.before.absenceIds, [fx.linkedAbsenceId]);
  assert.deepEqual(event.payload.after.absenceIds, [fx.freeAbsenceId]);
  assert.equal(event.payload.before.reason, 'Original', 'the untouched fields keep their value');
  assert.equal(event.payload.after.reason, 'Original');
});

test('an edit that changes no field of the snapshot records no event', async (t) => {
  const cases: Array<{ name: string; body: (fx: Fixture) => unknown }> = [
    { name: 'the same reason again', body: () => ({ reason: 'Original' }) },
    { name: 'the same absences again', body: (fx) => ({ absenceIds: [fx.linkedAbsenceId] }) },
    { name: 'an empty body', body: () => ({}) },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      await cleanup();
      const fx = await createFixture();

      const res = await put(fx.token, fx.institutionId, fx.justificationId, c.body(fx));
      assert.equal(res.status, 200, 'the edit is still a valid operation');

      assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was recorded');
      assert.equal(await reasonOf(fx.justificationId), 'Original', 'the justification keeps its reason');
      assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.linkedAbsenceId], 'the links are the same');
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
      name: 'an unknown justification',
      target: async () => 99999999,
      body: () => ({ reason: 'Cambiado' }),
      status: 404,
      message: 'Justification not found',
    },
    {
      name: 'a justification of another institution',
      target: async () => {
        const otherInstitution = await createInstitution();
        const otherEnrollment = await createEnrollment(otherInstitution);
        const otherAbsence = await insertAbsence(otherInstitution, otherEnrollment, '2026-03-04');
        return insertJustification(otherInstitution, otherEnrollment, [otherAbsence]);
      },
      body: () => ({ reason: 'Cambiado' }),
      status: 404,
      message: 'Justification not found',
    },
    {
      name: 'the justification of a withdrawn enrollment',
      target: async (fx) => {
        await withdrawEnrollment(fx.institutionId, fx.enrollmentId);
        return fx.justificationId;
      },
      body: () => ({ reason: 'Cambiado' }),
      status: 409,
      message: 'La matrícula está retirada',
    },
    {
      name: 'an absence of another institution in the links',
      target: async (fx) => fx.justificationId,
      body: async (fx) => {
        const otherInstitution = await createInstitution();
        const otherEnrollment = await createEnrollment(otherInstitution);
        return { absenceIds: [await insertAbsence(otherInstitution, otherEnrollment, '2026-03-04')] };
      },
      status: 404,
      message: 'not found',
    },
    {
      name: 'an absence of a different enrollment',
      target: async (fx) => fx.justificationId,
      body: async (fx) => {
        const otherEnrollment = await createEnrollment(fx.institutionId);
        return { absenceIds: [await insertAbsence(fx.institutionId, otherEnrollment, '2026-03-04')] };
      },
      status: 400,
      message: 'does not belong to this enrollment',
    },
    {
      name: 'an absence already justified by another justification',
      target: async (fx) => fx.justificationId,
      body: async (fx) => {
        const justified = await insertAbsence(fx.institutionId, fx.enrollmentId, '2026-03-05');
        await insertJustification(fx.institutionId, fx.enrollmentId, [justified]);
        return { absenceIds: [justified] };
      },
      status: 409,
      message: 'is already justified',
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
      assert.equal(await reasonOf(fx.justificationId), 'Original', 'the justification keeps its reason');
      assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.linkedAbsenceId], 'the links are the same');
    });
  }
});

test('a failing event insert rolls the edit and the relinking back', async () => {
  const fx = await createFixture();
  await installFailingEventTrigger(fx.institutionId);
  try {
    const res = await put(fx.token, fx.institutionId, fx.justificationId, {
      reason: 'Cambiado',
      absenceIds: [fx.freeAbsenceId],
    });
    assert.equal(res.status, 500, 'the failing insert surfaces as a server error');

    assert.equal(await reasonOf(fx.justificationId), 'Original', 'the edit was rolled back');
    assert.deepEqual(await linkedAbsences(fx.justificationId), [fx.linkedAbsenceId], 'the relinking was rolled back');
    assert.equal((await eventsOf(fx.institutionId)).length, 0, 'no event was stored');
  } finally {
    await removeFailingEventTrigger();
  }
});

test('the answer of an edit keeps the shape of the justification', async () => {
  const fx = await createFixture();

  const res = await put(fx.token, fx.institutionId, fx.justificationId, { reason: 'Cambiado' });
  assert.equal(res.status, 200);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'createdAt', 'createdByUserId', 'deletedAt', 'enrollmentId', 'id', 'institutionId',
    'isActive', 'notifiedBy', 'reason', 'updatedAt',
  ], 'the answer carries the justification and nothing else');

  assert.equal(res.body.id, fx.justificationId);
  assert.equal(res.body.enrollmentId, fx.enrollmentId);
  assert.equal(res.body.institutionId, fx.institutionId);
  assert.equal(res.body.reason, 'Cambiado', 'the answer carries the new value');
  assert.equal(res.body.notifiedBy, null);
  assert.equal(res.body.createdByUserId, null);
  assert.equal(res.body.isActive, true);
  assert.equal(res.body.deletedAt, null);
  assert.ok(res.body.createdAt, 'the answer carries the creation date');
  assert.ok(res.body.updatedAt, 'the answer carries the update date');
});

// Holds the justification row from another connection so the edits started
// meanwhile pile up behind it; they are released together once both wait.
async function withRowHeld(justificationId: number, start: () => Promise<unknown>[]): Promise<unknown[]> {
  const holder = AppDataSource.createQueryRunner();
  await holder.connect();
  await holder.startTransaction();
  try {
    await holder.query(`SELECT id FROM justifications WHERE id = $1 FOR UPDATE`, [justificationId]);
    const pending = start();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await AppDataSource.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND datname = current_database()`,
      );
      if (row.n >= pending.length) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await holder.commitTransaction();
    return await Promise.all(pending);
  } finally {
    if (holder.isTransactionActive) await holder.rollbackTransaction();
    await holder.release();
  }
}

async function post(token: string, institutionId: number, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/justifications`, {
    method: 'POST',
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

test('concurrent edits of one justification chain their snapshots', async () => {
  const fx = await createFixture();

  const results = await withRowHeld(fx.justificationId, () => [
    put(fx.token, fx.institutionId, fx.justificationId, { reason: 'Primero' }),
    put(fx.token, fx.institutionId, fx.justificationId, { reason: 'Segundo' }),
  ]) as Array<{ status: number; body: any }>;
  for (const res of results) assert.equal(res.status, 200, JSON.stringify(res.body));

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 2, 'each edit was recorded');
  assert.equal(events[0].payload.before.reason, 'Original');
  assert.deepEqual(events[1].payload.before, events[0].payload.after, 'the second edit saw the first one');
  assert.equal(await reasonOf(fx.justificationId), events[1].payload.after.reason, 'the last event matches the stored row');
});

test('concurrent relinks leave one of the two sets, never their union', async () => {
  const fx = await createFixture();
  const otherAbsenceId = await insertAbsence(fx.institutionId, fx.enrollmentId, '2026-03-04');
  const setA = [fx.freeAbsenceId];
  const setB = [fx.linkedAbsenceId, otherAbsenceId];

  const results = await withRowHeld(fx.justificationId, () => [
    put(fx.token, fx.institutionId, fx.justificationId, { absenceIds: setA }),
    put(fx.token, fx.institutionId, fx.justificationId, { absenceIds: setB }),
  ]) as Array<{ status: number; body: any }>;
  for (const res of results) assert.equal(res.status, 200, JSON.stringify(res.body));

  const links = await linkedAbsences(fx.justificationId);
  const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
  assert.ok(
    JSON.stringify(links) === JSON.stringify(sorted(setA)) || JSON.stringify(links) === JSON.stringify(sorted(setB)),
    `links ${JSON.stringify(links)} are one of the requested sets`,
  );

  const events = await eventsOf(fx.institutionId);
  assert.equal(events.length, 2, 'each relink was recorded');
  assert.deepEqual(events[1].payload.before, events[0].payload.after, 'the second relink saw the first one');
  assert.deepEqual(events[1].payload.after.absenceIds, links, 'the last event matches the stored links');
});

test('creating a justification records its absences in ascending order', async () => {
  const fx = await createFixture();
  const otherAbsenceId = await insertAbsence(fx.institutionId, fx.enrollmentId, '2026-03-04');
  const absenceIds = [otherAbsenceId, fx.freeAbsenceId].sort((a, b) => b - a);

  const res = await post(fx.token, fx.institutionId, { enrollmentId: fx.enrollmentId, reason: 'Nueva', absenceIds });
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const created = (await eventsOf(fx.institutionId)).find((e) => e.event_type === 'JustificationCreated');
  assert.ok(created, 'the creation was recorded');
  assert.deepEqual(created.payload.after.absenceIds, [...absenceIds].sort((a, b) => a - b));
});
