import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import authRouter from '../src/controllers/auth.controller';
import studentHistoryRouter from '../src/controllers/student-history.controller';
import studentWithdrawalRouter from '../src/controllers/student-withdrawal.controller';
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
import { UserCourse } from '../src/entities/UserCourse';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const MIGRATION_WITHDRAWALS = '29_student_withdrawals.sql';
const MIGRATION_VISIBILITY = '30_student_withdrawals_stats_visibility.sql';
const MIGRATION_REINSTATE = '33_student_withdrawals_reinstate_permission.sql';

const TEST_INST_PREFIX = '__test_wss_inst_';
const TEST_ROLE_PREFIX = '__test_wss_role_';
const TEST_USER_PREFIX = 'testuser_wss_';

const CITATION_ITEM_KEYS = ['createdAt', 'date', 'id', 'reasons', 'status', 'time'];

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  // Short enough for the narrowest name column (academic_years.name is
  // varchar(20)) while still being unique inside the run.
  return `${prefix}${process.pid.toString(36)}${Date.now().toString(36).slice(-5)}${counter.toString(36)}`;
}

function migrationPath(filename: string): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'postgres', filename),
    path.resolve(process.cwd(), '..', 'postgres', filename),
  ];
  const p = candidates.find(p => fs.existsSync(p));
  if (!p) throw new Error(`migration SQL not found in any of: ${candidates.join(', ')}`);
  return p;
}

async function runMigration(filename: string): Promise<void> {
  await AppDataSource.query(fs.readFileSync(migrationPath(filename), 'utf8'));
}

async function cleanup(): Promise<void> {
  const inst = [`${TEST_INST_PREFIX}%`];

  // The audit table is append-only, so the test rows can only go away with
  // the purge flag set inside the very transaction that deletes them.
  await AppDataSource.transaction(async (em) => {
    await em.query(`SET LOCAL app.domain_events_purge = 'on'`);
    await em.query(
      `DELETE FROM domain_events WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
      inst,
    );
  });

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
    `DELETE FROM citation_reasons WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
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

async function createUser(roleName: string, institutionId: number | null) {
  return createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName,
    institutionId,
  });
}

async function scopeUserToCourse(userId: number, courseId: number, academicYearId: number): Promise<void> {
  await AppDataSource.getRepository(UserCourse).save(
    AppDataSource.getRepository(UserCourse).create({ userId, courseId, academicYearId }),
  );
}

async function createAcademicYear(
  institutionId: number,
  startDate: string,
  endDate: string,
  isActive: boolean,
): Promise<AcademicYear> {
  const repo = AppDataSource.getRepository(AcademicYear);
  return repo.save(repo.create({
    name: uniqueName('y'),
    institutionId,
    startDate,
    endDate,
    isActive,
    deletedAt: null,
  }));
}

async function createCourse(institutionId: number): Promise<Course> {
  const repo = AppDataSource.getRepository(Course);
  return repo.save(repo.create({
    name: uniqueName('__test_wss_course_'),
    fullName: null,
    section: null,
    institutionId,
    shift: 'MATUTINA',
    isActive: true,
    deletedAt: null,
  }));
}

async function createStudent(institutionId: number, name?: string): Promise<Student> {
  const repo = AppDataSource.getRepository(Student);
  return repo.save(repo.create({
    idNumber: null,
    name: name ?? uniqueName('__test_wss_student_'),
    institutionId,
    gender: null,
    birthDate: null,
    isActive: true,
    deletedAt: null,
  }));
}

async function createEnrollment(
  institutionId: number,
  studentId: number,
  courseId: number,
  academicYearId: number,
): Promise<Enrollment> {
  const repo = AppDataSource.getRepository(Enrollment);
  return repo.save(repo.create({
    studentId,
    courseId,
    academicYearId,
    institutionId,
    guardianId: null,
    rosterNumber: null,
    studentPhone: null,
    studentEmail: null,
    createdByUserId: null,
    isActive: true,
    deletedAt: null,
  }));
}

async function insertWithdrawalReason(institutionId: number, name: string): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, $2) RETURNING id`,
    [institutionId, name],
  );
  return Number(row.id);
}

async function insertCitationReason(institutionId: number, name: string): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO citation_reasons (institution_id, name, severity) VALUES ($1, $2, 'medium') RETURNING id`,
    [institutionId, name],
  );
  return Number(row.id);
}

