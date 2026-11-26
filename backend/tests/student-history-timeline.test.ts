import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import studentHistoryRouter from '../src/controllers/student-history.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { AcademicYear } from '../src/entities/AcademicYear';
import { Course } from '../src/entities/Course';
import { Enrollment } from '../src/entities/Enrollment';
import { Institution } from '../src/entities/Institution';
import { Role } from '../src/entities/Role';
import { RolePermission } from '../src/entities/RolePermission';
import { Student } from '../src/entities/Student';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const TEST_INST_PREFIX = '__test_sht_inst_';
const TEST_ROLE_PREFIX = '__test_sht_role_';
const TEST_USER_PREFIX = 'testuser_sht_';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  // Short enough for the narrowest name column (academic_years.name is
  // varchar(20)) while still being unique inside the run.
  return `${prefix}${process.pid.toString(36)}${Date.now().toString(36).slice(-5)}${counter.toString(36)}`;
}

async function cleanup(): Promise<void> {
  const inst = [`${TEST_INST_PREFIX}%`];

  await AppDataSource.query(
    `DELETE FROM justification_absences WHERE absence_id IN (
        SELECT a.id FROM absences a JOIN institutions i ON i.id = a.institution_id WHERE i.name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM justifications WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM citation_citation_reasons WHERE citation_id IN (
        SELECT c.id FROM citations c JOIN institutions i ON i.id = c.institution_id WHERE i.name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM citations WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM absences WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM student_withdrawals WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM enrollments WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM students WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM withdrawal_reasons WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM user_courses WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM user_modules WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await deleteTestUsersByPrefix(TEST_USER_PREFIX);
  await AppDataSource.query(
    `DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name LIKE $1)`,
    [`${TEST_ROLE_PREFIX}%`],
  );
  await AppDataSource.query(`DELETE FROM roles WHERE name LIKE $1`, [`${TEST_ROLE_PREFIX}%`]);
  await AppDataSource.query(
    `DELETE FROM user_courses WHERE academic_year_id IN (SELECT id FROM academic_years WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1))`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM academic_years WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM courses WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(`DELETE FROM institutions WHERE name LIKE $1`, inst);
}

async function createTestInstitution(): Promise<Institution> {
  const repo = AppDataSource.getRepository(Institution);
  return repo.save(repo.create({
    name: uniqueName(TEST_INST_PREFIX),
    isActive: true,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  }));
}

async function createTestRole(perms: Array<{
  resource: string;
  canRead?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}>): Promise<Role> {
  const roleRepo = AppDataSource.getRepository(Role);
  const role = await roleRepo.save(roleRepo.create({
    name: uniqueName(TEST_ROLE_PREFIX),
    description: null,
    isActive: true,
    deletedAt: null,
  }));
  const permRepo = AppDataSource.getRepository(RolePermission);
  for (const p of perms) {
    await permRepo.save(permRepo.create({
      roleId: role.id,
      resource: p.resource,
      canRead: p.canRead ?? false,
      canCreate: p.canCreate ?? false,
      canUpdate: p.canUpdate ?? false,
      canDelete: p.canDelete ?? false,
    }));
  }
  return role;
}

async function createUser(roleName: string, institutionId: number) {
  return createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName,
    institutionId,
  });
}

async function insertReason(institutionId: number, name: string): Promise<{ id: number; name: string }> {
  const [row] = await AppDataSource.query(
    `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, $2) RETURNING id, name`,
    [institutionId, name],
  );
  return row;
}

interface Actor {
  id: number;
  username: string;
  token: string;
}

interface Fixture {
  institution: Institution;
  year: AcademicYear;
  course: Course;
  student: Student;
  enrollment: Enrollment;
  reason: { id: number; name: string };
  archivedReason: { id: number; name: string };
  withdrawer: Actor;
  reinstater: Actor;
}

async function createFixture(): Promise<Fixture> {
  const institution = await createTestInstitution();

  const year = await AppDataSource.getRepository(AcademicYear).save(
    AppDataSource.getRepository(AcademicYear).create({
      name: uniqueName('y'),
      institutionId: institution.id,
      startDate: '2000-01-01',
      endDate: '2099-12-31',
      isActive: true,
      deletedAt: null,
    }),
  );

  const course = await AppDataSource.getRepository(Course).save(
    AppDataSource.getRepository(Course).create({
      name: uniqueName('__test_sht_course_'),
      fullName: null,
      section: null,
      institutionId: institution.id,
      shift: 'MATUTINA',
      isActive: true,
      deletedAt: null,
    }),
  );

  const student = await AppDataSource.getRepository(Student).save(
    AppDataSource.getRepository(Student).create({
      idNumber: null,
      name: uniqueName('__test_sht_student_'),
      institutionId: institution.id,
      gender: null,
      birthDate: null,
      isActive: true,
      deletedAt: null,
    }),
  );

  const enrollment = await AppDataSource.getRepository(Enrollment).save(
    AppDataSource.getRepository(Enrollment).create({
      studentId: student.id,
      courseId: course.id,
      academicYearId: year.id,
      institutionId: institution.id,
      guardianId: null,
      rosterNumber: null,
      studentPhone: null,
      studentEmail: null,
      createdByUserId: null,
      isActive: true,
      deletedAt: null,
    }),
  );

  const reason = await insertReason(institution.id, 'Cambio de domicilio');
  const archivedReason = await insertReason(institution.id, 'Motivo archivado');

  const role = await createTestRole([{ resource: 'students', canRead: true }]);
  const withdrawer = await createUser(role.name, institution.id);
  const reinstater = await createUser(role.name, institution.id);

  return {
    institution,
    year,
    course,
    student,
    enrollment,
    reason,
    archivedReason,
    withdrawer,
    reinstater,
  };
}

async function insertWithdrawal(fx: Fixture, opts: {
  reasonId: number;
  withdrawalDate: string;
  createdAt: string;
  notes?: string | null;
  withdrawnByUserId?: number | null;
  revertedAt?: string | null;
  revertedByUserId?: number | null;
  statsVisibility?: string;
}): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO student_withdrawals
       (institution_id, enrollment_id, reason_id, withdrawal_date, notes,
        withdrawn_by_user_id, created_at, reverted_at, reverted_by_user_id, stats_visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      fx.institution.id,
      fx.enrollment.id,
      opts.reasonId,
      opts.withdrawalDate,
      opts.notes ?? null,
      opts.withdrawnByUserId ?? null,
      opts.createdAt,
      opts.revertedAt ?? null,
      opts.revertedByUserId ?? null,
      opts.statsVisibility ?? 'until_withdrawal',
    ],
  );
  return row.id;
}

interface TimelineEvent {
  type: string;
  recordedAt: string;
  occurredAt: string | null;
  title: string;
  description: string;
  createdByName: string | null;
  origin: string | null;
}

async function timeline(
  token: string,
  enrollmentId: number,
  range?: { dateFrom?: string; dateTo?: string },
): Promise<{ status: number; body: TimelineEvent[] }> {
  const params = new URLSearchParams();
  if (range?.dateFrom) params.set('date_from', range.dateFrom);
  if (range?.dateTo) params.set('date_to', range.dateTo);
  const qs = params.toString();
  const res = await fetch(
    `${baseUrl}/api/student-history/${enrollmentId}/timeline${qs ? `?${qs}` : ''}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json();
  return { status: res.status, body };
}

