import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../src/data-source';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import institutionRouter from '../src/controllers/institution.controller';
import authRouter from '../src/controllers/auth.controller';
import { User } from '../src/entities/User';
import { Institution } from '../src/entities/Institution';
import { Role } from '../src/entities/Role';
import { RolePermission } from '../src/entities/RolePermission';

const JWT_SECRET = () => process.env.JWT_SECRET || 'secret';

let baseUrl = '';
let close: () => Promise<void>;

const TEST_INST_PREFIX = '__test_stats_';
let testInstIds: number[] = [];
let testUserIds: number[] = [];

async function startTestApp(): Promise<void> {
  await AppDataSource.initialize();
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: '*', credentials: false }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authRouter);
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/institutions', institutionRouter);
  app.use(errorMiddleware);

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (typeof addr === 'string' || addr === null) {
        throw new Error('Could not bind ephemeral port');
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      close = () => new Promise<void>((r) => server.close(() => r()));
      resolve();
    });
  });
}

async function stopTestApp(): Promise<void> {
  await close();
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}

async function cleanup(): Promise<void> {
  if (testInstIds.length) {
    await AppDataSource.getRepository(Institution).delete(testInstIds);
    testInstIds = [];
  }
  if (testUserIds.length) {
    await AppDataSource.getRepository(User).delete(testUserIds);
    testUserIds = [];
  }
}

async function createTestInstitution(name: string): Promise<Institution> {
  const inst = AppDataSource.getRepository(Institution).create({
    name,
    isActive: true,
    primaryColor: null,
    secondaryColor: null,
    logoUrl: null,
  });
  const saved = await AppDataSource.getRepository(Institution).save(inst);
  testInstIds.push(saved.id);
  return saved;
}

async function createTestUser(opts: {
  username: string;
  roleName: string;
  institutionId: number | null;
  institutionReadPerm?: boolean;
}): Promise<{ id: number; token: string }> {
  const role = await AppDataSource.getRepository(Role).findOne({ where: { name: opts.roleName } });
  if (!role) throw new Error(`Role '${opts.roleName}' not found — DB not seeded`);

  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const user = AppDataSource.getRepository(User).create({
    username: opts.username,
    passwordHash,
    fullName: `Test ${opts.username}`,
    roleId: role.id,
    institutionId: opts.institutionId,
    isActive: true,
  });
  const saved = await AppDataSource.getRepository(User).save(user);
  testUserIds.push(saved.id);

  if (opts.institutionReadPerm) {
    const existing = await AppDataSource.getRepository(RolePermission).findOne({
      where: { roleId: role.id, resource: 'institutions' },
    });
    if (existing) {
      existing.canRead = true;
      await AppDataSource.getRepository(RolePermission).save(existing);
    } else {
      await AppDataSource.getRepository(RolePermission).save(
        AppDataSource.getRepository(RolePermission).create({
          roleId: role.id,
          resource: 'institutions',
          canRead: true,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        }),
      );
    }
  }

  const token = jwt.sign(
    {
      id: saved.id,
      username: saved.username,
      roleId: saved.roleId ?? 0,
      roleName: opts.roleName,
      institutionId: saved.institutionId,
    },
    JWT_SECRET(),
    { expiresIn: '1h' },
  );

  return { id: saved.id, token };
}

async function authedGet(path: string, token: string | null): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function dbInstitutionStats(): Promise<Map<number, { students: number; courses: number; users: number }>> {
  const sRows: any[] = await AppDataSource.query(
    `SELECT institution_id, COUNT(*)::int AS count FROM students WHERE deleted_at IS NULL GROUP BY institution_id`,
  );
  const cRows: any[] = await AppDataSource.query(
    `SELECT institution_id, COUNT(*)::int AS count FROM courses WHERE deleted_at IS NULL GROUP BY institution_id`,
  );
  const uRows: any[] = await AppDataSource.query(
    `SELECT institution_id, COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL GROUP BY institution_id`,
  );
  const allIds = new Set<number>();
  for (const r of [...sRows, ...cRows, ...uRows]) {
    if (r.institution_id != null) allIds.add(Number(r.institution_id));
  }
  const result = new Map<number, { students: number; courses: number; users: number }>();
  for (const id of allIds) {
    result.set(id, {
      students: Number(sRows.find(r => Number(r.institution_id) === id)?.count ?? 0),
      courses: Number(cRows.find(r => Number(r.institution_id) === id)?.count ?? 0),
      users: Number(uRows.find(r => Number(r.institution_id) === id)?.count ?? 0),
    });
  }
  return result;
}

before(async () => { await startTestApp(); });
after(async () => { await cleanup(); await stopTestApp(); });
beforeEach(async () => { await cleanup(); });