async function insertCitation(
  institutionId: number,
  enrollmentId: number,
  date: string,
  time: string,
  reasonIds: number[] = [],
  status: 'pending' | 'closed' = 'pending',
): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO citations (institution_id, enrollment_id, date, time, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [institutionId, enrollmentId, date, time, status],
  );
  const id = Number(row.id);
  for (const reasonId of reasonIds) {
    await AppDataSource.query(
      `INSERT INTO citation_citation_reasons (citation_id, citation_reason_id) VALUES ($1, $2)`,
      [id, reasonId],
    );
  }
  return id;
}

interface Fixture {
  institution: Institution;
  activeYear: AcademicYear;
  inactiveYear: AcademicYear;
  course: Course;
  otherCourse: Course;
  student: Student;
  enrollment: Enrollment;
  reasonId: number;
}

async function createFixture(): Promise<Fixture> {
  const institution = await createTestInstitution();
  const activeYear = await createAcademicYear(institution.id, '2000-01-01', '2099-12-31', true);
  const inactiveYear = await createAcademicYear(institution.id, '2001-01-01', '2001-12-31', false);
  const course = await createCourse(institution.id);
  const otherCourse = await createCourse(institution.id);
  const student = await createStudent(institution.id);
  const enrollment = await createEnrollment(institution.id, student.id, course.id, activeYear.id);
  const reasonId = await insertWithdrawalReason(institution.id, 'Motivo de prueba');

  return { institution, activeYear, inactiveYear, course, otherCourse, student, enrollment, reasonId };
}

