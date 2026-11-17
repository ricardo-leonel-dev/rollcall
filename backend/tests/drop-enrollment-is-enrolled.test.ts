import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import * as XLSX from 'xlsx';
import { AppDataSource } from '../src/data-source';
import authRouter from '../src/controllers/auth.controller';
import enrollmentRouter from '../src/controllers/enrollment.controller';
import importRouter from '../src/controllers/import.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { AcademicYear } from '../src/entities/AcademicYear';
import { Course } from '../src/entities/Course';
import { Enrollment } from '../src/entities/Enrollment';
import { Guardian } from '../src/entities/Guardian';
import { Institution } from '../src/entities/Institution';
import { Student } from '../src/entities/Student';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const MIGRATION_FILE = '31_drop_enrollment_is_enrolled.sql';

// The tables the withdrawal audit needs have their own migrations; they are
// applied here so this file does not depend on the order of the suite.
const SUPPORT_MIGRATIONS = [
  '26_withdrawal_reasons.sql',
  '28_domain_events.sql',
  '29_student_withdrawals.sql',
  '30_student_withdrawals_stats_visibility.sql',
];

const TEST_INST_PREFIX = '__test_dei_inst_';
const TEST_USER_PREFIX = 'testuser_dei_';

const YEAR_START = '2026-01-01';
const YEAR_END = '2026-12-31';

// The columns of the enrollment roster view once the legacy flag is gone.
const VIEW_COLUMNS = [
  'enrollment_id', 'academic_year_id', 'academic_year', 'course_id', 'course', 'teacher',
  'student_id', 'roster_number', 'id_number', 'full_name', 'gender', 'birth_date', 'age',
  'student_phone', 'student_email', 'guardian_id', 'guardian_name', 'guardian_phone',
  'whatsapp_link', 'guardian_email', 'is_active', 'deleted_at', 'created_at',
  'guardian_id_number', 'institution_id',
];

// The keys the enrollment listing answers with once the legacy flag is gone.
const ENROLLMENT_LIST_KEYS = [
  'enrollmentId', 'academicYearId', 'academicYear', 'courseId', 'course', 'teacher',
  'studentId', 'rosterNumber', 'idNumber', 'fullName', 'gender', 'birthDate', 'age',
  'studentPhone', 'studentEmail', 'guardianId', 'guardianName', 'guardianPhone',
  'whatsappLink', 'guardianEmail', 'guardianIdNumber', 'isActive',
];

// The roster view as it was before the migration: it still carries the flag.
const LEGACY_VIEW_SQL = `
DROP VIEW IF EXISTS v_enrollments_detail;
CREATE VIEW v_enrollments_detail AS
SELECT
  m.id                AS enrollment_id,
  al.id               AS academic_year_id,
  al.name             AS academic_year,
  c.id                AS course_id,
  c.name              AS course,
  ca.teacher,
  e.id                AS student_id,
  m.roster_number,
  e.id_number,
  e.name              AS full_name,
  e.gender,
  e.birth_date,
  DATE_PART('year', AGE(CURRENT_DATE, e.birth_date))::INTEGER AS age,
  m.is_enrolled,
  m.student_phone,
  m.student_email,
  r.id                AS guardian_id,
  r.name              AS guardian_name,
  r.phone             AS guardian_phone,
  r.whatsapp_link,
  r.email             AS guardian_email,
  m.is_active,
  m.deleted_at,
  m.created_at,
  r.id_number         AS guardian_id_number,
  m.institution_id
FROM enrollments m
JOIN students e        ON e.id = m.student_id
JOIN courses c         ON c.id = m.course_id
JOIN academic_years al ON al.id = m.academic_year_id
LEFT JOIN guardians r  ON r.id = m.guardian_id
LEFT JOIN course_academic_years ca ON ca.course_id = m.course_id
                                  AND ca.academic_year_id = m.academic_year_id
WHERE m.deleted_at IS NULL
  AND e.deleted_at IS NULL
  AND c.deleted_at IS NULL;
`;

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

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

function migrationSql(filename: string): string {
  return fs.readFileSync(migrationPath(filename), 'utf8');
}