// ─────────────────────────────────────────────────────────────────────
// R1, R7 — list shape: pre-existing fields + new `stats` field
// ─────────────────────────────────────────────────────────────────────
test('R1/R7: GET /api/institutions returns each row with all existing Institution fields plus a `stats` field', async () => {
  const { token } = await createTestUser({
    username: `testuser_${process.pid}_${Date.now()}_r1`,
    roleName: 'superadmin',
    institutionId: null,
  });

  const res = await authedGet('/api/institutions', token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body), 'response is an array');
  assert.ok(res.body.length > 0, 'there is at least one institution');

  for (const row of res.body) {
    // R7: every pre-existing field is present with the right type
    assert.equal(typeof row.id, 'number', 'id is number');
    assert.equal(typeof row.name, 'string', 'name is string');
    assert.equal(typeof row.isActive, 'boolean', 'isActive is boolean');
    assert.ok(
      row.logoUrl === null || typeof row.logoUrl === 'string',
      'logoUrl is string|null',
    );
    assert.ok(
      row.primaryColor === null || typeof row.primaryColor === 'string',
      'primaryColor is string|null',
    );
    assert.ok(
      row.secondaryColor === null || typeof row.secondaryColor === 'string',
      'secondaryColor is string|null',
    );
    assert.equal(typeof row.createdAt, 'string', 'createdAt is string');
    assert.equal(typeof row.updatedAt, 'string', 'updatedAt is string');

    // R1: `stats` is present
    assert.ok('stats' in row, 'row has stats field');
  }
});

