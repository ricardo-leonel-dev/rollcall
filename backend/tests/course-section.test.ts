import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import { AppDataSource } from '../src/data-source';
import courseRouter from '../src/controllers/course.controller';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { institutionMiddleware } from '../src/middleware/institution.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { Institution } from '../src/entities/Institution';
import { createTestUser, deleteTestUsersByPrefix } from './helpers/test-users';

const MIGRATION_FILE = '32_rename_course_paralelo_to_section.sql';

const TEST_INST_PREFIX = '__test_csec_inst_';
const TEST_USER_PREFIX = 'testuser_csec_';

const OLD_CONSTRAINT = 'uq_courses_institution_fullname_paralelo_shift';
const NEW_CONSTRAINT = 'uq_courses_institution_fullname_section_shift';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;
let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}${process.pid.toString(36)}${Date.now().toString(36).slice(-5)}${counter.toString(36)}`;
}

function migrationSql(filename: string): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'postgres', filename),
    path.resolve(process.cwd(), '..', 'postgres', filename),
  ];
  const p = candidates.find(c => fs.existsSync(c));
  if (!p) throw new Error(`migration SQL not found in any of: ${candidates.join(', ')}`);
  return fs.readFileSync(p, 'utf8');
}

async function runMigration(): Promise<void> {
  await AppDataSource.query(migrationSql(MIGRATION_FILE));
}

async function courseColumns(): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'courses'`,
  );
  return rows.map((r: any) => r.column_name);
}

async function courseConstraints(): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT c.conname FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'courses' AND t.relnamespace = current_schema()::regnamespace`,
  );
  return rows.map((r: any) => r.conname);
}

// Puts the table back in the shape it had before the rename, so the
// migration is exercised from a known starting point.
async function restoreLegacyState(): Promise<void> {
  if ((await courseColumns()).includes('section')) {
    await AppDataSource.query(`ALTER TABLE courses RENAME COLUMN section TO paralelo`);
  }
  if ((await courseConstraints()).includes(NEW_CONSTRAINT)) {
    await AppDataSource.query(`ALTER TABLE courses RENAME CONSTRAINT ${NEW_CONSTRAINT} TO ${OLD_CONSTRAINT}`);
  }
}

async function cleanup(): Promise<void> {
  const inst = [`${TEST_INST_PREFIX}%`];
  await AppDataSource.query(
    `DELETE FROM courses WHERE institution_id IN (SELECT id FROM institutions WHERE name LIKE $1)`,
    inst,
  );
  await deleteTestUsersByPrefix(TEST_USER_PREFIX);
  await AppDataSource.query(`DELETE FROM institutions WHERE name LIKE $1`, inst);
}

async function request(
  method: string,
  urlPath: string,
  opts: { token: string; institutionId: number; body?: unknown },
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    'X-Institution-Id': String(opts.institutionId),
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  await AppDataSource.initialize();
  await runMigration();

  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/courses', courseRouter);
  app.use(errorMiddleware);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await cleanup();
  // The database is left in the migrated shape the rest of the suite expects.
  await runMigration();
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});

test('the migration renames the course column and its unique constraint, and can run twice', async () => {
  await restoreLegacyState();
  assert.ok((await courseColumns()).includes('paralelo'), 'legacy column is in place before the migration');

  await runMigration();
  await runMigration();

  const columns = await courseColumns();
  assert.ok(columns.includes('section'));
  assert.ok(!columns.includes('paralelo'));
  const constraints = await courseConstraints();
  assert.ok(constraints.includes(NEW_CONSTRAINT));
  assert.ok(!constraints.includes(OLD_CONSTRAINT));
});

test('course create, update and list answer with section and keep it unique per full name and shift', async () => {
  const instRepo = AppDataSource.getRepository(Institution);
  const institution = await instRepo.save(instRepo.create({
    name: uniqueName(TEST_INST_PREFIX),
    isActive: true,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  }));
  const { token } = await createTestUser({
    username: uniqueName(TEST_USER_PREFIX),
    roleName: 'superadmin',
    institutionId: null,
  });
  const auth = { token, institutionId: institution.id };

  const created = await request('POST', '/api/courses', {
    ...auth,
    body: { name: uniqueName('c'), fullName: 'decimo', section: 'a', shift: 'matutina' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.section, 'A');
  assert.ok(!('paralelo' in created.body));

  const updated = await request('PUT', `/api/courses/${created.body.id}`, { ...auth, body: { section: 'b' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.section, 'B');

  const listed = await request('GET', '/api/courses', auth);
  assert.equal(listed.status, 200);
  const row = listed.body.find((c: any) => c.id === created.body.id);
  assert.equal(row.section, 'B');
  assert.ok(!('paralelo' in row));

  // Same full name, section and shift collides on the renamed constraint.
  const duplicate = await request('POST', '/api/courses', {
    ...auth,
    body: { name: uniqueName('c'), fullName: 'decimo', section: 'b', shift: 'matutina' },
  });
  assert.notEqual(duplicate.status, 201);
  const [stored] = await AppDataSource.query(
    `SELECT count(*)::int AS total FROM courses WHERE institution_id = $1`,
    [institution.id],
  );
  assert.equal(stored.total, 1);
});