async function runMigration(): Promise<void> {
  await AppDataSource.query(migrationSql(MIGRATION_FILE));
}

// Brings the table and the view back to the shape they had before the
// migration, so the migration can be exercised from a known starting point.
async function restoreLegacyState(): Promise<void> {
  await AppDataSource.query(
    `ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS is_enrolled BOOLEAN DEFAULT TRUE`,
  );
  await AppDataSource.query(LEGACY_VIEW_SQL);
}

async function columnNames(tableName: string): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName],
  );
  return rows.map((r: any) => r.column_name);
}

async function viewColumnNames(): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'v_enrollments_detail'
      ORDER BY ordinal_position`,
  );
  return rows.map((r: any) => r.column_name);
}

async function cleanup(): Promise<void> {
  const inst = [`${TEST_INST_PREFIX}%`];
  await AppDataSource.transaction(async (em) => {
    await em.query(`SET LOCAL app.domain_events_purge = 'on'`);
    await em.query(
      `DELETE FROM domain_events WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
      inst,
    );
  });
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
    `DELETE FROM user_courses WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM user_modules WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await deleteTestUsersByPrefix(TEST_USER_PREFIX);
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

async function createCourse(institutionId: number, name?: string): Promise<Course> {
  const repo = AppDataSource.getRepository(Course);
  return repo.save(repo.create({
    name: name ?? uniqueName('__test_dei_course_'),
    fullName: null,
    section: null,
    institutionId,
    shift: 'MATUTINA',
    isActive: true,
    deletedAt: null,
  }));
}

async function createAcademicYear(institutionId: number): Promise<AcademicYear> {
  const repo = AppDataSource.getRepository(AcademicYear);
  return repo.save(repo.create({
    name: uniqueName('y'),
    institutionId,
    startDate: YEAR_START,
    endDate: YEAR_END,
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

// Written with plain SQL so the legacy flag can be set to each of its values.
async function insertLegacyEnrollment(
  institutionId: number,
  studentId: number,
  courseId: number,
  academicYearId: number,
  rosterNumber: number | null,
  flag: boolean | null,
): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO enrollments (institution_id, student_id, course_id, academic_year_id, roster_number, is_enrolled, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
    [institutionId, studentId, courseId, academicYearId, rosterNumber, flag],
  );
  return Number(row.id);
}

// The enrollment of a table that no longer carries the flag.
async function insertEnrollment(
  institutionId: number,
  studentId: number,
  courseId: number,
  academicYearId: number,
  rosterNumber: number | null,
): Promise<number> {
  const [row] = await AppDataSource.query(
    `INSERT INTO enrollments (institution_id, student_id, course_id, academic_year_id, roster_number, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [institutionId, studentId, courseId, academicYearId, rosterNumber],
  );
  return Number(row.id);
}

