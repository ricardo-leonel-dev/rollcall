import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { startTestApp, stopTestApp } from './helpers/test-app';
import {
  createTestUser,
  deleteTestUsersByPrefix,
} from './helpers/test-users';
import {
  deleteTestTemplates,
  getTemplatesForUser,
} from './helpers/test-templates';
import {
  createTestAction,
  deleteTestActions,
} from './helpers/test-template-actions';
import { AppDataSource } from '../src/data-source';
import { MessageTemplateAction } from '../src/entities/MessageTemplateAction';
import { UserMessageTemplate } from '../src/entities/UserMessageTemplate';

let baseUrl = '';
let close: () => Promise<void>;

const TEST_PREFIX = 'testuser_';

const ABSENCES_DEFAULT =
  'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.';
const CITATIONS_DEFAULT =
  'Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.';

before(async () => {
  const app = await startTestApp();
  baseUrl = app.baseUrl;
  close = app.close;
});

after(async () => {
  await deleteTestTemplates();
  await deleteTestActions();
  await deleteTestUsersByPrefix(TEST_PREFIX);
  await stopTestApp(close);
});

beforeEach(async () => {
  await deleteTestTemplates();
  await deleteTestActions();
  await deleteTestUsersByPrefix(TEST_PREFIX);
});

async function authedRequest(
  method: string,
  urlPath: string,
  token: string | null,
  body?: any,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const respBody = await res.json().catch(() => null);
  return { status: res.status, body: respBody };
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

// ─────────────────────────────────────────────────────────────────────
// T10 (R1, R2, R3, R4, R5) — migration runs twice + seeds
// ─────────────────────────────────────────────────────────────────────

test('T10: migration 24 runs twice without error and seeds exactly one row per action_key', async () => {
  const sql = fs.readFileSync(migrationPath('24_message_template_actions.sql'), 'utf-8');
  await AppDataSource.query(sql);
  await AppDataSource.query(sql); // idempotency

  const absences = await AppDataSource.getRepository(MessageTemplateAction)
    .findOne({ where: { actionKey: 'absences' } });
  assert.ok(absences, 'absences row missing');
  assert.equal(absences!.active, true);
  assert.equal(absences!.defaultTemplate, ABSENCES_DEFAULT);
  assert.deepEqual(
    absences!.placeholders.map(p => p.key),
    ['nombre', 'fecha', 'tipo', 'curso'],
  );
  for (const ph of absences!.placeholders) {
    assert.equal(typeof ph.label, 'string');
    assert.ok(ph.label.length > 0);
  }

  const citations = await AppDataSource.getRepository(MessageTemplateAction)
    .findOne({ where: { actionKey: 'citations' } });
  assert.ok(citations, 'citations row missing');
  assert.equal(citations!.active, true);
  assert.equal(citations!.defaultTemplate, CITATIONS_DEFAULT);
  assert.deepEqual(
    citations!.placeholders.map(p => p.key),
    ['nombre', 'fecha', 'hora'],
  );
  for (const ph of citations!.placeholders) {
    assert.equal(typeof ph.label, 'string');
    assert.ok(ph.label.length > 0);
  }

  // Exactly one row per seeded action_key after running twice.
  const dup = await AppDataSource.query(
    "SELECT action_key, COUNT(*)::int AS n FROM message_template_actions " +
    "WHERE action_key IN ('absences','citations') GROUP BY action_key",
  );
  for (const row of dup) {
    assert.equal(row.n, 1, `${row.action_key} should have exactly one row`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// T11 (R6) — no NOTIFICATION_ACTION_KEYS under src/
// ─────────────────────────────────────────────────────────────────────

test('T11: no .ts file under src/ contains NOTIFICATION_ACTION_KEYS', () => {
  const srcDir = path.resolve(__dirname, '..', 'src');
  const offenders: string[] = [];
  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && full.endsWith('.ts')) {
        const txt = fs.readFileSync(full, 'utf-8');
        if (txt.includes('NOTIFICATION_ACTION_KEYS')) offenders.push(full);
      }
    }
  }
  walk(srcDir);
  assert.deepEqual(offenders, [], `files still reference NOTIFICATION_ACTION_KEYS: ${offenders.join(', ')}`);
});

// ─────────────────────────────────────────────────────────────────────
// T12 (R21) — 401 without token
// ─────────────────────────────────────────────────────────────────────

test('T12: GET / PUT / DELETE return 401 without a token, and leave user_message_templates unchanged', async () => {
  const { token, id } = await createTestUser({});
  // Seed one row so we can prove it survives the unauthenticated calls.
  await AppDataSource.getRepository(UserMessageTemplate).save({
    userId: id,
    actionKey: 'absences',
    template: 'pre-existing',
  });
  const before = await getTemplatesForUser(id);
  assert.equal(before.length, 1);

  const get401 = await authedRequest('GET', '/api/notification-templates', null);
  assert.equal(get401.status, 401);

  const put401 = await authedRequest('PUT', '/api/notification-templates', null, { actionKey: 'citations', template: 'x' });
  assert.equal(put401.status, 401);

  const del401 = await authedRequest('DELETE', '/api/notification-templates/absences', null);
  assert.equal(del401.status, 401);

  const after = await getTemplatesForUser(id);
  assert.equal(after.length, 1);
  assert.equal(after[0].template, 'pre-existing');
});

// ─────────────────────────────────────────────────────────────────────
// T14 (R7, R10) — GET shape + defaults for a fresh user
// ─────────────────────────────────────────────────────────────────────

test('T14: GET for a fresh user returns one item per active catalog row with full shape', async () => {
  const { token } = await createTestUser({});
  const res = await authedRequest('GET', '/api/notification-templates', token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));

  // Active catalog keys queried from the DB.
  const active = await AppDataSource.getRepository(MessageTemplateAction)
    .find({ where: { active: true } });
  assert.equal(res.body.length, active.length);
  const activeKeys = new Set(active.map(a => a.actionKey));
  assert.deepEqual(
    new Set(res.body.map((r: any) => r.actionKey)),
    activeKeys,
  );

  for (const item of res.body) {
    assert.ok('actionKey' in item);
    assert.ok('label' in item);
    assert.ok('description' in item);
    assert.ok('placeholders' in item);
    assert.ok('defaultTemplate' in item);
    assert.ok('template' in item);
    assert.ok('isCustom' in item);
    assert.equal(item.isCustom, false);
  }

  const absencesItem = res.body.find((r: any) => r.actionKey === 'absences');
  assert.equal(absencesItem.template, ABSENCES_DEFAULT);
  assert.equal(absencesItem.defaultTemplate, ABSENCES_DEFAULT);
  assert.equal(absencesItem.isCustom, false);
  const citationsItem = res.body.find((r: any) => r.actionKey === 'citations');
  assert.equal(citationsItem.template, CITATIONS_DEFAULT);
  assert.equal(citationsItem.defaultTemplate, CITATIONS_DEFAULT);
  assert.equal(citationsItem.isCustom, false);
});

// ─────────────────────────────────────────────────────────────────────
// T15 (R8) — ordering by sort_order, then action_key
// ─────────────────────────────────────────────────────────────────────

test('T15: GET orders by sort_order ascending, breaking ties by action_key ascending', async () => {
  await createTestAction({ suffix: 'b', sortOrder: -100, defaultTemplate: 'd-b' });
  await createTestAction({ suffix: 'a', sortOrder: -100, defaultTemplate: 'd-a' });
  await createTestAction({ suffix: 'c', sortOrder: 15,   defaultTemplate: 'd-c' });

  const { token } = await createTestUser({});
  const res = await authedRequest('GET', '/api/notification-templates', token);
  assert.equal(res.status, 200);

  const order = res.body.map((r: any) => r.actionKey);
  const expected = ['testaction_a', 'testaction_b', 'absences', 'testaction_c', 'citations'];
  assert.deepEqual(order, expected);
});

// ─────────────────────────────────────────────────────────────────────
// T16 (R9, R11) — custom vs default, two users
// ─────────────────────────────────────────────────────────────────────

test('T16: custom template is per-user (req.user.id only)', async () => {
  const a = await createTestUser({});
  const b = await createTestUser({});

  const aPut1 = await authedRequest('PUT', '/api/notification-templates', a.token, {
    actionKey: 'absences',
    template: 'A absences custom',
  });
  assert.equal(aPut1.status, 200);
  assert.equal(aPut1.body.isCustom, true);
  assert.equal(aPut1.body.template, 'A absences custom');
  assert.equal(aPut1.body.defaultTemplate, ABSENCES_DEFAULT);

  // A's GET: absences custom, citations default.
  const aGet = await authedRequest('GET', '/api/notification-templates', a.token);
  const aAbs = aGet.body.find((r: any) => r.actionKey === 'absences');
  const aCit = aGet.body.find((r: any) => r.actionKey === 'citations');
  assert.equal(aAbs.isCustom, true);
  assert.equal(aAbs.template, 'A absences custom');
  assert.equal(aCit.isCustom, false);
  assert.equal(aCit.template, CITATIONS_DEFAULT);

  // B's GET: absences default, citations default — never sees A's customization.
  const bGet = await authedRequest('GET', '/api/notification-templates', b.token);
  const bAbs = bGet.body.find((r: any) => r.actionKey === 'absences');
  assert.equal(bAbs.isCustom, false);
  assert.equal(bAbs.template, ABSENCES_DEFAULT);
});

// ─────────────────────────────────────────────────────────────────────
// T17 (R12) — inactive action omitted even with saved row
// ─────────────────────────────────────────────────────────────────────

test('T17: GET omits inactive actions even when the user has a saved template for them', async () => {
  const { token, id } = await createTestUser({});
  await createTestAction({ suffix: 'off', active: false, defaultTemplate: 'd-off' });
  // Seed a user template for the inactive action directly (catalog services
  // refuse to upsert on inactive, hence direct insert).
  await AppDataSource.getRepository(UserMessageTemplate).save({
    userId: id,
    actionKey: 'testaction_off',
    template: 'saved for off',
  });

  const res = await authedRequest('GET', '/api/notification-templates', token);
  assert.equal(res.status, 200);
  const keys = res.body.map((r: any) => r.actionKey);
  assert.ok(!keys.includes('testaction_off'), 'inactive action must not appear');
});

// ─────────────────────────────────────────────────────────────────────
// T18 (R13) — PUT creates then updates in place, full item in response
// ─────────────────────────────────────────────────────────────────────

test('T18: PUT upserts in place and returns the full item with isCustom=true and defaultTemplate unchanged', async () => {
  const { token, id } = await createTestUser({});
  const first = await authedRequest('PUT', '/api/notification-templates', token, {
    actionKey: 'citations',
    template: 'first version',
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.actionKey, 'citations');
  assert.equal(first.body.isCustom, true);
  assert.equal(first.body.template, 'first version');
  assert.equal(first.body.defaultTemplate, CITATIONS_DEFAULT);

  const second = await authedRequest('PUT', '/api/notification-templates', token, {
    actionKey: 'citations',
    template: 'second version',
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.isCustom, true);
  assert.equal(second.body.template, 'second version');
  assert.equal(second.body.defaultTemplate, CITATIONS_DEFAULT);

  // Only one row after two PUTs.
  const rows = await getTemplatesForUser(id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].template, 'second version');
});

// ─────────────────────────────────────────────────────────────────────
// T19 (R14, R15, R16) — PUT 400s without writing
// ─────────────────────────────────────────────────────────────────────

test('T19: PUT with unknown / inactive / blank template returns 400 and writes nothing', async () => {
  const { token, id } = await createTestUser({});
  await createTestAction({ suffix: 'off', active: false, defaultTemplate: 'd-off' });

  const r1 = await authedRequest('PUT', '/api/notification-templates', token, { actionKey: 'nope', template: 'x' });
  assert.equal(r1.status, 400);

  const r2 = await authedRequest('PUT', '/api/notification-templates', token, { actionKey: 'testaction_off', template: 'x' });
  assert.equal(r2.status, 400);

  const r3 = await authedRequest('PUT', '/api/notification-templates', token, { actionKey: 'absences', template: '   ' });
  assert.equal(r3.status, 400);

  const r4 = await authedRequest('PUT', '/api/notification-templates', token, { actionKey: 'absences' });
  assert.equal(r4.status, 400);

  const rows = await getTemplatesForUser(id);
  assert.equal(rows.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// T20 (R17, R18, R20) — DELETE restores default, idempotent, user-scoped
// ─────────────────────────────────────────────────────────────────────

test('T20: DELETE restores default; idempotent on second call; scoped to req.user.id only', async () => {
  const a = await createTestUser({});
  const b = await createTestUser({});

  await authedRequest('PUT', '/api/notification-templates', a.token, { actionKey: 'absences', template: 'A custom' });
  await authedRequest('PUT', '/api/notification-templates', b.token, { actionKey: 'absences', template: 'B custom' });

  const del = await authedRequest('DELETE', '/api/notification-templates/absences', a.token);
  assert.equal(del.status, 200);
  assert.equal(del.body.actionKey, 'absences');
  assert.equal(del.body.isCustom, false);
  assert.equal(del.body.template, ABSENCES_DEFAULT);
  assert.equal(del.body.defaultTemplate, ABSENCES_DEFAULT);

  // A's row is gone; B's row untouched.
  const aRows = await getTemplatesForUser(a.id);
  assert.equal(aRows.length, 0);
  const bRows = await getTemplatesForUser(b.id);
  assert.equal(bRows.length, 1);
  assert.equal(bRows[0].template, 'B custom');

  // Second DELETE from A — idempotent.
  const del2 = await authedRequest('DELETE', '/api/notification-templates/absences', a.token);
  assert.equal(del2.status, 200);
  assert.equal(del2.body.isCustom, false);
  assert.equal(del2.body.template, ABSENCES_DEFAULT);
});

// ─────────────────────────────────────────────────────────────────────
// T21 (R19) — DELETE 404s for unknown / inactive
// ─────────────────────────────────────────────────────────────────────

test('T21: DELETE on unknown / inactive actionKey returns 404 and does not delete', async () => {
  const { token, id } = await createTestUser({});
  await createTestAction({ suffix: 'off', active: false, defaultTemplate: 'd-off' });
  await AppDataSource.getRepository(UserMessageTemplate).save({
    userId: id,
    actionKey: 'testaction_off',
    template: 'must survive',
  });

  const r1 = await authedRequest('DELETE', '/api/notification-templates/nope', token);
  assert.equal(r1.status, 404);

  const r2 = await authedRequest('DELETE', '/api/notification-templates/testaction_off', token);
  assert.equal(r2.status, 404);

  const rows = await AppDataSource.getRepository(UserMessageTemplate)
    .find({ where: { userId: id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].template, 'must survive');
});

// ─────────────────────────────────────────────────────────────────────
// T22 (R22) — entity metadata mapping
// ─────────────────────────────────────────────────────────────────────

test('T22: MessageTemplateAction entity maps the expected columns', () => {
  const md = AppDataSource.getMetadata(MessageTemplateAction);
  assert.equal(md.tableName, 'message_template_actions');
  const cols: Record<string, string> = {};
  for (const c of md.columns) cols[c.propertyName] = c.databaseName;
  assert.equal(cols.actionKey, 'action_key');
  assert.equal(cols.defaultTemplate, 'default_template');
  assert.equal(cols.sortOrder, 'sort_order');
  assert.ok('label' in cols);
  assert.ok('description' in cols);
  assert.ok('placeholders' in cols);
  assert.ok('active' in cols);
});

// ─────────────────────────────────────────────────────────────────────
// T23 (R23) — FK rejects and FK exists in information_schema
// ─────────────────────────────────────────────────────────────────────

test('T23: FK rejects unknown action_key and the constraint exists in information_schema', async () => {
  const { id } = await createTestUser({});

  let rejected = false;
  try {
    await AppDataSource.getRepository(UserMessageTemplate).save({
      userId: id,
      actionKey: 'nope',
      template: 'should not persist',
    });
  } catch (err: any) {
    rejected = true;
    assert.match(String(err.message), /foreign key/i);
  }
  assert.equal(rejected, true, 'direct insert with unknown action_key must throw FK violation');

  const rows = await AppDataSource.getRepository(UserMessageTemplate).find({ where: { userId: id } });
  assert.equal(rows.length, 0);

  const fk = await AppDataSource.query(
    "SELECT 1 FROM information_schema.table_constraints " +
    "WHERE constraint_schema = current_schema() " +
    "  AND constraint_name = 'fk_user_message_templates_action' " +
    "  AND table_name = 'user_message_templates' " +
    "  AND constraint_type = 'FOREIGN KEY'",
  );
  assert.equal(fk.length, 1, 'FK fk_user_message_templates_action must exist');
});

// ─────────────────────────────────────────────────────────────────────
// T24 (acceptance A, B) — migration 25 rewrites citations catalog state,
// absences row is byte-identical, running twice is idempotent.
// ─────────────────────────────────────────────────────────────────────

test('T24: migration 25 rewrites citations catalog state, leaves absences untouched, and runs twice cleanly', async () => {
  // Snapshot the absences row before the migration so we can prove it is
  // byte-identical afterwards.
  const absencesBefore = await AppDataSource.getRepository(MessageTemplateAction)
    .findOneOrFail({ where: { actionKey: 'absences' } });
  const absencesTemplateBefore = absencesBefore.defaultTemplate;
  const absencesPlaceholdersBefore = JSON.stringify(absencesBefore.placeholders);

  const sql = fs.readFileSync(migrationPath('25_citation_template_hora.sql'), 'utf-8');

  // First apply.
  await AppDataSource.query(sql);
  // Second apply — must not error, must be a no-op on user_message_templates
  // (every row that matched the WHERE already has {{hora}} after the first run).
  await AppDataSource.query(sql);

  // Catalog state: citations has the new placeholders + default.
  const citations = await AppDataSource.getRepository(MessageTemplateAction)
    .findOneOrFail({ where: { actionKey: 'citations' } });
  assert.deepEqual(
    citations.placeholders.map(p => p.key),
    ['nombre', 'fecha', 'hora'],
  );
  assert.equal(citations.defaultTemplate, CITATIONS_DEFAULT);
  // placeholder labels per the acceptance contract.
  const phLabels: Record<string, string> = {};
  for (const p of citations.placeholders) phLabels[p.key] = p.label;
  assert.equal(phLabels.nombre, 'Nombre del estudiante');
  assert.equal(phLabels.fecha, 'Fecha de la citación');
  assert.equal(phLabels.hora, 'Hora de la citación');

  // absences row is byte-identical.
  const absencesAfter = await AppDataSource.getRepository(MessageTemplateAction)
    .findOneOrFail({ where: { actionKey: 'absences' } });
  assert.equal(absencesAfter.defaultTemplate, absencesTemplateBefore);
  assert.equal(JSON.stringify(absencesAfter.placeholders), absencesPlaceholdersBefore);
});

// ─────────────────────────────────────────────────────────────────────
// T25 (acceptance C) — user_message_templates citations row containing
// `{{fecha}}` but not `{{hora}}` is rewritten to `{{fecha}} a las {{hora}}`;
// user rows for other action_keys are not touched.
// ─────────────────────────────────────────────────────────────────────

test('T25: migration 25 rewrites legacy citations user rows to append ` a las {{hora}}` and leaves absences rows alone', async () => {
  const { id: userAId } = await createTestUser({});
  const { id: userBId } = await createTestUser({});

  // Legacy citations row: contains {{fecha}}, not {{hora}} — must be rewritten.
  await AppDataSource.getRepository(UserMessageTemplate).save({
    userId: userAId,
    actionKey: 'citations',
    template: 'Estimado apoderado, {{nombre}} el {{fecha}}.',
  });
  // absences row: must not be touched at all.
  await AppDataSource.getRepository(UserMessageTemplate).save({
    userId: userBId,
    actionKey: 'absences',
    template: 'Mi ausencia {{nombre}} el {{fecha}} en {{curso}}.',
  });

  const sql = fs.readFileSync(migrationPath('25_citation_template_hora.sql'), 'utf-8');
  await AppDataSource.query(sql);

  const aRow = await AppDataSource.getRepository(UserMessageTemplate)
    .findOneOrFail({ where: { userId: userAId, actionKey: 'citations' } });
  assert.equal(
    aRow.template,
    'Estimado apoderado, {{nombre}} el {{fecha}} a las {{hora}}.',
    'legacy citations row must be rewritten with ` a las {{hora}}` appended after {{fecha}}',
  );

  const bRow = await AppDataSource.getRepository(UserMessageTemplate)
    .findOneOrFail({ where: { userId: userBId, actionKey: 'absences' } });
  assert.equal(
    bRow.template,
    'Mi ausencia {{nombre}} el {{fecha}} en {{curso}}.',
    'absences user row must not be touched by the citations migration',
  );
});

// ─────────────────────────────────────────────────────────────────────
// T26 (acceptance C idempotency / acceptance D) — a row that already
// contained `{{hora}}` is left untouched; running the migration a second
// time does not re-modify any row.
// ─────────────────────────────────────────────────────────────────────

test('T26: a citations row that already uses {{hora}} is preserved; a second apply does not re-rewrite any row', async () => {
  const { id: legacyId } = await createTestUser({});
  const { id: modernId } = await createTestUser({});

  // Legacy row: needs rewrite.
  const legacyBefore = 'Hola {{nombre}}, el {{fecha}}.';
  await AppDataSource.getRepository(UserMessageTemplate).save({
    userId: legacyId,
    actionKey: 'citations',
    template: legacyBefore,
  });
  // Modern row: already uses {{hora}} — must be preserved verbatim.
  const modernBefore = 'Hola {{nombre}}, el {{fecha}} a las {{hora}}.';
  await AppDataSource.getRepository(UserMessageTemplate).save({
    userId: modernId,
    actionKey: 'citations',
    template: modernBefore,
  });

  const sql = fs.readFileSync(migrationPath('25_citation_template_hora.sql'), 'utf-8');

  // First apply.
  await AppDataSource.query(sql);
  const legacyAfter1 = await AppDataSource.getRepository(UserMessageTemplate)
    .findOneOrFail({ where: { userId: legacyId, actionKey: 'citations' } });
  assert.equal(legacyAfter1.template, 'Hola {{nombre}}, el {{fecha}} a las {{hora}}.');

  const modernAfter1 = await AppDataSource.getRepository(UserMessageTemplate)
    .findOneOrFail({ where: { userId: modernId, actionKey: 'citations' } });
  assert.equal(modernAfter1.template, modernBefore, 'modern row must be preserved verbatim');

  // Second apply — must not modify any row.
  await AppDataSource.query(sql);
  const legacyAfter2 = await AppDataSource.getRepository(UserMessageTemplate)
    .findOneOrFail({ where: { userId: legacyId, actionKey: 'citations' } });
  const modernAfter2 = await AppDataSource.getRepository(UserMessageTemplate)
    .findOneOrFail({ where: { userId: modernId, actionKey: 'citations' } });
  assert.equal(legacyAfter2.template, legacyAfter1.template, 'second apply must not re-rewrite legacy row');
  assert.equal(modernAfter2.template, modernBefore, 'second apply must not touch modern row');

  // Belt-and-braces: no row in the table currently has `{{fecha}}` without
  // ` a las {{hora}}` right after it — proof the migration is idempotent.
  const stillLegacy = await AppDataSource.query(
    "SELECT template FROM user_message_templates " +
    "WHERE action_key = 'citations' " +
    "  AND template LIKE '%{{fecha}}%' " +
    "  AND template NOT LIKE '%{{hora}}%'",
  );
  assert.equal(stillLegacy.length, 0, 'no citations row should still have {{fecha}} without {{hora}} after the second apply');
});

// ─────────────────────────────────────────────────────────────────────
// T27 (acceptance E) — GET /api/notification-templates reflects the new
// citations catalog state (placeholders keys/default, isCustom=false).
// ─────────────────────────────────────────────────────────────────────

test('T27: GET /api/notification-templates returns the new citations shape for a fresh user', async () => {
  // Ensure migration 25 is applied (T24 already applied it, but be defensive
  // in case test order changes or someone runs this file in isolation).
  const sql = fs.readFileSync(migrationPath('25_citation_template_hora.sql'), 'utf-8');
  await AppDataSource.query(sql);

  const { token } = await createTestUser({});
  const res = await authedRequest('GET', '/api/notification-templates', token);
  assert.equal(res.status, 200);

  const citations = res.body.find((r: any) => r.actionKey === 'citations');
  assert.ok(citations, 'citations item must be present in GET response');
  assert.equal(citations.isCustom, false);
  assert.equal(citations.defaultTemplate, CITATIONS_DEFAULT);
  assert.equal(citations.template, CITATIONS_DEFAULT);
  assert.deepEqual(
    citations.placeholders.map((p: any) => p.key),
    ['nombre', 'fecha', 'hora'],
  );
});