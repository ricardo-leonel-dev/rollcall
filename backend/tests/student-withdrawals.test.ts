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
import studentRouter from '../src/controllers/student.controller';
import withdrawalReasonRouter from '../src/controllers/withdrawal-reason.controller';
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

const MIGRATION_FILE = '29_student_withdrawals.sql';

const TEST_INST_PREFIX = '__test_sw_inst_';
const TEST_ROLE_PREFIX = '__test_sw_role_';
const TEST_USER_PREFIX = 'testuser_sw_';

const ITEM_KEYS = [
  'academicYear',
  'academicYearId',
  'courseId',
  'courseName',
  'enrollmentId',
  'id',
  'idNumber',
  'notes',
  'reason',
  'revertedAt',
  'revertedBy',
  'statsVisibility',
  'studentId',
  'studentName',
  'withdrawalDate',
  'withdrawnAt',
  'withdrawnBy',
];

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

async function runMigration(): Promise<void> {
  await AppDataSource.query(fs.readFileSync(migrationPath(MIGRATION_FILE), 'utf8'));
}

function shiftYears(iso: string, years: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year + years);
  return date.toISOString().slice(0, 10);
}

async function todayInGuayaquil(): Promise<string> {
  const [row] = await AppDataSource.query(
    `SELECT (now() AT TIME ZONE 'America/Guayaquil')::date::text AS today`,
  );
  return row.today as string;
}