function eventsOfType(events: TimelineEvent[], type: string): TimelineEvent[] {
  return events.filter((e) => e.type === type);
}

async function summary(token: string, enrollmentId: number): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/student-history/${enrollmentId}/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return { status: res.status, body };
}

before(async () => {
  await AppDataSource.initialize();
  // The institution middleware resolves the course scope through
  // user_courses.academic_year_id, a column the seeded schema does not carry.
  await AppDataSource.query(`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS academic_year_id INTEGER`);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/student-history', studentHistoryRouter);
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

test('a withdrawal shows up in the timeline with its reason, its date and who filed it', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    notes: 'Se mudó a otra ciudad',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
  });

  const res = await timeline(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.status, 200);

  const withdrawals = eventsOfType(res.body, 'withdrawal');
  assert.equal(withdrawals.length, 1, 'the withdrawal is a single event');

  const [event] = withdrawals;
  assert.equal(event.title, 'Retiro');
  assert.equal(event.occurredAt, '2026-03-02', 'the event happens on the withdrawal date');
  assert.equal(event.recordedAt, '2026-03-02T15:00:00.000Z', 'the event is recorded when the withdrawal was filed');
  assert.ok(
    event.description.includes(fx.reason.name),
    `the description names the reason: ${event.description}`,
  );
  assert.ok(
    event.description.includes('Se mudó a otra ciudad'),
    `the description carries the notes: ${event.description}`,
  );
  assert.ok(
    event.createdByName?.includes(fx.withdrawer.username),
    `the event names the user who withdrew: ${event.createdByName}`,
  );
});

