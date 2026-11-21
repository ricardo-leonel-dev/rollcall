// The parser reads its endpoints when the module loads, so the stand-in for
// the language model has to be announced before it is imported.
process.env.LLM_URL = 'http://127.0.0.1:18777';
process.env.IMAGE_LLM_URL = 'http://127.0.0.1:18777';

import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import authRouter from '../src/controllers/auth.controller';
import studentRouter from '../src/controllers/student.controller';
import enrollmentRouter from '../src/controllers/enrollment.controller';
import absenceRouter from '../src/controllers/absence.controller';
import justificationRouter from '../src/controllers/justification.controller';
import citationRouter from '../src/controllers/citation.controller';
import dashboardRouter from '../src/controllers/dashboard.controller';
import reportsRouter from '../src/controllers/reports.controller';
import studentHistoryRouter from '../src/controllers/student-history.controller';
import studentWithdrawalRouter from '../src/controllers/student-withdrawal.controller';
import withdrawalReasonRouter from '../src/controllers/withdrawal-reason.controller';
import courseRouter from '../src/controllers/course.controller';
import academicYearRouter from '../src/controllers/academic-year.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { AcademicYear } from '../src/entities/AcademicYear';
import { Course } from '../src/entities/Course';
import { Enrollment } from '../src/entities/Enrollment';
import { Guardian } from '../src/entities/Guardian';
import { Institution } from '../src/entities/Institution';
import { Quarter } from '../src/entities/Quarter';
import { Role } from '../src/entities/Role';
import { RolePermission } from '../src/entities/RolePermission';
import { Student } from '../src/entities/Student';
import { UserCourse } from '../src/entities/UserCourse';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';
import { fetchEnrollments, parsePhotoAbsence } from '../src/services/ai.service';

const MIGRATION_FILE = '30_student_withdrawals_stats_visibility.sql';
const MIGRATION_REINSTATE_FILE = '33_student_withdrawals_reinstate_permission.sql';

const TEST_INST_PREFIX = '__test_weh_inst_';
const TEST_ROLE_PREFIX = '__test_weh_role_';
const TEST_USER_PREFIX = 'testuser_weh_';

const VISIBILITY_VALUES = ['until_withdrawal', 'until_quarter_start', 'whole_year'];

// The academic year the fixture is built around. Today is inside it, so a
// withdrawal dated anywhere in it is accepted by the withdrawal endpoint.
const Y1_START = '2026-01-01';
const Y1_END = '2026-12-31';
const Q1_START = '2026-01-01';
const Q1_END = '2026-03-31';
const Q2_START = '2026-04-01';
const Q2_END = '2026-06-30';
const Q3_START = '2026-07-01';
const Q3_END = '2026-09-30';

const Y2_START = '2027-01-01';
const Y2_END = '2027-12-31';

const WITHDRAWAL_IN_Q3 = '2026-07-15';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;
let llmServer: http.Server;

// What the stand-in language model answers on the next call.
let llmAnswer = { date: '2026-07-15', records: [] as any[] };

let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
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

async function runMigration(filename: string = MIGRATION_FILE): Promise<void> {
  await AppDataSource.query(fs.readFileSync(migrationPath(filename), 'utf8'));
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
  await AppDataSource.query(
    `DELETE FROM justification_attachments WHERE justification_id IN (
        SELECT j.id FROM justifications j JOIN institutions i ON i.id = j.institution_id WHERE i.name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM justification_absences WHERE justification_id IN (
        SELECT j.id FROM justifications j JOIN institutions i ON i.id = j.institution_id WHERE i.name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM justifications WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await AppDataSource.query(
    `DELETE FROM citation_attachments WHERE citation_id IN (
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
    `DELETE FROM guardians WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
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
    `DELETE FROM quarters WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
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

async function createCourse(institutionId: number): Promise<Course> {
  const repo = AppDataSource.getRepository(Course);
  return repo.save(repo.create({
    name: uniqueName('__test_weh_course_'),
    fullName: null,
    section: null,
    institutionId,
    shift: 'MATUTINA',
    isActive: true,
    deletedAt: null,
  }));
}

async function createAcademicYear(
  institutionId: number,
  name: string,
  startDate: string,
  endDate: string,
  isActive: boolean,
): Promise<AcademicYear> {
  const repo = AppDataSource.getRepository(AcademicYear);
  return repo.save(repo.create({
    name,
    institutionId,
    startDate,
    endDate,
    isActive,
    deletedAt: null,
  }));
}

async function createQuarter(
  institutionId: number,
  academicYearId: number,
  name: string,
  sequenceNumber: number,
  startDate: string,
  endDate: string,
): Promise<Quarter> {
  const repo = AppDataSource.getRepository(Quarter);
  return repo.save(repo.create({
    academicYearId,
    institutionId,
    name,
    sequenceNumber,
    startDate,
    endDate,
    description: null,
    isActive: true,
    deletedAt: null,
  }));
}

async function createStudent(institutionId: number, name: string): Promise<Student> {
  const repo = AppDataSource.getRepository(Student);
  return repo.save(repo.create({
    idNumber: null,
    name,
    institutionId,
    gender: null,
    birthDate: null,
    isActive: true,
    deletedAt: null,
  }));
}

async function createGuardian(institutionId: number, name: string): Promise<Guardian> {
  const repo = AppDataSource.getRepository(Guardian);
  return repo.save(repo.create({
    name,
    institutionId,
    idNumber: null,
    phone: '0999999999',
    whatsappLink: 'https://wa.me/0999999999',
    email: null,
    isActive: true,
    deletedAt: null,
  }));
}

async function createEnrollment(
  institutionId: number,
  studentId: number,
  courseId: number,
  academicYearId: number,
  rosterNumber: number | null,
  guardianId: number | null = null,
): Promise<Enrollment> {
  const repo = AppDataSource.getRepository(Enrollment);
  return repo.save(repo.create({
    studentId,
    courseId,
    academicYearId,
    institutionId,
    guardianId,
    rosterNumber,
    studentPhone: null,
    studentEmail: null,
    createdByUserId: null,
    isActive: true,
    deletedAt: null,
  }));
}

async function insertAbsence(
  institutionId: number,
  enrollmentId: number,
  date: string,
  type: 'F' | 'AT' = 'F',
): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO absences (institution_id, enrollment_id, date, type) VALUES ($1, $2, $3, $4) RETURNING id`,
    [institutionId, enrollmentId, date, type],
  );
  return Number(row.id);
}

async function insertJustification(
  institutionId: number,
  enrollmentId: number,
  reason: string,
  absenceIds: number[],
): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO justifications (institution_id, enrollment_id, reason) VALUES ($1, $2, $3) RETURNING id`,
    [institutionId, enrollmentId, reason],
  );
  const id = Number(row.id);
  for (const absenceId of absenceIds) {
    await AppDataSource.query(
      `INSERT INTO justification_absences (justification_id, absence_id) VALUES ($1, $2)`,
      [id, absenceId],
    );
  }
  return id;
}

async function insertCitation(
  institutionId: number,
  enrollmentId: number,
  guardianId: number,
  date: string,
  time: string,
): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO citations (institution_id, enrollment_id, guardian_id, date, time, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
    [institutionId, enrollmentId, guardianId, date, time],
  );
  return Number(row.id);
}