async function cleanup(): Promise<void> {
  // The audit table is append-only, so the test rows can only go away with
  // the purge flag set inside the very transaction that deletes them.
  await AppDataSource.transaction(async (em) => {
    await em.query(`SET LOCAL app.domain_events_purge = 'on'`);
    await em.query(
      `DELETE FROM domain_events WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
      [`${TEST_INST_PREFIX}%`],
    );
  });

  await AppDataSource.query(
    `DELETE FROM student_withdrawals WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM absences WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM enrollments WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM students WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM withdrawal_reasons WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
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
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM academic_years WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM courses WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(`DELETE FROM institutions WHERE name LIKE $1`, [`${TEST_INST_PREFIX}%`]);
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

async function superadminToken(): Promise<string> {
  const { token } = await createUser('superadmin', null);
  return token;
}

async function scopeUserToCourse(userId: number, courseId: number, academicYearId: number): Promise<void> {
  await AppDataSource.getRepository(UserCourse).save(
    AppDataSource.getRepository(UserCourse).create({
      userId,
      courseId,
      academicYearId,
    }),
  );
}

async function insertReason(institutionId: number, name: string): Promise<{ id: number; name: string }> {
  const [row] = await AppDataSource.query(
    `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, $2) RETURNING id, name`,
    [institutionId, name],
  );
  return row;
}

interface Fixture {
  institution: Institution;
  year: AcademicYear;
  narrowYear: AcademicYear;
  course: Course;
  otherCourse: Course;
  reasonA: { id: number; name: string };
  reasonB: { id: number; name: string };
  reasonToDelete: { id: number; name: string };
  reasonInactive: { id: number; name: string };
  today: string;
  narrowStart: string;
  narrowEnd: string;
  outsideDate: string;
}

async function createFixture(): Promise<Fixture> {
  const institution = await createTestInstitution();
  const today = await todayInGuayaquil();

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

  // A narrow, already finished year: a withdrawal dated inside it is legal,
  // one dated after it is not.
  const narrowStart = shiftYears(today, -3);
  const narrowEnd = shiftYears(today, -2);
  const narrowYear = await AppDataSource.getRepository(AcademicYear).save(
    AppDataSource.getRepository(AcademicYear).create({
      name: uniqueName('y'),
      institutionId: institution.id,
      startDate: narrowStart,
      endDate: narrowEnd,
      isActive: false,
      deletedAt: null,
    }),
  );

  const course = await AppDataSource.getRepository(Course).save(
    AppDataSource.getRepository(Course).create({
      name: uniqueName('__test_sw_course_'),
      fullName: null,
      section: null,
      institutionId: institution.id,
      shift: 'MATUTINA',
      isActive: true,
      deletedAt: null,
    }),
  );

  const otherCourse = await AppDataSource.getRepository(Course).save(
    AppDataSource.getRepository(Course).create({
      name: uniqueName('__test_sw_course_'),
      fullName: null,
      section: null,
      institutionId: institution.id,
      shift: 'MATUTINA',
      isActive: true,
      deletedAt: null,
    }),
  );

  const reasonA = await insertReason(institution.id, 'Cambio de domicilio');
  const reasonB = await insertReason(institution.id, 'Otro');
  const reasonToDelete = await insertReason(institution.id, 'Motivo que se borra');
  const reasonInactive = await insertReason(institution.id, 'Motivo inactivo');
  await AppDataSource.query(
    `UPDATE withdrawal_reasons SET is_active = FALSE WHERE id = $1`,
    [reasonInactive.id],
  );

  return {
    institution,
    year,
    narrowYear,
    course,
    otherCourse,
    reasonA,
    reasonB,
    reasonToDelete,
    reasonInactive,
    today,
    narrowStart,
    narrowEnd,
    outsideDate: shiftYears(today, -1),
  };
}

async function createStudent(institutionId: number, name?: string): Promise<Student> {
  const repo = AppDataSource.getRepository(Student);
  return repo.save(repo.create({
    idNumber: null,
    name: name ?? uniqueName('__test_sw_student_'),
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

async function withdrawalsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, institution_id, enrollment_id, reason_id, withdrawal_date::text AS withdrawal_date,
            notes, withdrawn_by_user_id, created_at, reverted_at, reverted_by_user_id
       FROM student_withdrawals WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function eventsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, event_type, entity_type, entity_id, actor_user_id, payload, occurred_at
       FROM domain_events WHERE institution_id = $1 ORDER BY id`,
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
  await runMigration();

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRouter);
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/students', studentRouter);
  app.use('/api/withdrawal-reasons', withdrawalReasonRouter);
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
// R1 — the withdrawals table
// ─────────────────────────────────────────────────────────────────────
test('R1: the migration creates student_withdrawals with the expected columns and constraints', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the table has the expected columns',
      run: async () => {
        const columns = await AppDataSource.query(
          `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'student_withdrawals'`,
        );
        const byName = new Map<string, any>(columns.map((c: any) => [c.column_name, c]));

        const expected: Array<[string, string, boolean]> = [
          ['id', 'integer', false],
          ['institution_id', 'integer', false],
          ['enrollment_id', 'integer', false],
          ['reason_id', 'integer', false],
          ['withdrawal_date', 'date', false],
          ['notes', 'character varying', true],
          ['withdrawn_by_user_id', 'integer', true],
          ['created_at', 'timestamp with time zone', false],
          ['reverted_at', 'timestamp with time zone', true],
          ['reverted_by_user_id', 'integer', true],
        ];
        for (const [name, type, nullable] of expected) {
          const col = byName.get(name);
          assert.ok(col, `column ${name} exists`);
          assert.equal(col.data_type, type, `column ${name} type`);
          assert.equal(col.is_nullable, nullable ? 'YES' : 'NO', `column ${name} nullability`);
        }
        assert.equal(byName.get('notes').character_maximum_length, 1000, 'notes is varchar(1000)');
        assert.match(String(byName.get('id').column_default), /nextval/, 'id is a serial');
        assert.match(String(byName.get('created_at').column_default), /now\(\)/i, 'created_at defaults to now()');
      },
    },
    {
      name: 'the foreign keys point at the expected tables',
      run: async () => {
        const fks = await AppDataSource.query(
          `SELECT kcu.column_name, ccu.table_name AS referenced_table, rc.delete_rule
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
             JOIN information_schema.referential_constraints rc
               ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
            WHERE tc.table_schema = current_schema()
              AND tc.table_name = 'student_withdrawals'
              AND tc.constraint_type = 'FOREIGN KEY'`,
        );
        const byColumn = new Map<string, any>(fks.map((f: any) => [f.column_name, f]));

        assert.equal(byColumn.get('institution_id').referenced_table, 'institutions');
        assert.equal(byColumn.get('enrollment_id').referenced_table, 'enrollments');
        assert.equal(byColumn.get('reason_id').referenced_table, 'withdrawal_reasons');
        assert.equal(byColumn.get('withdrawn_by_user_id').referenced_table, 'users');
        assert.equal(byColumn.get('reverted_by_user_id').referenced_table, 'users');

        assert.equal(byColumn.get('enrollment_id').delete_rule, 'RESTRICT', 'an enrollment cannot be hard deleted');
        assert.equal(byColumn.get('reason_id').delete_rule, 'RESTRICT', 'a reason cannot be hard deleted');
        assert.equal(byColumn.get('withdrawn_by_user_id').delete_rule, 'SET NULL');
        assert.equal(byColumn.get('reverted_by_user_id').delete_rule, 'SET NULL');
      },
    },
    {
      name: 'the table has the partial unique index and the lookup indexes',
      run: async () => {
        const indexes = await AppDataSource.query(
          `SELECT indexdef FROM pg_indexes
            WHERE schemaname = current_schema() AND tablename = 'student_withdrawals'`,
        );
        const defs = indexes.map((i: any) => i.indexdef as string);

        const unique = defs.find((d: string) => d.includes('UNIQUE') && d.includes('reverted_at IS NULL'));
        assert.ok(unique, `a partial unique index over the active withdrawals exists: ${defs.join(' | ')}`);
        assert.match(unique, /enrollment_id/, 'the index is over the enrollment');

        assert.ok(
          defs.some((d: string) => d.includes('institution_id, withdrawal_date DESC, id DESC')),
          `an index on (institution_id, withdrawal_date DESC, id DESC) exists: ${defs.join(' | ')}`,
        );
        assert.ok(
          defs.some((d: string) => d.includes('reason_id')),
          `an index on the reason exists: ${defs.join(' | ')}`,
        );
      },
    },
    {
      name: 'the table refuses a revert actor without a revert date',
      run: async () => {
        const constraints = await AppDataSource.query(
          `SELECT conname, pg_get_constraintdef(oid) AS def
             FROM pg_constraint
            WHERE conrelid = 'student_withdrawals'::regclass AND contype = 'c'`,
        );
        const check = constraints.find((c: any) => c.def.includes('reverted_at'));
        assert.ok(check, `a check constraint on the revert columns exists: ${JSON.stringify(constraints)}`);
      },
    },
    {
      name: 'a second active withdrawal of the same enrollment is rejected',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);

        const [first] = await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [fx.institution.id, enrollment.id, fx.reasonA.id, fx.today],
        );

        await assert.rejects(
          () => AppDataSource.query(
            `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date)
             VALUES ($1, $2, $3, $4)`,
            [fx.institution.id, enrollment.id, fx.reasonB.id, fx.today],
          ),
          (err: Error) =>
            /duplicate key/.test(err.message) &&
            err.message.includes('uq_student_withdrawals_active_enrollment'),
        );

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'only the first row exists');
        assert.equal(rows[0].id, first.id);
      },
    },
    {
      name: 'a new withdrawal is accepted once the previous one was reverted',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);

        await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date, reverted_at)
           VALUES ($1, $2, $3, $4, now())`,
          [fx.institution.id, enrollment.id, fx.reasonA.id, fx.today],
        );

        const [second] = await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [fx.institution.id, enrollment.id, fx.reasonB.id, fx.today],
        );

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 2, 'both rows coexist');
        assert.equal(rows[1].id, second.id);
        assert.equal(rows[1].reverted_at, null, 'the new row is the active one');
      },
    },
    {
      name: 'an enrollment with a withdrawal cannot be hard deleted',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);

        await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date)
           VALUES ($1, $2, $3, $4)`,
          [fx.institution.id, enrollment.id, fx.reasonA.id, fx.today],
        );

        await assert.rejects(
          () => AppDataSource.query(`DELETE FROM enrollments WHERE id = $1`, [enrollment.id]),
          (err: Error) => /violates foreign key/.test(err.message),
        );

        const enrollments = await AppDataSource.query(`SELECT id FROM enrollments WHERE id = $1`, [enrollment.id]);
        assert.equal(enrollments.length, 1, 'the enrollment is still there');
        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'the withdrawal is still there');
      },
    },
    {
      name: 'a revert actor without a revert date is rejected',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);

        const [row] = await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [fx.institution.id, enrollment.id, fx.reasonA.id, fx.today],
        );

        await assert.rejects(
          () => AppDataSource.query(
            `UPDATE student_withdrawals SET reverted_by_user_id = $2 WHERE id = $1`,
            [row.id, 1],
          ),
          (err: Error) => /check constraint/.test(err.message),
        );

        const [stored] = await withdrawalsOf(fx.institution.id);
        assert.equal(stored.reverted_at, null, 'the row was not reverted');
        assert.equal(stored.reverted_by_user_id, null, 'no actor was stored');
      },
    },
    {
      name: 'the migration can be applied twice in a row without error',
      run: async () => {
        await runMigration();
        await runMigration();

        const rows = await AppDataSource.query(
          `SELECT role_id, COUNT(*)::int AS count
             FROM role_permissions WHERE resource = 'student-withdrawals'
            GROUP BY role_id HAVING COUNT(*) > 1`,
        );
        assert.deepEqual(rows, [], 'no role has two student-withdrawals rows');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R2 — withdrawal permissions
// ─────────────────────────────────────────────────────────────────────
test('R2: the withdrawal routes are guarded by the student-withdrawals permission', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a request without a token is rejected with 401 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);

        const calls: Array<[string, string, unknown]> = [
          ['GET', '/api/student-withdrawals', undefined],
          ['GET', '/api/student-withdrawals/stats', undefined],
          ['GET', `/api/student-withdrawals/students/${student.id}/history`, undefined],
          ['POST', '/api/student-withdrawals', { enrollmentId: enrollment.id, reasonId: fx.reasonA.id }],
          ['POST', '/api/student-withdrawals/1/revert', undefined],
        ];
        for (const [method, url, body] of calls) {
          const res = await request(method, url, { institutionId: fx.institution.id, body });
          assert.equal(res.status, 401, `${method} ${url} without a token`);
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a role without a student-withdrawals row gets 403 on every route',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'students', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const calls: Array<[string, string, unknown]> = [
          ['GET', '/api/student-withdrawals', undefined],
          ['GET', '/api/student-withdrawals/stats', undefined],
          ['GET', `/api/student-withdrawals/students/${student.id}/history`, undefined],
          ['POST', '/api/student-withdrawals', { enrollmentId: enrollment.id, reasonId: fx.reasonA.id }],
          ['POST', '/api/student-withdrawals/1/revert', undefined],
        ];
        for (const [method, url, body] of calls) {
          const res = await request(method, url, { token, institutionId: fx.institution.id, body });
          assert.equal(res.status, 403, `${method} ${url} as ${role.name}`);
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a role that can only read gets 403 on the writing routes',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const read = await request('GET', '/api/student-withdrawals', { token, institutionId: fx.institution.id });
        assert.equal(read.status, 200, 'the read is allowed');

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 403, 'the withdraw is rejected');

        const reverted = await request('POST', '/api/student-withdrawals/1/revert', {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 403, 'the reinstate is rejected');

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a role that can only create gets 403 on the reading routes',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const read = await request('GET', '/api/student-withdrawals', { token, institutionId: fx.institution.id });
        assert.equal(read.status, 403, 'the list is rejected');

        const stats = await request('GET', '/api/student-withdrawals/stats', { token, institutionId: fx.institution.id });
        assert.equal(stats.status, 403, 'the statistics are rejected');
      },
    },
    {
      name: 'a superadmin without an institution gets 400',
      run: async () => {
        const { token } = await createUser('superadmin', null);

        const res = await request('GET', '/api/student-withdrawals', { token });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Selecciona una institución');
      },
    },
    {
      name: 'a role that can delete students can withdraw and reinstate but never delete',
      run: async () => {
        const role = await createTestRole([{ resource: 'students', canRead: true, canDelete: true }]);
        await runMigration();

        const rows = await AppDataSource.query(
          `SELECT can_read, can_create, can_update, can_delete
             FROM role_permissions WHERE role_id = $1 AND resource = 'student-withdrawals'`,
          [role.id],
        );
        assert.equal(rows.length, 1, 'the role has one student-withdrawals row');
        assert.equal(rows[0].can_read, true, 'can read');
        assert.equal(rows[0].can_create, true, 'can create');
        assert.equal(rows[0].can_update, true, 'can update');
        assert.equal(rows[0].can_delete, false, 'cannot delete');
      },
    },
    {
      name: 'a role that can only read students can only read the withdrawals',
      run: async () => {
        const role = await createTestRole([{ resource: 'students', canRead: true }]);
        await runMigration();

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
      name: 'a teacher can read the withdrawal reasons catalog',
      run: async () => {
        const fx = await createFixture();
        const { token } = await createUser('teacher', fx.institution.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R3 — withdraw an enrollment
// ─────────────────────────────────────────────────────────────────────
test('R3: POST /api/student-withdrawals withdraws an enrollment', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a valid body stores the withdrawal and answers the withdrawal',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'PEREZ LOPEZ JUAN');
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const res = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: fx.today, notes: 'Se muda' },
        });
        assert.equal(res.status, 201);
        assert.deepEqual(Object.keys(res.body).sort(), ITEM_KEYS, 'the answer carries every field of the withdrawal');
        assert.equal(res.body.enrollmentId, enrollment.id);
        assert.equal(res.body.studentId, student.id);
        assert.equal(res.body.studentName, 'PEREZ LOPEZ JUAN');
        assert.equal(res.body.courseId, fx.course.id);
        assert.equal(res.body.courseName, fx.course.name);
        assert.equal(res.body.academicYearId, fx.year.id);
        assert.equal(res.body.academicYear, fx.year.name);
        assert.equal(res.body.withdrawalDate, fx.today);
        assert.equal(res.body.notes, 'Se muda');
        assert.deepEqual(res.body.reason, { id: fx.reasonA.id, name: fx.reasonA.name });
        assert.equal(res.body.revertedAt, null);
        assert.equal(res.body.revertedBy, null);
        assert.equal(res.body.withdrawnBy.id, userId, 'the caller is the actor');
        assert.ok(res.body.withdrawnAt, 'the withdrawal has a timestamp');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'one row was stored');
        assert.equal(rows[0].reverted_at, null, 'the row is active');
        assert.equal(rows[0].withdrawn_by_user_id, userId);
        assert.equal(rows[0].institution_id, fx.institution.id);
      },
    },
    {
      name: 'an omitted withdrawal date is today in Ecuador',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.withdrawalDate, fx.today, 'the date is today in America/Guayaquil');
      },
    },
    {
      name: 'the notes are trimmed and a blank one becomes null',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const bodies: unknown[] = [
          { reasonId: fx.reasonA.id, notes: '  Se muda  ' },
          { reasonId: fx.reasonA.id },
          { reasonId: fx.reasonA.id, notes: '' },
          { reasonId: fx.reasonA.id, notes: '   ' },
        ];
        const expected = ['Se muda', null, null, null];

        for (const [index, body] of bodies.entries()) {
          const student = await createStudent(fx.institution.id);
          const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { ...(body as Record<string, unknown>), enrollmentId: enrollment.id },
          });
          assert.equal(res.status, 201, `case ${index}`);
          assert.equal(res.body.notes, expected[index], `case ${index}`);
        }
      },
    },
    {
      name: 'a too long or non-string note is rejected with 400 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        for (const notes of ['a'.repeat(1001), 42, { a: 1 }]) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, notes },
          });
          assert.equal(res.status, 400, `notes ${JSON.stringify(notes)}`);
          assert.equal(res.body.error, 'Las observaciones no pueden superar 1000 caracteres');
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a malformed withdrawal date is rejected with 400 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        for (const date of ['16-11-2026', '2026/11/16', '2026-13-01', '2026-02-30', 'hoy', 20261116]) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: date },
          });
          assert.equal(res.status, 400, `date ${date}`);
          assert.equal(res.body.error, 'withdrawalDate debe tener formato YYYY-MM-DD');
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a future withdrawal date is rejected with 400 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const tomorrow = shiftYears(fx.today, 0);
        const [row] = await AppDataSource.query(
          `SELECT ((now() AT TIME ZONE 'America/Guayaquil')::date + 1)::text AS tomorrow`,
        );
        assert.notEqual(row.tomorrow, tomorrow);

        const res = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: row.tomorrow },
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'La fecha de retiro no puede ser futura');

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a date outside the academic year is rejected with 400 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.narrowYear.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const before = shiftYears(fx.narrowStart, -1);
        const after = fx.outsideDate;

        for (const date of [before, after]) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: date },
          });
          assert.equal(res.status, 400, `date ${date}`);
          assert.equal(res.body.error, 'La fecha de retiro debe estar dentro del año lectivo');
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a missing or invalid reason is rejected with 400 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        for (const reasonId of [undefined, null, 0, -1, 'abc', 1.5]) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId },
          });
          assert.equal(res.status, 400, `reason ${reasonId}`);
          assert.equal(res.body.error, 'El motivo del retiro es obligatorio');
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a foreign, deleted or inactive reason is rejected with 400 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE id = $1`,
          [fx.reasonToDelete.id],
        );
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        for (const reasonId of [other.reasonA.id, fx.reasonToDelete.id, fx.reasonInactive.id]) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId },
          });
          assert.equal(res.status, 400, `reason ${reasonId}`);
          assert.equal(res.body.error, 'Motivo de retiro inválido');
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'an enrollment that is already withdrawn answers 409 and keeps one active row',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const first = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(first.status, 201);

        const second = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonB.id },
        });
        assert.equal(second.status, 409);
        assert.equal(second.body.error, 'La matrícula ya está retirada');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.filter(r => r.reverted_at === null).length, 1, 'exactly one active row');
      },
    },
    {
      name: 'two concurrent withdrawals leave one row and one event',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const body = { enrollmentId: enrollment.id, reasonId: fx.reasonA.id };
        const responses = await Promise.all([
          request('POST', '/api/student-withdrawals', { token, institutionId: fx.institution.id, body }),
          request('POST', '/api/student-withdrawals', { token, institutionId: fx.institution.id, body }),
        ]);

        const statuses = responses.map(r => r.status).sort();
        assert.deepEqual(statuses, [201, 409], 'one withdrawal wins and the other is rejected');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.filter(r => r.reverted_at === null).length, 1, 'exactly one active row');
        const events = await eventsOf(fx.institution.id);
        assert.equal(events.length, 1, 'exactly one event');
      },
    },
    {
      name: 'an unknown, deleted or foreign enrollment answers 404 and writes nothing',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const student = await createStudent(fx.institution.id);
        const deleted = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        await AppDataSource.query(
          `UPDATE enrollments SET deleted_at = NOW() WHERE id = $1`,
          [deleted.id],
        );
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const foreignStudent = await createStudent(other.institution.id);
        const foreign = await createEnrollment(other.institution.id, foreignStudent.id, other.course.id, other.year.id);

        for (const enrollmentId of [undefined, null, 0, -1, 'abc', 99999999, deleted.id, foreign.id]) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId, reasonId: fx.reasonA.id },
          });
          assert.equal(res.status, 404, `enrollment ${enrollmentId}`);
          assert.equal(res.body.error, 'Enrollment not found');
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
    {
      name: 'a course-scoped caller cannot withdraw an enrollment outside their courses',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(userId, fx.course.id, fx.year.id);

        const res = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(res.status, 404);
        assert.equal(res.body.error, 'Enrollment not found');

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no row was written');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R4 — the StudentWithdrawn event
// ─────────────────────────────────────────────────────────────────────
test('R4: withdrawing an enrollment records one StudentWithdrawn event', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the event carries the withdrawal snapshot and the caller as actor',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const res = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, notes: 'Se muda' },
        });
        assert.equal(res.status, 201);

        const events = await eventsOf(fx.institution.id);
        assert.equal(events.length, 1, 'exactly one event');
        const event = events[0];
        assert.equal(event.event_type, 'StudentWithdrawn');
        assert.equal(event.entity_type, 'student_withdrawal');
        assert.equal(event.entity_id, res.body.id, 'the event points at the withdrawal row');
        assert.equal(event.actor_user_id, userId, 'the caller is the actor');
        assert.deepEqual(event.payload, {
          before: null,
          after: {
            id: res.body.id,
            enrollmentId: enrollment.id,
            studentId: student.id,
            academicYearId: fx.year.id,
            courseId: fx.course.id,
            reasonId: fx.reasonA.id,
            withdrawalDate: fx.today,
            notes: 'Se muda',
            statsVisibility: 'whole_year',
            revertedAt: null,
          },
        });
      },
    },
    {
      name: 'a rejected withdrawal records no event',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const rejected: Array<[string, unknown]> = [
          ['POST', { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, notes: 'a'.repeat(1001) }],
          ['POST', { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: 'ayer' }],
          ['POST', { enrollmentId: enrollment.id, reasonId: 999999 }],
          ['POST', { enrollmentId: 999999, reasonId: fx.reasonA.id }],
        ];
        for (const [method, body] of rejected) {
          const res = await request(method, '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body,
          });
          assert.ok(res.status >= 400, `body ${JSON.stringify(body)} is rejected`);
        }

        assert.equal((await eventsOf(fx.institution.id)).length, 0, 'no event was recorded');
      },
    },
    {
      name: 'a failed event write leaves no withdrawal behind',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        await AppDataSource.query(
          `ALTER TABLE domain_events ADD CONSTRAINT tmp_sw_force_fail CHECK (event_type <> 'StudentWithdrawn') NOT VALID`,
        );
        try {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
          });
          assert.equal(res.status, 500, 'the request fails');
        } finally {
          await AppDataSource.query(`ALTER TABLE domain_events DROP CONSTRAINT IF EXISTS tmp_sw_force_fail`);
        }

        assert.equal((await withdrawalsOf(fx.institution.id)).length, 0, 'no withdrawal was stored');
        assert.equal((await eventsOf(fx.institution.id)).length, 0, 'no event was stored');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R5 — reinstate an enrollment
