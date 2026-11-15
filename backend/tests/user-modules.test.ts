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
import userRouter from '../src/controllers/user.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const TEST_PREFIX = 'testmodules_';
const MIGRATION = path.resolve(process.cwd(), '../postgres/27_admin_citation_reasons_module_key.sql');

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;
let institutionId = 0;
let counter = 0;

async function cleanup() {
  await AppDataSource.query(
    `DELETE FROM user_modules WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [`${TEST_PREFIX}%`],
  );
  await deleteTestUsersByPrefix(TEST_PREFIX);
}

function newUser(opts: { roleName?: string; institutionId?: number | null }) {
  counter += 1;
  return createTestUser({ ...opts, username: `${TEST_PREFIX}${process.pid}_${counter}` });
}

async function moduleKeys(userId: number): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT module_key FROM user_modules WHERE user_id = $1 ORDER BY module_key`, [userId]);
  return rows.map((r: { module_key: string }) => r.module_key);
}

async function runMigration() {
  await AppDataSource.query(fs.readFileSync(MIGRATION, 'utf8'));
}

before(async () => {
  await AppDataSource.initialize();
  const [inst] = await AppDataSource.query(`SELECT id FROM institutions ORDER BY id LIMIT 1`);
  assert.ok(inst, 'needs at least one institution in the DB');
  institutionId = inst.id;

  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/users', userRouter);
  app.use(errorMiddleware);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await cleanup();
  await new Promise<void>((r) => server.close(() => r()));
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});

beforeEach(cleanup);

async function putModules(token: string, userId: number, moduleKeys: string[]) {
  const res = await fetch(`${baseUrl}/api/users/${userId}/modules`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ moduleKeys }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('PUT /api/users/:id/modules accepts admin:citation-reasons and stores it', async () => {
  const admin = await newUser({ roleName: 'superadmin', institutionId: null });
  const target = await newUser({ institutionId });

  const res = await putModules(admin.token, target.id, ['admin', 'admin:citation-reasons']);

  assert.equal(res.status, 200);
  assert.deepEqual(await moduleKeys(target.id), ['admin', 'admin:citation-reasons']);
});

test('PUT /api/users/:id/modules rejects the bare citation-reasons key', async () => {
  const admin = await newUser({ roleName: 'superadmin', institutionId: null });
  const target = await newUser({ institutionId });

  const res = await putModules(admin.token, target.id, ['citation-reasons']);

  assert.equal(res.status, 400);
  assert.deepEqual(await moduleKeys(target.id), []);
});

test('migration renames old citation-reasons rows and is idempotent', async () => {
  const onlyOld = await newUser({ institutionId });
  const both = await newUser({ institutionId });
  await AppDataSource.query(
    `INSERT INTO user_modules (user_id, module_key) VALUES
       ($1, 'citation-reasons'), ($1, 'admin'),
       ($2, 'citation-reasons'), ($2, 'admin:citation-reasons')`,
    [onlyOld.id, both.id],
  );

  await runMigration();
  await runMigration();

  assert.deepEqual(await moduleKeys(onlyOld.id), ['admin', 'admin:citation-reasons']);
  assert.deepEqual(await moduleKeys(both.id), ['admin:citation-reasons']);
});
