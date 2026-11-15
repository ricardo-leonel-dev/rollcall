import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import authRouter from '../src/controllers/auth.controller';
import institutionRouter from '../src/controllers/institution.controller';
import userRouter from '../src/controllers/user.controller';
import withdrawalReasonRouter from '../src/controllers/withdrawal-reason.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { AcademicYear } from '../src/entities/AcademicYear';
import { Course } from '../src/entities/Course';
import { Institution } from '../src/entities/Institution';
import { Role } from '../src/entities/Role';
import { RolePermission } from '../src/entities/RolePermission';
import { UserCourse } from '../src/entities/UserCourse';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';
import { DEFAULT_WITHDRAWAL_REASONS } from '../src/services/withdrawal-reason.service';

const MIGRATION_FILE = '26_withdrawal_reasons.sql';

const TEST_INST_PREFIX = '__test_wr_inst_';
const TEST_ROLE_PREFIX = '__test_wr_role_';
const TEST_USER_PREFIX = 'testuser_wr_';

// The catalog the migration must seed, pinned here so a change in either the
// SQL seed or the service constant has to be made deliberately on both sides.
const EXPECTED_DEFAULT_REASONS = [
  'Cambio de domicilio',
  'Cambio de institución educativa',
  'Situación económica',
  'Problemas de salud',
  'Viaje o migración',
  'Bajo rendimiento académico',
  'Motivos disciplinarios',
  'Otro',
];

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}${process.pid}_${Date.now()}_${counter}`;
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

async function cleanup(): Promise<void> {
  await AppDataSource.query(
    `DELETE FROM user_courses WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await AppDataSource.query(
    `DELETE FROM user_modules WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_USER_PREFIX}%`],
  );
  await deleteTestUsersByPrefix(TEST_USER_PREFIX);
  await AppDataSource.query(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name LIKE $1)`, [`${TEST_ROLE_PREFIX}%`]);
  await AppDataSource.query(`DELETE FROM roles WHERE name LIKE $1`, [`${TEST_ROLE_PREFIX}%`]);
  await AppDataSource.query(
    `DELETE FROM withdrawal_reasons WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    [`${TEST_INST_PREFIX}%`],
  );
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
  const saved = await repo.save(repo.create({
    name: uniqueName(TEST_INST_PREFIX),
    isActive: true,
    primaryColor: null,
    secondaryColor: null,
    logoUrl: null,
  }));
  return saved;
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

async function reasonsOf(institutionId: number): Promise<any[]> {
  return AppDataSource.query(
    `SELECT id, institution_id, name, description, is_active, deleted_at, created_at, updated_at
       FROM withdrawal_reasons WHERE institution_id = $1 ORDER BY id`,
    [institutionId],
  );
}