test('a withdrawal without notes still names its reason', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
  });

  const res = await timeline(fx.withdrawer.token, fx.enrollment.id);
  const [event] = eventsOfType(res.body, 'withdrawal');

  assert.ok(event, 'the withdrawal is in the timeline');
  assert.ok(
    event.description.includes(fx.reason.name),
    `the description names the reason: ${event.description}`,
  );
});

test('a reinstated enrollment shows the reinstatement with its date and who reinstated it', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
    revertedAt: '2026-04-10T12:00:00Z',
    revertedByUserId: fx.reinstater.id,
  });

  const res = await timeline(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.status, 200);

  const reinstatements = eventsOfType(res.body, 'reinstatement');
  assert.equal(reinstatements.length, 1, 'the reinstatement is a single event');

  const [event] = reinstatements;
  assert.equal(event.title, 'Reincorporación');
  assert.equal(event.occurredAt, '2026-04-10T12:00:00.000Z', 'the event happens when the student came back');
  assert.equal(event.recordedAt, '2026-04-10T12:00:00.000Z');
  assert.ok(
    event.description.includes(fx.reason.name),
    `the description names the reason of the withdrawal: ${event.description}`,
  );
  assert.ok(
    event.createdByName?.includes(fx.reinstater.username),
    `the event names the user who reinstated: ${event.createdByName}`,
  );

  const [withdrawalEvent] = eventsOfType(res.body, 'withdrawal');
  assert.ok(
    withdrawalEvent.createdByName?.includes(fx.withdrawer.username),
    `the withdrawal keeps its own author: ${withdrawalEvent.createdByName}`,
  );
});

test('an enrollment withdrawn, reinstated and withdrawn again keeps every moment', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
    revertedAt: '2026-04-10T12:00:00Z',
    revertedByUserId: fx.reinstater.id,
  });
  await insertWithdrawal(fx, {
    reasonId: fx.archivedReason.id,
    withdrawalDate: '2026-05-01',
    withdrawnByUserId: fx.reinstater.id,
    createdAt: '2026-05-01T15:00:00Z',
  });

  const res = await timeline(fx.withdrawer.token, fx.enrollment.id);

  const moments = res.body
    .filter((e) => e.type === 'withdrawal' || e.type === 'reinstatement')
    .map((e) => e.type);
  assert.deepEqual(
    moments,
    ['withdrawal', 'reinstatement', 'withdrawal'],
    'the timeline keeps both withdrawals and the reinstatement between them',
  );

  const withdrawals = eventsOfType(res.body, 'withdrawal');
  assert.deepEqual(withdrawals.map((e) => e.occurredAt), ['2026-03-02', '2026-05-01']);
});