async function snapshotTables(institutionId: number): Promise<any> {
  const enrollments = await AppDataSource.query(
    `SELECT id, student_id, course_id, academic_year_id, guardian_id, roster_number,
            student_phone, student_email, is_active, deleted_at, created_at, updated_at,
            institution_id, created_by_user_id
       FROM enrollments WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
  const withdrawals = await AppDataSource.query(
    `SELECT id, institution_id, enrollment_id, reason_id, withdrawal_date, notes,
            withdrawn_by_user_id, created_at, reverted_at, reverted_by_user_id
       FROM student_withdrawals WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
  const reasons = await AppDataSource.query(
    `SELECT id, institution_id, name, description, is_active, deleted_at, created_at, updated_at
       FROM withdrawal_reasons WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
  const events = await AppDataSource.query(
    `SELECT id, institution_id, event_type, entity_type, entity_id, actor_user_id, payload, occurred_at
       FROM domain_events WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
  return { enrollments, withdrawals, reasons, events };
}

async function withdrawalCount(institutionId: number): Promise<number> {
  const rows = await AppDataSource.query(
    `SELECT count(*)::int AS total FROM student_withdrawals WHERE institution_id = $1`,
    [institutionId],
  );
  return Number(rows[0].total);
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

const ROSTER_HEADERS = [
  'N°', 'CEDULA', 'APELLIDOS', 'SEXO', 'NACIMIENTO', 'MATRICULADO',
  'REPRESENTANTE LEGAL', 'TELEFONO ESTUDIANTE', 'CORREO ESTUDIANTE',
  'TELEFONO REPRESENTANTE', 'CORREO REPRESENTANTE',
];

// The roster sheet reads its headers on the sixth row, as the importer expects.
function rosterWorkbook(sheetName: string, headers: string[], rows: any[][]): Buffer {
  const sheet: any[][] = [['NOMINA']];
  while (sheet.length < 5) sheet.push([]);
  sheet.push(headers);
  for (const row of rows) sheet.push(row);
  const ws = XLSX.utils.aoa_to_sheet(sheet);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function postRoster(
  buffer: Buffer,
  token: string,
  institutionId: number,
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'nomina.xlsx',
  );
  const res = await fetch(`${baseUrl}/api/import/roster`, {
    method: 'POST',
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

interface BaseFixture {
  institution: Institution;
  year: AcademicYear;
  course: Course;
  token: string;
}

interface Fixture extends BaseFixture {
  student: Student;
  guardian: Guardian;
}

// Without a student or a guardian, so the counts of an import are not mixed
// with the ones of the fixture.
async function createBaseFixture(): Promise<BaseFixture> {
  const institution = await createTestInstitution();
  const year = await createAcademicYear(institution.id);
  const course = await createCourse(institution.id);
  const { token } = await createTestUser({ roleName: 'superadmin', institutionId: null });
  return { institution, year, course, token };
}

async function createFixture(): Promise<Fixture> {
  const base = await createBaseFixture();
  const student = await createStudent(base.institution.id, 'ESTUDIANTE DE PRUEBA');
  const guardian = await createGuardian(base.institution.id, 'REPRESENTANTE DE PRUEBA');
  return { ...base, student, guardian };
}

before(async () => {
  await AppDataSource.initialize();
  for (const file of SUPPORT_MIGRATIONS) {
    await AppDataSource.query(migrationSql(file));
  }

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRouter);
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
  // The database is left in the migrated shape the next run starts from.
  if ((await columnNames('enrollments')).includes('is_enrolled')) await runMigration();
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});

// ─────────────────────────────────────────────────────────────────────
// The migration that removes the legacy flag
// ─────────────────────────────────────────────────────────────────────
test('the enrollment table and its roster view lose the legacy flag', async (t) => {
  await restoreLegacyState();

  const institution = await createTestInstitution();
  const year = await createAcademicYear(institution.id);
  const course = await createCourse(institution.id);

  const flagged = await createStudent(institution.id, 'ESTUDIANTO CON BANDERA');
  const plain = await createStudent(institution.id, 'ESTUDIANTO SIN BANDERA');
  const empty = await createStudent(institution.id, 'ESTUDIANTO CON BANDERA NULA');

  const flaggedEnrollment = await insertLegacyEnrollment(institution.id, flagged.id, course.id, year.id, 1, false);
  const plainEnrollment = await insertLegacyEnrollment(institution.id, plain.id, course.id, year.id, 2, true);
  const emptyEnrollment = await insertLegacyEnrollment(institution.id, empty.id, course.id, year.id, 3, null);

  const before = await snapshotTables(institution.id);

  await runMigration();

  // Taken right after the migration, before the checks add rows of their own.
  const after = await snapshotTables(institution.id);

  await t.test('the table does not carry the flag anymore', async () => {
    const columns = await columnNames('enrollments');
    assert.ok(!columns.includes('is_enrolled'), `the columns are ${columns.join(', ')}`);
  });

  await t.test('the view keeps its other columns in the same order', async () => {
    const columns = await viewColumnNames();
    assert.deepEqual(columns, VIEW_COLUMNS);
    assert.ok(!columns.includes('is_enrolled'));
  });

  await t.test('the view still leaves out the soft deleted records', async () => {
    const deleted = await createStudent(institution.id, 'ESTUDIANTO CON MATRICULA BORRADA');
    const deletedEnrollment = await insertEnrollment(institution.id, deleted.id, course.id, year.id, 4);
    await AppDataSource.query(`UPDATE enrollments SET deleted_at = now() WHERE id = $1`, [deletedEnrollment]);

    const deletedStudent = await createStudent(institution.id, 'ESTUDIANTO BORRADO');
    const deletedStudentEnrollment = await insertEnrollment(
      institution.id, deletedStudent.id, course.id, year.id, 5,
    );
    await AppDataSource.query(`UPDATE students SET deleted_at = now() WHERE id = $1`, [deletedStudent.id]);

    const deletedCourse = await createCourse(institution.id);
    const deletedCourseStudent = await createStudent(institution.id, 'ESTUDIANTO DE CURSO BORRADO');
    const deletedCourseEnrollment = await insertEnrollment(
      institution.id, deletedCourseStudent.id, deletedCourse.id, year.id, 6,
    );
    await AppDataSource.query(`UPDATE courses SET deleted_at = now() WHERE id = $1`, [deletedCourse.id]);

    const listed = await AppDataSource.query(
      `SELECT enrollment_id FROM v_enrollments_detail WHERE institution_id = $1 ORDER BY enrollment_id`,
      [institution.id],
    );
    const ids = listed.map((r: any) => Number(r.enrollment_id));
    assert.ok(ids.includes(flaggedEnrollment), 'the enrollment of the row marked NO is listed');
    assert.ok(ids.includes(plainEnrollment), 'the enrollment of the row marked YES is listed');
    assert.ok(ids.includes(emptyEnrollment), 'the enrollment of the row without a value is listed');
    assert.ok(!ids.includes(deletedEnrollment), 'the deleted enrollment is left out');
    assert.ok(!ids.includes(deletedStudentEnrollment), 'the enrollment of a deleted student is left out');
    assert.ok(!ids.includes(deletedCourseEnrollment), 'the enrollment of a deleted course is left out');
  });

  await t.test('the rows of the enrollment and the audit tables do not change', async () => {
    assert.deepEqual(after.enrollments, before.enrollments, 'the enrollments are the same');
    assert.deepEqual(after.withdrawals, before.withdrawals, 'the withdrawals are the same');
    assert.deepEqual(after.reasons, before.reasons, 'the withdrawal reasons are the same');
    assert.deepEqual(after.events, before.events, 'the audit trail is the same');
    assert.equal(after.enrollments.length, before.enrollments.length);
    assert.ok(after.enrollments.length >= 3, 'the fixtures with the three flag values are there');
  });

  await t.test('it can be applied again without changing anything', async () => {
    const beforeSecondRun = await snapshotTables(institution.id);
    await runMigration();
    await runMigration();
    const afterSecondRun = await snapshotTables(institution.id);
    assert.deepEqual(afterSecondRun, beforeSecondRun);
    assert.ok(!(await columnNames('enrollments')).includes('is_enrolled'));
    assert.deepEqual(await viewColumnNames(), VIEW_COLUMNS);
  });

  await t.test('a statement that fails leaves the table and the view as they were', async () => {
    await restoreLegacyState();

    const failing = migrationSql(MIGRATION_FILE).replace(
      /COMMIT;\s*$/m,
      'SELECT 1/0;\nCOMMIT;',
    );
    assert.notEqual(failing, migrationSql(MIGRATION_FILE), 'the forced failure reached the migration');

    const runner = AppDataSource.createQueryRunner();
    await runner.connect();
    let failed = false;
    try {
      await runner.query(failing);
    } catch {
      failed = true;
    }
    try {
      await runner.query('ROLLBACK');
    } catch {
      // the transaction was already closed by the failure
    }
    await runner.release();
    assert.ok(failed, 'the failed statement aborted the migration');

    assert.ok(
      (await columnNames('enrollments')).includes('is_enrolled'),
      'the table kept the flag',
    );
    assert.ok(
      (await viewColumnNames()).includes('is_enrolled'),
      'the view kept the flag',
    );

    await runMigration();
  });
});

// ─────────────────────────────────────────────────────────────────────
// The enrollment API
// ─────────────────────────────────────────────────────────────────────
test('the enrollment API neither answers nor stores the legacy flag', async (t) => {
  await t.test('the listing answers with every other key and without the flag', async () => {
    const fx = await createFixture();
    await insertEnrollment(
      fx.institution.id, fx.student.id, fx.course.id, fx.year.id, 1,
    );

    const listed = await request('GET', '/api/enrollments', {
      token: fx.token, institutionId: fx.institution.id,
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);
    const enrollment = listed.body[0];
    for (const key of ENROLLMENT_LIST_KEYS) {
      assert.ok(key in enrollment, `the listing carries ${key}`);
    }
    assert.ok(!('isEnrolled' in enrollment), 'the listing does not carry the flag');
  });

  await t.test('creating an enrollment ignores a flag sent in the body', async () => {
    const fx = await createFixture();
    const created = await request('POST', '/api/enrollments', {
      token: fx.token,
      institutionId: fx.institution.id,
      body: {
        studentId: fx.student.id,
        courseId: fx.course.id,
        academicYearId: fx.year.id,
        guardianId: fx.guardian.id,
        rosterNumber: 4,
        isEnrolled: false,
      },
    });
    assert.equal(created.status, 201);
    assert.ok(!('isEnrolled' in created.body), 'the answer does not carry the flag');

    const rows = await AppDataSource.query(
      `SELECT id, roster_number FROM enrollments
        WHERE institution_id = $1 AND student_id = $2 AND course_id = $3 AND academic_year_id = $4`,
      [fx.institution.id, fx.student.id, fx.course.id, fx.year.id],
    );
    assert.equal(rows.length, 1, 'the enrollment was created');
    assert.equal(Number(rows[0].roster_number), 4);
    assert.equal(await withdrawalCount(fx.institution.id), 0, 'no withdrawal was created');
  });

  await t.test('updating an enrollment ignores a flag sent in the body', async () => {
    const fx = await createFixture();
    const enrollmentId = await insertEnrollment(
      fx.institution.id, fx.student.id, fx.course.id, fx.year.id, 2,
    );

    const updated = await request('PUT', `/api/enrollments/${enrollmentId}`, {
      token: fx.token,
      institutionId: fx.institution.id,
      body: { rosterNumber: 7, isEnrolled: false },
    });
    assert.equal(updated.status, 200);
    assert.ok(!('isEnrolled' in updated.body), 'the answer does not carry the flag');
    assert.equal(updated.body.rosterNumber, 7, 'the roster number moved');

    const rows = await AppDataSource.query(
      `SELECT roster_number FROM enrollments WHERE id = $1`,
      [enrollmentId],
    );
    assert.equal(Number(rows[0].roster_number), 7);
    assert.equal(await withdrawalCount(fx.institution.id), 0, 'no withdrawal was created');
  });

  await t.test('the entity does not map the flag anymore', async () => {
    const fx = await createFixture();
    const metadata = AppDataSource.getMetadata(Enrollment);
    assert.ok(
      !metadata.columns.some(c => c.databaseName === 'is_enrolled'),
      'no column of the entity points at the flag',
    );
    assert.ok(
      !Object.keys(metadata.propertiesMap).includes('isEnrolled'),
      'no property of the entity carries the flag',
    );

    const rows = await AppDataSource.getRepository(Enrollment).find({
      where: { institutionId: fx.institution.id },
    });
    assert.ok(Array.isArray(rows));
    for (const row of rows) {
      assert.ok(!('isEnrolled' in (row as any)), 'no loaded row carries the flag');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// The roster import
// ─────────────────────────────────────────────────────────────────────
test('the roster import ignores the enrolled column of the sheet', async (t) => {
  await t.test('a row marked NO creates the enrollment and no withdrawal', async () => {
    const fx = await createBaseFixture();
    const sheetName = uniqueName('__test_dei_course_');
    const workbook = rosterWorkbook(sheetName, ROSTER_HEADERS, [[
      1, '0991111111', 'NO MATRICULADO', 'M', '2010-05-04', 'NO',
      'FAMILIAR NO', '0991111112', 'NO@EXAMPLE.COM', '0991111113', 'NO.FAMILIAR@EXAMPLE.COM',
    ]]);

    const imported = await postRoster(workbook, fx.token, fx.institution.id);
    assert.equal(imported.status, 200);
    assert.equal(imported.body.enrollmentsCreated, 1, 'the enrollment was created');
    assert.deepEqual(imported.body.errors, [], 'nothing failed');

    const rows = await AppDataSource.query(
      `SELECT id FROM enrollments WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(rows.length, 1, 'the enrollment is stored');
    assert.equal(await withdrawalCount(fx.institution.id), 0, 'no withdrawal was created');
  });

  await t.test('a row marked NO does not touch an enrollment that changed nothing', async () => {
    const fx = await createBaseFixture();
    const sheetName = uniqueName('__test_dei_course_');
    const row = [
      1, '0992222222', 'NO MATRICULADO', 'M', '2010-05-04', 'NO',
      'FAMILIAR NO', '0992222223', 'NO@EXAMPLE.COM', '0992222224', 'NO.FAMILIAR@EXAMPLE.COM',
    ];
    const workbook = rosterWorkbook(sheetName, ROSTER_HEADERS, [row]);

    const first = await postRoster(workbook, fx.token, fx.institution.id);
    assert.equal(first.status, 200);
    assert.equal(first.body.enrollmentsCreated, 1);

    const second = await postRoster(workbook, fx.token, fx.institution.id);
    assert.equal(second.status, 200);
    assert.equal(second.body.enrollmentsUpdated, 0, 'the enrollment was not counted as updated');
    assert.deepEqual(second.body.errors, []);
    assert.equal(await withdrawalCount(fx.institution.id), 0, 'no withdrawal was created');
  });

  await t.test('a row marked NO still updates the roster number of an enrollment', async () => {
    const fx = await createBaseFixture();
    const sheetName = uniqueName('__test_dei_course_');
    const base = [
      1, '0993333333', 'NO MATRICULADO', 'M', '2010-05-04', 'NO',
      'FAMILIAR NO', '0993333334', 'NO@EXAMPLE.COM', '0993333335', 'NO.FAMILIAR@EXAMPLE.COM',
    ];
    const first = await postRoster(
      rosterWorkbook(sheetName, ROSTER_HEADERS, [base]), fx.token, fx.institution.id,
    );
    assert.equal(first.status, 200);

    const moved = [...base];
    moved[0] = 9;
    const second = await postRoster(
      rosterWorkbook(sheetName, ROSTER_HEADERS, [moved]), fx.token, fx.institution.id,
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.enrollmentsUpdated, 1, 'the enrollment was counted as updated');
    assert.deepEqual(second.body.errors, []);

    const rows = await AppDataSource.query(
      `SELECT roster_number FROM enrollments WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(Number(rows[0].roster_number), 9);
    assert.equal(await withdrawalCount(fx.institution.id), 0, 'no withdrawal was created');
  });

  await t.test('a sheet without the enrolled column works the same way', async () => {
    const fx = await createBaseFixture();
    const sheetName = uniqueName('__test_dei_course_');
    const headers = ROSTER_HEADERS.filter(h => h !== 'MATRICULADO');
    const row = [
      1, '0994444444', 'SIN COLUMNA', 'M', '2010-05-04',
      'FAMILIAR SIN', '0994444445', 'SIN@EXAMPLE.COM', '0994444446', 'SIN.FAMILIAR@EXAMPLE.COM',
    ];
    const workbook = rosterWorkbook(sheetName, headers, [row]);

    const imported = await postRoster(workbook, fx.token, fx.institution.id);
    assert.equal(imported.status, 200);
    assert.equal(imported.body.enrollmentsCreated, 1, 'the enrollment was created');
    assert.deepEqual(imported.body.errors, []);

    const rows = await AppDataSource.query(
      `SELECT id FROM enrollments WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(rows.length, 1, 'the enrollment is stored');
    assert.equal(await withdrawalCount(fx.institution.id), 0, 'no withdrawal was created');
  });
});

test('the roster import keeps syncing the rows marked as enrolled', async (t) => {
  await t.test('a row marked SI creates the student, the guardian and the enrollment', async () => {
    const fx = await createBaseFixture();
    const sheetName = uniqueName('__test_dei_course_');
    const workbook = rosterWorkbook(sheetName, ROSTER_HEADERS, [[
      1, '0995555555', 'SI MATRICULADO', 'M', '2010-05-04', 'SI',
      'FAMILIAR SI', '0995555556', 'SI@EXAMPLE.COM', '0995555557', 'SI.FAMILIAR@EXAMPLE.COM',
    ]]);

    const imported = await postRoster(workbook, fx.token, fx.institution.id);
    assert.equal(imported.status, 200);
    assert.equal(imported.body.coursesProcessed, 1);
    assert.equal(imported.body.studentsCreated, 1);
    assert.equal(imported.body.enrollmentsCreated, 1);
    assert.equal(imported.body.studentsUpdated, 0);
    assert.equal(imported.body.enrollmentsUpdated, 0);
    assert.equal(imported.body.guardiansUpdated, 0);
    assert.deepEqual(imported.body.errors, []);

    const enrollments = await AppDataSource.query(
      `SELECT roster_number, student_phone, student_email FROM enrollments WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(enrollments.length, 1);
    assert.equal(Number(enrollments[0].roster_number), 1);
    assert.equal(enrollments[0].student_phone, '0995555556');
    assert.equal(enrollments[0].student_email, 'SI@EXAMPLE.COM');

    const students = await AppDataSource.query(
      `SELECT name FROM students WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(students.length, 1);
    assert.equal(students[0].name, 'SI MATRICULADO');

    const guardians = await AppDataSource.query(
      `SELECT name FROM guardians WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(guardians.length, 1);
    assert.equal(guardians[0].name, 'FAMILIAR SI');
  });

  await t.test('a second import updates the roster number, the phone, the email and the guardian', async () => {
    const fx = await createBaseFixture();
    const sheetName = uniqueName('__test_dei_course_');
    const first = rosterWorkbook(sheetName, ROSTER_HEADERS, [[
      1, '0996666666', 'SI MATRICULADO', 'M', '2010-05-04', 'SI',
      'FAMILIAR SI', '0996666667', 'SI@EXAMPLE.COM', '0996666668', 'SI.FAMILIAR@EXAMPLE.COM',
    ]]);
    const created = await postRoster(first, fx.token, fx.institution.id);
    assert.equal(created.status, 200);
    assert.equal(created.body.enrollmentsCreated, 1);

    const second = rosterWorkbook(sheetName, ROSTER_HEADERS, [[
      5, '0996666666', 'SI MATRICULADO', 'M', '2010-05-04', 'SI',
      'FAMILIAR SI', '0996666669', 'SI.NUEVO@EXAMPLE.COM', '0996666670', 'SI.FAMILIAR@EXAMPLE.COM',
    ]]);
    const updated = await postRoster(second, fx.token, fx.institution.id);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.coursesProcessed, 1);
    assert.equal(updated.body.studentsCreated, 0);
    assert.equal(updated.body.studentsUpdated, 1);
    assert.equal(updated.body.enrollmentsCreated, 0);
    assert.equal(updated.body.enrollmentsUpdated, 1);
    assert.equal(updated.body.guardiansUpdated, 1);
    assert.deepEqual(updated.body.errors, []);

    const enrollments = await AppDataSource.query(
      `SELECT roster_number, student_phone, student_email FROM enrollments WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(enrollments.length, 1);
    assert.equal(Number(enrollments[0].roster_number), 5);
    assert.equal(enrollments[0].student_phone, '0996666669');
    assert.equal(enrollments[0].student_email, 'SI.NUEVO@EXAMPLE.COM');

    const guardians = await AppDataSource.query(
      `SELECT phone FROM guardians WHERE institution_id = $1`,
      [fx.institution.id],
    );
    assert.equal(guardians.length, 1);
    assert.equal(guardians[0].phone, '0996666670');
  });
});