async function insertReason(institutionId: number, name: string, description: string | null = null): Promise<any> {
  const [row] = await AppDataSource.query(
    `INSERT INTO withdrawal_reasons (institution_id, name, description) VALUES ($1, $2, $3) RETURNING id, name`,
    [institutionId, name, description],
  );
  return row;
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
  app.use('/api/institutions', institutionRouter);
  app.use('/api/users', userRouter);
  app.use('/api/withdrawal-reasons', withdrawalReasonRouter);
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
// R1 — the catalog table
// ─────────────────────────────────────────────────────────────────────
test('R1: the migration creates withdrawal_reasons with the expected columns and constraints', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the table has the expected columns',
      run: async () => {
        const columns = await AppDataSource.query(
          `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'withdrawal_reasons'`,
        );
        const byName = new Map<string, any>(columns.map((c: any) => [c.column_name, c]));

        const expected: Array<[string, string, boolean]> = [
          ['id', 'integer', false],
          ['institution_id', 'integer', false],
          ['name', 'character varying', false],
          ['description', 'text', true],
          ['is_active', 'boolean', false],
          ['deleted_at', 'timestamp with time zone', true],
          ['created_at', 'timestamp with time zone', false],
          ['updated_at', 'timestamp with time zone', false],
        ];
        for (const [name, type, nullable] of expected) {
          const col = byName.get(name);
          assert.ok(col, `column ${name} exists`);
          assert.equal(col.data_type, type, `column ${name} type`);
          assert.equal(col.is_nullable, nullable ? 'YES' : 'NO', `column ${name} nullability`);
        }
        assert.equal(byName.get('name').character_maximum_length, 150, 'name is varchar(150)');
        assert.match(String(byName.get('is_active').column_default), /true/i, 'is_active defaults to true');
        assert.match(String(byName.get('created_at').column_default), /now\(\)/i, 'created_at defaults to now()');
        assert.match(String(byName.get('updated_at').column_default), /now\(\)/i, 'updated_at defaults to now()');

        const fks = await AppDataSource.query(
          `SELECT ccu.table_name AS referenced_table
             FROM information_schema.table_constraints tc
             JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.table_schema = current_schema()
              AND tc.table_name = 'withdrawal_reasons'
              AND tc.constraint_type = 'FOREIGN KEY'`,
        );
        assert.deepEqual(fks.map((f: any) => f.referenced_table), ['institutions'], 'institution_id references institutions');

        const indexes = await AppDataSource.query(
          `SELECT indexdef FROM pg_indexes
            WHERE schemaname = current_schema() AND tablename = 'withdrawal_reasons'`,
        );
        const uniqueIdx = indexes.map((i: any) => i.indexdef).find((def: string) => def.includes('UNIQUE') && def.includes('lower('));
        assert.ok(uniqueIdx, 'a unique index on the lower-cased name exists');
        assert.match(uniqueIdx, /lower\(\(name\)::text\)|lower\(name\)/, 'the index uses the lower-cased name');
        assert.match(uniqueIdx, /deleted_at IS NULL/, 'the unique index only covers non-deleted rows');
      },
    },
    {
      name: 'two non-deleted reasons with the same name in different cases cannot coexist',
      run: async () => {
        const inst = await createTestInstitution();
        await insertReason(inst.id, 'Otro');

        await assert.rejects(
          () => AppDataSource.query(
            `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, 'otro')`,
            [inst.id],
          ),
          (err: Error) =>
            /duplicate key/.test(err.message) &&
            err.message.includes('uq_withdrawal_reasons_institution_name'),
        );

        assert.equal((await reasonsOf(inst.id)).length, 1, 'the second insert did not create a row');
      },
    },
    {
      name: 'a name freed by a soft delete can be used again',
      run: async () => {
        const inst = await createTestInstitution();
        await insertReason(inst.id, 'Otro');
        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE institution_id = $1`,
          [inst.id],
        );

        await insertReason(inst.id, 'Otro');

        const rows = await reasonsOf(inst.id);
        assert.equal(rows.length, 2, 'the soft-deleted row and the new one coexist');
        assert.equal(rows.filter(r => r.deleted_at === null).length, 1, 'only one row is active');
      },
    },
    {
      name: 'the same reason name can exist in two different institutions',
      run: async () => {
        const a = await createTestInstitution();
        const b = await createTestInstitution();

        await AppDataSource.query(
          `INSERT INTO withdrawal_reasons (institution_id, name) VALUES ($1, 'Otro'), ($2, 'Otro')`,
          [a.id, b.id],
        );

        assert.equal((await reasonsOf(a.id)).length, 1);
        assert.equal((await reasonsOf(b.id)).length, 1);
      },
    },
    {
      name: 'the migration can be applied twice in a row without error',
      run: async () => {
        await runMigration();
        await runMigration();
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R2 — the default seed for existing institutions
// ─────────────────────────────────────────────────────────────────────
test('R2: the migration seeds the 8 default reasons into every existing institution', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'an institution without reasons gets the 8 active defaults',
      run: async () => {
        const inst = await createTestInstitution();
        assert.equal((await reasonsOf(inst.id)).length, 0, 'the fixture starts with no reasons');

        await runMigration();

        const rows = await reasonsOf(inst.id);
        assert.equal(rows.length, 8, 'exactly the 8 defaults');
        assert.deepEqual(
          rows.map(r => r.name).sort(),
          [...EXPECTED_DEFAULT_REASONS].sort(),
        );
        for (const row of rows) {
          assert.equal(row.is_active, true, `${row.name} is active`);
          assert.equal(row.deleted_at, null, `${row.name} is not deleted`);
          assert.equal(row.description, null, `${row.name} has no description`);
        }
      },
    },
    {
      name: 're-applying the migration does not duplicate the seeded reasons',
      run: async () => {
        const inst = await createTestInstitution();
        await runMigration();
        await runMigration();

        assert.equal((await reasonsOf(inst.id)).length, 8);
      },
    },
    {
      name: 'a soft-deleted default is not resurrected by a new migration run',
      run: async () => {
        const inst = await createTestInstitution();
        await runMigration();
        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW(), is_active = FALSE
            WHERE institution_id = $1 AND lower(name) = 'otro'`,
          [inst.id],
        );

        await runMigration();

        const rows = await reasonsOf(inst.id);
        const otros = rows.filter(r => r.name.toLowerCase() === 'otro');
        assert.equal(otros.length, 1, 'still exactly one "Otro" row');
        assert.notEqual(otros[0].deleted_at, null, 'it stays soft-deleted');
        assert.equal(rows.length, 8, 'no other default was duplicated');
      },
    },
    {
      name: 'a custom spelling of a default is not duplicated, the other defaults are still seeded',
      run: async () => {
        const inst = await createTestInstitution();
        const [custom] = await AppDataSource.query(
          `INSERT INTO withdrawal_reasons (institution_id, name, description)
           VALUES ($1, 'cambio de domicilio', 'Motivo propio de la institución') RETURNING id`,
          [inst.id],
        );

        await runMigration();

        const rows = await reasonsOf(inst.id);
        const sameName = rows.filter(r => r.name.toLowerCase() === 'cambio de domicilio');
        assert.equal(sameName.length, 1, 'the custom spelling was not duplicated');
        assert.equal(sameName[0].id, custom.id, 'the custom row was left untouched');
        assert.equal(sameName[0].description, 'Motivo propio de la institución', 'its description was left untouched');

        const seeded = rows.filter(r => r.id !== custom.id).map(r => r.name).sort();
        assert.deepEqual(
          seeded,
          EXPECTED_DEFAULT_REASONS.filter(n => n.toLowerCase() !== 'cambio de domicilio').sort(),
          'the remaining 7 defaults were inserted',
        );
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R8 — write permissions
// ─────────────────────────────────────────────────────────────────────
test('R8: only the roles with the withdrawal-reasons permission can write the catalog', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a request without a token is rejected with 401 and writes nothing',
      run: async () => {
        const inst = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Motivo existente');

        const calls: Array<[string, string]> = [
          ['GET', '/api/withdrawal-reasons'],
          ['POST', '/api/withdrawal-reasons'],
          ['PUT', `/api/withdrawal-reasons/${reason.id}`],
          ['DELETE', `/api/withdrawal-reasons/${reason.id}`],
        ];
        for (const [method, url] of calls) {
          const res = await request(method, url, {
            institutionId: inst.id,
            body: method === 'GET' ? undefined : { name: 'Otro' },
          });
          assert.equal(res.status, 401, `${method} ${url} without a token`);
        }

        const rows = await reasonsOf(inst.id);
        assert.equal(rows.length, 1, 'no row was written');
        assert.equal(rows[0].deleted_at, null, 'the existing row was not touched');
      },
    },
    {
      name: 'a role without the withdrawal-reasons flags cannot create, update or delete',
      run: async () => {
        const inst = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Motivo existente');

        const withoutRow = await createTestRole([]);
        const readOnly = await createTestRole([{ resource: 'withdrawal-reasons', canRead: true }]);

        for (const role of [withoutRow, readOnly]) {
          const { token } = await createUser(role.name, inst.id);
          const calls: Array<[string, string, unknown]> = [
            ['POST', '/api/withdrawal-reasons', { name: 'Nuevo motivo' }],
            ['PUT', `/api/withdrawal-reasons/${reason.id}`, { name: 'Cambiado' }],
            ['DELETE', `/api/withdrawal-reasons/${reason.id}`, undefined],
          ];
          for (const [method, url, body] of calls) {
            const res = await request(method, url, { token, institutionId: inst.id, body });
            assert.equal(res.status, 403, `${method} ${url} as ${role.name}`);
          }
        }

        const rows = await reasonsOf(inst.id);
        assert.equal(rows.length, 1, 'no row was written');
        assert.equal(rows[0].name, 'Motivo existente', 'the existing row was not changed');
      },
    },
    {
      name: 'a role with student-withdrawals permissions only cannot create, update or delete',
      run: async () => {
        const inst = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Motivo existente');

        const withdrawalsRole = await createTestRole([
          { resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        ]);
        const { token } = await createUser(withdrawalsRole.name, inst.id);

        const calls: Array<[string, string, unknown]> = [
          ['POST', '/api/withdrawal-reasons', { name: 'Nuevo motivo' }],
          ['PUT', `/api/withdrawal-reasons/${reason.id}`, { name: 'Cambiado' }],
          ['DELETE', `/api/withdrawal-reasons/${reason.id}`, undefined],
        ];
        for (const [method, url, body] of calls) {
          const res = await request(method, url, { token, institutionId: inst.id, body });
          assert.equal(res.status, 403, `${method} ${url} as ${withdrawalsRole.name}`);
        }

        const rows = await reasonsOf(inst.id);
        assert.equal(rows.length, 1, 'no row was written');
        assert.equal(rows[0].name, 'Motivo existente', 'the existing row was not changed');
      },
    },
    {
      name: 'admin, rector and superadmin get one full-CRUD withdrawal-reasons row',
      run: async () => {
        const rows = await AppDataSource.query(
          `SELECT r.name AS role_name, rp.can_read, rp.can_create, rp.can_update, rp.can_delete
             FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
            WHERE rp.resource = 'withdrawal-reasons'`,
        );

        for (const roleName of ['admin', 'rector', 'superadmin']) {
          const matching = rows.filter((r: any) => r.role_name === roleName);
          assert.equal(matching.length, 1, `one withdrawal-reasons row for ${roleName}`);
          assert.equal(matching[0].can_read, true, `${roleName} can read`);
          assert.equal(matching[0].can_create, true, `${roleName} can create`);
          assert.equal(matching[0].can_update, true, `${roleName} can update`);
          assert.equal(matching[0].can_delete, true, `${roleName} can delete`);
        }
      },
    },
    {
      name: 'no other role gets a withdrawal-reasons row',
      run: async () => {
        const rows = await AppDataSource.query(
          `SELECT r.name AS role_name
             FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
            WHERE rp.resource = 'withdrawal-reasons'`,
        );
        const roleNames = rows.map((r: any) => r.role_name).sort();
        assert.deepEqual(roleNames, ['admin', 'rector', 'superadmin']);
      },
    },
    {
      name: 'applying the migration twice keeps one withdrawal-reasons row per role',
      run: async () => {
        await runMigration();
        await runMigration();

        const rows = await AppDataSource.query(
          `SELECT role_id, COUNT(*)::int AS count
             FROM role_permissions WHERE resource = 'withdrawal-reasons'
            GROUP BY role_id`,
        );
        assert.equal(rows.length, 3, 'one row per seeded role');
        for (const row of rows) assert.equal(row.count, 1);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R9 — read access follows the withdrawal permission
// ─────────────────────────────────────────────────────────────────────
test('R9: the catalog can be read with withdrawal-reasons:read or a student-withdrawals read/create flag', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'a role with withdrawal-reasons:read can list the catalog',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canRead: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
      },
    },
    {
      name: 'a role with student-withdrawals:read can list the catalog',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([{ resource: 'student-withdrawals', canRead: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
      },
    },
    {
      name: 'a role with student-withdrawals:create (read false) can list the catalog',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([{ resource: 'student-withdrawals', canCreate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
      },
    },
    {
      name: 'a role without any of the three permissions gets 403',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(res.status, 403);
        assert.equal(res.body.error, 'Sin permisos para este recurso');
      },
    },
    {
      name: 'a role with only student-withdrawals:update and delete gets 403',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([
          { resource: 'student-withdrawals', canUpdate: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(res.status, 403);
        assert.equal(res.body.error, 'Sin permisos para este recurso');
      },
    },
    {
      name: 'a superadmin does not need any withdrawal-reasons permission row',
      run: async () => {
        const inst = await createTestInstitution();
        const roleWithoutRows = await createTestRole([]);
        const { id: userId, username } = await createUser(roleWithoutRows.name, null);
        // The middleware reads the role from the token: a superadmin token whose
        // role has no permission rows at all proves the rows are not consulted.
        const token = jwt.sign(
          {
            id: userId,
            username,
            roleId: roleWithoutRows.id,
            roleName: 'superadmin',
            institutionId: null,
          },
          process.env.JWT_SECRET || 'secret',
          { expiresIn: '1h' },
        );

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
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
// R4 — list the reasons of the caller's institution
// ─────────────────────────────────────────────────────────────────────
test('R4: listing returns the institution reasons that are not deleted, ordered by name', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the list has only the non-deleted reasons, ordered by name, with the full shape',
      run: async () => {
        const inst = await createTestInstitution();
        await insertReason(inst.id, 'Zeta');
        await insertReason(inst.id, 'Alfa');
        const removed = await insertReason(inst.id, 'Borrado');
        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE id = $1`,
          [removed.id],
        );

        const role = await createTestRole([{ resource: 'withdrawal-reasons', canRead: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));

        const expected = await AppDataSource.query(
          `SELECT name FROM withdrawal_reasons
            WHERE institution_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
          [inst.id],
        );
        assert.deepEqual(res.body.map((r: any) => r.name), expected.map((r: any) => r.name));

        for (const item of res.body) {
          assert.deepEqual(
            Object.keys(item).sort(),
            ['createdAt', 'deletedAt', 'description', 'id', 'institutionId', 'isActive', 'name', 'updatedAt'],
            'the item carries every field of the reason',
          );
          assert.equal(item.institutionId, inst.id);
        }
      },
    },
    {
      name: 'the reasons of another institution are not returned',
      run: async () => {
        const mine = await createTestInstitution();
        const other = await createTestInstitution();
        await insertReason(mine.id, 'Motivo propio');
        await insertReason(other.id, 'Motivo ajeno');

        const role = await createTestRole([{ resource: 'withdrawal-reasons', canRead: true }]);
        const { token } = await createUser(role.name, mine.id);

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: mine.id });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.map((r: any) => r.name), ['Motivo propio']);
      },
    },
    {
      name: 'a superadmin with X-Institution-Id sees the reasons of that institution',
      run: async () => {
        const mine = await createTestInstitution();
        const other = await createTestInstitution();
        await insertReason(mine.id, 'Motivo propio');
        await insertReason(other.id, 'Motivo ajeno');

        const { token } = await createUser('superadmin', null);
        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: mine.id });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.map((r: any) => r.name), ['Motivo propio']);
      },
    },
    {
      name: 'a superadmin without X-Institution-Id gets 400',
      run: async () => {
        const { token } = await createUser('superadmin', null);
        const res = await request('GET', '/api/withdrawal-reasons', { token });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Selecciona una institución');
      },
    },
    {
      name: 'a course-scoped caller sees the whole institution catalog',
      run: async () => {
        const inst = await createTestInstitution();
        await insertReason(inst.id, 'Alfa');
        await insertReason(inst.id, 'Zeta');

        const year = await AppDataSource.getRepository(AcademicYear).save(
          AppDataSource.getRepository(AcademicYear).create({
            name: `2026-${process.pid}_${counter}`,
            institutionId: inst.id,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            isActive: true,
            deletedAt: null,
          }),
        );
        const course = await AppDataSource.getRepository(Course).save(
          AppDataSource.getRepository(Course).create({
            name: uniqueName('__test_wr_course_'),
            fullName: null,
            paralelo: null,
            institutionId: inst.id,
            shift: 'MATUTINA',
            isActive: true,
            deletedAt: null,
          }),
        );

        const role = await createTestRole([{ resource: 'withdrawal-reasons', canRead: true }]);
        const { token, id: userId } = await createUser(role.name, inst.id);
        await AppDataSource.getRepository(UserCourse).save(
          AppDataSource.getRepository(UserCourse).create({
            userId,
            courseId: course.id,
            academicYearId: year.id,
          }),
        );

        const res = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.map((r: any) => r.name), ['Alfa', 'Zeta']);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});
// ─────────────────────────────────────────────────────────────────────
// R5 — create a reason
// ─────────────────────────────────────────────────────────────────────
test('R5: creating a reason validates the body and stores it in the caller institution', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the name and the description are trimmed and the reason is active',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canCreate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('POST', '/api/withdrawal-reasons', {
          token,
          institutionId: inst.id,
          body: { name: '  Embarazo  ', description: '  x  ' },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.name, 'Embarazo');
        assert.equal(res.body.description, 'x');
        assert.equal(res.body.isActive, true);
        assert.equal(res.body.institutionId, inst.id);
      },
    },
    {
      name: 'a missing, null or blank description is stored as null',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canCreate: true }]);
        const { token } = await createUser(role.name, inst.id);

        for (const [index, body] of [
          { name: 'Sin descripción' },
          { name: 'Descripción nula', description: null },
          { name: 'Descripción en blanco', description: '   ' },
        ].entries()) {
          const res = await request('POST', '/api/withdrawal-reasons', {
            token,
            institutionId: inst.id,
            body,
          });
          assert.equal(res.status, 201, `case ${index}`);
          assert.equal(res.body.description, null, `case ${index}`);
        }
      },
    },
    {
      name: 'a missing, non-string, empty or blank name is rejected with 400 and writes nothing',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canCreate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const bodies: unknown[] = [{}, { name: null }, { name: 42 }, { name: '' }, { name: '   ' }];
        for (const body of bodies) {
          const res = await request('POST', '/api/withdrawal-reasons', {
            token,
            institutionId: inst.id,
            body,
          });
          assert.equal(res.status, 400, `body ${JSON.stringify(body)}`);
          assert.equal(res.body.error, 'El nombre del motivo no puede estar vacío');
        }

        assert.equal((await reasonsOf(inst.id)).length, 0, 'no row was created');
      },
    },
    {
      name: 'a name longer than 150 characters is rejected with 400 and writes nothing',
      run: async () => {
        const inst = await createTestInstitution();
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canCreate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('POST', '/api/withdrawal-reasons', {
          token,
          institutionId: inst.id,
          body: { name: 'a'.repeat(151) },
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'El nombre no puede superar 150 caracteres');

        assert.equal((await reasonsOf(inst.id)).length, 0, 'no row was created');
      },
    },
    {
      name: 'a name that repeats a reason of the institution is rejected with 409',
      run: async () => {
        const inst = await createTestInstitution();
        await insertReason(inst.id, 'Embarazo');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canCreate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('POST', '/api/withdrawal-reasons', {
          token,
          institutionId: inst.id,
          body: { name: 'embarazo' },
        });
        assert.equal(res.status, 409);

        assert.equal((await reasonsOf(inst.id)).length, 1, 'no row was created');
      },
    },
    {
      name: 'a name that repeats a soft-deleted reason is accepted',
      run: async () => {
        const inst = await createTestInstitution();
        const removed = await insertReason(inst.id, 'Embarazo');
        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE id = $1`,
          [removed.id],
        );
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canCreate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('POST', '/api/withdrawal-reasons', {
          token,
          institutionId: inst.id,
          body: { name: 'Embarazo' },
        });
        assert.equal(res.status, 201);

        const rows = await reasonsOf(inst.id);
        assert.equal(rows.length, 2, 'the new reason was created next to the soft-deleted one');
        assert.equal(rows.filter(r => r.deleted_at === null).length, 1);
      },
    },
    {
      name: 'a name that repeats a reason of another institution is accepted',
      run: async () => {
        const mine = await createTestInstitution();
        const other = await createTestInstitution();
        await insertReason(other.id, 'Embarazo');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canCreate: true }]);
        const { token } = await createUser(role.name, mine.id);

        const res = await request('POST', '/api/withdrawal-reasons', {
          token,
          institutionId: mine.id,
          body: { name: 'Embarazo' },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.institutionId, mine.id);

        assert.equal((await reasonsOf(mine.id)).length, 1);
        assert.equal((await reasonsOf(other.id)).length, 1);
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R6 — update a reason
// ─────────────────────────────────────────────────────────────────────
test('R6: updating a reason changes only the fields sent in the body', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'sending only a description changes the description and keeps the name',
      run: async () => {
        const inst = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Embarazo', 'Motivo original');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canUpdate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('PUT', `/api/withdrawal-reasons/${reason.id}`, {
          token,
          institutionId: inst.id,
          body: { description: 'Motivo actualizado' },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.description, 'Motivo actualizado');
        assert.equal(res.body.name, 'Embarazo');

        const [row] = await reasonsOf(inst.id);
        assert.equal(row.description, 'Motivo actualizado');
        assert.equal(row.name, 'Embarazo');
      },
    },
    {
      name: 'sending only a name stores it trimmed and keeps the description',
      run: async () => {
        const inst = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Embarazo', 'Motivo original');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canUpdate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('PUT', `/api/withdrawal-reasons/${reason.id}`, {
          token,
          institutionId: inst.id,
          body: { name: '  Embarazo inesperado  ' },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.name, 'Embarazo inesperado');
        assert.equal(res.body.description, 'Motivo original');

        const [row] = await reasonsOf(inst.id);
        assert.equal(row.name, 'Embarazo inesperado');
        assert.equal(row.description, 'Motivo original');
      },
    },
    {
      name: 'a blank or too long name is rejected with 400 and the row is unchanged',
      run: async () => {
        const inst = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Embarazo', 'Motivo original');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canUpdate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const blank = await request('PUT', `/api/withdrawal-reasons/${reason.id}`, {
          token,
          institutionId: inst.id,
          body: { name: '   ' },
        });
        assert.equal(blank.status, 400);
        assert.equal(blank.body.error, 'El nombre del motivo no puede estar vacío');

        const tooLong = await request('PUT', `/api/withdrawal-reasons/${reason.id}`, {
          token,
          institutionId: inst.id,
          body: { name: 'a'.repeat(151) },
        });
        assert.equal(tooLong.status, 400);
        assert.equal(tooLong.body.error, 'El nombre no puede superar 150 caracteres');

        const [row] = await reasonsOf(inst.id);
        assert.equal(row.name, 'Embarazo');
        assert.equal(row.description, 'Motivo original');
      },
    },
    {
      name: 'a name that repeats another reason of the institution is rejected with 409',
      run: async () => {
        const inst = await createTestInstitution();
        await insertReason(inst.id, 'Embarazo');
        const other = await insertReason(inst.id, 'Otro motivo', 'Motivo original');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canUpdate: true }]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('PUT', `/api/withdrawal-reasons/${other.id}`, {
          token,
          institutionId: inst.id,
          body: { name: 'embarazo' },
        });
        assert.equal(res.status, 409);

        const rows = await reasonsOf(inst.id);
        const changed = rows.find(r => r.id === other.id);
        assert.equal(changed.name, 'Otro motivo', 'the row is unchanged');
      },
    },
    {
      name: 'an unknown, soft-deleted or foreign id gets 404 and changes nothing',
      run: async () => {
        const inst = await createTestInstitution();
        const other = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Embarazo', 'Motivo original');
        const removed = await insertReason(inst.id, 'Motivo borrado');
        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE id = $1`,
          [removed.id],
        );
        const foreign = await insertReason(other.id, 'Motivo ajeno');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canUpdate: true }]);
        const { token } = await createUser(role.name, inst.id);

        for (const id of ['999999999', 'no-es-un-id', String(removed.id), String(foreign.id)]) {
          const res = await request('PUT', `/api/withdrawal-reasons/${id}`, {
            token,
            institutionId: inst.id,
            body: { name: 'Nombre nuevo' },
          });
          assert.equal(res.status, 404, `id ${id}`);
          assert.equal(res.body.error, 'Motivo de retiro no encontrado', `id ${id}`);
        }

        const rows = await reasonsOf(inst.id);
        const unchanged = rows.find(r => r.id === reason.id);
        assert.equal(unchanged.name, 'Embarazo', 'the row is unchanged');
        assert.equal(unchanged.description, 'Motivo original');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R7 — delete a reason
