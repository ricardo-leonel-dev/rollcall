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
import absenceRouter from '../src/controllers/absence.controller';
import justificationRouter from '../src/controllers/justification.controller';
import auditEventRouter from '../src/controllers/audit-event.controller';
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
import { recordEvents } from '../src/services/domain-event.service';
import type { DomainEventInput } from '../src/services/domain-event.service';

const MIGRATION_FILE = '28_domain_events.sql';

const TEST_INST_PREFIX = '__test_de_inst_';
const TEST_ROLE_PREFIX = '__test_de_role_';
const TEST_USER_PREFIX = 'testuser_de_';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  // Short enough to fit the narrowest name column (academic_years.name is
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

function isAppendOnlyError(err: unknown): boolean {
  const e = err as { message?: string; driverError?: { message?: string } } | null;
  return `${e?.message ?? ''} ${e?.driverError?.message ?? ''}`.includes('domain_events is append-only');
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
    `DELETE FROM justification_absences WHERE justification_id IN (SELECT id FROM justifications WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1))`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM justification_absences WHERE absence_id IN (SELECT id FROM absences WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1))`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM justification_attachments WHERE justification_id IN (SELECT id FROM justifications WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1))`,
    [`${TEST_INST_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM justifications WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
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

interface Fixture {
  institution: Institution;
  year: AcademicYear;
  course: Course;
  student: Student;
  enrollment: Enrollment;
}

async function createFixture(): Promise<Fixture> {
  const institution = await createTestInstitution();

  const year = await AppDataSource.getRepository(AcademicYear).save(
    AppDataSource.getRepository(AcademicYear).create({
      name: uniqueName('y'),
      institutionId: institution.id,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      isActive: true,
      deletedAt: null,
    }),
  );

  const course = await AppDataSource.getRepository(Course).save(
    AppDataSource.getRepository(Course).create({
      name: uniqueName('__test_de_course_'),
      fullName: null,
      paralelo: null,
      institutionId: institution.id,
      shift: 'MATUTINA',
      isActive: true,
      deletedAt: null,
    }),
  );

  const student = await AppDataSource.getRepository(Student).save(
    AppDataSource.getRepository(Student).create({
      idNumber: null,
      name: uniqueName('__test_de_student_'),
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

  return { institution, year, course, student, enrollment };
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
  // The seeded schema of this database does not carry the justification
  // attachments table, and the delete of a justification has to leave the
  // attachments of that justification untouched.
  await AppDataSource.query(
    `CREATE TABLE IF NOT EXISTS justification_attachments (
       id                SERIAL PRIMARY KEY,
       justification_id  INTEGER NOT NULL,
       file_name         VARCHAR(255) NOT NULL,
       original_name     VARCHAR(255) NOT NULL,
       mime_type         VARCHAR(100) NOT NULL,
       created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
  await runMigration();

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRouter);
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/absences', absenceRouter);
  app.use('/api/justifications', justificationRouter);
  app.use('/api/audit-events', auditEventRouter);
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
// R1 — the domain_events table
// ─────────────────────────────────────────────────────────────────────
test('R1: the migration creates the domain_events table with the expected shape', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the table has the expected columns',
      run: async () => {
        const columns = await AppDataSource.query(
          `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'domain_events'`,
        );
        const byName = new Map<string, any>(columns.map((c: any) => [c.column_name, c]));

        const expected: Array<[string, string, boolean]> = [
          ['id', 'bigint', false],
          ['institution_id', 'integer', false],
          ['event_type', 'character varying', false],
          ['entity_type', 'character varying', false],
          ['entity_id', 'integer', false],
          ['actor_user_id', 'integer', true],
          ['payload', 'jsonb', false],
          ['occurred_at', 'timestamp with time zone', false],
        ];
        for (const [name, type, nullable] of expected) {
          const col = byName.get(name);
          assert.ok(col, `column ${name} exists`);
          assert.equal(col.data_type, type, `column ${name} type`);
          assert.equal(col.is_nullable, nullable ? 'YES' : 'NO', `column ${name} nullability`);
        }

        assert.equal(byName.get('event_type').character_maximum_length, 64, 'event_type is varchar(64)');
        assert.equal(byName.get('entity_type').character_maximum_length, 64, 'entity_type is varchar(64)');
        assert.match(String(byName.get('id').column_default), /nextval/, 'id is a bigserial');
        assert.match(String(byName.get('payload').column_default), /'\{\}'::jsonb/, 'payload defaults to an empty json object');
        assert.match(String(byName.get('occurred_at').column_default), /now\(\)/i, 'occurred_at defaults to now()');
      },
    },
    {
      name: 'the table has the institution-time and entity indexes',
      run: async () => {
        const indexes = await AppDataSource.query(
          `SELECT indexdef FROM pg_indexes
            WHERE schemaname = current_schema() AND tablename = 'domain_events'`,
        );
        const defs = indexes.map((i: any) => i.indexdef as string);
        assert.ok(
          defs.some((d: string) => d.includes('institution_id, occurred_at DESC, id DESC')),
          `an index on (institution_id, occurred_at DESC, id DESC) exists: ${defs.join(' | ')}`,
        );
        assert.ok(
          defs.some((d: string) => d.includes('entity_type, entity_id, occurred_at DESC')),
          `an index on (entity_type, entity_id, occurred_at DESC) exists: ${defs.join(' | ')}`,
        );
      },
    },
    {
      name: 'the table has no foreign keys',
      run: async () => {
        const fks = await AppDataSource.query(
          `SELECT ccu.table_name AS referenced_table
             FROM information_schema.table_constraints tc
             JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.table_schema = current_schema()
              AND tc.table_name = 'domain_events'
              AND tc.constraint_type = 'FOREIGN KEY'`,
        );
        assert.deepEqual(fks, [], 'no foreign key points at the audit table');
      },
    },
    {
      name: 'the migration can be applied twice in a row without error',
      run: async () => {
        await runMigration();
        await runMigration();

        const rows = await AppDataSource.query(
          `SELECT r.name, p.id FROM role_permissions p JOIN roles r ON r.id = p.role_id
            WHERE p.resource = 'audit-events' ORDER BY r.name`,
        );
        assert.deepEqual(
          rows.map((r: any) => r.name),
          ['admin', 'rector', 'superadmin'],
          'still exactly one seeded row per role',
        );
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R2 — the table is append-only
// ─────────────────────────────────────────────────────────────────────
test('R2: the domain_events table rejects updates, deletes and truncates', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'an UPDATE is rejected and the row is unchanged',
      run: async () => {
        const inst = await createTestInstitution();
        const [row] = await AppDataSource.query(
          `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id, payload)
           VALUES ($1, 'AbsenceRecorded', 'absence', 1, '{"before":null,"after":{"id":1}}') RETURNING id`,
          [inst.id],
        );

        await assert.rejects(
          () => AppDataSource.query(`UPDATE domain_events SET payload = '{}' WHERE id = $1`, [row.id]),
          isAppendOnlyError,
        );

        const [after] = await AppDataSource.query(
          `SELECT payload FROM domain_events WHERE id = $1`,
          [row.id],
        );
        assert.deepEqual(after.payload, { before: null, after: { id: 1 } }, 'the payload was not rewritten');
      },
    },
    {
      name: 'a DELETE is rejected and the row is still there',
      run: async () => {
        const inst = await createTestInstitution();
        const [row] = await AppDataSource.query(
          `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id)
           VALUES ($1, 'AbsenceDeleted', 'absence', 2) RETURNING id`,
          [inst.id],
        );

        await assert.rejects(
          () => AppDataSource.query(`DELETE FROM domain_events WHERE id = $1`, [row.id]),
          isAppendOnlyError,
        );

        const rows = await AppDataSource.query(`SELECT id FROM domain_events WHERE id = $1`, [row.id]);
        assert.equal(rows.length, 1, 'the row is still present');
      },
    },
    {
      name: 'a TRUNCATE is rejected and the rows are still there',
      run: async () => {
        const inst = await createTestInstitution();
        await AppDataSource.query(
          `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id)
           VALUES ($1, 'AbsenceDeleted', 'absence', 3)`,
          [inst.id],
        );

        await assert.rejects(
          () => AppDataSource.query(`TRUNCATE domain_events`),
          isAppendOnlyError,
        );

        const rows = await AppDataSource.query(
          `SELECT id FROM domain_events WHERE institution_id = $1`,
          [inst.id],
        );
        assert.equal(rows.length, 1, 'the row survived the truncate');
      },
    },
    {
      name: 'a DELETE inside a transaction with the purge flag on removes the row',
      run: async () => {
        const inst = await createTestInstitution();
        const [row] = await AppDataSource.query(
          `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id)
           VALUES ($1, 'AbsenceDeleted', 'absence', 4) RETURNING id`,
          [inst.id],
        );

        await AppDataSource.transaction(async (em) => {
          await em.query(`SET LOCAL app.domain_events_purge = 'on'`);
          await em.query(`DELETE FROM domain_events WHERE id = $1`, [row.id]);
        });

        const rows = await AppDataSource.query(`SELECT id FROM domain_events WHERE id = $1`, [row.id]);
        assert.equal(rows.length, 0, 'the row was deleted');
      },
    },
    {
      name: 'an UPDATE inside a transaction with the purge flag on is still rejected',
      run: async () => {
        const inst = await createTestInstitution();
        const [row] = await AppDataSource.query(
          `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id)
           VALUES ($1, 'AbsenceRecorded', 'absence', 5) RETURNING id`,
          [inst.id],
        );

        await assert.rejects(
          () => AppDataSource.transaction(async (em) => {
            await em.query(`SET LOCAL app.domain_events_purge = 'on'`);
            await em.query(`UPDATE domain_events SET payload = '{}' WHERE id = $1`, [row.id]);
          }),
          isAppendOnlyError,
        );

        const rows = await AppDataSource.query(`SELECT payload FROM domain_events WHERE id = $1`, [row.id]);
        assert.deepEqual(rows[0].payload, {}, 'the payload was not rewritten');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R3 — the events are written on the caller's transaction
// ─────────────────────────────────────────────────────────────────────
test('R3: recordEvents writes the whole batch with one statement inside the caller transaction', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'three events are written with a single statement and the transaction commits',
      run: async () => {
        const inst = await createTestInstitution();
        const events: DomainEventInput[] = [
          { institutionId: inst.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 1, actorUserId: null, payload: { before: null, after: { id: 1 } } },
          { institutionId: inst.id, eventType: 'AbsenceDeleted', entityType: 'absence', entityId: 2, actorUserId: null, payload: { before: { id: 2 }, after: null } },
          { institutionId: inst.id, eventType: 'JustificationCreated', entityType: 'justification', entityId: 3, actorUserId: null, payload: { before: null, after: { id: 3 } } },
        ];

        let calls = 0;
        await AppDataSource.transaction(async (em) => {
          const original = em.query.bind(em);
          em.query = (query: string, parameters?: any[]) => {
            calls += 1;
            return original(query, parameters);
          };
          await recordEvents(em, events);
        });

        assert.equal(calls, 1, 'the batch went out in one statement');

        const rows = await AppDataSource.query(
          `SELECT event_type, entity_type, entity_id, actor_user_id, payload
             FROM domain_events WHERE institution_id = $1 ORDER BY id`,
          [inst.id],
        );
        assert.equal(rows.length, 3, 'the three events were stored');
        assert.deepEqual(rows.map((r: any) => r.event_type), ['AbsenceRecorded', 'AbsenceDeleted', 'JustificationCreated']);
        assert.deepEqual(rows.map((r: any) => r.entity_type), ['absence', 'absence', 'justification']);
        assert.deepEqual(rows.map((r: any) => r.entity_id), [1, 2, 3]);
        assert.deepEqual(rows.map((r: any) => r.actor_user_id), [null, null, null]);
        assert.deepEqual(rows[0].payload, { before: null, after: { id: 1 } });
        assert.deepEqual(rows[1].payload, { before: { id: 2 }, after: null });
      },
    },
    {
      name: 'a transaction that rolls back leaves no row behind',
      run: async () => {
        const inst = await createTestInstitution();

        await assert.rejects(
          () => AppDataSource.transaction(async (em) => {
            await recordEvents(em, [
              { institutionId: inst.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 7, actorUserId: null, payload: { before: null, after: { id: 7 } } },
              { institutionId: inst.id, eventType: 'AbsenceDeleted', entityType: 'absence', entityId: 8, actorUserId: null, payload: { before: { id: 8 }, after: null } },
            ]);
            throw new Error('boom');
          }),
          /boom/,
        );

        const rows = await AppDataSource.query(`SELECT id FROM domain_events WHERE institution_id = $1`, [inst.id]);
        assert.equal(rows.length, 0, 'the rolled back batch wrote nothing');
      },
    },
    {
      name: 'an empty batch issues no statement at all',
      run: async () => {
        const inst = await createTestInstitution();

        let calls = 0;
        await AppDataSource.transaction(async (em) => {
          const original = em.query.bind(em);
          em.query = (query: string, parameters?: any[]) => {
            calls += 1;
            return original(query, parameters);
          };
          await recordEvents(em, []);
        });

        assert.equal(calls, 0, 'no statement was issued');
        const rows = await AppDataSource.query(`SELECT id FROM domain_events WHERE institution_id = $1`, [inst.id]);
        assert.equal(rows.length, 0);
      },
    },
    {
      name: 'every event of the batch carries the same timestamp',
      run: async () => {
        const inst = await createTestInstitution();

        await AppDataSource.transaction(async (em) => {
          await recordEvents(em, [1, 2, 3].map((n) => ({
            institutionId: inst.id,
            eventType: 'AbsenceRecorded' as const,
            entityType: 'absence' as const,
            entityId: n,
            actorUserId: null,
            payload: { before: null, after: { id: n } },
          })));
        });

        const rows = await AppDataSource.query(
          `SELECT DISTINCT occurred_at FROM domain_events WHERE institution_id = $1`,
          [inst.id],
        );
        assert.equal(rows.length, 1, 'all the events share one occurred_at');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

async function eventsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, event_type, entity_type, entity_id, actor_user_id, payload, occurred_at
       FROM domain_events WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function absencesOf(enrollmentId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, enrollment_id, date::text AS date, type, notes, is_active, deleted_at
       FROM absences WHERE enrollment_id = $1 ORDER BY id`,
    [enrollmentId],
  );
}

// ─────────────────────────────────────────────────────────────────────
// R4 — creating absences records an event per row
// ─────────────────────────────────────────────────────────────────────
test('R4: POST /api/absences records one AbsenceRecorded event per created row', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a three-business-day range records one event per absence',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const res = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-04', notes: 'Prueba' },
        });
        assert.equal(res.status, 201);

        const rows = await absencesOf(fx.enrollment.id);
        assert.equal(rows.length, 3, 'the three business days were stored');

        const events = await eventsOf(fx.institution.id);
        assert.equal(events.length, 3, 'one event per created absence');
        assert.deepEqual(events.map((e: any) => e.event_type), ['AbsenceRecorded', 'AbsenceRecorded', 'AbsenceRecorded']);
        assert.deepEqual(events.map((e: any) => e.entity_type), ['absence', 'absence', 'absence']);
        assert.deepEqual(events.map((e: any) => e.entity_id), rows.map((r: any) => r.id));
        assert.deepEqual(events.map((e: any) => e.actor_user_id), [userId, userId, userId]);

        for (const [index, event] of events.entries()) {
          assert.deepEqual(event.payload, {
            before: null,
            after: {
              id: rows[index].id,
              enrollmentId: fx.enrollment.id,
              date: rows[index].date,
              type: 'F',
              notes: 'Prueba',
            },
            restored: false,
          }, `event ${index} carries the absence snapshot`);
        }
      },
    },
    {
      name: 'a soft-deleted absence is restored and flagged as restored',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const first = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(first.status, 201);

        const [existing] = await absencesOf(fx.enrollment.id);
        const deleted = await request('DELETE', `/api/absences/${existing.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(deleted.status, 204);

        const recordedBefore = (await eventsOf(fx.institution.id)).length;

        const second = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-03' },
        });
        assert.equal(second.status, 201);
        assert.equal(second.body.created, 2, 'the soft-deleted day was restored and a new day added');

        const events = (await eventsOf(fx.institution.id)).slice(recordedBefore);
        assert.equal(events.length, 2, 'one event for the restored row and one for the new row');

        const restored = events.find((e: any) => e.payload.restored === true);
        assert.ok(restored, 'the restored row has its own event');
        assert.equal(restored.entity_id, existing.id, 'the event points at the restored row id');
        assert.deepEqual(restored.payload.after, {
          id: existing.id,
          enrollmentId: fx.enrollment.id,
          date: '2026-03-02',
          type: 'F',
          notes: null,
        });

        const created = events.find((e: any) => e.payload.restored === false);
        assert.ok(created, 'the new row has its own event');
        assert.notEqual(created.entity_id, existing.id, 'the new row is a different row');
        assert.equal(created.payload.after.date, '2026-03-03');
      },
    },
    {
      name: 'a range whose days all exist records nothing',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const first = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-04' },
        });
        assert.equal(first.status, 201);
        assert.equal(first.body.created, 3);

        const second = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'AT', dateFrom: '2026-03-02', dateTo: '2026-03-04' },
        });
        assert.equal(second.status, 201);
        assert.equal(second.body.created, 0, 'every day was skipped');
        assert.equal(second.body.skipped, 3);

        const events = (await eventsOf(fx.institution.id)).filter((e: any) => e.event_type === 'AbsenceRecorded');
        assert.equal(events.length, 3, 'only the first call recorded events');
      },
    },
    {
      name: 'a rejected request records nothing',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const rejected: Array<{ body: unknown; status: number }> = [
          { body: { enrollmentId: fx.enrollment.id, type: 'X', dateFrom: '2026-03-02', dateTo: '2026-03-04' }, status: 400 },
          { body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-04', dateTo: '2026-03-02' }, status: 400 },
          { body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-07', dateTo: '2026-03-08' }, status: 400 },
          { body: { enrollmentId: other.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-04' }, status: 404 },
        ];

        for (const [index, c] of rejected.entries()) {
          const res = await request('POST', '/api/absences', {
            token,
            institutionId: fx.institution.id,
            body: c.body,
          });
          assert.equal(res.status, c.status, `case ${index} status`);
        }

        assert.equal((await eventsOf(fx.institution.id)).length, 0, 'no event was recorded');
        assert.equal((await eventsOf(other.institution.id)).length, 0, 'no event was recorded');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R5 — deleting an absence records an event
// ─────────────────────────────────────────────────────────────────────
test('R5: DELETE /api/absences/:id records one AbsenceDeleted event', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'deleting an absence records the row it deleted',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'AT', dateFrom: '2026-03-02', dateTo: '2026-03-02', notes: 'Tarde' },
        });
        assert.equal(created.status, 201);
        const [row] = await absencesOf(fx.enrollment.id);

        const res = await request('DELETE', `/api/absences/${row.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 204);

        const events = (await eventsOf(fx.institution.id)).filter((e: any) => e.event_type === 'AbsenceDeleted');
        assert.equal(events.length, 1, 'exactly one AbsenceDeleted event');
        assert.equal(events[0].entity_type, 'absence');
        assert.equal(events[0].entity_id, row.id);
        assert.equal(events[0].actor_user_id, userId);
        assert.deepEqual(events[0].payload, {
          before: {
            id: row.id,
            enrollmentId: fx.enrollment.id,
            date: '2026-03-02',
            type: 'AT',
            notes: 'Tarde',
          },
          after: null,
        });
      },
    },
    {
      name: 'deleting an absence whose only justification it was records no justification event',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(created.status, 201);
        const [row] = await absencesOf(fx.enrollment.id);

        const justified = await request('POST', '/api/justifications', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reason: 'Cita medica', notifiedBy: 'Madre', absenceIds: [row.id] },
        });
        assert.equal(justified.status, 201);

        const res = await request('DELETE', `/api/absences/${row.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 204);

        const events = await eventsOf(fx.institution.id);
        assert.deepEqual(
          events.filter((e: any) => e.event_type === 'AbsenceDeleted').map((e: any) => e.entity_id),
          [row.id],
          'only the absence was evented',
        );
        assert.equal(
          events.filter((e: any) => e.event_type === 'JustificationDeleted').length,
          0,
          'the cascaded justification is not evented',
        );
      },
    },
    {
      name: 'deleting an unknown, already deleted or foreign absence records nothing',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(created.status, 201);
        const [row] = await absencesOf(fx.enrollment.id);

        const foreignUser = await createUser(role.name, other.institution.id);
        const foreign = await request('POST', '/api/absences', {
          token: foreignUser.token,
          institutionId: other.institution.id,
          body: { enrollmentId: other.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(foreign.status, 201);
        const [foreignRow] = await absencesOf(other.enrollment.id);
        const foreignEventsBefore = (await eventsOf(other.institution.id)).length;

        for (const id of [99999999, foreignRow.id]) {
          const res = await request('DELETE', `/api/absences/${id}`, {
            token,
            institutionId: fx.institution.id,
          });
          assert.equal(res.status, 404, `absence ${id} is not visible`);
        }

        const first = await request('DELETE', `/api/absences/${row.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(first.status, 204);

        const second = await request('DELETE', `/api/absences/${row.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(second.status, 404, 'the absence is already deleted');

        assert.equal(
          (await eventsOf(fx.institution.id)).filter((e: any) => e.event_type === 'AbsenceDeleted').length,
          1,
          'only the successful delete was evented',
        );
        assert.equal(
          (await eventsOf(other.institution.id)).length,
          foreignEventsBefore,
          'the foreign institution recorded nothing for the rejected delete',
        );
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

async function justificationsOf(enrollmentId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, enrollment_id, reason, notified_by, is_active, deleted_at
       FROM justifications WHERE enrollment_id = $1 ORDER BY id`,
    [enrollmentId],
  );
}

async function justificationLinks(justificationId: number): Promise<number[]> {
  const rows = await AppDataSource.query(
    `SELECT absence_id FROM justification_absences WHERE justification_id = $1 ORDER BY absence_id`,
    [justificationId],
  );
  return rows.map((r: any) => r.absence_id);
}

// ─────────────────────────────────────────────────────────────────────
// R6 — creating a justification records an event
// ─────────────────────────────────────────────────────────────────────
test('R6: POST /api/justifications records one JustificationCreated event', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a justification over two absences records one event with both absence ids',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-03' },
        });
        assert.equal(created.status, 201);
        const absences = await absencesOf(fx.enrollment.id);
        assert.equal(absences.length, 2);
        const absenceIds = absences.map((a: any) => a.id);

        const res = await request('POST', '/api/justifications', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reason: 'Cita medica', notifiedBy: 'Madre', absenceIds },
        });
        assert.equal(res.status, 201);

        const events = (await eventsOf(fx.institution.id)).filter((e: any) => e.event_type === 'JustificationCreated');
        assert.equal(events.length, 1, 'exactly one JustificationCreated event');
        assert.equal(events[0].entity_type, 'justification');
        assert.equal(events[0].entity_id, res.body.id);
        assert.equal(events[0].actor_user_id, userId);
        assert.deepEqual(events[0].payload, {
          before: null,
          after: {
            id: res.body.id,
            enrollmentId: fx.enrollment.id,
            reason: 'Cita medica',
            notifiedBy: 'Madre',
            absenceIds,
          },
        });
      },
    },
    {
      name: 'a rejected justification records nothing',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(created.status, 201);
        const [absence] = await absencesOf(fx.enrollment.id);

        const justified = await request('POST', '/api/justifications', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reason: 'Primera', absenceIds: [absence.id] },
        });
        assert.equal(justified.status, 201);
        const recordedBefore = (await eventsOf(fx.institution.id)).length;

        const rejected: Array<{ body: unknown; status: number }> = [
          { body: { enrollmentId: fx.enrollment.id, reason: 'Sin faltas', absenceIds: [] }, status: 400 },
          { body: { enrollmentId: fx.enrollment.id, reason: 'Falta inexistente', absenceIds: [99999999] }, status: 404 },
          { body: { enrollmentId: fx.enrollment.id, reason: 'Repetida', absenceIds: [absence.id] }, status: 409 },
        ];

        for (const [index, c] of rejected.entries()) {
          const res = await request('POST', '/api/justifications', {
            token,
            institutionId: fx.institution.id,
            body: c.body,
          });
          assert.equal(res.status, c.status, `case ${index} status`);
        }

        assert.equal(
          (await eventsOf(fx.institution.id)).length,
          recordedBefore,
          'the rejected requests recorded nothing',
        );
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R7 — deleting a justification records an event
// ─────────────────────────────────────────────────────────────────────
test('R7: DELETE /api/justifications/:id records one JustificationDeleted event', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'deleting a justification records the absences it used to link',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-03' },
        });
        assert.equal(created.status, 201);
        const absenceIds = (await absencesOf(fx.enrollment.id)).map((a: any) => a.id);

        const justified = await request('POST', '/api/justifications', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reason: 'Cita medica', notifiedBy: 'Madre', absenceIds },
        });
        assert.equal(justified.status, 201);

        const res = await request('DELETE', `/api/justifications/${justified.body.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 204);

        const events = (await eventsOf(fx.institution.id)).filter((e: any) => e.event_type === 'JustificationDeleted');
        assert.equal(events.length, 1, 'exactly one JustificationDeleted event');
        assert.equal(events[0].entity_type, 'justification');
        assert.equal(events[0].entity_id, justified.body.id);
        assert.equal(events[0].actor_user_id, userId);
        assert.deepEqual(events[0].payload, {
          before: {
            id: justified.body.id,
            enrollmentId: fx.enrollment.id,
            reason: 'Cita medica',
            notifiedBy: 'Madre',
            absenceIds,
          },
          after: null,
        });
      },
    },
    {
      name: 'deleting an unknown, already deleted or foreign justification records nothing',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(created.status, 201);
        const [absence] = await absencesOf(fx.enrollment.id);

        const justified = await request('POST', '/api/justifications', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reason: 'Cita medica', absenceIds: [absence.id] },
        });
        assert.equal(justified.status, 201);

        for (const id of [99999999]) {
          const res = await request('DELETE', `/api/justifications/${id}`, {
            token,
            institutionId: fx.institution.id,
          });
          assert.equal(res.status, 404, `justification ${id} is not visible`);
        }

        const first = await request('DELETE', `/api/justifications/${justified.body.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(first.status, 204);

        const second = await request('DELETE', `/api/justifications/${justified.body.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(second.status, 404, 'the justification is already deleted');

        assert.equal(
          (await eventsOf(fx.institution.id)).filter((e: any) => e.event_type === 'JustificationDeleted').length,
          1,
          'only the successful delete was evented',
        );
        assert.equal((await eventsOf(other.institution.id)).length, 0, 'the foreign institution recorded nothing');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R8 — the audit event list
// ─────────────────────────────────────────────────────────────────────
test('R8: GET /api/audit-events lists the caller institution events', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the list holds the caller institution events, capped at fifty',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token, id: userId, username } = await createUser(role.name, fx.institution.id);

        await AppDataSource.transaction(async (em) => {
          await recordEvents(em, Array.from({ length: 55 }, (_, index) => ({
            institutionId: fx.institution.id,
            eventType: 'AbsenceRecorded' as const,
            entityType: 'absence' as const,
            entityId: index + 1,
            actorUserId: userId,
            payload: { before: null, after: { id: index + 1 } },
          })));
        });
        await AppDataSource.transaction(async (em) => {
          await recordEvents(em, [
            { institutionId: fx.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 90, actorUserId: null, payload: { before: null, after: { id: 90 } } },
            { institutionId: fx.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 91, actorUserId: 987654321, payload: { before: null, after: { id: 91 } } },
            { institutionId: other.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 999, actorUserId: null, payload: { before: null, after: { id: 999 } } },
          ]);
        });

        const res = await request('GET', '/api/audit-events', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.items.length, 50, 'the page is capped at fifty events');
        assert.equal(res.body.nextBeforeId, res.body.items[49].id, 'the cursor points at the last item');

        for (const item of res.body.items) {
          assert.deepEqual(
            Object.keys(item).sort(),
            ['actorUserId', 'actorUsername', 'entityId', 'entityType', 'eventType', 'id', 'occurredAt', 'payload'],
            'the item carries every field of the event',
          );
          assert.equal(typeof item.id, 'number');
          assert.equal(typeof item.occurredAt, 'string');
        }

        assert.equal(res.body.items[0].actorUserId, 987654321, 'the event of a deleted user comes first');
        assert.equal(res.body.items[0].actorUsername, null, 'a missing user has no username');
        assert.equal(res.body.items[1].actorUserId, null, 'the event without actor comes next');
        assert.equal(res.body.items[1].actorUsername, null, 'no actor means no username');
        assert.equal(res.body.items[2].actorUserId, userId);
        assert.equal(res.body.items[2].actorUsername, username, 'a known actor brings its username');

        assert.equal(
          res.body.items.some((item: any) => item.entityId === 999),
          false,
          'the other institution is not in the list',
        );
      },
    },
    {
      name: 'the list can be filtered by entity, event type and actor',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token, id: userId, username } = await createUser(role.name, fx.institution.id);

        await AppDataSource.transaction(async (em) => {
          await recordEvents(em, [
            { institutionId: fx.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 7, actorUserId: userId, payload: { before: null, after: { id: 7 } } },
            { institutionId: fx.institution.id, eventType: 'AbsenceDeleted', entityType: 'absence', entityId: 7, actorUserId: userId, payload: { before: { id: 7 }, after: null } },
            { institutionId: fx.institution.id, eventType: 'JustificationCreated', entityType: 'justification', entityId: 3, actorUserId: null, payload: { before: null, after: { id: 3 } } },
          ]);
        });

        const byEntity = await request('GET', '/api/audit-events?entity_type=absence&entity_id=7', { token, institutionId: fx.institution.id });
        assert.equal(byEntity.status, 200);
        assert.equal(byEntity.body.items.length, 2, 'only the events of that absence came back');
        assert.deepEqual(byEntity.body.items.map((i: any) => i.eventType).sort(), ['AbsenceDeleted', 'AbsenceRecorded']);

        const byType = await request('GET', '/api/audit-events?event_type=AbsenceDeleted', { token, institutionId: fx.institution.id });
        assert.equal(byType.status, 200);
        assert.equal(byType.body.items.length, 1);
        assert.equal(byType.body.items[0].eventType, 'AbsenceDeleted');

        const byActor = await request('GET', `/api/audit-events?actor_user_id=${userId}`, { token, institutionId: fx.institution.id });
        assert.equal(byActor.status, 200);
        assert.equal(byActor.body.items.length, 2, 'only the events of that actor came back');
        assert.deepEqual(byActor.body.items.map((i: any) => i.actorUserId), [userId, userId]);
        assert.deepEqual(byActor.body.items.map((i: any) => i.actorUsername), [username, username]);
      },
    },
    {
      name: 'the list can be filtered by date range',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const [row] = await AppDataSource.query(`SELECT (now() AT TIME ZONE 'America/Guayaquil')::date::text AS today`);
        const today = row.today;
        await AppDataSource.query(
          `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id, occurred_at)
           VALUES ($1, 'AbsenceRecorded', 'absence', 1, now()),
                  ($1, 'AbsenceRecorded', 'absence', 2, now() - interval '2 days')`,
          [fx.institution.id],
        );

        const res = await request('GET', `/api/audit-events?date_from=${today}&date_to=${today}`, { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.items.length, 1, 'only the event of that day came back');
        assert.equal(res.body.items[0].entityId, 1);
      },
    },
    {
      name: 'the date range follows Ecuador local days, not UTC days',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        await AppDataSource.query(
          `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id, occurred_at)
           VALUES ($1, 'AbsenceRecorded', 'absence', 1, '2026-11-16 01:30:00+00'),
                  ($1, 'AbsenceRecorded', 'absence', 2, '2026-11-15 04:59:00+00')`,
          [fx.institution.id],
        );

        const idsOn = async (day: string) => {
          const res = await request('GET', `/api/audit-events?date_from=${day}&date_to=${day}`, { token, institutionId: fx.institution.id });
          assert.equal(res.status, 200);
          return res.body.items.map((i: any) => i.entityId).sort();
        };

        assert.deepEqual(await idsOn('2026-11-14'), [2], 'an event at 04:59 UTC belongs to the previous local day');
        assert.deepEqual(await idsOn('2026-11-15'), [1], 'an event at 01:30 UTC the next day still belongs to this local day');
        assert.deepEqual(await idsOn('2026-11-16'), [], 'the early UTC event is not on the later local day');
      },
    },
    {
      name: 'the list pages backwards with the cursor',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        await AppDataSource.transaction(async (em) => {
          await recordEvents(em, [
            { institutionId: fx.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 1, actorUserId: null, payload: { before: null, after: { id: 1 } } },
            { institutionId: fx.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 2, actorUserId: null, payload: { before: null, after: { id: 2 } } },
            { institutionId: fx.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 3, actorUserId: null, payload: { before: null, after: { id: 3 } } },
          ]);
        });

        const first = await request('GET', '/api/audit-events?limit=2', { token, institutionId: fx.institution.id });
        assert.equal(first.status, 200);
        assert.equal(first.body.items.length, 2);
        assert.deepEqual(first.body.items.map((i: any) => i.entityId), [3, 2], 'the newest events come first');
        assert.equal(first.body.nextBeforeId, first.body.items[1].id, 'the cursor is the last item');

        const second = await request('GET', `/api/audit-events?limit=2&before_id=${first.body.nextBeforeId}`, { token, institutionId: fx.institution.id });
        assert.equal(second.status, 200);
        assert.equal(second.body.items.length, 1);
        assert.equal(second.body.items[0].entityId, 1, 'the third event came back');
        assert.equal(second.body.nextBeforeId, null, 'there is nothing left to page');
      },
    },
    {
      name: 'an invalid query parameter is rejected',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const invalid = [
          'limit=0', 'limit=201', 'limit=abc', 'limit=-1', 'limit=1.5',
          'entity_id=0', 'entity_id=-1', 'entity_id=abc',
          'actor_user_id=0', 'actor_user_id=abc',
          'before_id=0', 'before_id=abc',
          'date_from=not-a-date', 'date_from=2026-13-01', 'date_from=2026-02-30',
          'date_to=2026-99-99',
        ];

        for (const query of invalid) {
          const res = await request('GET', `/api/audit-events?${query}`, { token, institutionId: fx.institution.id });
          assert.equal(res.status, 400, `${query} is rejected`);
          assert.equal(res.body.error, 'Parámetros de consulta inválidos');
        }
      },
    },
    {
      name: 'a superadmin picks the institution with the header',
      run: async () => {
        const fx = await createFixture();
        const other = await createFixture();
        const { token } = await createUser('superadmin', null);

        await AppDataSource.transaction(async (em) => {
          await recordEvents(em, [
            { institutionId: fx.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 11, actorUserId: null, payload: { before: null, after: { id: 11 } } },
            { institutionId: other.institution.id, eventType: 'AbsenceRecorded', entityType: 'absence', entityId: 22, actorUserId: null, payload: { before: null, after: { id: 22 } } },
          ]);
        });

        const res = await request('GET', '/api/audit-events', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.items.map((i: any) => i.entityId), [11]);
      },
    },
    {
      name: 'a superadmin without an institution is rejected',
      run: async () => {
        const { token } = await createUser('superadmin', null);

        const res = await request('GET', '/api/audit-events', { token });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Selecciona una institución');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R9 — the audit read permission
// ─────────────────────────────────────────────────────────────────────
test('R9: GET /api/audit-events is guarded by the audit-events read permission', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a caller without a token is rejected',
      run: async () => {
        const res = await request('GET', '/api/audit-events');
        assert.equal(res.status, 401);
      },
    },
    {
      name: 'a role without an audit-events row is rejected',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('GET', '/api/audit-events', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 403);
      },
    },
    {
      name: 'a role whose audit-events row cannot read is rejected',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: false }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('GET', '/api/audit-events', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 403);
      },
    },
    {
      name: 'a course-scoped caller is rejected even with the read permission',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token, id: userId } = await createUser(role.name, fx.institution.id);
        await AppDataSource.getRepository(UserCourse).save(
          AppDataSource.getRepository(UserCourse).create({
            userId,
            courseId: fx.course.id,
            academicYearId: fx.year.id,
          }),
        );

        const res = await request('GET', '/api/audit-events', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 403);
        assert.equal(res.body.error, 'El historial de auditoría requiere acceso a toda la institución');
      },
    },
    {
      name: 'a caller with the read permission and no course scope gets the list',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'audit-events', canRead: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('GET', '/api/audit-events', { token, institutionId: fx.institution.id });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.items), 'the response carries the items array');
      },
    },
    {
      name: 'only admin, rector and superadmin get an audit-events row after the migration',
      run: async () => {
        const rows = await AppDataSource.query(
          `SELECT r.name, p.can_read, p.can_create, p.can_update, p.can_delete
             FROM role_permissions p JOIN roles r ON r.id = p.role_id
            WHERE p.resource = 'audit-events' ORDER BY r.name`,
        );

        assert.deepEqual(
          rows.map((r: any) => r.name),
          ['admin', 'rector', 'superadmin'],
          'no other role gets the resource',
        );
        for (const row of rows) {
          assert.equal(row.can_read, true, `${row.name} can read`);
          assert.equal(row.can_create, false, `${row.name} cannot create`);
          assert.equal(row.can_update, false, `${row.name} cannot update`);
          assert.equal(row.can_delete, false, `${row.name} cannot delete`);
        }
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// P1 — the absence and justification endpoints keep their answers
// ─────────────────────────────────────────────────────────────────────
test('P1: the absence and justification endpoints keep their status codes, bodies and stored rows', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'creating absences answers the same body and stores the same rows',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const res = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-04', notes: 'Prueba' },
        });
        assert.equal(res.status, 201);
        assert.deepEqual(Object.keys(res.body).sort(), ['created', 'skipped', 'skippedDetails']);
        assert.equal(res.body.created, 3);
        assert.equal(res.body.skipped, 0);
        assert.deepEqual(res.body.skippedDetails, []);

        const rows = await absencesOf(fx.enrollment.id);
        assert.deepEqual(rows.map((r: any) => r.date), ['2026-03-02', '2026-03-03', '2026-03-04']);
        for (const row of rows) {
          assert.equal(row.enrollment_id, fx.enrollment.id);
          assert.equal(row.type, 'F');
          assert.equal(row.notes, 'Prueba');
          assert.equal(row.is_active, true);
          assert.equal(row.deleted_at, null);
        }
      },
    },
    {
      name: 'creating absences over existing days still reports the skipped ones',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const first = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(first.status, 201);

        const second = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'AT', dateFrom: '2026-03-02', dateTo: '2026-03-03' },
        });
        assert.equal(second.status, 201);
        assert.equal(second.body.created, 1);
        assert.equal(second.body.skipped, 1);
        assert.deepEqual(second.body.skippedDetails, [{ date: '2026-03-02', existingType: 'F', conflict: true }]);
      },
    },
    {
      name: 'deleting an absence answers 204 and soft deletes the row',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([{ resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true }]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(created.status, 201);
        const [row] = await absencesOf(fx.enrollment.id);

        const res = await request('DELETE', `/api/absences/${row.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 204);
        assert.equal(res.body, null, 'the delete answers with an empty body');

        const [deleted] = await absencesOf(fx.enrollment.id);
        assert.equal(deleted.is_active, false);
        assert.ok(deleted.deleted_at, 'the row is soft deleted');
        assert.equal(deleted.type, 'F', 'the business fields are untouched');
        assert.equal(deleted.date, '2026-03-02');
      },
    },
    {
      name: 'creating a justification answers the saved justification',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(created.status, 201);
        const [absence] = await absencesOf(fx.enrollment.id);

        const res = await request('POST', '/api/justifications', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reason: 'Cita medica', notifiedBy: 'Madre', absenceIds: [absence.id] },
        });
        assert.equal(res.status, 201);
        assert.equal(typeof res.body.id, 'number');
        assert.equal(res.body.enrollmentId, fx.enrollment.id);
        assert.equal(res.body.institutionId, fx.institution.id);
        assert.equal(res.body.reason, 'Cita medica');
        assert.equal(res.body.notifiedBy, 'Madre');
        assert.equal(res.body.isActive, true);
        assert.equal(res.body.deletedAt, null);

        const [stored] = await justificationsOf(fx.enrollment.id);
        assert.equal(stored.id, res.body.id);
        assert.equal(stored.reason, 'Cita medica');
        assert.equal(stored.notified_by, 'Madre');
        assert.equal(stored.is_active, true);
        assert.equal(stored.deleted_at, null);
        assert.deepEqual(await justificationLinks(res.body.id), [absence.id]);
      },
    },
    {
      name: 'deleting a justification answers 204, drops the links and keeps the attachments',
      run: async () => {
        const fx = await createFixture();
        const role = await createTestRole([
          { resource: 'absences', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          { resource: 'justifications', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, fx.institution.id);

        const created = await request('POST', '/api/absences', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, type: 'F', dateFrom: '2026-03-02', dateTo: '2026-03-02' },
        });
        assert.equal(created.status, 201);
        const [absence] = await absencesOf(fx.enrollment.id);

        const justified = await request('POST', '/api/justifications', {
          token,
          institutionId: fx.institution.id,
          body: { enrollmentId: fx.enrollment.id, reason: 'Cita medica', absenceIds: [absence.id] },
        });
        assert.equal(justified.status, 201);
        await AppDataSource.query(
          `INSERT INTO justification_attachments (justification_id, file_name, original_name, mime_type)
           VALUES ($1, 'proof.pdf', 'proof.pdf', 'application/pdf')`,
          [justified.body.id],
        );

        const res = await request('DELETE', `/api/justifications/${justified.body.id}`, {
          token,
          institutionId: fx.institution.id,
        });
        assert.equal(res.status, 204);
        assert.equal(res.body, null, 'the delete answers with an empty body');

        const [stored] = await justificationsOf(fx.enrollment.id);
        assert.equal(stored.is_active, false);
        assert.ok(stored.deleted_at, 'the justification is soft deleted');
        assert.equal(stored.reason, 'Cita medica', 'the business fields are untouched');
        assert.deepEqual(await justificationLinks(justified.body.id), [], 'the links to the absences are gone');

        const attachments = await AppDataSource.query(
          `SELECT id FROM justification_attachments WHERE justification_id = $1`,
          [justified.body.id],
        );
        assert.equal(attachments.length, 1, 'the attachments are preserved');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});