test('the date range filters a withdrawal by its withdrawal date', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-09',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-09T15:00:00Z',
  });

  const inside = await timeline(fx.withdrawer.token, fx.enrollment.id, {
    dateFrom: '2026-03-09',
    dateTo: '2026-03-09',
  });
  assert.equal(eventsOfType(inside.body, 'withdrawal').length, 1, 'the withdrawal of that day is in range');

  const outside = await timeline(fx.withdrawer.token, fx.enrollment.id, {
    dateFrom: '2026-03-10',
    dateTo: '2026-03-10',
  });
  assert.equal(eventsOfType(outside.body, 'withdrawal').length, 0, 'a withdrawal of another day is out of range');
});

test('the date range filters a reinstatement by the local day it was recorded on', async () => {
  const fx = await createFixture();
  // 02:00 UTC is still the previous day in Guayaquil (UTC-5): the local day
  // of this reinstatement is 2026-03-09, while its UTC day is 2026-03-10.
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-01',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-01T15:00:00Z',
    revertedAt: '2026-03-10T02:00:00Z',
    revertedByUserId: fx.reinstater.id,
  });

  const localDay = await timeline(fx.withdrawer.token, fx.enrollment.id, {
    dateFrom: '2026-03-09',
    dateTo: '2026-03-09',
  });
  assert.equal(
    eventsOfType(localDay.body, 'reinstatement').length,
    1,
    'the reinstatement belongs to the local day it happened on',
  );

  const utcDay = await timeline(fx.withdrawer.token, fx.enrollment.id, {
    dateFrom: '2026-03-10',
    dateTo: '2026-03-10',
  });
  assert.equal(
    eventsOfType(utcDay.body, 'reinstatement').length,
    0,
    'the UTC day of the timestamp does not decide the range',
  );
});

test('a withdrawal keeps the name of a reason that was archived later', async () => {
  const fx = await createFixture();
  await AppDataSource.query(
    `UPDATE withdrawal_reasons SET deleted_at = now() WHERE id = $1`,
    [fx.archivedReason.id],
  );
  await insertWithdrawal(fx, {
    reasonId: fx.archivedReason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
  });

  const res = await timeline(fx.withdrawer.token, fx.enrollment.id);
  const [event] = eventsOfType(res.body, 'withdrawal');

  assert.ok(event, 'the withdrawal is in the timeline');
  assert.ok(
    event.description.includes(fx.archivedReason.name),
    `the archived reason is still named: ${event.description}`,
  );
});

test('changing how far the statistics reach does not add anything to the timeline', async () => {
  const fx = await createFixture();
  const id = await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
  });

  const before = await timeline(fx.withdrawer.token, fx.enrollment.id);
  await AppDataSource.query(
    `UPDATE student_withdrawals SET stats_visibility = 'whole_year' WHERE id = $1`,
    [id],
  );
  const after = await timeline(fx.withdrawer.token, fx.enrollment.id);

  assert.deepEqual(
    after.body.map((e) => [e.type, e.recordedAt]),
    before.body.map((e) => [e.type, e.recordedAt]),
    'the timeline is the same before and after the change',
  );
  assert.equal(eventsOfType(after.body, 'withdrawal').length, 1, 'the withdrawal is still the only withdrawal event');
  assert.equal(eventsOfType(after.body, 'reinstatement').length, 0, 'the change is not a reinstatement');
});