// ─────────────────────────────────────────────────────────────────────
test('R7: deleting a reason soft-deletes it and hides it from the catalog', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the row stays in the table, marked as deleted and inactive, and disappears from the list',
      run: async () => {
        const inst = await createTestInstitution();
        const reason = await insertReason(inst.id, 'Embarazo');
        const role = await createTestRole([
          { resource: 'withdrawal-reasons', canRead: true, canDelete: true },
        ]);
        const { token } = await createUser(role.name, inst.id);

        const res = await request('DELETE', `/api/withdrawal-reasons/${reason.id}`, {
          token,
          institutionId: inst.id,
        });
        assert.equal(res.status, 204);

        const [row] = await reasonsOf(inst.id);
        assert.ok(row, 'the row is still in the table');
        assert.notEqual(row.deleted_at, null, 'the row is soft-deleted');
        assert.equal(row.is_active, false, 'the row is inactive');

        const list = await request('GET', '/api/withdrawal-reasons', { token, institutionId: inst.id });
        assert.equal(list.status, 200);
        assert.deepEqual(list.body, [], 'the reason is not listed anymore');
      },
    },
    {
      name: 'an unknown, already deleted or foreign id gets 404 and changes nothing',
      run: async () => {
        const inst = await createTestInstitution();
        const other = await createTestInstitution();
        const kept = await insertReason(inst.id, 'Embarazo');
        const removed = await insertReason(inst.id, 'Motivo borrado');
        await AppDataSource.query(
          `UPDATE withdrawal_reasons SET deleted_at = NOW() WHERE id = $1`,
          [removed.id],
        );
        const foreign = await insertReason(other.id, 'Motivo ajeno');
        const role = await createTestRole([{ resource: 'withdrawal-reasons', canDelete: true }]);
        const { token } = await createUser(role.name, inst.id);

        for (const id of ['999999999', 'no-es-un-id', String(removed.id), String(foreign.id)]) {
          const res = await request('DELETE', `/api/withdrawal-reasons/${id}`, {
            token,
            institutionId: inst.id,
          });
          assert.equal(res.status, 404, `id ${id}`);
          assert.equal(res.body.error, 'Motivo de retiro no encontrado', `id ${id}`);
        }

        const rows = await reasonsOf(inst.id);
        const unchanged = rows.find(r => r.id === kept.id);
        assert.equal(unchanged.deleted_at, null, 'the live row was not deleted');
        assert.equal(unchanged.is_active, true);

        const foreignRows = await reasonsOf(other.id);
        assert.equal(foreignRows.find(r => r.id === foreign.id).deleted_at, null, 'the foreign row was not deleted');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R3 — the default reasons of a new institution
// ─────────────────────────────────────────────────────────────────────
test('R3: creating an institution seeds the same 8 default reasons', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the new institution gets the 8 active defaults',
      run: async () => {
        const { token } = await createUser('superadmin', null);
        const name = uniqueName(TEST_INST_PREFIX);

        const res = await request('POST', '/api/institutions', {
          token,
          body: { name, primaryColor: '#112233' },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.name, name);
        assert.equal(res.body.primaryColor, '#112233');
        assert.equal(res.body.isActive, true);

        const rows = await reasonsOf(res.body.id);
        assert.equal(rows.length, 8, 'the new institution has the 8 defaults');
        for (const row of rows) {
          assert.equal(row.is_active, true, `${row.name} is active`);
          assert.equal(row.deleted_at, null, `${row.name} is not deleted`);
        }
      },
    },
    {
      name: 'the seeded names are the same as the ones the migration seeds',
      run: async () => {
        const { token } = await createUser('superadmin', null);
        const name = uniqueName(TEST_INST_PREFIX);
        const created = await request('POST', '/api/institutions', { token, body: { name } });
        assert.equal(created.status, 201);

        const migrated = await createTestInstitution();
        await runMigration();

        const createdNames = (await reasonsOf(created.body.id)).map(r => r.name).sort();
        const migratedNames = (await reasonsOf(migrated.id)).map(r => r.name).sort();

        assert.deepEqual(createdNames, migratedNames, 'both paths seed the same names');
        assert.deepEqual(
          createdNames,
          [...DEFAULT_WITHDRAWAL_REASONS].sort(),
          'the service constant matches the seeded names',
        );
      },
    },
    {
      name: 'an invalid body creates neither the institution nor its reasons',
      run: async () => {
        const { token } = await createUser('superadmin', null);
        const name = uniqueName(TEST_INST_PREFIX);

        const res = await request('POST', '/api/institutions', {
          token,
          body: { name, primaryColor: 'no-es-un-color' },
        });
        assert.equal(res.status, 400);

        const institutions = await AppDataSource.query(
          `SELECT id FROM institutions WHERE name = $1`,
          [name],
        );
        assert.deepEqual(institutions, [], 'the institution was not created');
        const reasons = await AppDataSource.query(
          `SELECT id FROM withdrawal_reasons WHERE institution_id IN (SELECT id FROM institutions WHERE name = $1)`,
          [name],
        );
        assert.deepEqual(reasons, [], 'no reason was created');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R10 — the admin module key
// ─────────────────────────────────────────────────────────────────────
test('R10: admin:withdrawal-reasons is a valid module key', async (t) => {
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'the key is accepted and stored for the user',
      run: async () => {
        const inst = await createTestInstitution();
        const { token } = await createUser('superadmin', null);
        const target = await createUser('readonly', inst.id);

        const res = await request('PUT', `/api/users/${target.id}/modules`, {
          token,
          institutionId: inst.id,
          body: { moduleKeys: ['admin:withdrawal-reasons'] },
        });
        assert.equal(res.status, 200);

        const rows = await AppDataSource.query(
          `SELECT module_key FROM user_modules WHERE user_id = $1 ORDER BY module_key`,
          [target.id],
        );
        assert.deepEqual(rows.map((r: any) => r.module_key), ['admin:withdrawal-reasons']);
      },
    },
    {
      name: 'a misspelled key is rejected with 400',
      run: async () => {
        const inst = await createTestInstitution();
        const { token } = await createUser('superadmin', null);
        const target = await createUser('readonly', inst.id);

        const res = await request('PUT', `/api/users/${target.id}/modules`, {
          token,
          institutionId: inst.id,
          body: { moduleKeys: ['admin:withdrawal-reason'] },
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Módulo(s) inválido(s): admin:withdrawal-reason');

        const rows = await AppDataSource.query(
          `SELECT module_key FROM user_modules WHERE user_id = $1`,
          [target.id],
        );
        assert.deepEqual(rows, [], 'no module was stored');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, c.run);
  }
});
