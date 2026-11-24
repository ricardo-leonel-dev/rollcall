// Admin catalog tab for student-withdrawal reasons.
//
// Plain JS test, runs under `node --test` with no compilation step. The
// Angular project has no test framework wired (see docs/conventions.md >
// Tests and docs/verification.md), so this file is the automated coverage
// for the tab — run it with:
//
//   node --test tests/withdrawal_reasons_admin_tab.test.mjs
//
// The page-level behavior (a real browser against a running stack) is
// covered by the smoke script kept next to the feature handoff; this file
// pins the pieces that must not drift:
//
//   - the admin chapter numerals, the sidebar entry and the grantable
//     module sub-key;
//   - the pure resolver that turns role-permission rows into the
//     create/update/delete flags that gate the tab's actions;
//   - the reasons list, the create/edit dialog and the delete confirmation;
//   - that the sibling "Motivos de citación" tab and the rest of the admin
//     screen keep the behavior they have today.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');

const adminSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/admin/admin.component.ts'), 'utf8',
);
const modelsSource = readFileSync(
  resolve(FE_ROOT, 'src/app/core/models/index.ts'), 'utf8',
);
const citationDialogSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/admin/citation-reason-dialog.component.ts'), 'utf8',
);

const navItems = await import(pathToFileURL(resolve(FE_ROOT, 'src/app/core/nav-items.ts')).href);
const { SECTIONS, MODULE_TREE, MODULE_KEYS } = navItems;

// ----- Helpers for reading the admin component's exported constant maps -----