async function insertWithdrawal(
  institutionId: number,
  enrollmentId: number,
  reasonId: number,
  withdrawalDate: string,
  statsVisibility?: string,
): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date, stats_visibility)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'until_withdrawal')) RETURNING id`,
    [institutionId, enrollmentId, reasonId, withdrawalDate, statsVisibility ?? null],
  );
  return Number(row.id);
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

interface Fixture {
  institution: Institution;
  otherInstitution: Institution;
  year: AcademicYear;
  secondYear: AcademicYear;
  overlapYear: AcademicYear;
  rosterCourse: Course;
  windowCourse: Course;
  scopeCourse: Course;
  overlapCourse: Course;
  foreignCourse: Course;
  reasonId: number;
  guardianId: number;
  token: string;
  otherToken: string;
}

async function createFixture(): Promise<Fixture> {
  const institution = await createTestInstitution();
  const otherInstitution = await createTestInstitution();

  const year = await createAcademicYear(institution.id, uniqueName('y'), Y1_START, Y1_END, true);
  await createQuarter(institution.id, year.id, 'Primer Trimestre', 1, Q1_START, Q1_END);
  await createQuarter(institution.id, year.id, 'Segundo Trimestre', 2, Q2_START, Q2_END);
  await createQuarter(institution.id, year.id, 'Tercer Trimestre', 3, Q3_START, Q3_END);

  const secondYear = await createAcademicYear(institution.id, uniqueName('y'), Y2_START, Y2_END, false);
  await createQuarter(institution.id, secondYear.id, 'Primer Trimestre', 1, '2027-01-01', '2027-03-31');
  await createQuarter(institution.id, secondYear.id, 'Segundo Trimestre', 2, '2027-04-01', '2027-06-30');
  await createQuarter(institution.id, secondYear.id, 'Tercer Trimestre', 3, '2027-07-01', '2027-09-30');

  // A year whose quarters overlap, so two of them contain the same day.
  const overlapYear = await createAcademicYear(institution.id, uniqueName('y'), Y1_START, Y1_END, false);
  await createQuarter(institution.id, overlapYear.id, 'Primer Trimestre', 1, Q1_START, Q1_END);
  await createQuarter(institution.id, overlapYear.id, 'Segundo Trimestre', 2, Q2_START, Q2_END);
  await createQuarter(institution.id, overlapYear.id, 'Tercer Trimestre', 3, Q3_START, Q3_END);
  await createQuarter(institution.id, overlapYear.id, 'Periodo Solapado', 4, '2026-06-15', '2026-08-15');

  const rosterCourse = await createCourse(institution.id);
  const windowCourse = await createCourse(institution.id);
  const scopeCourse = await createCourse(institution.id);
  const overlapCourse = await createCourse(institution.id);
  const foreignCourse = await createCourse(otherInstitution.id);

  const [reason] = await AppDataSource.query(
    `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, $2) RETURNING id`,
    [institution.id, 'Motivo de prueba'],
  );

  const guardian = await createGuardian(institution.id, 'REPRESENTANTE DE PRUEBA');

  const { token } = await createUser('superadmin', null);
  const { token: otherToken } = await createUser('superadmin', null);

  return {
    institution,
    otherInstitution,
    year,
    secondYear,
    overlapYear,
    rosterCourse,
    windowCourse,
    scopeCourse,
    overlapCourse,
    foreignCourse,
    reasonId: Number(reason.id),
    guardianId: guardian.id,
    token,
    otherToken,
  };
}

async function withdraw(
  fx: Fixture,
  enrollmentId: number,
  opts: { withdrawalDate?: string; statsVisibility?: unknown; notes?: string; token?: string } = {},
): Promise<{ status: number; body: any }> {
  const body: Record<string, unknown> = {
    enrollmentId,
    reasonId: fx.reasonId,
  };
  if (opts.withdrawalDate) body.withdrawalDate = opts.withdrawalDate;
  if (opts.statsVisibility !== undefined) body.statsVisibility = opts.statsVisibility;
  if (opts.notes !== undefined) body.notes = opts.notes;
  return request('POST', '/api/student-withdrawals', {
    token: opts.token ?? fx.token,
    institutionId: fx.institution.id,
    body,
  });
}

async function uploadFile(
  method: string,
  urlPath: string,
  field: string,
  fileName: string,
  token: string,
  institutionId: number,
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), fileName);
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
    },
    body: form,
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
  await AppDataSource.query(`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS academic_year_id INTEGER`);
  await runMigration();
  // The default of the visibility and the permission of the reinstatement
  // live in this migration; the cases below assert them.
  await runMigration(MIGRATION_REINSTATE_FILE);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRouter);
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/students', studentRouter);
  app.use('/api/enrollments', enrollmentRouter);
  app.use('/api/absences', absenceRouter);
  app.use('/api/justifications', justificationRouter);
  app.use('/api/citations', citationRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/student-history', studentHistoryRouter);
  app.use('/api/student-withdrawals', studentWithdrawalRouter);
  app.use('/api/withdrawal-reasons', withdrawalReasonRouter);
  app.use('/api/courses', courseRouter);
  app.use('/api/academic-years', academicYearRouter);
  app.use(errorMiddleware);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  llmServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(llmAnswer) } }] }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    llmServer.once('error', reject);
    llmServer.listen(18777, '127.0.0.1', () => resolve());
  });
});

after(async () => {
  await new Promise<void>((r) => llmServer.close(() => r()));
  await new Promise<void>((r) => server.close(() => r()));
  await cleanup();
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});

beforeEach(cleanup);

// ─────────────────────────────────────────────────────────────────────
// The visibility window of a withdrawn enrollment
// ─────────────────────────────────────────────────────────────────────
test('a withdrawn enrollment only shows the records dated inside its visibility window', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'until_withdrawal keeps the withdrawal day and drops the next one',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA HASTA RETIRO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const onDay = await insertAbsence(fx.institution.id, enrollment.id, WITHDRAWAL_IN_Q3);
        const nextDay = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-16');

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });
        assert.equal(created.status, 201);

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.status, 200);
        const dates = listed.body.map((a: any) => a.date).sort();
        assert.deepEqual(dates, [WITHDRAWAL_IN_Q3]);
        assert.ok(!listed.body.some((a: any) => a.id === nextDay));
        assert.ok(listed.body.some((a: any) => a.id === onDay));
      },
    },
    {
      name: 'until_quarter_start drops the quarter the withdrawal falls in',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA HASTA TRIMESTRE');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const lastVisible = await insertAbsence(fx.institution.id, enrollment.id, Q2_END);
        const firstHidden = await insertAbsence(fx.institution.id, enrollment.id, Q3_START);

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });
        assert.equal(created.status, 201);

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        const dates = listed.body.map((a: any) => a.date);
        assert.deepEqual(dates, [Q2_END]);
        assert.ok(!listed.body.some((a: any) => a.id === firstHidden));
        assert.ok(listed.body.some((a: any) => a.id === lastVisible));
      },
    },
    {
      name: 'a withdrawal on the first day of a quarter hides that whole quarter',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA PRIMER DIA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, Q2_END);
        await insertAbsence(fx.institution.id, enrollment.id, Q3_START);

        await withdraw(fx, enrollment.id, {
          withdrawalDate: Q3_START,
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body.map((a: any) => a.date), [Q2_END]);
      },
    },
    {
      name: 'a withdrawal inside the first quarter leaves nothing visible',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA PRIMER TRIMESTRE');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-01-15');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: '2026-02-15',
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body, []);
      },
    },
    {
      name: 'a date no quarter contains behaves like until_withdrawal',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA HUECO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-10-15');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-10-16');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: '2026-10-15',
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body.map((a: any) => a.date), ['2026-10-15']);
      },
    },
    {
      name: 'when two quarters contain the day the earlier start wins',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA SOLAPADA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.overlapCourse.id, fx.overlapYear.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-14');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-15');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body.map((a: any) => a.date), ['2026-06-14']);
      },
    },
    {
      name: 'a soft-deleted quarter is ignored',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA TRIMESTRE BORRADO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.overlapCourse.id, fx.overlapYear.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-30');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-14');

        await AppDataSource.query(
          `UPDATE quarters SET deleted_at = now(), is_active = FALSE
            WHERE academic_year_id = $1 AND name = 'Periodo Solapado'`,
          [fx.overlapYear.id],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body.map((a: any) => a.date).sort(), ['2026-06-14', '2026-06-30']);
      },
    },
    {
      name: 'whole_year hides every record of the enrollment',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA ANIO COMPLETO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-30');
        await insertAbsence(fx.institution.id, enrollment.id, WITHDRAWAL_IN_Q3);

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'whole_year',
        });

        const listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body, []);
      },
    },
    {
      name: 'editing the quarter dates moves the window on the next request',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VENTANA TRIMESTRE EDITADO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-07-04');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });

        let listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body, []);

        await AppDataSource.query(
          `UPDATE quarters SET start_date = '2026-07-05'
            WHERE academic_year_id = $1 AND name = 'Tercer Trimestre'`,
          [fx.year.id],
        );

        listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body.map((a: any) => a.date), ['2026-07-04']);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Choosing and exposing the visibility of a withdrawal
// ─────────────────────────────────────────────────────────────────────
test('a withdrawal stores and reports the visibility of its records', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the column exists with its default and its allowed values',
      run: async () => {
        const columns = await AppDataSource.query(
          `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'student_withdrawals'
              AND column_name = 'stats_visibility'`,
        );
        assert.equal(columns.length, 1, 'the column exists');
        const col = columns[0];
        assert.equal(col.data_type, 'character varying');
        assert.equal(col.character_maximum_length, 20);
        assert.equal(col.is_nullable, 'NO', 'the column is mandatory');
        assert.match(String(col.column_default), /whole_year/, 'the default is whole_year');

        const constraints = await AppDataSource.query(
          `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
            WHERE conrelid = 'student_withdrawals'::regclass AND contype = 'c'`,
        );
        const check = constraints.find((c: any) => c.def.includes('stats_visibility'));
        assert.ok(check, `a check constraint over the visibility exists: ${JSON.stringify(constraints)}`);
        for (const value of VISIBILITY_VALUES) {
          assert.ok(check.def.includes(value), `the check allows ${value}`);
        }
      },
    },
    {
      name: 'a row inserted without the column gets whole_year',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VALOR POR DEFECTO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );

        const [row] = await AppDataSource.query(
          `INSERT INTO student_withdrawals (institution_id, enrollment_id, reason_id, withdrawal_date)
           VALUES ($1, $2, $3, $4) RETURNING id, stats_visibility`,
          [fx.institution.id, enrollment.id, fx.reasonId, WITHDRAWAL_IN_Q3],
        );
        assert.equal(row.stats_visibility, 'whole_year');
      },
    },
    {
      name: 'a withdrawal without a visibility defaults to whole_year',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO SIN VISIBILIDAD');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );

        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        assert.equal(created.status, 201);
        assert.equal(created.body.statsVisibility, 'whole_year');
      },
    },
    {
      name: 'each allowed visibility is stored and returned as sent',
      run: async () => {
        for (const value of VISIBILITY_VALUES) {
          const fx = await createFixture();
          const student = await createStudent(fx.institution.id, `RETIRO ${value}`);
          const enrollment = await createEnrollment(
            fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
          );

          const created = await withdraw(fx, enrollment.id, {
            withdrawalDate: WITHDRAWAL_IN_Q3,
            statsVisibility: value,
          });
          assert.equal(created.status, 201);
          assert.equal(created.body.statsVisibility, value);

          const stored = await AppDataSource.query(
            `SELECT stats_visibility FROM student_withdrawals WHERE id = $1`,
            [created.body.id],
          );
          assert.equal(stored[0].stats_visibility, value);
        }
      },
    },
    {
      name: 'an invalid visibility is rejected without storing anything',
      run: async () => {
        for (const value of ['foo', '', null, 1]) {
          const fx = await createFixture();
          const student = await createStudent(fx.institution.id, 'RETIRO VISIBILIDAD INVALIDA');
          const enrollment = await createEnrollment(
            fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
          );

          const created = await withdraw(fx, enrollment.id, {
            withdrawalDate: WITHDRAWAL_IN_Q3,
            statsVisibility: value,
          });
          assert.equal(created.status, 400, `value ${JSON.stringify(value)} is rejected`);
          assert.equal(created.body.error, 'statsVisibility inválido');

          const rows = await AppDataSource.query(
            `SELECT id FROM student_withdrawals WHERE institution_id = $1`,
            [fx.institution.id],
          );
          assert.equal(rows.length, 0, 'no row was stored');
          const events = await eventsOf(fx.institution.id);
          assert.equal(events.length, 0, 'no event was recorded');
        }
      },
    },
    {
      name: 'every listing and response carries the visibility',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO VISIBLE EN LISTAS');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });
        assert.equal(created.status, 201);

        const list = await request('GET', '/api/student-withdrawals', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(list.status, 200);
        assert.equal(list.body.length, 1);
        assert.equal(list.body[0].statsVisibility, 'until_quarter_start');

        const history = await request('GET', `/api/student-withdrawals/students/${student.id}/history`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(history.status, 200);
        assert.equal(history.body.length, 1);
        assert.equal(history.body[0].statsVisibility, 'until_quarter_start');

        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 200);
        assert.equal(reverted.body.statsVisibility, 'until_quarter_start');
      },
    },
    {
      name: 'the audit trail of the withdrawal carries the visibility',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO CON AUDITORIA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'whole_year',
        });
        assert.equal(created.status, 201);

        const events = await eventsOf(fx.institution.id);
        const withdrawn = events.find((e: any) => e.event_type === 'StudentWithdrawn');
        assert.ok(withdrawn, 'the withdrawal is audited');
        assert.equal(withdrawn.payload.after.statsVisibility, 'whole_year');

        await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        const after = await eventsOf(fx.institution.id);
        const reinstated = after.find((e: any) => e.event_type === 'StudentReinstated');
        assert.ok(reinstated, 'the reinstating is audited');
        assert.equal(reinstated.payload.before.statsVisibility, 'whole_year');
        assert.equal(reinstated.payload.after.statsVisibility, 'whole_year');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Changing the visibility of a withdrawal
// ─────────────────────────────────────────────────────────────────────
test('the visibility of a withdrawal can be changed', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a valid visibility is stored and audited',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'CAMBIO DE VISIBILIDAD');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });
        assert.equal(created.status, 201);

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'until_quarter_start' },
        });
        assert.equal(patched.status, 200);
        assert.equal(patched.body.statsVisibility, 'until_quarter_start');
        assert.equal(patched.body.enrollmentId, enrollment.id);
        assert.equal(patched.body.withdrawalDate, WITHDRAWAL_IN_Q3);
        assert.equal(patched.body.reason.id, fx.reasonId);

        const events = await eventsOf(fx.institution.id);
        const changed = events.filter((e: any) => e.event_type === 'WithdrawalVisibilityChanged');
        assert.equal(changed.length, 1, 'exactly one event');
        assert.equal(changed[0].entity_type, 'student_withdrawal');
        assert.equal(Number(changed[0].entity_id), created.body.id);
        assert.equal(changed[0].payload.before.statsVisibility, 'until_withdrawal');
        assert.equal(changed[0].payload.after.statsVisibility, 'until_quarter_start');
      },
    },
    {
      name: 'the new visibility governs the records that are listed',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'CAMBIO APLICA A LAS LISTAS');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, Q2_END);
        await insertAbsence(fx.institution.id, enrollment.id, WITHDRAWAL_IN_Q3);

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });
        let listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.body.length, 2);

        await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'until_quarter_start' },
        });

        listed = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(listed.body.map((a: any) => a.date), [Q2_END]);
      },
    },
    {
      name: 'setting the same visibility changes nothing and audits nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'MISMA VISIBILIDAD');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const before = await eventsOf(fx.institution.id);
        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'until_withdrawal' },
        });
        assert.equal(patched.status, 200);
        assert.equal(patched.body.statsVisibility, 'until_withdrawal');

        const after = await eventsOf(fx.institution.id);
        assert.equal(after.length, before.length, 'no new event');
      },
    },
    {
      name: 'the other fields of the body are ignored',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'CAMPO EXTRA IGNORADO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          notes: 'Observación original',
        });

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: {
            statsVisibility: 'whole_year',
            reasonId: 999999,
            withdrawalDate: '2026-01-05',
            notes: 'Otra observación',
          },
        });
        assert.equal(patched.status, 200);
        assert.equal(patched.body.statsVisibility, 'whole_year');
        assert.equal(patched.body.withdrawalDate, WITHDRAWAL_IN_Q3, 'the withdrawal date did not move');
        assert.equal(patched.body.notes, 'Observación original', 'the notes did not change');
        assert.equal(patched.body.reason.id, fx.reasonId, 'the reason did not change');
      },
    },
    {
      name: 'a withdrawal of another institution or nonexistent is not found',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO AJENO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const other = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: fx.otherToken, institutionId: fx.otherInstitution.id,
          body: { statsVisibility: 'whole_year' },
        });
        assert.equal(other.status, 404);
        assert.equal(other.body.error, 'Retiro no encontrado');

        const missing = await request('PATCH', '/api/student-withdrawals/987654', {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'whole_year' },
        });
        assert.equal(missing.status, 404);
        assert.equal(missing.body.error, 'Retiro no encontrado');

        const notANumber = await request('PATCH', '/api/student-withdrawals/abc', {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'whole_year' },
        });
        assert.equal(notANumber.status, 404);
        assert.equal(notANumber.body.error, 'Retiro no encontrado');
      },
    },
    {
      name: 'a withdrawal out of the course scope of the caller is not found',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO FUERA DE AMBITO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canUpdate: true },
        ]);
        const scoped = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(scoped.id, fx.scopeCourse.id, fx.year.id);

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: scoped.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'whole_year' },
        });
        assert.equal(patched.status, 404);
        assert.equal(patched.body.error, 'Retiro no encontrado');
      },
    },
    {
      name: 'a reverted withdrawal cannot change its visibility',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO REVERTIDO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'whole_year' },
        });
        assert.equal(patched.status, 409);
        assert.equal(patched.body.error, 'El retiro ya fue revertido');
      },
    },
    {
      name: 'a missing or invalid visibility is rejected',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO VISIBILIDAD FALTANTE');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        for (const body of [{}, { statsVisibility: 'foo' }, { statsVisibility: '' }, { statsVisibility: null }]) {
          const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
            token: fx.token, institutionId: fx.institution.id, body,
          });
          assert.equal(patched.status, 400, `body ${JSON.stringify(body)} is rejected`);
          assert.equal(patched.body.error, 'statsVisibility inválido');
        }

        const stored = await AppDataSource.query(
          `SELECT stats_visibility FROM student_withdrawals WHERE id = $1`,
          [created.body.id],
        );
        assert.equal(stored[0].stats_visibility, 'until_withdrawal', 'the value did not change');
      },
    },
    {
      name: 'a caller without the update permission is refused',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'RETIRO SIN PERMISO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const role = await createTestRole([
          { resource: 'student-withdrawals', canRead: true },
        ]);
        const reader = await createUser(role.name, fx.institution.id);

        const patched = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: reader.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'whole_year' },
        });
        assert.equal(patched.status, 403);
      },
    },
    {
      name: 'the checks keep their order: not found, then reverted, then an invalid visibility',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ORDEN DE LAS COMPROBACIONES');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        assert.equal(created.status, 201);
        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 200);

        // The reverted withdrawal is refused before the value of the body is read.
        const onReverted = await request('PATCH', `/api/student-withdrawals/${created.body.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'foo' },
        });
        assert.equal(onReverted.status, 409);
        assert.equal(onReverted.body.error, 'El retiro ya fue revertido');

        // A withdrawal of another institution is not found before the reverted
        // one is judged and before the value of the body is read.
        const foreignYear = await createAcademicYear(
          fx.otherInstitution.id, uniqueName('y'), Y1_START, Y1_END, true,
        );
        const foreignStudent = await createStudent(fx.otherInstitution.id, 'ESTUDIANTE AJENO');
        const foreignEnrollment = await createEnrollment(
          fx.otherInstitution.id, foreignStudent.id, fx.foreignCourse.id, foreignYear.id, 1, null,
        );
        const [foreignReason] = await AppDataSource.query(
          `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, $2) RETURNING id`,
          [fx.otherInstitution.id, 'Motivo ajeno'],
        );
        const foreignCreated = await request('POST', '/api/student-withdrawals', {
          token: fx.otherToken, institutionId: fx.otherInstitution.id,
          body: {
            enrollmentId: foreignEnrollment.id,
            reasonId: Number(foreignReason.id),
            withdrawalDate: WITHDRAWAL_IN_Q3,
          },
        });
        assert.equal(foreignCreated.status, 201);
        const foreignReverted = await request(
          'POST', `/api/student-withdrawals/${foreignCreated.body.id}/revert`,
          { token: fx.otherToken, institutionId: fx.otherInstitution.id },
        );
        assert.equal(foreignReverted.status, 200);

        const onForeign = await request('PATCH', `/api/student-withdrawals/${foreignCreated.body.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { statsVisibility: 'foo' },
        });
        assert.equal(onForeign.status, 404);
        assert.equal(onForeign.body.error, 'Retiro no encontrado');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Withdrawn enrollments leave the rosters
// ─────────────────────────────────────────────────────────────────────
test('a withdrawn enrollment is not part of the rosters', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'it is left out of the enrollment list whatever its visibility',
      run: async () => {
        for (const value of VISIBILITY_VALUES) {
          const fx = await createFixture();
          const student = await createStudent(fx.institution.id, `LISTA ${value}`);
          const enrollment = await createEnrollment(
            fx.institution.id, student.id, fx.rosterCourse.id, fx.year.id, 1, fx.guardianId,
          );
          const created = await withdraw(fx, enrollment.id, {
            withdrawalDate: WITHDRAWAL_IN_Q3,
            statsVisibility: value,
          });
          assert.equal(created.status, 201);

          const all = await request('GET', '/api/enrollments', {
            token: fx.token, institutionId: fx.institution.id,
          });
          assert.equal(all.status, 200);
          assert.ok(!all.body.some((e: any) => e.enrollmentId === enrollment.id), `not listed with ${value}`);

          const byStudent = await request('GET', `/api/enrollments?student_id=${student.id}`, {
            token: fx.token, institutionId: fx.institution.id,
          });
          assert.deepEqual(byStudent.body, [], `not listed by student with ${value}`);

          const byCourse = await request(
            'GET',
            `/api/enrollments?course_id=${fx.rosterCourse.id}&academic_year_id=${fx.year.id}`,
            { token: fx.token, institutionId: fx.institution.id },
          );
          assert.ok(!byCourse.body.some((e: any) => e.enrollmentId === enrollment.id), `not listed by course with ${value}`);
        }
      },
    },
    {
      name: 'it is left out of the citations roster',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'LISTA DE CITACIONES');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.rosterCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const roster = await request(
          'GET',
          `/api/citations?course_id=${fx.rosterCourse.id}&academic_year_id=${fx.year.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(roster.status, 200);
        assert.ok(!roster.body.some((e: any) => e.enrollmentId === enrollment.id), 'not in the roster');
      },
    },
    {
      name: 'the roster keeps its stored numbers and the gap left by a withdrawal',
      run: async () => {
        const fx = await createFixture();
        const enrollments: Enrollment[] = [];
        for (let number = 1; number <= 5; number += 1) {
          const student = await createStudent(fx.institution.id, `NUMERO ${number}`);
          enrollments.push(await createEnrollment(
            fx.institution.id, student.id, fx.rosterCourse.id, fx.year.id, number, fx.guardianId,
          ));
        }

        const listed = await request(
          'GET',
          `/api/enrollments?course_id=${fx.rosterCourse.id}&academic_year_id=${fx.year.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.map((e: any) => e.rosterNumber), [1, 2, 3, 4, 5]);

        await withdraw(fx, enrollments[3].id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const after = await request(
          'GET',
          `/api/enrollments?course_id=${fx.rosterCourse.id}&academic_year_id=${fx.year.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.deepEqual(after.body.map((e: any) => e.rosterNumber), [1, 2, 3, 5]);

        const roster = await request(
          'GET',
          `/api/citations?course_id=${fx.rosterCourse.id}&academic_year_id=${fx.year.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.deepEqual(roster.body.map((e: any) => e.rosterNumber), [1, 2, 3, 5]);
      },
    },
    {
      name: 'an enrollment without a stored number is listed last, by name',
      run: async () => {
        const fx = await createFixture();
        const numbered = await createStudent(fx.institution.id, 'CON NUMERO');
        await createEnrollment(fx.institution.id, numbered.id, fx.rosterCourse.id, fx.year.id, 7, fx.guardianId);
        const first = await createStudent(fx.institution.id, 'SIN NUMERO ALFA');
        await createEnrollment(fx.institution.id, first.id, fx.rosterCourse.id, fx.year.id, null, fx.guardianId);
        const second = await createStudent(fx.institution.id, 'SIN NUMERO BRAVO');
        await createEnrollment(fx.institution.id, second.id, fx.rosterCourse.id, fx.year.id, null, fx.guardianId);

        const listed = await request(
          'GET',
          `/api/enrollments?course_id=${fx.rosterCourse.id}&academic_year_id=${fx.year.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.map((e: any) => e.rosterNumber), [7, null, null]);
        assert.deepEqual(
          listed.body.slice(1).map((e: any) => e.fullName),
          ['SIN NUMERO ALFA', 'SIN NUMERO BRAVO'],
        );
      },
    },
    {
      name: 'an enrollment whose withdrawal was reverted is listed again',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'REVERTIDO EN LISTA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.rosterCourse.id, fx.year.id, 3, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });

        const listed = await request(
          'GET',
          `/api/enrollments?course_id=${fx.rosterCourse.id}&academic_year_id=${fx.year.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(listed.status, 200);
        const found = listed.body.find((e: any) => e.enrollmentId === enrollment.id);
        assert.ok(found, 'the enrollment is listed again');
        assert.equal(found.rosterNumber, 3);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The records of a withdrawn enrollment leave the lists
// ─────────────────────────────────────────────────────────────────────
test('the records of a withdrawn enrollment outside its window leave the lists', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the absences of another enrollment are not affected',
      run: async () => {
        const fx = await createFixture();
        const withdrawnStudent = await createStudent(fx.institution.id, 'FALTAS RETIRADO');
        const withdrawn = await createEnrollment(
          fx.institution.id, withdrawnStudent.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const activeStudent = await createStudent(fx.institution.id, 'FALTAS ACTIVO');
        const active = await createEnrollment(
          fx.institution.id, activeStudent.id, fx.windowCourse.id, fx.year.id, 2, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, withdrawn.id, '2026-07-20');
        await insertAbsence(fx.institution.id, active.id, '2026-07-20');

        await withdraw(fx, withdrawn.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const listed = await request('GET', '/api/absences', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.map((a: any) => a.enrollmentId), [active.id]);
      },
    },
    {
      name: 'a justification whose absences are all inside the window keeps every link',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'JUSTIFICACION COMPLETA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const first = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-10');
        const second = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-15');
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'ENFERMEDAD', [first, second],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const listed = await request('GET', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.status, 200);
        const found = listed.body.find((j: any) => j.id === justification);
        assert.ok(found, 'the justification is listed');
        assert.deepEqual([...found.absenceIds].sort(), [first, second].sort());
        assert.deepEqual(found.absenceDates.map((a: any) => a.id).sort(), [first, second].sort());
      },
    },
    {
      name: 'a justification that spans the cutoff only carries the links inside the window',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'JUSTIFICACION PARTIDA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const inside = await insertAbsence(fx.institution.id, enrollment.id, Q2_END);
        const outside = await insertAbsence(fx.institution.id, enrollment.id, Q3_START);
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'PERMISO', [inside, outside],
        );
        await AppDataSource.query(
          `INSERT INTO justification_attachments (justification_id, file_name, original_name, mime_type)
           VALUES ($1, 'prueba.pdf', 'prueba.pdf', 'application/pdf')`,
          [justification],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
        });
        const found = listed.body.find((j: any) => j.id === justification);
        assert.ok(found, 'the justification is listed');
        assert.deepEqual(found.absenceIds, [inside]);
        assert.deepEqual(found.absenceDates.map((a: any) => a.id), [inside]);
        assert.equal(found.reason, 'PERMISO', 'the reason did not change');
        assert.equal(found.attachments.length, 1, 'the attachment is still there');
      },
    },
    {
      name: 'a justification whose absences are all outside the window is not listed',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'JUSTIFICACION FUERA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const outside = await insertAbsence(fx.institution.id, enrollment.id, Q3_START);
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'FUERA DE VENTANA', [outside],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.ok(!listed.body.some((j: any) => j.id === justification), 'the justification is not listed');
      },
    },
    {
      name: 'a justification whose only absence was deleted is not listed',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'JUSTIFICACION SIN FALTAS');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const deleted = await insertAbsence(fx.institution.id, enrollment.id, Q2_END);
        await AppDataSource.query(
          `UPDATE absences SET deleted_at = now(), is_active = FALSE WHERE id = $1`,
          [deleted],
        );
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'SIN FALTAS VIVAS', [deleted],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request('GET', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.ok(!listed.body.some((j: any) => j.id === justification), 'the justification is not listed');
      },
    },
    {
      name: 'a range that only covers the absences outside the window returns nothing',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'JUSTIFICACION POR RANGO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const inside = await insertAbsence(fx.institution.id, enrollment.id, Q2_END);
        const outside = await insertAbsence(fx.institution.id, enrollment.id, Q3_START);
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'RANGO', [inside, outside],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });

        const listed = await request(
          'GET',
          `/api/justifications?date_from=${Q3_START}&date_to=${Q3_END}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(listed.status, 200);
        assert.ok(!listed.body.some((j: any) => j.id === justification), 'the justification is not listed');
      },
    },
    {
      name: 'the citations of a withdrawn enrollment are filtered by their date',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'CITACIONES VENTANA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const inside = await insertCitation(fx.institution.id, enrollment.id, fx.guardianId, '2026-07-15', '08:00');
        const outside = await insertCitation(fx.institution.id, enrollment.id, fx.guardianId, '2026-07-16', '09:00');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const listed = await request('GET', `/api/citations?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.map((c: any) => c.id), [inside]);
        assert.ok(!listed.body.some((c: any) => c.id === outside));
      },
    },
    {
      name: 'whole_year leaves nothing of the enrollment in the lists',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'TODO OCULTO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const absence = await insertAbsence(fx.institution.id, enrollment.id, '2026-06-30');
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'OCULTA', [absence],
        );
        await insertCitation(fx.institution.id, enrollment.id, fx.guardianId, '2026-06-30', '08:00');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'whole_year',
        });

        const absences = await request('GET', '/api/absences', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(absences.body, []);

        const justifications = await request('GET', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.ok(!justifications.body.some((j: any) => j.id === justification));

        const citations = await request('GET', `/api/citations?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(citations.status, 200);
        assert.deepEqual(citations.body, []);
      },
    },
    {
      name: 'a justification of an active enrollment keeps its deleted absences in its links',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'JUSTIFICACION ACTIVA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const live = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-10');
        const deleted = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-12');
        await AppDataSource.query(
          `UPDATE absences SET deleted_at = now(), is_active = FALSE WHERE id = $1`,
          [deleted],
        );
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'MIXTA', [live, deleted],
        );

        const listed = await request('GET', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
        });
        const found = listed.body.find((j: any) => j.id === justification);
        assert.ok(found, 'the justification is listed');
        assert.deepEqual([...found.absenceIds].sort(), [live, deleted].sort());
        assert.deepEqual(found.absenceDates.map((a: any) => a.id).sort(), [live, deleted].sort());
      },
    },
    {
      name: 'a caller scoped to other courses is not affected',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'CITACIONES FUERA DE AMBITO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertCitation(fx.institution.id, enrollment.id, fx.guardianId, '2026-07-16', '09:00');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const role = await createTestRole([
          { resource: 'citaciones', canRead: true },
          { resource: 'absences', canRead: true },
        ]);
        const scoped = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(scoped.id, fx.scopeCourse.id, fx.year.id);

        const citations = await request('GET', `/api/citations?enrollment_id=${enrollment.id}`, {
          token: scoped.token, institutionId: fx.institution.id,
        });
        assert.equal(citations.status, 404, 'the enrollment of another course is not found');

        const absences = await request('GET', '/api/absences', {
          token: scoped.token, institutionId: fx.institution.id,
        });
        assert.equal(absences.status, 200);
        assert.deepEqual(absences.body, []);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The figures of a withdrawn enrollment leave the aggregates