// ─────────────────────────────────────────────────────────────────────
// R6 — `stats` shape: exactly { students, courses, users } as numbers
// ─────────────────────────────────────────────────────────────────────
test('R6: stats has exactly students, courses, users — each a non-negative integer — and only those keys', async () => {
  const { token } = await createTestUser({
    username: `testuser_${process.pid}_${Date.now()}_r6`,
    roleName: 'superadmin',
    institutionId: null,
  });

  const res = await authedGet('/api/institutions', token);
  assert.equal(res.status, 200);

  for (const row of res.body) {
    const keys = Object.keys(row.stats).sort();
    assert.deepEqual(keys, ['courses', 'students', 'users'], `stats keys for institution ${row.id}`);

    assert.equal(typeof row.stats.students, 'number');
    assert.equal(typeof row.stats.courses, 'number');
    assert.equal(typeof row.stats.users, 'number');

    assert.ok(Number.isInteger(row.stats.students) && row.stats.students >= 0);
    assert.ok(Number.isInteger(row.stats.courses) && row.stats.courses >= 0);
    assert.ok(Number.isInteger(row.stats.users) && row.stats.users >= 0);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R2, R3, R4 — counts match the DB aggregates
// ─────────────────────────────────────────────────────────────────────
test('R2/R3/R4: stats.{students,courses,users} match SELECT COUNT(*) GROUP BY institution_id', async () => {
  const { token } = await createTestUser({
    username: `testuser_${process.pid}_${Date.now()}_r234`,
    roleName: 'superadmin',
    institutionId: null,
  });

  const res = await authedGet('/api/institutions', token);
  assert.equal(res.status, 200);

  const expected = await dbInstitutionStats();

  for (const row of res.body) {
    const exp = expected.get(row.id);
    assert.ok(exp, `expected stats entry for institution id=${row.id}`);
    assert.equal(row.stats.students, exp!.students, `students for institution ${row.id}`);
    assert.equal(row.stats.courses, exp!.courses, `courses for institution ${row.id}`);
    assert.equal(row.stats.users, exp!.users, `users for institution ${row.id}`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R5 — institution with no rows in any of the 3 tables has 0s, not undefined
// ─────────────────────────────────────────────────────────────────────
test('R5: a freshly-created institution has stats.students=courses=users=0 (no missing fields)', async () => {
  const freshName = `${TEST_INST_PREFIX}empty_${process.pid}_${Date.now()}`;
  const fresh = await createTestInstitution(freshName);

  const { token } = await createTestUser({
    username: `testuser_${process.pid}_${Date.now()}_r5`,
    roleName: 'superadmin',
    institutionId: null,
  });

  const res = await authedGet('/api/institutions', token);
  assert.equal(res.status, 200);

  const row = res.body.find((r: any) => r.id === fresh.id);
  assert.ok(row, 'fresh institution is in the response');
  assert.ok('stats' in row, 'stats is present');
  assert.equal(row.stats.students, 0);
  assert.equal(row.stats.courses, 0);
  assert.equal(row.stats.users, 0);
});

// ─────────────────────────────────────────────────────────────────────
// R3/R4/R5 isolation — counts are strictly per-institution
// ─────────────────────────────────────────────────────────────────────
test('isolation: superadmin counts in A do not include rows from B (and vice versa)', async () => {
  const aName = `${TEST_INST_PREFIX}A_${process.pid}_${Date.now()}`;
  const bName = `${TEST_INST_PREFIX}B_${process.pid}_${Date.now()}`;
  const a = await createTestInstitution(aName);
  const b = await createTestInstitution(bName);

  const { token } = await createTestUser({
    username: `testuser_${process.pid}_${Date.now()}_iso`,
    roleName: 'superadmin',
    institutionId: null,
  });

  const res = await authedGet('/api/institutions', token);
  assert.equal(res.status, 200);

  const aRow = res.body.find((r: any) => r.id === a.id)!;
  const bRow = res.body.find((r: any) => r.id === b.id)!;
  assert.ok(aRow && bRow, 'both fresh institutions in response');

  // Both institutions were just created; neither has any students/courses/users.
  // Their counts must be 0 — not a sum, not a leak from another institution.
  assert.equal(aRow.stats.students, 0);
  assert.equal(aRow.stats.courses, 0);
  assert.equal(aRow.stats.users, 0);
  assert.equal(bRow.stats.students, 0);
  assert.equal(bRow.stats.courses, 0);
  assert.equal(bRow.stats.users, 0);

  // And the cross-check: existing institutions (id=1, id=2 in seed data) must
  // show non-negative integers that match the DB exactly — verifying the
  // GROUP BY institution_id doesn't accidentally merge institutions.
  const expected = await dbInstitutionStats();
  for (const row of res.body) {
    if (row.id === a.id || row.id === b.id) continue;
    const exp = expected.get(row.id);
    if (!exp) continue;
    assert.equal(row.stats.students, exp.students);
    assert.equal(row.stats.courses, exp.courses);
    assert.equal(row.stats.users, exp.users);
  }
});

// ─────────────────────────────────────────────────────────────────────
// R7 — pre-existing fields are byte-identical to a raw repo().find() call
// ─────────────────────────────────────────────────────────────────────
test('R7: pre-existing fields (everything except stats) match the raw repo().find() result byte-for-byte', async () => {
  const { token } = await createTestUser({
    username: `testuser_${process.pid}_${Date.now()}_r7`,
    roleName: 'superadmin',
    institutionId: null,
  });

  const res = await authedGet('/api/institutions', token);
  assert.equal(res.status, 200);

  const raw = await AppDataSource.getRepository(Institution).find({ order: { name: 'ASC' } });

  // Map raw rows by id for O(1) lookup
  const rawById = new Map<number, any>(raw.map(r => [r.id, r]));

  assert.equal(res.body.length, raw.length, 'same number of institutions');

  for (const row of res.body) {
    const rawRow = rawById.get(row.id)!;
    assert.ok(rawRow, `raw row for id=${row.id}`);

    // Compare each pre-existing field exactly. Dates come back from the wire
    // as ISO 8601 strings, but from the entity as Date instances — normalize.
    assert.equal(row.id, rawRow.id);
    assert.equal(row.name, rawRow.name);
    assert.equal(row.isActive, rawRow.isActive);
    assert.equal(row.logoUrl, rawRow.logoUrl);
    assert.equal(row.primaryColor, rawRow.primaryColor);
    assert.equal(row.secondaryColor, rawRow.secondaryColor);
    assert.equal(new Date(row.createdAt).toISOString(), new Date(rawRow.createdAt).toISOString());
    assert.equal(new Date(row.updatedAt).toISOString(), new Date(rawRow.updatedAt).toISOString());

    // The new field is the only delta
    assert.ok('stats' in row);
    assert.ok(!('stats' in rawRow), 'raw entity has no stats field');
  }
});

// ─────────────────────────────────────────────────────────────────────
// R5/R3 — non-superadmin user with institutions:read permission sees the same shape
// ─────────────────────────────────────────────────────────────────────
test('non-superadmin with institutions:read permission sees the same response shape (with stats)', async () => {
  // Create a non-superadmin user tied to institution id=2 with institutions:read on their role.
  // Use an existing seeded role if possible — fall back to the first non-superadmin role.
  const role = await AppDataSource.getRepository(Role).findOne({
    where: { name: 'rector' },
  }) ?? await AppDataSource.getRepository(Role).createQueryBuilder('r')
    .where('r.name != :sn', { sn: 'superadmin' })
    .getOne();

  if (!role) {
    // No roles at all — skip this test rather than fail it on infra
    return;
  }

  const { token } = await createTestUser({
    username: `testuser_${process.pid}_${Date.now()}_rbac`,
    roleName: role.name,
    institutionId: 2,
    institutionReadPerm: true,
  });

  const res = await authedGet('/api/institutions', token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));

  for (const row of res.body) {
    assert.ok('stats' in row, 'stats present for non-superadmin too');
    const keys = Object.keys(row.stats).sort();
    assert.deepEqual(keys, ['courses', 'students', 'users']);
    assert.equal(typeof row.stats.students, 'number');
    assert.equal(typeof row.stats.courses, 'number');
    assert.equal(typeof row.stats.users, 'number');
  }
});