// ─────────────────────────────────────────────────────────────────────
test('R5: POST /api/student-withdrawals/:id/revert reinstates an enrollment', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the withdrawal is marked as reverted and keeps its other fields',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, notes: 'Se muda' },
        });
        assert.equal(created.status, 201);

        const res = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.deepEqual(Object.keys(res.body).sort(), ITEM_KEYS);
        assert.equal(res.body.id, created.body.id);
        assert.ok(res.body.revertedAt, 'the withdrawal has a revert date');
        assert.equal(res.body.revertedBy.id, userId, 'the caller is the actor');
        assert.equal(res.body.enrollmentId, enrollment.id);
        assert.equal(res.body.studentId, student.id);
        assert.equal(res.body.withdrawalDate, created.body.withdrawalDate);
        assert.equal(res.body.notes, 'Se muda');
        assert.deepEqual(res.body.reason, created.body.reason);
        assert.equal(res.body.withdrawnBy.id, created.body.withdrawnBy.id);

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'the row was not deleted');
        assert.notEqual(rows[0].reverted_at, null, 'the row is reverted');
        assert.equal(rows[0].reverted_by_user_id, userId);
      },
    },
    {
      name: 'a reinstated enrollment can be withdrawn again',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 201);

        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 200);

        const again = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonB.id },
        });
        assert.equal(again.status, 201);
        assert.notEqual(again.body.id, created.body.id, 'the second withdrawal is a new row');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 2, 'both rows are kept');
        assert.equal(rows.filter(r => r.reverted_at === null).length, 1, 'only the new one is active');
      },
    },
    {
      name: 'a withdrawal that is already reverted answers 409 and is not touched',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        const first = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(first.status, 200);

        const second = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(second.status, 409);
        assert.equal(second.body.error, 'El retiro ya fue revertido');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'no row was added');
        assert.equal(rows[0].reverted_by_user_id, userId, 'the actor did not change');
      },
    },
    {
      name: 'two concurrent reinstatements leave one revert and one event',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        const url = `/api/student-withdrawals/${created.body.id}/revert`;
        const responses = await Promise.all([
          request('POST', url, { token, institutionId: fx.institution.id }),
          request('POST', url, { token, institutionId: fx.institution.id }),
        ]);

        const statuses = responses.map(r => r.status).sort();
        assert.deepEqual(statuses, [200, 409], 'one reinstatement wins and the other is rejected');

        const events = await eventsOf(fx.institution.id);
        assert.equal(events.filter(e => e.event_type === 'StudentReinstated').length, 1, 'exactly one reinstatement event');
      },
    },
    {
      name: 'an unknown, foreign or hidden withdrawal answers 404 and is not touched',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 201);

        const foreignStudent = await createStudent(other.institution.id);
        const foreignEnrollment = await createEnrollment(other.institution.id, foreignStudent.id, other.course.id, other.year.id);
        const adminToken = await superadminToken();
        const foreign = await request('POST', '/api/student-withdrawals', {
          token: adminToken,
          institutionId: other.institution.id,
          body: { enrollmentId: foreignEnrollment.id, reasonId: other.reasonA.id },
        });
        assert.equal(foreign.status, 201);

        await AppDataSource.query(
          `UPDATE enrollments SET deleted_at = NOW() WHERE id = $1`,
          [enrollment.id],
        );

        for (const id of ['abc', '0', '-1', '99999999', String(foreign.body.id)]) {
          const res = await request('POST', `/api/student-withdrawals/${id}/revert`, {
            token,
            institutionId: fx.institution.id,
          });
          assert.equal(res.status, 404, `id ${id}`);
          assert.equal(res.body.error, 'Retiro no encontrado');
        }

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'the withdrawal was not reverted');
        assert.equal(rows[0].reverted_at, null, 'the withdrawal is still active');
      },
    },
    {
      name: 'a course-scoped caller cannot reinstate a withdrawal outside their courses',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(userId, fx.course.id, fx.year.id);

        const adminToken = await superadminToken();
        const created = await request('POST', '/api/student-withdrawals', {
          token: adminToken,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 201);

        const res = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 404);
        assert.equal(res.body.error, 'Retiro no encontrado');

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
// R6 — the StudentReinstated event
// ─────────────────────────────────────────────────────────────────────
test('R6: reinstating an enrollment records one StudentReinstated event', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the event carries the withdrawal before and after the revert',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 201);

        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 200);

        const events = await eventsOf(fx.institution.id);
        const reinstated = events.filter(e => e.event_type === 'StudentReinstated');
        assert.equal(reinstated.length, 1, 'exactly one StudentReinstated event');
        const event = reinstated[0];
        assert.equal(event.entity_type, 'student_withdrawal');
        assert.equal(event.entity_id, created.body.id);
        assert.equal(event.actor_user_id, userId, 'the caller is the actor');
        assert.equal(event.payload.before.revertedAt, null, 'the withdrawal was not reverted before');
        assert.equal(event.payload.after.revertedAt, reverted.body.revertedAt, 'the event carries the revert date');
        assert.equal(event.payload.after.id, created.body.id);
        assert.equal(event.payload.after.enrollmentId, enrollment.id);
        assert.equal(event.payload.after.studentId, student.id);
      },
    },
    {
      name: 'a rejected reinstatement records no event',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 201);

        const before = (await eventsOf(fx.institution.id)).length;

        const unknown = await request('POST', '/api/student-withdrawals/99999999/revert', {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(unknown.status, 404);

        assert.equal((await eventsOf(fx.institution.id)).length, before, 'no event was recorded');
      },
    },
    {
      name: 'a failed event write leaves the withdrawal active',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 201);

        await AppDataSource.query(
          `ALTER TABLE domain_events ADD CONSTRAINT tmp_sw_force_fail CHECK (event_type <> 'StudentReinstated') NOT VALID`,
        );
        try {
          const res = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
            token,
            institutionId: fx.institution.id,
          });
          assert.equal(res.status, 500, 'the request fails');
        } finally {
          await AppDataSource.query(`ALTER TABLE domain_events DROP CONSTRAINT IF EXISTS tmp_sw_force_fail`);
        }

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'the row is still there');
        assert.equal(rows[0].reverted_at, null, 'the withdrawal is still active');
        assert.equal(rows[0].reverted_by_user_id, null, 'no actor was stored');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R7 — list withdrawals