// ─────────────────────────────────────────────────────────────────────
test('the figures of a withdrawn enrollment only count the records inside its window', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the dashboard only counts the absences inside the window',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'TABLERO RETIRADO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const before = await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25', 'F');
        const onDay = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-15', 'F');
        const after = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20', 'AT');
        await insertJustification(fx.institution.id, enrollment.id, 'JUSTIFICADA', [before, after]);

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const summary = await request('GET', '/api/dashboard/summary', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(summary.status, 200);
        assert.equal(summary.body.totalAbsences, 2, 'the absence after the window does not count');
        assert.equal(summary.body.totalTardies, 0, 'the tardy after the window does not count');
        assert.equal(summary.body.justifiedCount, 1);
        assert.equal(summary.body.unjustifiedCount, 1);

        const top = summary.body.topStudents.find((s: any) => s.studentName === 'TABLERO RETIRADO');
        assert.ok(top, 'the student is in the ranking');
        assert.equal(Number(top.totalAbsences), 1);
        assert.equal(Number(top.totalTardies), 0);
        assert.equal(Number(top.totalJustified), 1);
        assert.deepEqual(
          top.breakdown.map((b: any) => b.date),
          ['2026-06-25', '2026-07-15'],
        );

        const course = summary.body.byCourse.find((c: any) => c.course === fx.windowCourse.name);
        assert.equal(course.totalAbsences, 2);
        assert.equal(course.totalTardies, 0);

        assert.deepEqual(
          summary.body.absencesByDay.map((d: any) => d.date),
          ['2026-06-25', '2026-07-15'],
        );
        assert.ok(!summary.body.absencesByDay.some((d: any) => d.date === '2026-07-20'));
        assert.ok(top.breakdown.some((b: any) => b.date === '2026-07-15'));
        assert.ok(!top.breakdown.some((b: any) => b.date === '2026-07-20'));
      },
    },
    {
      name: 'the justified figure matches the absences the listed justifications carry',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'COHERENCIA DE CIFRAS');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const before = await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25', 'F');
        const after = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20', 'F');
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'PARTE DE LA JUSTIFICACION', [before, after],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const listed = await request('GET', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
        });
        const found = listed.body.find((j: any) => j.id === justification);
        assert.ok(found, 'the justification is listed');

        const summary = await request('GET', '/api/dashboard/summary', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(summary.body.justifiedCount, found.absenceDates.length);

        const report = await request(
          'GET',
          `/api/reports/student-summary?course_ids=${fx.windowCourse.id}&academic_year_id=${fx.year.id}` +
            '&date_from=2026-01-01&date_to=2026-12-31',
          { token: fx.token, institutionId: fx.institution.id },
        );
        const course = report.body.find((c: any) => c.course.id === fx.windowCourse.id);
        const studentRow = course.students.find((s: any) => s.studentName === 'COHERENCIA DE CIFRAS');
        assert.equal(studentRow.justified, found.absenceDates.length);
      },
    },
    {
      name: 'the student report counts only the absences inside the window',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'INFORME VENTANA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25', 'F');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-07-15', 'F');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20', 'AT');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const report = await request(
          'GET',
          `/api/reports/student-summary?course_ids=${fx.windowCourse.id}&academic_year_id=${fx.year.id}` +
            '&date_from=2026-01-01&date_to=2026-12-31',
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(report.status, 200);
        const course = report.body.find((c: any) => c.course.id === fx.windowCourse.id);
        const row = course.students.find((s: any) => s.studentName === 'INFORME VENTANA');
        assert.ok(row, 'the student is in the report');
        assert.equal(row.absences, 2);
        assert.equal(row.tardies, 0);
      },
    },
    {
      name: 'a period that starts after the window leaves the student out',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'INFORME POSTERIOR');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20', 'F');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const report = await request(
          'GET',
          `/api/reports/student-summary?course_ids=${fx.windowCourse.id}&academic_year_id=${fx.year.id}` +
            '&date_from=2026-07-16&date_to=2026-12-31',
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(report.status, 200);
        const course = report.body.find((c: any) => c.course.id === fx.windowCourse.id);
        if (course) {
          assert.ok(!course.students.some((s: any) => s.studentName === 'INFORME POSTERIOR'));
        }
      },
    },
    {
      name: 'whole_year leaves the student out of the report',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'INFORME ANIO COMPLETO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25', 'F');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'whole_year',
        });

        const report = await request(
          'GET',
          `/api/reports/student-summary?course_ids=${fx.windowCourse.id}&academic_year_id=${fx.year.id}` +
            '&date_from=2026-01-01&date_to=2026-12-31',
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(report.status, 200);
        const course = report.body.find((c: any) => c.course.id === fx.windowCourse.id);
        if (course) {
          assert.ok(!course.students.some((s: any) => s.studentName === 'INFORME ANIO COMPLETO'));
        }
      },
    },
    {
      name: 'reinstating the enrollment brings its figures back',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'FIGURAS REVERTIDAS');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25', 'F');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20', 'AT');

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });
        await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });

        const summary = await request('GET', '/api/dashboard/summary', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(summary.body.totalAbsences, 1);
        assert.equal(summary.body.totalTardies, 1);

        const report = await request(
          'GET',
          `/api/reports/student-summary?course_ids=${fx.windowCourse.id}&academic_year_id=${fx.year.id}` +
            '&date_from=2026-01-01&date_to=2026-12-31',
          { token: fx.token, institutionId: fx.institution.id },
        );
        const course = report.body.find((c: any) => c.course.id === fx.windowCourse.id);
        const row = course.students.find((s: any) => s.studentName === 'FIGURAS REVERTIDAS');
        assert.ok(row, 'the student is in the report');
        assert.equal(row.absences, 1);
        assert.equal(row.tardies, 1);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The roster handed to the voice and photo parsers
// ─────────────────────────────────────────────────────────────────────
test('the roster handed to the parsers leaves out the withdrawn enrollments', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the roster of the course does not carry the withdrawn enrollment',
      run: async () => {
        const fx = await createFixture();
        const withdrawnStudent = await createStudent(fx.institution.id, 'VOZ RETIRADO');
        const withdrawn = await createEnrollment(
          fx.institution.id, withdrawnStudent.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const activeStudent = await createStudent(fx.institution.id, 'VOZ ACTIVO');
        const active = await createEnrollment(
          fx.institution.id, activeStudent.id, fx.windowCourse.id, fx.year.id, 2, fx.guardianId,
        );

        await withdraw(fx, withdrawn.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const roster = await fetchEnrollments(fx.windowCourse.id, fx.year.id, fx.institution.id);
        assert.deepEqual(roster.map((r: any) => r.enrollment_id), [active.id]);
      },
    },
    {
      name: 'a name answered with a withdrawn enrollment is reported as not found',
      run: async () => {
        const fx = await createFixture();
        const withdrawnStudent = await createStudent(fx.institution.id, 'FOTO RETIRADO');
        const withdrawn = await createEnrollment(
          fx.institution.id, withdrawnStudent.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const activeStudent = await createStudent(fx.institution.id, 'FOTO ACTIVO');
        const active = await createEnrollment(
          fx.institution.id, activeStudent.id, fx.windowCourse.id, fx.year.id, 2, fx.guardianId,
        );

        await withdraw(fx, withdrawn.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        llmAnswer = {
          date: '2026-07-15',
          records: [
            { name: 'FOTO RETIRADO', enrollmentId: withdrawn.id, type: 'F', confidence: 0.9 },
            { name: 'FOTO ACTIVO', enrollmentId: active.id, type: 'F', confidence: 0.9 },
          ],
        };

        const preview = await parsePhotoAbsence(
          Buffer.from('falso'), 'image/png', fx.institution.id, fx.windowCourse.id, fx.year.id, '2026-07-15',
        );
        assert.deepEqual(preview.notFound, ['FOTO RETIRADO']);
        assert.deepEqual(preview.matched.map((m: any) => m.enrollmentId), [active.id]);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// A withdrawn enrollment is read-only
// ─────────────────────────────────────────────────────────────────────
test('a write on a withdrawn enrollment is refused', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the absences of the enrollment cannot be written',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ESCRITURA FALTAS');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const inside = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-10');
        const outside = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20');

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const eventsBefore = (await eventsOf(fx.institution.id)).length;

        const created = await request('POST', '/api/absences', {
          token: fx.token, institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, type: 'F', dateFrom: '2026-07-21', dateTo: '2026-07-21' },
        });
        assert.equal(created.status, 409);
        assert.equal(created.body.error, 'La matrícula está retirada');

        const updated = await request('PUT', `/api/absences/${outside}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { notes: 'Cambio' },
        });
        assert.equal(updated.status, 409);
        assert.equal(updated.body.error, 'La matrícula está retirada');

        const deleted = await request('DELETE', `/api/absences/${outside}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(deleted.status, 409);
        assert.equal(deleted.body.error, 'La matrícula está retirada');

        const updatedInside = await request('PUT', `/api/absences/${inside}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { notes: 'Cambio' },
        });
        assert.equal(updatedInside.status, 409, 'a record inside the window is read-only too');

        const absences = await AppDataSource.query(
          `SELECT id, notes, deleted_at FROM absences WHERE enrollment_id = $1 ORDER BY id`,
          [enrollment.id],
        );
        assert.equal(absences.length, 2, 'no absence was added');
        assert.equal(absences[0].notes, null, 'the absence did not change');
        assert.equal(absences[1].notes, null, 'the absence did not change');
        assert.equal(absences[1].deleted_at, null, 'the absence was not deleted');

        const eventsAfter = await eventsOf(fx.institution.id);
        assert.equal(eventsAfter.length, eventsBefore, 'no event was recorded');
      },
    },
    {
      name: 'the justifications of the enrollment cannot be written',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ESCRITURA JUSTIFICACIONES');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const absence = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-10');
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'MOTIVO', [absence],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const eventsBefore = (await eventsOf(fx.institution.id)).length;

        const created = await request('POST', '/api/justifications', {
          token: fx.token, institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, reason: 'NUEVO', absenceIds: [absence] },
        });
        assert.equal(created.status, 409);
        assert.equal(created.body.error, 'La matrícula está retirada');

        const updated = await request('PUT', `/api/justifications/${justification}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { reason: 'OTRO MOTIVO' },
        });
        assert.equal(updated.status, 409);

        const deleted = await request('DELETE', `/api/justifications/${justification}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(deleted.status, 409);

        const rows = await AppDataSource.query(
          `SELECT reason, deleted_at FROM justifications WHERE id = $1`,
          [justification],
        );
        assert.equal(rows[0].reason, 'MOTIVO', 'the justification did not change');
        assert.equal(rows[0].deleted_at, null, 'the justification was not deleted');

        const count = await AppDataSource.query(
          `SELECT COUNT(*)::int AS count FROM justifications WHERE enrollment_id = $1`,
          [enrollment.id],
        );
        assert.equal(count[0].count, 1, 'no justification was added');

        const eventsAfter = await eventsOf(fx.institution.id);
        assert.equal(eventsAfter.length, eventsBefore, 'no event was recorded');
      },
    },
    {
      name: 'the attachments of a justification of the enrollment cannot be written',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ADJUNTOS JUSTIFICACION');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const absence = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-10');
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'MOTIVO', [absence],
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const dir = path.join(process.cwd(), 'uploads', 'justifications');
        const before = fs.readdirSync(dir);

        const added = await uploadFile(
          'POST', `/api/justifications/${justification}/attachments`, 'files', 'prueba.pdf',
          fx.token, fx.institution.id,
        );
        assert.equal(added.status, 409);
        assert.equal(added.body.error, 'La matrícula está retirada');
        assert.deepEqual(fs.readdirSync(dir), before, 'the uploaded file was removed');

        const [attachment] = await AppDataSource.query(
          `INSERT INTO justification_attachments (justification_id, file_name, original_name, mime_type)
           VALUES ($1, 'existente.pdf', 'existente.pdf', 'application/pdf') RETURNING id`,
          [justification],
        );
        const removed = await request(
          'DELETE', `/api/justifications/${justification}/attachments/${attachment.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(removed.status, 409);

        const rows = await AppDataSource.query(
          `SELECT id FROM justification_attachments WHERE justification_id = $1`,
          [justification],
        );
        assert.equal(rows.length, 1, 'the attachment was not removed');
      },
    },
    {
      name: 'the citations of the enrollment cannot be written',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ESCRITURA CITACIONES');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const citation = await insertCitation(
          fx.institution.id, enrollment.id, fx.guardianId, '2026-07-10', '08:00',
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const created = await request('POST', '/api/citations', {
          token: fx.token, institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, date: '2026-07-21', time: '08:00', reasonIds: [1] },
        });
        assert.equal(created.status, 409);
        assert.equal(created.body.error, 'La matrícula está retirada');

        const updated = await request('PUT', `/api/citations/${citation}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { observations: 'Cambio' },
        });
        assert.equal(updated.status, 409);

        const closed = await request('PUT', `/api/citations/${citation}/close`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(closed.status, 409);

        const deleted = await request('DELETE', `/api/citations/${citation}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(deleted.status, 409);

        const rows = await AppDataSource.query(
          `SELECT status, observations, deleted_at FROM citations WHERE id = $1`,
          [citation],
        );
        assert.equal(rows.length, 1, 'no citation was added');
        assert.equal(rows[0].status, 'pending', 'the citation was not closed');
        assert.equal(rows[0].observations, null, 'the citation did not change');
        assert.equal(rows[0].deleted_at, null, 'the citation was not deleted');
      },
    },
    {
      name: 'the attachments of a citation of the enrollment cannot be written',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ADJUNTOS CITACION');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const citation = await insertCitation(
          fx.institution.id, enrollment.id, fx.guardianId, '2026-07-10', '08:00',
        );

        await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });

        const dir = path.join(process.cwd(), 'uploads', 'citaciones');
        const before = fs.readdirSync(dir);

        const added = await uploadFile(
          'POST', `/api/citations/${citation}/attachments`, 'files', 'prueba.pdf',
          fx.token, fx.institution.id,
        );
        assert.equal(added.status, 409);
        assert.equal(added.body.error, 'La matrícula está retirada');
        assert.deepEqual(fs.readdirSync(dir), before, 'the uploaded file was removed');

        const [attachment] = await AppDataSource.query(
          `INSERT INTO citation_attachments (citation_id, file_name, original_name, mime_type)
           VALUES ($1, 'existente.pdf', 'existente.pdf', 'application/pdf') RETURNING id`,
          [citation],
        );
        const removed = await request(
          'DELETE', `/api/citations/${citation}/attachments/${attachment.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.equal(removed.status, 409);

        const rows = await AppDataSource.query(
          `SELECT id FROM citation_attachments WHERE citation_id = $1`,
          [citation],
        );
        assert.equal(rows.length, 1, 'the attachment was not removed');
      },
    },
    {
      name: 'the enrollment itself cannot be written',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ESCRITURA MATRICULA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );

        await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const updated = await request('PUT', `/api/enrollments/${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
          body: { rosterNumber: 9 },
        });
        assert.equal(updated.status, 409);
        assert.equal(updated.body.error, 'La matrícula está retirada');

        const deleted = await request('DELETE', `/api/enrollments/${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(deleted.status, 409);
        assert.equal(deleted.body.error, 'La matrícula está retirada');

        const rows = await AppDataSource.query(
          `SELECT roster_number, deleted_at FROM enrollments WHERE id = $1`,
          [enrollment.id],
        );
        assert.equal(rows[0].roster_number, 1, 'the enrollment did not change');
        assert.equal(rows[0].deleted_at, null, 'the enrollment was not deleted');
      },
    },
    {
      name: 'an enrollment of another institution or out of scope is not found',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'FUERA DE ALCANCE');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const foreign = await request('POST', '/api/absences', {
          token: fx.otherToken, institutionId: fx.otherInstitution.id,
          body: { enrollmentId: enrollment.id, type: 'F', dateFrom: '2026-07-21', dateTo: '2026-07-21' },
        });
        assert.equal(foreign.status, 404, 'an enrollment of another institution is not found');

        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const scoped = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(scoped.id, fx.scopeCourse.id, fx.year.id);

        const outOfScope = await request('POST', '/api/absences', {
          token: scoped.token, institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, type: 'F', dateFrom: '2026-07-21', dateTo: '2026-07-21' },
        });
        assert.equal(outOfScope.status, 404, 'an enrollment out of the course scope is not found');
      },
    },
    {
      name: 'a record write on an enrollment of another institution or out of scope is not found',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'FUERA DE ALCANCE REGISTROS');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const absence = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-10');
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'MOTIVO', [absence],
        );
        await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const role = await createTestRole([
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'citaciones', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'enrollments', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const scoped = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(scoped.id, fx.scopeCourse.id, fx.year.id);

        const callers = [
          { label: 'another institution', token: fx.otherToken, institutionId: fx.otherInstitution.id },
          { label: 'out of the course scope', token: scoped.token, institutionId: fx.institution.id },
        ];

        for (const caller of callers) {
          const justificationUpdate = await request('PUT', `/api/justifications/${justification}`, {
            token: caller.token, institutionId: caller.institutionId,
            body: { reason: 'OTRO MOTIVO' },
          });
          assert.equal(justificationUpdate.status, 404, `justification update from ${caller.label}`);

          const citationCreate = await request('POST', '/api/citations', {
            token: caller.token, institutionId: caller.institutionId,
            body: { enrollmentId: enrollment.id, date: '2026-07-21', time: '08:00', reasonIds: [1] },
          });
          assert.equal(citationCreate.status, 404, `citation create from ${caller.label}`);

          const enrollmentUpdate = await request('PUT', `/api/enrollments/${enrollment.id}`, {
            token: caller.token, institutionId: caller.institutionId,
            body: { rosterNumber: 9 },
          });
          assert.equal(enrollmentUpdate.status, 404, `enrollment update from ${caller.label}`);
        }

        const rows = await AppDataSource.query(
          `SELECT reason FROM justifications WHERE id = $1`,
          [justification],
        );
        assert.equal(rows[0].reason, 'MOTIVO', 'the justification did not change');
        const citations = await AppDataSource.query(
          `SELECT COUNT(*)::int AS count FROM citations WHERE enrollment_id = $1`,
          [enrollment.id],
        );
        assert.equal(citations[0].count, 0, 'no citation was added');
        const enrollments = await AppDataSource.query(
          `SELECT roster_number FROM enrollments WHERE id = $1`,
          [enrollment.id],
        );
        assert.equal(enrollments[0].roster_number, 1, 'the enrollment did not change');
      },
    },
    {
      name: 'an attachment upload to a record that is not found leaves no file behind',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'ADJUNTO NO ENCONTRADO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const absence = await insertAbsence(fx.institution.id, enrollment.id, '2026-07-10');
        const justification = await insertJustification(
          fx.institution.id, enrollment.id, 'MOTIVO', [absence],
        );
        const citation = await insertCitation(
          fx.institution.id, enrollment.id, fx.guardianId, '2026-07-10', '08:00',
        );

        const uploads = [
          { dir: 'justifications', url: `/api/justifications/${justification}/attachments` },
          { dir: 'citaciones', url: `/api/citations/${citation}/attachments` },
        ];

        for (const upload of uploads) {
          const dir = path.join(process.cwd(), 'uploads', upload.dir);
          const before = fs.readdirSync(dir);

          const added = await uploadFile(
            'POST', upload.url, 'files', 'prueba.pdf', fx.otherToken, fx.otherInstitution.id,
          );
          assert.equal(added.status, 404, `${upload.url} from another institution is not found`);
          assert.deepEqual(fs.readdirSync(dir), before, `the file uploaded to ${upload.url} was removed`);
        }
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Reinstating an enrollment
// ─────────────────────────────────────────────────────────────────────
test('reinstating an enrollment brings back its data and its writability', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a withdrawal until the quarter start is undone',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'REVERTIDO TRIMESTRE');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20');
        await insertCitation(fx.institution.id, enrollment.id, fx.guardianId, '2026-07-20', '08:00');

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_quarter_start',
        });
        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 200);

        const enrollments = await request(
          'GET',
          `/api/enrollments?course_id=${fx.windowCourse.id}&academic_year_id=${fx.year.id}`,
          { token: fx.token, institutionId: fx.institution.id },
        );
        assert.ok(enrollments.body.some((e: any) => e.enrollmentId === enrollment.id), 'the enrollment is listed again');

        const absences = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(absences.body.length, 2, 'every absence is back');

        const citations = await request('GET', `/api/citations?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(citations.body.length, 1, 'every citation is back');

        const written = await request('POST', '/api/absences', {
          token: fx.token, institutionId: fx.institution.id,
          body: { enrollmentId: enrollment.id, type: 'F', dateFrom: '2026-07-21', dateTo: '2026-07-21' },
        });
        assert.equal(written.status, 201, 'the enrollment can be written again');
      },
    },
    {
      name: 'a withdrawal of the whole year is undone',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'REVERTIDO ANIO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25');

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'whole_year',
        });
        await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });

        const absences = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(absences.body.length, 1, 'the absence is back');
      },
    },
    {
      name: 'withdrawing it again hides it with the new visibility',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'REVERTIDO Y VUELTO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25');
        await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20');

        const created = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });
        await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });

        const again = await withdraw(fx, enrollment.id, {
          withdrawalDate: WITHDRAWAL_IN_Q3,
          statsVisibility: 'until_withdrawal',
        });
        assert.equal(again.status, 201);

        const absences = await request('GET', `/api/absences?enrollment_id=${enrollment.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.deepEqual(absences.body.map((a: any) => a.date), ['2026-06-25']);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The students of an academic year
// ─────────────────────────────────────────────────────────────────────
test('the students of an institution can be filtered by academic year', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'without a year every student of the institution is listed',
      run: async () => {
        const fx = await createFixture();
        const withdrawnOnly = await createStudent(fx.institution.id, 'SOLO RETIRADO');
        await createEnrollment(
          fx.institution.id, withdrawnOnly.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const active = await createStudent(fx.institution.id, 'ESTUDIANTE ACTIVO');
        await createEnrollment(
          fx.institution.id, active.id, fx.windowCourse.id, fx.year.id, 2, fx.guardianId,
        );
        const foreign = await createStudent(fx.otherInstitution.id, 'ESTUDIANTE AJENO');
        await createEnrollment(
          fx.otherInstitution.id, foreign.id, fx.foreignCourse.id, fx.year.id, 1, fx.guardianId,
        );

        await withdraw(fx, (await AppDataSource.query(
          `SELECT id FROM enrollments WHERE student_id = $1`, [withdrawnOnly.id],
        ))[0].id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const listed = await request('GET', '/api/students', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.status, 200);
        const names = listed.body.map((s: any) => s.name);
        assert.ok(names.includes('SOLO RETIRADO'), 'a student with only withdrawn enrollments is listed');
        assert.ok(names.includes('ESTUDIANTE ACTIVO'));
        assert.ok(!names.includes('ESTUDIANTE AJENO'), 'a student of another institution is not listed');
      },
    },
    {
      name: 'a year leaves out the students whose enrollment there is withdrawn',
      run: async () => {
        const fx = await createFixture();
        const withdrawn = await createStudent(fx.institution.id, 'RETIRADO DEL AÑO');
        const withdrawnEnrollment = await createEnrollment(
          fx.institution.id, withdrawn.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const active = await createStudent(fx.institution.id, 'ACTIVO DEL AÑO');
        await createEnrollment(
          fx.institution.id, active.id, fx.windowCourse.id, fx.year.id, 2, fx.guardianId,
        );

        await withdraw(fx, withdrawnEnrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const listed = await request('GET', `/api/students?academic_year_id=${fx.year.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.status, 200);
        const names = listed.body.map((s: any) => s.name);
        assert.ok(!names.includes('RETIRADO DEL AÑO'), 'the withdrawn student is not listed');
        assert.ok(names.includes('ACTIVO DEL AÑO'));
      },
    },
    {
      name: 'a student withdrawn in one year is listed in the other one',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'DOS ANOS');
        const first = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await createEnrollment(
          fx.institution.id, student.id, fx.scopeCourse.id, fx.secondYear.id, 1, fx.guardianId,
        );

        await withdraw(fx, first.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const inFirst = await request('GET', `/api/students?academic_year_id=${fx.year.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.ok(!inFirst.body.some((s: any) => s.name === 'DOS ANOS'), 'not listed in the year of the withdrawal');

        const inSecond = await request('GET', `/api/students?academic_year_id=${fx.secondYear.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.ok(inSecond.body.some((s: any) => s.name === 'DOS ANOS'), 'listed in the other year');
      },
    },
    {
      name: 'a year of another institution or a missing one is not found',
      run: async () => {
        const fx = await createFixture();
        const foreignYear = await createAcademicYear(
          fx.otherInstitution.id, uniqueName('y'), Y1_START, Y1_END, true,
        );

        const foreign = await request('GET', `/api/students?academic_year_id=${foreignYear.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(foreign.status, 404);
        assert.equal(foreign.body.error, 'Academic year not found');

        const missing = await request('GET', '/api/students?academic_year_id=987654', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(missing.status, 404);
        assert.equal(missing.body.error, 'Academic year not found');
      },
    },
    {
      name: 'a year that is not a positive number is refused',
      run: async () => {
        const fx = await createFixture();
        for (const value of ['abc', '0', '-3', '1.5']) {
          const listed = await request('GET', `/api/students?academic_year_id=${value}`, {
            token: fx.token, institutionId: fx.institution.id,
          });
          assert.equal(listed.status, 400, `value ${value} is refused`);
          assert.equal(listed.body.error, 'academic_year_id inválido');
        }
      },
    },
    {
      name: 'the search and the year apply together',
      run: async () => {
        const fx = await createFixture();
        const alfa = await createStudent(fx.institution.id, 'ALFA BUSCABLE');
        await createEnrollment(fx.institution.id, alfa.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId);
        const bravo = await createStudent(fx.institution.id, 'BRAVO BUSCABLE');
        await createEnrollment(fx.institution.id, bravo.id, fx.windowCourse.id, fx.year.id, 2, fx.guardianId);
        const charlie = await createStudent(fx.institution.id, 'CHARLIE OTRO');
        await createEnrollment(fx.institution.id, charlie.id, fx.scopeCourse.id, fx.secondYear.id, 1, fx.guardianId);

        const listed = await request('GET', `/api/students?academic_year_id=${fx.year.id}&search=BUSCABLE`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.map((s: any) => s.name), ['ALFA BUSCABLE', 'BRAVO BUSCABLE']);
      },
    },
    {
      name: 'a caller scoped to courses only sees the students of those courses',
      run: async () => {
        const fx = await createFixture();
        const inScope = await createStudent(fx.institution.id, 'DENTRO DE AMBITO');
        await createEnrollment(fx.institution.id, inScope.id, fx.scopeCourse.id, fx.year.id, 1, fx.guardianId);
        const outOfScope = await createStudent(fx.institution.id, 'FUERA DE AMBITO');
        const outEnrollment = await createEnrollment(
          fx.institution.id, outOfScope.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );

        await withdraw(fx, outEnrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const role = await createTestRole([
          { resource: 'students', canRead: true },
        ]);
        const scoped = await createUser(role.name, fx.institution.id);
        await scopeUserToCourse(scoped.id, fx.scopeCourse.id, fx.year.id);

        const withoutYear = await request('GET', '/api/students', {
          token: scoped.token, institutionId: fx.institution.id,
        });
        assert.equal(withoutYear.status, 200);
        const names = withoutYear.body.map((s: any) => s.name);
        assert.ok(names.includes('DENTRO DE AMBITO'));
        assert.ok(!names.includes('FUERA DE AMBITO'), 'the withdrawn student of another course is not listed');

        const withYear = await request('GET', `/api/students?academic_year_id=${fx.year.id}`, {
          token: scoped.token, institutionId: fx.institution.id,
        });
        assert.equal(withYear.status, 200);
        assert.deepEqual(withYear.body.map((s: any) => s.name), ['DENTRO DE AMBITO']);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// The views of the withdrawal and the history of the student stay reachable
// ─────────────────────────────────────────────────────────────────────
test('the views of a withdrawal and the history of its student keep working', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the withdrawal can be listed, counted and reverted',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'VISTAS DEL RETIRO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const created = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        assert.equal(created.status, 201);

        const list = await request('GET', '/api/student-withdrawals', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(list.status, 200);
        assert.equal(list.body.length, 1);

        const history = await request('GET', `/api/student-withdrawals/students/${student.id}/history`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(history.status, 200);
        assert.equal(history.body.length, 1);

        const stats = await request('GET', '/api/student-withdrawals/stats', {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(stats.status, 200);
        assert.equal(stats.body.total, 1);
        assert.equal(stats.body.byReason.find((r: any) => r.reasonId === fx.reasonId).count, 1);

        const reverted = await request('POST', `/api/student-withdrawals/${created.body.id}/revert`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(reverted.status, 200);
        assert.equal(reverted.body.revertedAt !== null, true);

        const second = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        assert.equal(second.status, 201, 'the enrollment can be withdrawn again');
      },
    },
    {
      name: 'an enrollment that is already withdrawn cannot be withdrawn again',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'DOBLE RETIRO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        const first = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        assert.equal(first.status, 201);

        const second = await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });
        assert.equal(second.status, 409);
        assert.equal(second.body.error, 'La matrícula ya está retirada');
      },
    },
    {
      name: 'the history of the student keeps every record of the withdrawn enrollment',
      run: async () => {
        for (const value of VISIBILITY_VALUES) {
          const fx = await createFixture();
          const student = await createStudent(fx.institution.id, `HISTORIAL ${value}`);
          const enrollment = await createEnrollment(
            fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
          );
          await insertAbsence(fx.institution.id, enrollment.id, '2026-06-25', 'F');
          await insertAbsence(fx.institution.id, enrollment.id, '2026-07-20', 'AT');
          const absence = await insertAbsence(fx.institution.id, enrollment.id, '2026-06-26', 'F');
          await insertJustification(fx.institution.id, enrollment.id, 'MOTIVO', [absence]);

          await withdraw(fx, enrollment.id, {
            withdrawalDate: WITHDRAWAL_IN_Q3,
            statsVisibility: value,
          });

          const summary = await request('GET', `/api/student-history/${enrollment.id}/summary`, {
            token: fx.token, institutionId: fx.institution.id,
          });
          assert.equal(summary.status, 200);
          assert.equal(summary.body.enrollment.enrollmentId, enrollment.id);
          assert.equal(summary.body.absences.total, 2);
          assert.equal(summary.body.tardies.total, 1);
          assert.equal(summary.body.justifications.total, 1);
          assert.deepEqual(Object.keys(summary.body.citations).sort(), ['items', 'total'], 'the summary carries the citations');
          assert.equal(summary.body.citations.total, 0);
          assert.deepEqual(summary.body.citations.items, []);

          const timeline = await request('GET', `/api/student-history/${enrollment.id}/timeline`, {
            token: fx.token, institutionId: fx.institution.id,
          });
          assert.equal(timeline.status, 200);
          const types = timeline.body.map((e: any) => e.type);
          assert.ok(types.includes('enrollment'));
          assert.ok(types.includes('absence'));
          assert.ok(types.includes('tardy'));
          assert.ok(types.includes('justification'));
        }
      },
    },
    {
      name: 'deleting a student, a course or an academic year still works',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'BORRADO EN CASCADA');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const deletedStudent = await request('DELETE', `/api/students/${student.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(deletedStudent.status, 204);

        const rows = await AppDataSource.query(
          `SELECT deleted_at FROM enrollments WHERE id = $1`,
          [enrollment.id],
        );
        assert.ok(rows[0].deleted_at, 'the enrollment was deleted too');
      },
    },
    {
      name: 'deleting a course with a withdrawn enrollment still works',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'CURSO BORRADO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const deletedCourse = await request('DELETE', `/api/courses/${fx.windowCourse.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(deletedCourse.status, 204);

        const rows = await AppDataSource.query(
          `SELECT deleted_at FROM enrollments WHERE id = $1`,
          [enrollment.id],
        );
        assert.ok(rows[0].deleted_at, 'the enrollment was deleted too');
      },
    },
    {
      name: 'deleting an academic year with a withdrawn enrollment still works',
      run: async () => {
        const fx = await createFixture();
        const student = await createStudent(fx.institution.id, 'AÑO BORRADO');
        const enrollment = await createEnrollment(
          fx.institution.id, student.id, fx.windowCourse.id, fx.year.id, 1, fx.guardianId,
        );
        await withdraw(fx, enrollment.id, { withdrawalDate: WITHDRAWAL_IN_Q3 });

        const deletedYear = await request('DELETE', `/api/academic-years/${fx.year.id}`, {
          token: fx.token, institutionId: fx.institution.id,
        });
        assert.equal(deletedYear.status, 204);

        const rows = await AppDataSource.query(
          `SELECT deleted_at FROM enrollments WHERE id = $1`,
          [enrollment.id],
        );
        assert.ok(rows[0].deleted_at, 'the enrollment was deleted too');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});
