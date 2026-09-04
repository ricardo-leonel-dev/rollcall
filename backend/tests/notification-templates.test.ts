import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { startTestApp, stopTestApp } from './helpers/test-app';
import {
  createTestUser,
  deleteTestUser,
  deleteTestUsersByPrefix,
  getTestUser,
} from './helpers/test-users';
import {
  deleteTestTemplates,
  getTemplateForUserAction,
  getTemplatesForUser,
} from './helpers/test-templates';
import { AppDataSource } from '../src/data-source';

let baseUrl = '';
let close: () => Promise<void>;

const TEST_PREFIX = 'testuser_';

before(async () => {
  const app = await startTestApp();
  baseUrl = app.baseUrl;
  close = app.close;
});

after(async () => {
  await deleteTestTemplates();
  await deleteTestUsersByPrefix(TEST_PREFIX);
  await stopTestApp(close);
});

beforeEach(async () => {
  await deleteTestTemplates();
  await deleteTestUsersByPrefix(TEST_PREFIX);
});

async function authedGet(path: string, token: string | null): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function authedPut(path: string, token: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const respBody = await res.json().catch(() => null);
  return { status: res.status, body: respBody };
}

// ─────────────────────────────────────────────────────────────────────
// T9 (R5, R9) — GET /api/notification-templates
// ─────────────────────────────────────────────────────────────────────

test('T9.a: GET /api/notification-templates returns 401 without token', async () => {
  const res = await authedGet('/api/notification-templates', null);
  assert.equal(res.status, 401);
});

test('T9.b: GET /api/notification-templates returns 200 with [] for a user with no templates', async () => {
  const { token } = await createTestUser({});
  const res = await authedGet('/api/notification-templates', token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('T9.c: GET /api/notification-templates returns only the requester own rows when other users have rows too', async () => {
  const a = await createTestUser({});
  const b = await createTestUser({});

  await authedPut('/api/notification-templates', a.token, { actionKey: 'absences', template: 'A absences' });
  await authedPut('/api/notification-templates', a.token, { actionKey: 'citations', template: 'A citations' });
  await authedPut('/api/notification-templates', b.token, { actionKey: 'absences', template: 'B absences' });

  const aRes = await authedGet('/api/notification-templates', a.token);
  assert.equal(aRes.status, 200);
  assert.equal(aRes.body.length, 2);
  const aKeys = aRes.body.map((r: any) => r.actionKey).sort();
  assert.deepEqual(aKeys, ['absences', 'citations']);
  for (const row of aRes.body) {
    assert.ok(row.template.startsWith('A '), `expected A prefix, got ${row.template}`);
  }

  const bRes = await authedGet('/api/notification-templates', b.token);
  assert.equal(bRes.status, 200);
  assert.equal(bRes.body.length, 1);
  assert.equal(bRes.body[0].actionKey, 'absences');
  assert.equal(bRes.body[0].template, 'B absences');
});

// ─────────────────────────────────────────────────────────────────────
// T10 (R6, R11) — PUT /api/notification-templates happy path
// ─────────────────────────────────────────────────────────────────────

test('T10: PUT first call creates a row; second call with same actionKey updates in place (GET returns 1 entry)', async () => {
  const { token } = await createTestUser({});

  const first = await authedPut('/api/notification-templates', token, { actionKey: 'absences', template: 'first version' });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { actionKey: 'absences', template: 'first version' });

  const second = await authedPut('/api/notification-templates', token, { actionKey: 'absences', template: 'second version' });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { actionKey: 'absences', template: 'second version' });

  const list = await authedGet('/api/notification-templates', token);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].actionKey, 'absences');
  assert.equal(list.body[0].template, 'second version');
});

// ─────────────────────────────────────────────────────────────────────
// T11 (R7) — invalid actionKey → 400, table unchanged
// ─────────────────────────────────────────────────────────────────────