// ─────────────────────────────────────────────────────────────────────
test('R7: GET /api/student-withdrawals lists the withdrawals of the institution', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the list holds the active withdrawals, newest first',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const other = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const older = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: fx.narrowEnd },
        });
        assert.equal(older.status, 201);
        const newer = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: other.id, reasonId: fx.reasonB.id, withdrawalDate: fx.today },
        });
        assert.equal(newer.status, 201);

        const res = await request('GET', '/api/student-withdrawals', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.deepEqual(res.body.map((i: any) => i.id), [newer.body.id, older.body.id], 'the newest comes first');
        for (const item of res.body) {
          assert.deepEqual(Object.keys(item).sort(), ITEM_KEYS, 'every item carries the withdrawal shape');
        }
      },
    },
    {
      name: 'the status filter picks the active, the reverted or both',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const other = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const active = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        const reverted = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: other.id, reasonId: fx.reasonB.id },
        });
        await request('POST', `/api/student-withdrawals/${reverted.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });

        const list = async (status: string) => {
          const res = await request('GET', `/api/student-withdrawals?status=${status}`, { token, institutionId: fx.institution.id });
          assert.equal(res.status, 200);
          return res.body.map((i: any) => i.id);
        };

        assert.deepEqual(await list('active'), [active.body.id], 'the active one');
        assert.deepEqual(await list('reverted'), [reverted.body.id], 'the reverted one');
        assert.deepEqual((await list('all')).sort(), [active.body.id, reverted.body.id].sort(), 'both');
      },
    },
    {
      name: 'the list can be filtered by year, course and reason',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const other = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.narrowYear.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const first = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        const second = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: other.id, reasonId: fx.reasonB.id, withdrawalDate: fx.narrowEnd },
        });

        const list = async (query: string) => {
          const res = await request('GET', `/api/student-withdrawals?${query}`, { token, institutionId: fx.institution.id });
          assert.equal(res.status, 200);
          return res.body.map((i: any) => i.id);
        };

        assert.deepEqual(await list(`academic_year_id=${fx.year.id}`), [first.body.id]);
        assert.deepEqual(await list(`course_id=${fx.otherCourse.id}`), [second.body.id]);
        assert.deepEqual(await list(`reason_id=${fx.reasonA.id}`), [first.body.id]);
        assert.deepEqual(
          await list(`academic_year_id=${fx.year.id}&course_id=${fx.course.id}&reason_id=${fx.reasonA.id}`),
          [first.body.id],
          'the filters combine',
        );
        assert.deepEqual(
          await list(`academic_year_id=${fx.year.id}&course_id=${fx.otherCourse.id}`),
          [],
          'a contradictory combination returns nothing',
        );
      },
    },
    {
      name: 'the list can be filtered by date range, both ends included',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const second = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const first = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: fx.narrowEnd },
        });
        const other = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: second.id, reasonId: fx.reasonA.id, withdrawalDate: fx.today },
        });

        const list = async (query: string) => {
          const res = await request('GET', `/api/student-withdrawals?${query}`, { token, institutionId: fx.institution.id });
          assert.equal(res.status, 200);
          return res.body.map((i: any) => i.id);
        };

        assert.deepEqual(await list(`date_from=${fx.narrowEnd}&date_to=${fx.narrowEnd}`), [first.body.id]);
        assert.deepEqual(
          await list(`date_from=${fx.narrowEnd}&date_to=${fx.today}`),
          [other.body.id, first.body.id],
          'both ends are included',
        );
        assert.deepEqual(await list(`date_from=${fx.today}&date_to=${fx.today}`), [other.body.id]);
      },
    },
    {
      name: 'a withdrawal whose reason was deleted is still listed with its name',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonToDelete.id },
        });
        assert.equal(created.status, 201);

        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE id = $1`,
          [fx.reasonToDelete.id],
        );

        const res = await request('GET', '/api/student-withdrawals', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.length, 1, 'the withdrawal is still listed');
        assert.deepEqual(res.body[0].reason, { id: fx.reasonToDelete.id, name: fx.reasonToDelete.name });
      },
    },
    {
      name: 'the list can be filtered by student',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const otherStudent = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const other = await createEnrollment(fx.institution.id, otherStudent.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const mine = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        const theirs = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: other.id, reasonId: fx.reasonA.id },
        });

        const res = await request('GET', `/api/student-withdrawals?student_id=${student.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.map((i: any) => i.id), [mine.body.id], 'only the withdrawals of that student');

        const combined = await request(
          'GET',
          `/api/student-withdrawals?student_id=${student.id}&course_id=${fx.otherCourse.id}`,
          { token, institutionId: fx.institution.id },
        );
        assert.equal(combined.status, 200);
        assert.deepEqual(combined.body, [], 'the filters combine');

        const empty = await request('GET', `/api/student-withdrawals?student_id=${99999999}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(empty.status, 200);
        assert.deepEqual(empty.body, []);
        assert.ok(theirs.body.id, 'the other withdrawal exists');
      },
    },
    {
      name: 'a course-scoped caller only sees the withdrawals of their courses',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const mine = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const theirs = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(userId, fx.course.id, fx.year.id);

        const first = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: mine.id, reasonId: fx.reasonA.id },
        });
        assert.equal(first.status, 201);

        const adminToken = await superadminToken();
        await request('POST', '/api/student-withdrawals', {
          token: adminToken,
          institutionId: fx.institution.id,
          body: { enrollmentId: theirs.id, reasonId: fx.reasonA.id },
        });

        const res = await request('GET', '/api/student-withdrawals', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.map((i: any) => i.id), [first.body.id], 'only the withdrawal of their course');
      },
    },
    {
      name: 'the withdrawals of another institution are not listed',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });

        const foreignStudent = await createStudent(other.institution.id);
        const foreignEnrollment = await createEnrollment(other.institution.id, foreignStudent.id, other.course.id, other.year.id);
        const adminToken = await superadminToken();
        await request('POST', '/api/student-withdrawals', {
          token: adminToken,
          institutionId: other.institution.id,
          body: { enrollmentId: foreignEnrollment.id, reasonId: other.reasonA.id },
        });

        const res = await request('GET', '/api/student-withdrawals', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.length, 1, 'only the withdrawal of the caller institution');
        assert.equal(res.body[0].institutionId, undefined, 'the item does not leak the institution');
      },
    },
    {
      name: 'an invalid query is rejected with 400',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const invalid = [
          'status=todo', 'status=', 'academic_year_id=0', 'academic_year_id=abc', 'academic_year_id=-1',
          'course_id=0', 'course_id=abc', 'reason_id=0', 'reason_id=abc', 'student_id=0', 'student_id=abc',
          'date_from=not-a-date', 'date_from=2026-13-01', 'date_from=2026-02-30', 'date_to=2026-99-99',
        ];

        for (const query of invalid) {
          const res = await request('GET', `/api/student-withdrawals?${query}`, { token, institutionId: fx.institution.id });
          assert.equal(res.status, 400, `${query} is rejected`);
          assert.equal(res.body.error, 'Parámetros de consulta inválidos');
        }
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R8 — the withdrawal history of a student
// ─────────────────────────────────────────────────────────────────────
test('R8: GET /api/student-withdrawals/students/:studentId/history lists the history of a student', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the history holds the withdrawals of every year, the newest first',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const first = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const second = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.narrowYear.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const firstWithdrawal = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: first.id, reasonId: fx.reasonA.id },
        });
        assert.equal(firstWithdrawal.status, 201);

        const reverted = await request('POST', `/api/student-withdrawals/${firstWithdrawal.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 200);

        const secondWithdrawal = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: second.id, reasonId: fx.reasonB.id, withdrawalDate: fx.narrowEnd },
        });
        assert.equal(secondWithdrawal.status, 201);

        const res = await request('GET', `/api/student-withdrawals/students/${student.id}/history`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.length, 2, 'both withdrawals are listed');
        assert.deepEqual(res.body.map((i: any) => i.id), [secondWithdrawal.body.id, firstWithdrawal.body.id]);
        assert.equal(res.body[0].revertedAt, null, 'the newest one is active');
        assert.notEqual(res.body[1].revertedAt, null, 'the older one was reverted');
        for (const item of res.body) {
          assert.deepEqual(Object.keys(item).sort(), ITEM_KEYS);
        }
      },
    },
    {
      name: 'a student that was never withdrawn has an empty history',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('GET', `/api/student-withdrawals/students/${student.id}/history`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, []);
      },
    },
    {
      name: 'an unknown, deleted or foreign student answers 404',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const student = await createStudent(fx.institution.id);
        await AppDataSource.query(`UPDATE students SET deleted_at = NOW() WHERE id = $1`, [student.id]);
        const foreign = await createStudent(other.institution.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        for (const id of ['abc', '0', '99999999', String(student.id), String(foreign.id)]) {
          const res = await request('GET', `/api/student-withdrawals/students/${id}/history`, {
            token,
            institutionId: fx.institution.id,
          });
          assert.equal(res.status, 404, `student ${id}`);
          assert.equal(res.body.error, 'Student not found');
        }
      },
    },
    {
      name: 'a course-scoped caller only sees the history of their courses',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const mine = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const theirs = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(userId, fx.course.id, fx.year.id);

        const first = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: mine.id, reasonId: fx.reasonA.id },
        });
        assert.equal(first.status, 201);

        const adminToken = await superadminToken();
        await request('POST', '/api/student-withdrawals', {
          token: adminToken,
          institutionId: fx.institution.id,
          body: { enrollmentId: theirs.id, reasonId: fx.reasonA.id },
        });

        const res = await request('GET', `/api/student-withdrawals/students/${student.id}/history`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.map((i: any) => i.id), [first.body.id], 'only the withdrawal of their course');
      },
    },
    {
      name: 'a course-scoped caller gets 404 for a student without an enrollment in their courses',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(userId, fx.course.id, fx.year.id);

        const res = await request('GET', `/api/student-withdrawals/students/${student.id}/history`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 404);
        assert.equal(res.body.error, 'Student not found');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R9 — the statistics by reason
// ─────────────────────────────────────────────────────────────────────
test('R9: GET /api/student-withdrawals/stats counts the withdrawals by reason', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the statistics count the active withdrawals and list every active reason',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const first = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const second = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const third = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.narrowYear.id);
        // The reinstatement only works in the active year, so the withdrawal
        // that is reverted belongs to it.
        const otherStudent = await createStudent(fx.institution.id);
        const fourth = await createEnrollment(fx.institution.id, otherStudent.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        // Two active withdrawals with the first reason, one with the second.
        for (const [enrollment, reasonId] of [[first, fx.reasonA.id], [second, fx.reasonA.id], [third, fx.reasonB.id]] as Array<[any, number]>) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId, withdrawalDate: fx.narrowEnd },
          });
          assert.equal(res.status, 201);
        }

        // A fourth withdrawal with the first reason, reverted: it does not count.
        const reverted = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fourth.id, reasonId: fx.reasonA.id, withdrawalDate: fx.narrowEnd },
        });
        assert.equal(reverted.status, 201);
        const reinstate = await request('POST', `/api/student-withdrawals/${reverted.body.id}/revert`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(reinstate.status, 200);

        const res = await request('GET', '/api/student-withdrawals/stats', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 3, 'the reverted withdrawal is not counted');

        const byReason = new Map<number, any>(res.body.byReason.map((r: any) => [r.reasonId, r] as [number, any]));
        assert.equal(byReason.get(fx.reasonA.id).count, 2, 'the first reason counts two withdrawals');
        assert.equal(byReason.get(fx.reasonB.id).count, 1, 'the second reason counts one withdrawal');
        assert.equal(byReason.get(fx.reasonInactive.id), undefined, 'an inactive reason is not listed');

        for (const reason of [fx.reasonA, fx.reasonB, fx.reasonToDelete]) {
          assert.ok(byReason.has(reason.id), `the reason ${reason.name} is listed`);
        }
        assert.equal(byReason.get(fx.reasonToDelete.id).count, 0, 'a reason without withdrawals counts zero');
      },
    },
    {
      name: 'the statistics can be filtered by year and course',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const first = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const second = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.narrowYear.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        for (const enrollment of [first, second]) {
          const res = await request('POST', '/api/student-withdrawals', {
            token,
            institutionId: fx.institution.id,
            body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id, withdrawalDate: fx.narrowEnd },
          });
          assert.equal(res.status, 201);
        }

        const byYear = await request('GET', `/api/student-withdrawals/stats?academic_year_id=${fx.year.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(byYear.status, 200);
        assert.equal(byYear.body.total, 1, 'only the withdrawal of that year counts');

        const byCourse = await request('GET', `/api/student-withdrawals/stats?course_id=${fx.otherCourse.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(byCourse.status, 200);
        assert.equal(byCourse.body.total, 1, 'only the withdrawal of that course counts');

        const both = await request(
          'GET',
          `/api/student-withdrawals/stats?academic_year_id=${fx.year.id}&course_id=${fx.otherCourse.id}`,
          { token, institutionId: fx.institution.id },
        );
        assert.equal(both.status, 200);
        assert.equal(both.body.total, 0, 'the filters combine');
      },
    },
    {
      name: 'a reason deleted after being used keeps its count and a deleted reason without withdrawals is absent',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonToDelete.id },
        });
        assert.equal(created.status, 201);

        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE id = $1`,
          [fx.reasonToDelete.id],
        );

        const res = await request('GET', '/api/student-withdrawals/stats', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 1, 'the withdrawal is still counted');
        const deleted = res.body.byReason.find((r: any) => r.reasonId === fx.reasonToDelete.id);
        assert.ok(deleted, 'the deleted reason is still listed');
        assert.equal(deleted.count, 1);
        assert.equal(deleted.reasonName, fx.reasonToDelete.name, 'it keeps its name');
      },
    },
    {
      name: 'a course-scoped caller only counts the withdrawals of their courses',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const mine = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        const theirs = await createEnrollment(fx.institution.id, student.id, fx.otherCourse.id, fx.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(userId, fx.course.id, fx.year.id);

        await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: mine.id, reasonId: fx.reasonA.id },
        });
        await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: theirs.id, reasonId: fx.reasonB.id },
        });

        const res = await request('GET', '/api/student-withdrawals/stats', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 1, 'only the withdrawal of their course counts');
        const byReason = new Map<number, any>(res.body.byReason.map((r: any) => [r.reasonId, r] as [number, any]));
        assert.equal(byReason.get(fx.reasonA.id).count, 1);
        assert.equal(byReason.get(fx.reasonB.id).count, 0);
      },
    },
    {
      name: 'an institution without withdrawals has zero in every active reason',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('GET', '/api/student-withdrawals/stats', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 0);
        const byReason = new Map<number, any>(res.body.byReason.map((r: any) => [r.reasonId, r] as [number, any]));
        assert.equal(byReason.get(fx.reasonA.id).count, 0);
        assert.equal(byReason.get(fx.reasonB.id).count, 0);
        assert.equal(byReason.get(fx.reasonToDelete.id).count, 0);
        assert.equal(byReason.get(fx.reasonInactive.id), undefined, 'the inactive reason is not listed');
      },
    },
    {
      name: 'the withdrawals and reasons of another institution are never counted',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const student = await createStudent(other.institution.id);
        const enrollment = await createEnrollment(other.institution.id, student.id, other.course.id, other.year.id);
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true, canCreate: true }]);
        const { token } = await createUser(role.name, other.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: other.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: other.reasonA.id },
        });
        assert.equal(created.status, 201);

        const mine = await createUser(role.name, fx.institution.id);
        const res = await request('GET', '/api/student-withdrawals/stats', {
          token: mine.token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 0, 'the foreign withdrawal is not counted');
        const byReason = new Map<number, any>(res.body.byReason.map((r: any) => [r.reasonId, r] as [number, any]));
        assert.equal(byReason.get(other.reasonA.id), undefined, 'the foreign reason is not listed');
      },
    },
    {
      name: 'an invalid query is rejected with 400',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        for (const query of ['academic_year_id=0', 'academic_year_id=abc', 'course_id=-1', 'course_id=abc']) {
          const res = await request('GET', `/api/student-withdrawals/stats?${query}`, {
            token,
            institutionId: fx.institution.id,
          });
          assert.equal(res.status, 400, `${query} is rejected`);
          assert.equal(res.body.error, 'Parámetros de consulta inválidos');
        }
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// P1 — deleting a student keeps its behavior
// ─────────────────────────────────────────────────────────────────────
test('P1: deleting a student keeps its behavior and hides its withdrawals', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the student, its enrollments and absences are soft deleted and its withdrawal stays',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id);
        const enrollment = await createEnrollment(fx.institution.id, student.id, fx.course.id, fx.year.id);
        await AppDataSource.query(
          `INSERT INTO absences (enrollment_id, institution_id, date, type, notes)
           VALUES ($1, $2, $3, 'F', 'Falta de prueba')`,
          [enrollment.id, fx.institution.id, fx.narrowEnd],
        );

        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true },
          { resource: 'students', canRead: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/student-withdrawals', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reasonId: fx.reasonA.id },
        });
        assert.equal(created.status, 201);

        const res = await request('DELETE', `/api/students/${student.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 204);

        const [storedStudent] = await AppDataSource.query(`SELECT deleted_at FROM students WHERE id = $1`, [student.id]);
        assert.notEqual(storedStudent.deleted_at, null, 'the student is soft deleted');
        const [storedEnrollment] = await AppDataSource.query(`SELECT deleted_at FROM enrollments WHERE id = $1`, [enrollment.id]);
        assert.notEqual(storedEnrollment.deleted_at, null, 'the enrollment is soft deleted');
        const absences = await AppDataSource.query(`SELECT deleted_at FROM absences WHERE enrollment_id = $1`, [enrollment.id]);
        assert.notEqual(absences[0].deleted_at, null, 'the absence is soft deleted');

        const rows = await withdrawalsOf(fx.institution.id);
        assert.equal(rows.length, 1, 'the withdrawal row is still there');
        assert.equal(rows[0].reverted_at, null, 'the withdrawal was not touched');

        const list = await request('GET', '/api/student-withdrawals', { token, institutionId: fx.institution.id });
        assert.equal(list.status, 200);
        assert.deepEqual(list.body, [], 'the withdrawal is not listed anymore');

        const history = await request('GET', `/api/student-withdrawals/students/${student.id}/history`, {
          token,
          institutionId: fx.institution.id,
        });
        // The student is soft deleted, so its history is not visible at all.
        assert.equal(history.status, 404);
        assert.equal(history.body.error, 'Student not found');

        const stats = await request('GET', '/api/student-withdrawals/stats', { token, institutionId: fx.institution.id });
        assert.equal(stats.status, 200);
        assert.equal(stats.body.total, 0, 'the withdrawal is not counted');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});