test('the other kinds of event keep their place and the timeline stays in order', async () => {
  const fx = await createFixture();

  await AppDataSource.query(
    `UPDATE enrollments SET created_at = '2026-01-04T10:00:00Z' WHERE id = $1`,
    [fx.enrollment.id],
  );
  const [absence] = await AppDataSource.query(
    `INSERT INTO absences (institution_id, enrollment_id, date, type, created_at)
     VALUES ($1, $2, '2026-01-05', 'F', '2026-01-05T10:00:00Z') RETURNING id`,
    [fx.institution.id, fx.enrollment.id],
  );
  const [justification] = await AppDataSource.query(
    `INSERT INTO justifications (institution_id, enrollment_id, reason, created_at)
     VALUES ($1, $2, 'Justificación familiar', '2026-01-06T10:00:00Z') RETURNING id`,
    [fx.institution.id, fx.enrollment.id],
  );
  await AppDataSource.query(
    `INSERT INTO justification_absences (justification_id, absence_id) VALUES ($1, $2)`,
    [justification.id, absence.id],
  );
  await AppDataSource.query(
    `INSERT INTO citations (institution_id, enrollment_id, date, time, status, created_by_user_id, created_at)
     VALUES ($1, $2, '2026-01-07', '08:30', 'pending', $3, '2026-01-07T10:00:00Z')`,
    [fx.institution.id, fx.enrollment.id, fx.withdrawer.id],
  );
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-01-08',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-01-08T10:00:00Z',
  });

  const res = await timeline(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.status, 200);

  assert.deepEqual(
    res.body.map((e) => e.type),
    ['enrollment', 'absence', 'justification', 'citation', 'withdrawal'],
    'every kind of event keeps its place in the timeline',
  );

  const recordedAts = res.body.map((e) => e.recordedAt);
  assert.deepEqual(recordedAts, [...recordedAts].sort(), 'the timeline goes from the oldest to the newest');
});

test('the summary tells that the enrollment is withdrawn, since when and why', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
  });

  const res = await summary(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.withdrawal, {
    active: true,
    date: '2026-03-02',
    reason: fx.reason.name,
  });
});

test('the summary of an enrollment that was never withdrawn has no withdrawal', async () => {
  const fx = await createFixture();

  const res = await summary(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.status, 200);
  assert.equal(res.body.withdrawal, null);
});

test('the summary reports a withdrawal that was already reinstated as no longer active', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
    revertedAt: '2026-04-10T12:00:00Z',
    revertedByUserId: fx.reinstater.id,
  });

  const res = await summary(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.body.withdrawal.active, false);
  assert.equal(res.body.withdrawal.date, '2026-03-02');
});

test('the summary reports the withdrawal that is still in force, even when a reinstated one has a later date', async () => {
  const fx = await createFixture();
  const standingReason = await insertReason(fx.institution.id, 'Motivo vigente');
  // The withdrawal that was reinstated carries the later date, but it no longer
  // stands: the student left again on an earlier date, filed afterwards.
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-10',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-10T15:00:00Z',
    revertedAt: '2026-03-20T12:00:00Z',
    revertedByUserId: fx.reinstater.id,
  });
  await insertWithdrawal(fx, {
    reasonId: standingReason.id,
    withdrawalDate: '2026-03-01',
    withdrawnByUserId: fx.reinstater.id,
    createdAt: '2026-03-15T15:00:00Z',
  });

  const res = await summary(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.withdrawal,
    { active: true, date: '2026-03-01', reason: standingReason.name },
    'the withdrawal that is in force is the one reported, not the one with the latest date',
  );
});

test('the summary reports the latest withdrawal when every one of them was reinstated', async () => {
  const fx = await createFixture();
  await insertWithdrawal(fx, {
    reasonId: fx.reason.id,
    withdrawalDate: '2026-03-02',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-03-02T15:00:00Z',
    revertedAt: '2026-04-10T12:00:00Z',
    revertedByUserId: fx.reinstater.id,
  });
  await insertWithdrawal(fx, {
    reasonId: fx.archivedReason.id,
    withdrawalDate: '2026-05-01',
    withdrawnByUserId: fx.withdrawer.id,
    createdAt: '2026-05-01T15:00:00Z',
    revertedAt: '2026-05-20T12:00:00Z',
    revertedByUserId: fx.reinstater.id,
  });

  const res = await summary(fx.withdrawer.token, fx.enrollment.id);
  assert.equal(res.body.withdrawal.active, false, 'no withdrawal is in force anymore');
  assert.equal(res.body.withdrawal.date, '2026-05-01', 'the latest withdrawal is still reported');
  assert.equal(res.body.withdrawal.reason, fx.archivedReason.name);
});