// The admin component is an Angular file with decorators, so it cannot be
// imported here (Node's type stripping does not transform decorators). The
// constant maps it exports are plain object literals, so they are read out of
// the source and evaluated as data — the assertions below compare values,
// not formatting.
function readStringMap(constName) {
  const marker = `export const ${constName}`;
  const markerAt = adminSource.indexOf(marker);
  assert.notEqual(markerAt, -1, `${constName} is not exported by admin.component.ts`);
  const open = adminSource.indexOf('{', markerAt);
  let depth = 0;
  let close = -1;
  for (let i = open; i < adminSource.length; i++) {
    const ch = adminSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  assert.notEqual(close, -1, `${constName} is not a closed object literal`);
  const literal = adminSource.slice(open, close + 1);
  const map = {};
  const entry = /(['"]?)([A-Za-z0-9_:.-]+)\1\s*:\s*'([^']*)'/g;
  let m;
  while ((m = entry.exec(literal)) !== null) map[m[2]] = m[3];
  return map;
}

// Slices one tab's template block out of the admin template so assertions
// stay scoped to the tab they talk about.
function readTabBlock(tabKey) {
  const marker = `@if (activeTab() === '${tabKey}')`;
  const start = adminSource.indexOf(marker);
  assert.notEqual(start, -1, `the ${tabKey} tab is not rendered by admin.component.ts`);
  const next = adminSource.indexOf("@if (activeTab() === '", start + marker.length);
  return adminSource.slice(start, next === -1 ? adminSource.length : next);
}

function pick(map, keys) {
  const out = {};
  for (const key of keys) out[key] = map[key];
  return out;
}

// The body of loadAll(), read between its signature and the next method.
function readLoadAll() {
  const start = adminSource.indexOf('async loadAll()');
  assert.notEqual(start, -1, 'the admin component has a loadAll method');
  const end = adminSource.indexOf('openYearDialog(', start);
  assert.notEqual(end, -1, 'loadAll is followed by another method');
  return adminSource.slice(start, end);
}

// One method of the admin component, read from its signature to the end of
// its body.
function readMethod(signature) {
  const start = adminSource.indexOf(signature);
  assert.notEqual(start, -1, `${signature} exists in the admin component`);
  const end = adminSource.indexOf('\n  }\n', start);
  assert.notEqual(end, -1, `${signature} has a body`);
  return adminSource.slice(start, end);
}

const adminSection = SECTIONS.find(s => s.key === 'admin');
assert.ok(adminSection, 'the admin section exists in the sidebar config');

// ----- The sibling tab and the rest of the admin screen keep their shape -----

test('the admin tabs keep their eyebrows, titles and sidebar entries', () => {
  assert.deepEqual(
    pick(readStringMap('ADMIN_TAB_EYEBROW_SUFFIX'), [
      'users', 'courses', 'years', 'permissions', 'citation-reasons', 'roster', 'institutions',
    ]),
    {
      users: 'Gestión de personal',
      courses: 'Cursos',
      years: 'Calendario académico',
      permissions: 'Permisos',
      'citation-reasons': 'Motivos de citación',
      roster: 'Importar nómina',
      institutions: 'Instituciones del sistema',
    },
  );

  assert.deepEqual(
    pick(readStringMap('ADMIN_TAB_TITLE'), [
      'users', 'courses', 'years', 'permissions', 'citation-reasons', 'roster', 'institutions',
    ]),
    {
      users: 'Usuarios',
      courses: 'Cursos',
      years: 'Años lectivos',
      permissions: 'Permisos',
      'citation-reasons': 'Motivos de citación',
      roster: 'Importar nómina',
      institutions: 'Instituciones',
    },
  );

  const existingEntries = adminSection.subnav
    .filter(entry => entry.queryParams?.tab !== 'withdrawal-reasons')
    .map(entry => ({
      label: entry.label,
      icon: entry.icon,
      moduleKey: entry.moduleKey,
      tab: entry.queryParams?.tab,
    }));

  assert.deepEqual(existingEntries, [
    { label: 'Usuarios', icon: 'manage_accounts', moduleKey: 'admin', tab: 'users' },
    { label: 'Cursos', icon: 'class', moduleKey: 'admin', tab: 'courses' },
    { label: 'Años lectivos', icon: 'calendar_today', moduleKey: 'admin', tab: 'years' },
    { label: 'Permisos', icon: 'security', moduleKey: 'admin', tab: 'permissions' },
    { label: 'Motivos de citación', icon: 'rule', moduleKey: 'admin', tab: 'citation-reasons' },
    { label: 'Importar nómina', icon: 'upload_file', moduleKey: 'admin', tab: 'roster' },
    { label: 'Instituciones', icon: 'corporate_fare', moduleKey: 'admin', tab: 'institutions' },
  ]);
});

test('the citation-reasons tab still lists, edits and deletes its own reasons', () => {
  const block = readTabBlock('citation-reasons');

  assert.match(block, /citationReasons\(\)/);
  assert.match(block, /severityBadgeClass\(r\.severity\)/);
  assert.match(block, /openCitationReasonDialog\(r\)/);
  assert.match(block, /deleteCitationReason\(r\.id\)/);
  assert.match(block, /<th>Severidad<\/th>/);
  assert.match(block, /<th>Descripción<\/th>/);
  assert.match(block, /Agregar motivo/);

  assert.match(adminSource, /openCitationReasonDialog\(reason\?: CitationReason\)/);
  assert.match(adminSource, /this\.http\.delete\(`\/api\/citation-reasons\/\$\{id\}`\)/);
  assert.match(citationDialogSource, /this\.http\.put\(`\/api\/citation-reasons\/\$\{this\.data\.reason!\.id\}`/);
  assert.match(citationDialogSource, /this\.http\.post\('\/api\/citation-reasons'/);
});

// ----- The permission flags that gate the tab's actions -----

const permissionUtil = await import(
  pathToFileURL(resolve(FE_ROOT, 'src/app/shared/utils/permission.util.ts')).href
);
const { resolveResourcePermissions, NO_FLAGS } = permissionUtil;

function permissionRow(resource, flags) {
  return {
    id: 1,
    roleId: 2,
    resource,
    canRead: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    ...flags,
  };
}

const flagCases = [
  {
    name: 'a superadmin may create, update and delete without any row',
    rows: null,
    isSuperAdmin: true,
    expected: { canCreate: true, canUpdate: true, canDelete: true },
  },
  {
    name: 'a superadmin may create, update and delete even when rows are present',
    rows: [permissionRow('withdrawal-reasons', { canCreate: false, canUpdate: false, canDelete: false })],
    isSuperAdmin: true,
    expected: { canCreate: true, canUpdate: true, canDelete: true },
  },
  {
    name: 'the row of the requested resource decides each flag',
    rows: [permissionRow('withdrawal-reasons', { canCreate: true, canUpdate: false, canDelete: true })],
    isSuperAdmin: false,
    expected: { canCreate: true, canUpdate: false, canDelete: true },
  },
  {
    name: 'a role without a row of the requested resource gets no flag',
    rows: [permissionRow('citation-reasons', { canCreate: true, canUpdate: true, canDelete: true })],
    isSuperAdmin: false,
    expected: { canCreate: false, canUpdate: false, canDelete: false },
  },
  {
    name: 'a failed request gets no flag',
    rows: null,
    isSuperAdmin: false,
    expected: { canCreate: false, canUpdate: false, canDelete: false },
  },
];

for (const { name, rows, isSuperAdmin, expected } of flagCases) {
  test(`the create/update/delete flags: ${name}`, () => {
    assert.deepEqual(
      resolveResourcePermissions(rows, 'withdrawal-reasons', isSuperAdmin),
      expected,
    );
  });
}

test('the empty flag set denies every action', () => {
  assert.deepEqual(NO_FLAGS, { canCreate: false, canUpdate: false, canDelete: false });
});

// ----- The tab, its chapter numeral and its sidebar entry -----

test('the admin chapters are numbered in sidebar order', () => {
  assert.deepEqual(readStringMap('ADMIN_TAB_CHAPTER_NUMERAL'), {
    users: 'I',
    courses: 'II',
    years: 'III',
    permissions: 'IV',
    'citation-reasons': 'V',
    'withdrawal-reasons': 'VI',
    roster: 'VII',
    institutions: 'VIII',
  });
});

test('the tab is titled "Motivos de retiro"', () => {
  assert.equal(readStringMap('ADMIN_TAB_EYEBROW_SUFFIX')['withdrawal-reasons'], 'Motivos de retiro');
  assert.equal(readStringMap('ADMIN_TAB_TITLE')['withdrawal-reasons'], 'Motivos de retiro');
});

test('the sidebar shows the tab right after the citation reasons', () => {
  const labels = adminSection.subnav.map(entry => entry.label);
  assert.equal(
    labels[labels.indexOf('Motivos de citación') + 1],
    'Motivos de retiro',
  );

  const entry = adminSection.subnav.find(e => e.queryParams?.tab === 'withdrawal-reasons');
  assert.ok(entry, 'the withdrawal reasons entry exists in the admin subnav');
  assert.equal(entry.route, '/admin');
  assert.equal(entry.icon, 'person_remove');
  assert.equal(entry.label, 'Motivos de retiro');
  assert.equal(entry.moduleKey, 'admin');
  assert.deepEqual(entry.queryParams, { tab: 'withdrawal-reasons' });
});

test('the sub-key of the tab can be granted', () => {
  const adminTree = MODULE_TREE.find(node => node.key === 'admin');
  assert.ok(adminTree?.children, 'the admin module has children');

  const childKeys = adminTree.children.map(child => child.key);
  assert.equal(
    childKeys[childKeys.indexOf('admin:citation-reasons') + 1],
    'admin:withdrawal-reasons',
  );

  const child = adminTree.children.find(c => c.key === 'admin:withdrawal-reasons');
  assert.equal(child.label, 'Motivos de retiro');

  const keyIndex = MODULE_KEYS.findIndex(k => k.key === 'admin:withdrawal-reasons');
  assert.notEqual(keyIndex, -1, 'the sub-key is listed in the flat module keys');
  assert.equal(MODULE_KEYS[keyIndex].label, '↳ Motivos de retiro');
  assert.equal(MODULE_KEYS[keyIndex - 1].key, 'admin:citation-reasons');
});

// ----- The list and the flags are loaded with the rest of the admin data -----

test('the reasons of the institution are loaded', () => {
  assert.match(adminSource, /readonly withdrawalReasons = signal<WithdrawalReason\[\]>\(\[\]\)/);
  assert.match(
    adminSource,
    /firstValueFrom\(this\.http\.get<WithdrawalReason\[\]>\(withdrawalReasonsUrl\(\)\)\)\.catch\(\(\) => \[\] as WithdrawalReason\[\]\)/,
  );
  assert.match(adminSource, /this\.withdrawalReasons\.set\(withdrawalReasons\)/);
});

test('the flags of the current role are loaded', () => {
  assert.match(adminSource, /readonly withdrawalReasonFlags = signal<ResourceFlags>\(NO_FLAGS\)/);
  assert.match(
    adminSource,
    /this\.http\.get<RolePermission\[\]>\(`\/api\/roles\/permissions\/\$\{roleId\}`\)\)\.catch\(\(\) => null\)/,
  );
  assert.match(
    adminSource,
    /resolveResourcePermissions\(\s*permissionRows,\s*'withdrawal-reasons',\s*this\.auth\.isSuperAdmin\(\)\s*\)/,
  );
});

test('a superadmin loads no role permissions and no institution-scoped list', () => {
  const loadAll = readLoadAll();

  assert.match(loadAll, /this\.auth\.isSuperAdmin\(\)[^;]*\?\s*Promise\.resolve\(null\)/);
  assert.match(loadAll, /noInstitutionYet \? Promise\.resolve\(\[\] as WithdrawalReason\[\]\)/);
});

test('a failed request never breaks the rest of the admin data', () => {
  const loadAll = readLoadAll();

  assert.match(loadAll, /get<WithdrawalReason\[\]>\(withdrawalReasonsUrl\(\)\)\)\.catch\(/);
  assert.match(loadAll, /get<RolePermission\[\]>\(`\/api\/roles\/permissions\/\$\{roleId\}`\)\)\.catch\(/);
});

// ----- The tab body -----

test('the tab body is guarded like the other admin tabs', () => {
  const block = readTabBlock('withdrawal-reasons');

  assert.doesNotMatch(block, /canAccessModule/);
  assert.doesNotMatch(block, /isSuperAdmin/);
});

test('the list shows the name and the description of every reason', () => {
  const block = readTabBlock('withdrawal-reasons');

  assert.match(block, /<th>Nombre<\/th>/);
  assert.match(block, /<th>Descripción<\/th>/);
  assert.match(block, /\{\{r\.name\}\}/);
  assert.match(block, /\{\{r\.description \|\| '—'\}\}/);
  assert.doesNotMatch(block, /Estado/);
  assert.doesNotMatch(block, /Activo|Inactivo/);
});

test('the folio counts the reasons', () => {
  const block = readTabBlock('withdrawal-reasons');

  assert.match(block, /class="withdrawal-reasons-folio"/);
  assert.match(block, /class="withdrawal-reasons-folio-text"/);
  assert.match(
    block,
    /Registros: <b>\{\{ withdrawalReasons\(\)\.length \}\}<\/b> \{\{ withdrawalReasons\(\)\.length === 1 \? 'motivo' : 'motivos' \}\}/,
  );
});

test('an empty catalog says so instead of showing rows', () => {
  const block = readTabBlock('withdrawal-reasons');

  assert.match(block, /No hay motivos de retiro registrados\./);
});

test('each action shows only when its flag allows it', () => {
  const block = readTabBlock('withdrawal-reasons');

  assert.match(block, /@if \(withdrawalReasonFlags\(\)\.canCreate\)/);
  assert.match(block, /@if \(withdrawalReasonFlags\(\)\.canUpdate\)/);
  assert.match(block, /@if \(withdrawalReasonFlags\(\)\.canDelete\)/);
  assert.match(
    block,
    /@if \(withdrawalReasonFlags\(\)\.canUpdate \|\| withdrawalReasonFlags\(\)\.canDelete\)/,
  );
});

test('the folio of the tab reuses the shared folio styles', () => {
  assert.match(adminSource, /\.withdrawal-reasons-folio \{/);
  assert.match(adminSource, /\.withdrawal-reasons-folio \.filete-ink \{/);
  assert.match(adminSource, /\.withdrawal-reasons-folio \.filete-border \{/);
  assert.match(adminSource, /\.withdrawal-reasons-folio-text \{/);
  assert.match(adminSource, /\.withdrawal-reasons-folio-text b \{/);
});

// ----- The create / edit dialog -----

const dialogSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/admin/withdrawal-reason-dialog.component.ts'), 'utf8',
);

test('the dialog asks for a name and a description', () => {
  assert.match(dialogSource, /'Nuevo motivo de retiro'/);
  assert.match(dialogSource, /'Editar motivo de retiro'/);
  assert.match(dialogSource, /<mat-label>Nombre<\/mat-label>/);
  assert.match(dialogSource, /<mat-label>Descripción<\/mat-label>/);
  assert.match(dialogSource, /maxlength="150"/);
  assert.match(dialogSource, /placeholder="Ej: Cambio de domicilio"/);
  assert.match(dialogSource, /placeholder="Opcional"/);
});

test('the dialog cannot be saved without a valid name', () => {
  assert.match(
    dialogSource,
    /\[disabled\]="!name\.trim\(\) \|\| name\.trim\(\)\.length > 150 \|\| saving\(\)"/,
  );
  assert.match(dialogSource, /if \(!name \|\| name\.length > 150\) return;/);
});

test('the dialog saves the trimmed name and the description', () => {
  assert.match(dialogSource, /const name = this\.name\.trim\(\);/);
  assert.match(dialogSource, /const payload = \{ name, description: this\.description\.trim\(\) \|\| null \};/);
  assert.match(dialogSource, /this\.http\.post\('\/api\/withdrawal-reasons', payload\)/);
  assert.match(
    dialogSource,
    /this\.http\.put\(`\/api\/withdrawal-reasons\/\$\{this\.data\.reason!\.id\}`, payload\)/,
  );
});

test('the dialog reports what happened and stays open on a failure', () => {
  assert.match(dialogSource, /this\.notify\.success\('Motivo de retiro creado'\)/);
  assert.match(dialogSource, /this\.notify\.success\('Motivo de retiro actualizado'\)/);
  assert.match(dialogSource, /this\.notify\.error\(err\?\.error\?\.error \?\? 'Error al guardar'\)/);
  assert.match(dialogSource, /this\.dialogRef\.close\(true\)/);
});

test('cancelling the dialog closes it without saving', () => {
  assert.match(dialogSource, /<button mat-button \(click\)="dialogRef\.close\(false\)">Cancelar<\/button>/);
});

test('the tab opens the dialog and reloads the list after a save', () => {
  const handler = readMethod('openWithdrawalReasonDialog(reason?: WithdrawalReason)');

  assert.match(
    handler,
    /const data: WithdrawalReasonDialogData = \{ mode: reason \? 'edit' : 'create', reason \};/,
  );
  assert.match(handler, /this\.dialog\.open\(WithdrawalReasonDialogComponent, \{\s*width: '420px',\s*data,/);
  assert.match(handler, /if \(ok\) await this\.loadAll\(\);/);
});

// ----- The delete confirmation -----

test('deleting a reason asks for confirmation first', () => {
  const handler = readMethod('deleteWithdrawalReason(id: number)');

  assert.match(handler, /this\.dialog\.open\(ConfirmDialogComponent, \{/);
  assert.match(handler, /title: 'Eliminar motivo de retiro'/);
  assert.match(
    handler,
    /message: '¿Eliminar este motivo de retiro\? Ya no aparecerá al retirar estudiantes\.'/,
  );
  assert.match(handler, /if \(!ok\) return;/);
});

test('a confirmed delete removes the reason and reloads the list', () => {
  const handler = readMethod('deleteWithdrawalReason(id: number)');

  assert.match(handler, /this\.http\.delete\(`\/api\/withdrawal-reasons\/\$\{id\}`\)/);
  assert.match(handler, /this\.notify\.success\('Motivo de retiro eliminado'\)/);
  assert.match(handler, /await this\.loadAll\(\);/);
});

test('a failed delete says so and keeps the list', () => {
  const handler = readMethod('deleteWithdrawalReason(id: number)');

  assert.match(handler, /this\.notify\.error\(err\?\.error\?\.error \?\? 'Error al eliminar'\)/);
});