test('T11: PUT with invalid actionKey returns 400 and does not write to the table', async () => {
  const { token, id } = await createTestUser({});
  const res = await authedPut('/api/notification-templates', token, { actionKey: 'nope', template: 'whatever' });
  assert.equal(res.status, 400);

  const rows = await getTemplatesForUser(id);
  assert.equal(rows.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// T12 (R8) — missing/blank template → 400, table unchanged
// ─────────────────────────────────────────────────────────────────────

test('T12.a: PUT with missing template returns 400 and does not write', async () => {
  const { token, id } = await createTestUser({});
  const res = await authedPut('/api/notification-templates', token, { actionKey: 'absences' });
  assert.equal(res.status, 400);
  const rows = await getTemplatesForUser(id);
  assert.equal(rows.length, 0);
});

test('T12.b: PUT with blank template returns 400 and does not write', async () => {
  const { token, id } = await createTestUser({});
  const res = await authedPut('/api/notification-templates', token, { actionKey: 'absences', template: '   ' });
  assert.equal(res.status, 400);
  const rows = await getTemplatesForUser(id);
  assert.equal(rows.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// T13 (R10) — userId/id in body ignored
// ─────────────────────────────────────────────────────────────────────

test('T13: PUT with userId and id in body still targets the authenticated requester', async () => {
  const a = await createTestUser({});
  const b = await createTestUser({});

  const res = await authedPut('/api/notification-templates', a.token, {
    actionKey: 'citations',
    template: 'for a',
    userId: b.id,
    id: b.id,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { actionKey: 'citations', template: 'for a' });

  const aRows = await getTemplatesForUser(a.id);
  assert.equal(aRows.length, 1);
  assert.equal(aRows[0].actionKey, 'citations');
  assert.equal(aRows[0].template, 'for a');

  const bRows = await getTemplatesForUser(b.id);
  assert.equal(bRows.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// T14 (R2, R3) — Migration backfill + column drop
// ─────────────────────────────────────────────────────────────────────

test('T14: migration backfills a non-blank users.notification_template row into user_message_templates(absences) and drops the column', async () => {
  // This test simulates the pre-migration state. If the column has already
  // been dropped by a prior run, re-add it (idempotent restoration) so we
  // can prove the migration behaves correctly.
  await AppDataSource.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_template TEXT`);

  const { id: userId } = await createTestUser({});
  await AppDataSource.query(`UPDATE users SET notification_template = $1 WHERE id = $2`, [
    '  my absences template  ', // surrounding whitespace — verifies TRIM
    userId,
  ]);

  // Run the migration SQL verbatim from postgres/20_notification_templates_per_action.sql
  // (located at /home/rileo/ai-personal/postgres/, sibling of the backend/ directory).
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'postgres', '20_notification_templates_per_action.sql'),
    path.resolve(process.cwd(), '..', 'postgres', '20_notification_templates_per_action.sql'),
  ];
  const sqlPath = candidates.find(p => fs.existsSync(p));
  if (!sqlPath) throw new Error(`migration SQL not found in any of: ${candidates.join(', ')}`);
  const migrationSql = fs.readFileSync(sqlPath, 'utf-8');
  await AppDataSource.query(migrationSql);

  // R2: row inserted with action_key='absences' and trimmed template value
  const row = await getTemplateForUserAction(userId, 'absences');
  assert.ok(row, `expected a user_message_templates row for user ${userId}, action_key='absences'`);
  assert.equal(row!.actionKey, 'absences');
  assert.equal(row!.template, '  my absences template  '); // backfill copies verbatim (no trim per spec — trim is only for the WHERE filter)

  // R3: column dropped
  const colCheck = await AppDataSource.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'attendance' AND table_name = 'users' AND column_name = 'notification_template'`
  );
  assert.equal(colCheck.length, 0, 'users.notification_template column should have been dropped');

  // Cleanup: delete the backfilled row so subsequent tests start clean
  await AppDataSource.getRepository('user_message_templates' as any).delete({ userId });
  // Restore the column so the test is re-runnable
  await AppDataSource.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_template TEXT`);
});

// ─────────────────────────────────────────────────────────────────────
// T15 (R12) — /api/auth/me no longer references notificationTemplate
// ─────────────────────────────────────────────────────────────────────

test('T15.a: GET /api/auth/me response body does not contain notificationTemplate', async () => {
  const { token } = await createTestUser({});
  const res = await authedGet('/api/auth/me', token);
  assert.equal(res.status, 200);
  assert.equal('notificationTemplate' in res.body, false);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'notificationTemplate'), false);
});

test('T15.b: PUT /api/auth/me with notificationTemplate in body is silently ignored (no error, no persisted effect)', async () => {
  const { token, id } = await createTestUser({});
  // Also seed a non-blank value in the legacy column if it exists, to prove
  // the request does not write to it (re-add column if absent from prior tests).
  await AppDataSource.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_template TEXT`);
  await AppDataSource.query(`UPDATE users SET notification_template = NULL WHERE id = $1`, [id]);

  const res = await authedPut('/api/auth/me', token, {
    fullName: 'Updated Name',
    notificationTemplate: 'should be ignored',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.fullName, 'Updated Name');
  assert.equal('notificationTemplate' in res.body, false);

  // The legacy column, if it still exists, must not have been written.
  const after = await getTestUser(id);
  if (after && (await AppDataSource.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'attendance' AND table_name = 'users' AND column_name = 'notification_template'`
  )).length > 0) {
    const v = await AppDataSource.query(`SELECT notification_template FROM users WHERE id = $1`, [id]);
    assert.equal(v[0].notification_template, null, 'notificationTemplate field in PUT body must not be persisted');
  }
});