async function withdrawalsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, enrollment_id, stats_visibility, created_at, reverted_at, reverted_by_user_id
       FROM student_withdrawals WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function eventsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, event_type, entity_type, entity_id, payload FROM domain_events
      WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function request(
  method: string,
  urlPath: string,
  opts: { token?: string | null; institutionId?: number | null; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.institutionId != null) headers['X-Institution-Id'] = String(opts.institutionId);
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

before(async () => {
  await AppDataSource.initialize();
  // The course-scoping fixture needs user_courses.academic_year_id, which the
  // seeded schema does not carry (the migration that adds it targets another
  // schema). Added here so a course-scoped caller can be exercised.
  await AppDataSource.query(`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS academic_year_id INTEGER`);
  await runMigration(MIGRATION_WITHDRAWALS);
  await runMigration(MIGRATION_VISIBILITY);
  await runMigration(MIGRATION_REINSTATE);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRouter);
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/student-history', studentHistoryRouter);
  app.use('/api/student-withdrawals', studentWithdrawalRouter);
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

// ─────────────────────────────────────────────────────────────────────
// The migration that gives the reinstate its own permission and changes
// the default visibility of a new withdrawal
// ─────────────────────────────────────────────────────────────────────
test('migration 33 seeds the reinstate permission and is re-runnable', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a role that could change the visibility can now reinstate',
      run: async () => {
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true },
        ]);
        await runMigration(MIGRATION_REINSTATE);

        const rows = await AppDataSource.query(
          `SELECT can_read, can_create, can_update, can_delete
             FROM role_permissions WHERE role_id = $1 AND resource = 'student-withdrawals'`,
          [role.id],
        );
        assert.equal(rows.length, 1, 'the role has one student-withdrawals row');
        assert.equal(rows[0].can_read, true, 'can read');
        assert.equal(rows[0].can_create, true, 'can create');
        assert.equal(rows[0].can_update, true, 'can update');
        assert.equal(rows[0].can_delete, true, 'can delete');
      },
    },
    {
      name: 'a role that could not change the visibility does not gain the reinstate',
      run: async () => {
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true },
        ]);
        await runMigration(MIGRATION_REINSTATE);

        const rows = await AppDataSource.query(
          `SELECT can_read, can_create, can_update, can_delete
             FROM role_permissions WHERE role_id = $1 AND resource = 'student-withdrawals'`,
          [role.id],
        );
        assert.equal(rows.length, 1, 'the role has one student-withdrawals row');
        assert.equal(rows[0].can_read, true, 'can read');
        assert.equal(rows[0].can_create, false, 'cannot create');
        assert.equal(rows[0].can_update, false, 'cannot update');
        assert.equal(rows[0].can_delete, false, 'cannot delete');
      },
    },
    {
      name: 'the permissions of another resource are not touched',
      run: async () => {
        const role = await createTestRole([
          { resource: 'students', canRead: true, canUpdate: true, canDelete: false },
        ]);
        await runMigration(MIGRATION_REINSTATE);

        const rows = await AppDataSource.query(
          `SELECT can_read, can_create, can_update, can_delete
             FROM role_permissions WHERE role_id = $1 AND resource = 'students'`,
          [role.id],
        );
        assert.equal(rows.length, 1, 'the role has one students row');
        assert.equal(rows[0].can_read, true, 'can read');
        assert.equal(rows[0].can_create, false, 'cannot create');
        assert.equal(rows[0].can_update, true, 'can update');
        assert.equal(rows[0].can_delete, false, 'cannot delete');
      },
    },
    {
      name: 'running it a second time changes nothing',
      run: async () => {
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canUpdate: true },
        ]);
        await runMigration(MIGRATION_REINSTATE);

        const before = await AppDataSource.query(
          `SELECT role_id, can_read, can_create, can_update, can_delete
             FROM role_permissions WHERE resource = 'student-withdrawals' ORDER BY role_id`,
        );
        const defaultBefore = await columnDefault();

        await runMigration(MIGRATION_REINSTATE);

        const after = await AppDataSource.query(
          `SELECT role_id, can_read, can_create, can_update, can_delete
             FROM role_permissions WHERE resource = 'student-withdrawals' ORDER BY role_id`,
        );
        const defaultAfter = await columnDefault();

        assert.deepEqual(after, before, 'every student-withdrawals row is identical');
        assert.equal(defaultAfter, defaultBefore, 'the column default is identical');
      },
    },
    {
      name: 'the visibility of a new withdrawal defaults to whole_year',
      run: async () => {
        const value = await columnDefault();
        assert.match(String(value), /whole_year/, 'the column default is whole_year');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

test('migration 33 keeps the visibility of existing withdrawals', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a row of every visibility keeps its value',
      run: async () => {
        const fx = await createFixture();
        const values = ['until_withdrawal', 'until_quarter_start', 'whole_year'];
        const ids: number[] = [];
        for (const value of values) {
          const student = await createStudent(fx.institution.id);
          const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.activeYear.id);
          const [row] = await AppDataSource.query(
            `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date, stats_visibility)
             VALUES ($1, $2, $3, CURRENT_DATE, $4) RETURNING id`,
            [fx.institution.id, enrollment.id, fx.reasonId, value],
          );
          ids.push(Number(row.id));
        }

        await runMigration(MIGRATION_REINSTATE);

        const rows = await AppDataSource.query(
          `SELECT id, stats_visibility FROM student_withdrawals WHERE institution_id = $1 ORDER BY id`,
          [fx.institution.id],
        );
        assert.equal(rows.length, 3, 'every row is still there');
        for (const [index, value] of values.entries()) {
          assert.equal(rows[index].id, ids[index], 'the rows keep their order');
          assert.equal(rows[index].stats_visibility, value, `the row keeps ${value}`);
        }
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The default visibility of a new withdrawal
// ─────────────────────────────────────────────────────────────────────
test('a new withdrawal defaults to whole_year', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a withdrawal without a visibility is stored as whole_year',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.statsVisibility, 'whole_year', 'the answer carries whole_year');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'the withdrawal was stored');
        assert.equal(rows[0].stats_visibility, 'whole_year', 'the row carries whole_year');

        const events = await eventsOf(fx.institution.id);
        const withdrawn = events.find((e: any) => e.event_type === 'StudentWithdrawn');
        assert.ok(withdrawn, 'the withdrawal is audited');
        assert.equal(withdrawn.payload.after.statsVisibility, 'whole_year', 'the event carries whole_year');
      },
    },
    {
      name: 'a row inserted without the column gets whole_year',
      run: async () => {
        const fx = await createFixture();

        const [row] = await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date)
           VALUES ($1, $2, $3, CURRENT_DATE) RETURNING id, stats_visibility`,
          [fx.institution.id, fx.enrollment.id, fx.reasonId],
        );
        assert.equal(row.stats_visibility, 'whole_year');
      },
    },
    {
      name: 'an explicit visibility is stored as it was sent',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId, statsVisibility: 'until_withdrawal' },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.statsVisibility, 'until_withdrawal', 'the answer carries until_withdrawal');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows[0].stats_visibility, 'until_withdrawal', 'the row carries until_withdrawal');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// One permission flag per withdrawal action
// ─────────────────────────────────────────────────────────────────────
test('each withdrawal action has its own permission flag', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a role that can change the visibility cannot reinstate',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canUpdate: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const admin = await createUser('superadmin', null);
        const created = await request('POST', '/api/student-withdrawals', {
          token: admin.token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId },
        });
        assert.equal(created.status, 201);

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token,
          institutionId: fx.institution.id,
          body: { statsVisibility: 'until_withdrawal' },
        });
        assert.notEqual(patched.status, 403, 'the visibility can still be changed');

        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 403, 'the reinstate is rejected');
      },
    },
    {
      name: 'a role that can reinstate cannot change the visibility',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const admin = await createUser('superadmin', null);
        const created = await request('POST', '/api/student-withdrawals', {
          token: admin.token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId },
        });
        assert.equal(created.status, 201);

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token,
          institutionId: fx.institution.id,
          body: { statsVisibility: 'until_withdrawal' },
        });
        assert.equal(patched.status, 403, 'the visibility change is rejected');

        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.notEqual(reverted.status, 403, 'the reinstate is allowed');
        assert.equal(reverted.status, 200);
        assert.ok(reverted.body.revertedAt, 'the withdrawal was reverted');
      },
    },
    {
      name: 'a role that can only withdraw cannot change the visibility nor reinstate',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId },
        });
        assert.notEqual(created.status, 403, 'the withdraw is allowed');
        assert.equal(created.status, 201);

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token,
          institutionId: fx.institution.id,
          body: { statsVisibility: 'until_withdrawal' },
        });
        assert.equal(patched.status, 403, 'the visibility change is rejected');

        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 403, 'the reinstate is rejected');
      },
    },
    {
      name: 'a role that can only read cannot write anything',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId },
        });
        assert.equal(created.status, 403, 'the withdraw is rejected');

        const patched = await request('PATCH', '/api/student-withdrawals/1', {
          token,
          institutionId: fx.institution.id,
          body: { statsVisibility: 'until_withdrawal' },
        });
        assert.equal(patched.status, 403, 'the visibility change is rejected');

        const reverted = await request('POST', '/api/student-withdrawals/1/revert', {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 403, 'the reinstate is rejected');

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a role without a student-withdrawals row cannot use any route',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'students', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const calls: Array<[string, string, unknown]> = [
          ['GET', '/api/student-withdrawals', undefined],
          ['GET', '/api/student-withdrawals/stats', undefined],
          ['GET', `/api/student-withdrawals/students/${fx.student.id}/history`, undefined],
          ['POST', '/api/student-withdrawals', { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId }],
          ['PATCH', '/api/student-withdrawals/1', { statsVisibility: 'until_withdrawal' }],
          ['POST', '/api/student-withdrawals/1/revert', undefined],
        ];
        for (const [method, url, body] of calls) {
          const res = await request(method, url, { token, institutionId: fx.institution.id, body });
          assert.equal(res.status, 403, `${method} ${url} as ${role.name}`);
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Reinstating only in the academic year that is in course
// ─────────────────────────────────────────────────────────────────────
test('reinstate is only allowed in the active academic year', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a withdrawal of the active year is reinstated',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId },
        });
        assert.equal(created.status, 201);

        const res = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.ok(res.body.revertedAt, 'the withdrawal was reverted');
      },
    },
    {
      name: 'a withdrawal of another year is refused and changes nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.inactiveYear.id);
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonId, withdrawalDate: '2001-06-01' },
        });
        assert.equal(created.status, 201);

        const res = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Solo se puede reincorporar en el año lectivo actual');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows[0].reverted_at, null, 'the withdrawal is still active');
        const events = await eventsOf(fx.institution.id);
        assert.equal(events.filter((e: any) => e.event_type === 'StudentReinstated').length, 0, 'no reinstatement event');
      },
    },
    {
      name: 'an institution without an active year refuses every reinstatement',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId },
        });
        assert.equal(created.status, 201);

        await AppDataSource.query(
          `UPDATE academic_years SET is_active = FALSE WHERE institution_id = $1`,
          [fx.institution.id],
        );

        const res = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Solo se puede reincorporar en el año lectivo actual');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows[0].reverted_at, null, 'the withdrawal is still active');
      },
    },
    {
      name: 'a withdrawal that was already reverted keeps its own answer',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.inactiveYear.id);
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const [row] = await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date, reverted_at)
           VALUES ($1, $2, $3, CURRENT_DATE, now()) RETURNING id`,
          [fx.institution.id, enrollment.id, fx.reasonId],
        );

        const res = await request('POST', `/api/student-withdrawals/${row.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'El retiro ya fue revertido');
      },
    },
    {
      name: 'an unknown or out of scope withdrawal is not found before anything else',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.inactiveYear.id);
        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true, canDelete: true },
        ]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(userId, fx.course.id, fx.activeYear.id);

        const admin = await createUser('superadmin', null);
        const created = await request('POST', '/api/student-withdrawals', {
          token: admin.token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonId, withdrawalDate: '2001-06-01' },
        });
        assert.equal(created.status, 201);

        for (const id of ['99999999', String(created.body.id)]) {
          const res = await request('POST', `/api/student-withdrawals/${id}/revert`, {
            token,
            institutionId: fx.institution.id,
          });
          assert.equal(res.status, 404, `id ${id}`);
          assert.equal(res.body.error, 'Retiro no encontrado');
        }

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows[0].reverted_at, null, 'the withdrawal is still active');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The citations of the enrollment in the history summary
// ─────────────────────────────────────────────────────────────────────
test('the history summary lists the enrollment citations', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'every citation of the enrollment is counted and listed',
      run: async () => {
        const fx = await createFixture();
        const conducta = await insertCitationReason(fx.institution.id, 'Conducta');
        const faltas = await insertCitationReason(fx.institution.id, 'Faltas');
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30', [conducta]);
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-11', '09:00', [conducta, faltas], 'closed');

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/summary`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.citations.total, 2);
        assert.equal(res.body.citations.items.length, 2);
        for (const item of res.body.citations.items) {
          assert.deepEqual(Object.keys(item).sort(), CITATION_ITEM_KEYS, 'the item carries every field');
          assert.match(item.time, /^\d{2}:\d{2}$/, 'the time is HH:MM');
          assert.ok(Array.isArray(item.reasons), 'the reasons are an array');
        }
        const twoReasons = res.body.citations.items.find((i: any) => i.date === '2026-06-11');
        assert.deepEqual(twoReasons.reasons, ['Conducta', 'Faltas'], 'the reasons are the reason names');
        const oneReason = res.body.citations.items.find((i: any) => i.date === '2026-06-10');
        assert.deepEqual(oneReason.reasons, ['Conducta'], 'the reasons are the reason names');
        assert.equal(twoReasons.status, 'closed', 'the status is kept');
      },
    },
    {
      name: 'only the five newest citations are listed',
      run: async () => {
        const fx = await createFixture();
        const rows: Array<[string, string]> = [
          ['2026-06-10', '08:30'],
          ['2026-06-10', '08:30'],
          ['2026-06-09', '09:00'],
          ['2026-06-11', '07:00'],
          ['2026-06-12', '10:00'],
          ['2026-06-08', '11:00'],
          ['2026-06-13', '12:00'],
        ];
        const ids: number[] = [];
        for (const [date, time] of rows) {
          ids.push(await insertCitation(fx.institution.id, fx.enrollment.id, date, time));
        }

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/summary`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.citations.total, 7, 'every citation is counted');
        assert.equal(res.body.citations.items.length, 5, 'only five are listed');
        assert.deepEqual(
          res.body.citations.items.map((i: any) => i.id),
          [ids[6], ids[4], ids[3], ids[1], ids[0]],
          'the newest come first, and the newest id breaks the tie',
        );
      },
    },
    {
      name: 'a deleted citation is neither counted nor listed',
      run: async () => {
        const fx = await createFixture();
        const kept = await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');
        const deleted = await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-11', '09:00');
        await AppDataSource.query(`UPDATE citations SET deleted_at = now() WHERE id = $1`, [deleted]);

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/summary`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.citations.total, 1);
        assert.deepEqual(res.body.citations.items.map((i: any) => i.id), [kept]);
      },
    },
    {
      name: 'only the citations of the requested range are counted and listed',
      run: async () => {
        const fx = await createFixture();
        const before = await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-01', '08:30');
        const inside = await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');
        const after = await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-30', '08:30');
        assert.ok(before && inside && after, 'the three citations exist');

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/summary?date_from=2026-06-05&date_to=2026-06-20`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.citations.total, 1, 'only the citation of the range is counted');
        assert.deepEqual(res.body.citations.items.map((i: any) => i.id), [inside]);
      },
    },
    {
      name: 'the citations of a withdrawn enrollment are still listed',
      run: async () => {
        const fx = await createFixture();
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-11', '09:00');

        const admin = await createUser('superadmin', null);
        const created = await request('POST', '/api/student-withdrawals', {
          token: admin.token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId, statsVisibility: 'whole_year' },
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.statsVisibility, 'whole_year');

        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/summary`, {
          token: admin.token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.citations.total, 2, 'both citations are counted');
        assert.equal(res.body.citations.items.length, 2, 'both citations are listed');
      },
    },
    {
      name: 'an enrollment without citations has an empty list',
      run: async () => {
        const fx = await createFixture();

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/summary`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.citations, { total: 0, items: [] });
      },
    },
    {
      name: 'the summary no longer says that the citations are not implemented',
      run: async () => {
        const fx = await createFixture();

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/summary`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.ok(!('status' in res.body.citations), 'the citations have no status');
        assert.notEqual(res.body.citations.status, 'not_implemented');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The citations of the enrollment in the history timeline
// ─────────────────────────────────────────────────────────────────────
test('the history timeline includes a citation event', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a citation is an event of the timeline',
      run: async () => {
        const fx = await createFixture();
        const conducta = await insertCitationReason(fx.institution.id, 'Conducta');
        const faltas = await insertCitationReason(fx.institution.id, 'Faltas');
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30', [conducta, faltas]);

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/timeline`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);

        const citations = res.body.filter((e: any) => e.type === 'citation');
        assert.equal(citations.length, 1, 'exactly one citation event');
        const event = citations[0];
        assert.equal(event.title, 'Citación');
        assert.equal(event.occurredAt, '2026-06-10');
        assert.ok(event.recordedAt, 'the event carries the record date');
        assert.equal(
          event.description,
          'Citación al representante el 10 de junio de 2026 a las 08:30. Motivos: Conducta, Faltas',
        );
        assert.ok('createdByName' in event, 'the event carries the creator');
        assert.ok('origin' in event, 'the event carries the origin');
      },
    },
    {
      name: 'a citation without reasons ends at the time',
      run: async () => {
        const fx = await createFixture();
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/timeline`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);

        const event = res.body.filter((e: any) => e.type === 'citation')[0];
        assert.equal(event.description, 'Citación al representante el 10 de junio de 2026 a las 08:30');
        assert.ok(!event.description.includes('Motivos'), 'the reasons are not mentioned');
      },
    },
    {
      name: 'a deleted citation is not an event',
      run: async () => {
        const fx = await createFixture();
        const deleted = await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');
        await AppDataSource.query(`UPDATE citations SET deleted_at = now() WHERE id = $1`, [deleted]);

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/timeline`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.filter((e: any) => e.type === 'citation').length, 0);
      },
    },
    {
      name: 'only the citations of the requested range are events',
      run: async () => {
        const fx = await createFixture();
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-01', '08:30');
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-30', '08:30');

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/timeline?date_from=2026-06-05&date_to=2026-06-20`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        const citations = res.body.filter((e: any) => e.type === 'citation');
        assert.equal(citations.length, 1, 'only the citation of the range is an event');
        assert.equal(citations[0].occurredAt, '2026-06-10');
      },
    },
    {
      name: 'the citations of a withdrawn enrollment are still events',
      run: async () => {
        const fx = await createFixture();
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');

        const admin = await createUser('superadmin', null);
        const created = await request('POST', '/api/student-withdrawals', {
          token: admin.token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reasonId: fx.reasonId, statsVisibility: 'whole_year' },
        });
        assert.equal(created.status, 201);

        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/timeline`, {
          token: admin.token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.filter((e: any) => e.type === 'citation').length, 1);
      },
    },
    {
      name: 'the events stay ordered by their record date',
      run: async () => {
        const fx = await createFixture();
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-10', '08:30');
        await insertCitation(fx.institution.id, fx.enrollment.id, '2026-06-12', '08:30');
        await AppDataSource.query(
          `INSERT INTO absences (institution_id, enrollment_id, date, type)
           VALUES ($1, $2, '2026-06-11', 'F')`,
          [fx.institution.id, fx.enrollment.id],
        );

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', `/api/student-history/${fx.enrollment.id}/timeline`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);

        const types = res.body.map((e: any) => e.type);
        assert.ok(types.includes('enrollment'));
        assert.ok(types.includes('absence'));
        assert.equal(types.filter((t: string) => t === 'citation').length, 2);

        const recordedAt = res.body.map((e: any) => new Date(e.recordedAt).getTime());
        const sorted = [...recordedAt].sort((a, b) => a - b);
        assert.deepEqual(recordedAt, sorted, 'the events are ordered by their record date');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

async function columnDefault(): Promise<string | null> {
  const [row] = await AppDataSource.query(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'student_withdrawals'
        AND column_name = 'stats_visibility'`,
  );
  return row?.column_default ?? null;
}
