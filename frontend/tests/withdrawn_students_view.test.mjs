// The "Estudiantes retirados" screen: the list of withdrawals, the record of
// a student's withdrawals, the reinstatement and the visibility of the
// records in the reports.
//
// Plain JS test, runs under `node --test` with no compilation step. The
// Angular project has no test framework wired (see docs/conventions.md >
// Tests and docs/verification.md), so this file is the automated coverage —
// run it with:
//
//   node --test tests/withdrawn_students_view.test.mjs
//
// The pure helpers (the query of the list, the labels, the error mapping) are
// imported straight from their TypeScript source with Node's type stripping;
// the components are read as text and asserted on what they do.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');

const readSource = (relativePath) => readFileSync(resolve(FE_ROOT, relativePath), 'utf8');

// One method of a component, read from its signature to the end of its body.
function readMethod(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} exists`);
  const end = source.indexOf('\n  }\n', start);
  assert.notEqual(end, -1, `${signature} has a body`);
  return source.slice(start, end);
}

// One menu of a component, read from its template marker to its closing tag.
function readMenuBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `the ${marker} menu exists`);
  const end = source.indexOf('</mat-menu>', start);
  assert.notEqual(end, -1, `the ${marker} menu is closed`);
  return source.slice(start, end);
}

const historyPageSource = readSource('src/app/features/students/student-history.component.ts');
const historyDialogSource = readSource('src/app/features/students/student-history-dialog.component.ts');
const timelineSource = readSource('src/app/shared/components/timeline/timeline.component.ts');
const navItems = await import(
  pathToFileURL(resolve(FE_ROOT, 'src/app/core/nav-items.ts')).href
);

// ----- What the rest of the app keeps doing -----

test('the history page still opens the dialog with the student and the applied dates', () => {
  const openHistory = readMethod(historyPageSource, 'openHistory(e: Enrollment): void');

  assert.match(
    openHistory,
    /data: \{ enrollment: e, dateFrom: this\.appliedDateFrom, dateTo: this\.appliedDateTo \}/,
  );
});

test('the history dialog still sends the user to the absences and the justifications', () => {
  const goToAbsence = readMethod(historyDialogSource, 'goToAbsence(item: StudentHistorySummaryItem): void');
  assert.match(goToAbsence, /this\.router\.navigate\(\['\/absences'\], \{/);
  assert.match(goToAbsence, /course: this\.data\.enrollment\.courseId/);
  assert.match(goToAbsence, /student: this\.data\.enrollment\.fullName/);
  assert.match(goToAbsence, /dateFrom: item\.date/);
  assert.match(goToAbsence, /dateTo: item\.date/);

  const goToJustification = readMethod(historyDialogSource, 'goToJustification(): void');
  assert.match(goToJustification, /this\.router\.navigate\(\['\/justifications'\], \{/);
  assert.match(goToJustification, /course: this\.data\.enrollment\.courseId/);
  assert.match(goToJustification, /enrollmentId: this\.data\.enrollment\.enrollmentId/);
});

test('the students subnav keeps its first two entries, in the same order', () => {
  const students = navItems.SECTIONS.find(s => s.key === 'students');
  assert.ok(students, 'the students section exists');

  assert.deepEqual(students.subnav.slice(0, 2), [
    { route: '/students/manage',  icon: 'groups',  label: 'Administración de estudiantes', moduleKey: 'students' },
    { route: '/students/history', icon: 'history', label: 'Historial',                     moduleKey: 'students' },
  ]);
});

test('the timeline keeps the style of the four events it already had', () => {
  for (const line of [
    "  enrollment:    { icon: 'school',     classes: 'bg-indigo-50 text-indigo-600 border-indigo-200',   rotate: '1deg' },",
    "  absence:       { icon: 'event_busy', classes: 'bg-red-50 text-red-600 border-red-200',             rotate: '-2deg' },",
    "  tardy:         { icon: 'schedule',   classes: 'bg-amber-50 text-amber-600 border-amber-200',       rotate: '2deg' },",
    "  justification: { icon: 'fact_check', classes: 'bg-emerald-50 text-emerald-600 border-emerald-200', rotate: '-1deg' },",
  ]) {
    assert.ok(timelineSource.includes(line), `the timeline keeps: ${line.trim()}`);
  }
});

// ----- The helpers of the list of withdrawals -----

const withdrawalUtil = await import(
  pathToFileURL(resolve(FE_ROOT, 'src/app/shared/utils/withdrawal.util.ts')).href
);
const permissionUtil = await import(
  pathToFileURL(resolve(FE_ROOT, 'src/app/shared/utils/permission.util.ts')).href
);

const {
  STATS_VISIBILITY_OPTIONS,
  WITHDRAWAL_RECORD_ERROR,
  WITHDRAWAL_STATUS_OPTIONS,
  buildWithdrawalListQuery,
  filterWithdrawals,
  formatRevertedDate,
  statsVisibilityLabel,
  withdrawalListErrorMessage,
  withdrawalMutationErrorOutcome,
  withdrawalReasonLabel,
  withdrawalReasonsUrl,
  withdrawalRowActions,
  withdrawnByName,
} = withdrawalUtil;
const { resolveResourcePermissions } = permissionUtil;

test('the status filter offers the three states of a withdrawal', () => {
  assert.deepEqual(WITHDRAWAL_STATUS_OPTIONS, [
    { value: 'active', label: 'Retirados' },
    { value: 'reverted', label: 'Reincorporados' },
    { value: 'all', label: 'Todos' },
  ]);
});

const queryCases = [
  {
    name: 'the first load asks for the active withdrawals of the selected year',
    filters: { status: 'active', academicYearId: 7, courseId: null, reasonId: null, dateFrom: null, dateTo: null },
    expected: 'status=active&academic_year_id=7',
  },
  {
    name: 'the reincorporated ones are asked for by their own status',
    filters: { status: 'reverted', academicYearId: 7, courseId: null, reasonId: null, dateFrom: null, dateTo: null },
    expected: 'status=reverted&academic_year_id=7',
  },
  {
    name: 'every state can be asked for',
    filters: { status: 'all', academicYearId: 7, courseId: null, reasonId: null, dateFrom: null, dateTo: null },
    expected: 'status=all&academic_year_id=7',
  },
  {
    name: 'the course and the reason narrow the list down',
    filters: { status: 'active', academicYearId: 7, courseId: 3, reasonId: 5, dateFrom: null, dateTo: null },
    expected: 'status=active&academic_year_id=7&course_id=3&reason_id=5',
  },
  {
    name: 'the dates narrow the list down',
    filters: { status: 'active', academicYearId: 7, courseId: null, reasonId: null, dateFrom: '2026-03-01', dateTo: '2026-06-30' },
    expected: 'status=active&academic_year_id=7&date_from=2026-03-01&date_to=2026-06-30',
  },
  {
    name: 'without a selected year every year is asked for',
    filters: { status: 'active', academicYearId: null, courseId: null, reasonId: null, dateFrom: null, dateTo: null },
    expected: 'status=active',
  },
  {
    name: 'an empty date is left out of the query',
    filters: { status: 'active', academicYearId: null, courseId: null, reasonId: null, dateFrom: '', dateTo: '2026-06-30' },
    expected: 'status=active&date_to=2026-06-30',
  },
];

for (const { name, filters, expected } of queryCases) {
  test(`the query of the list: ${name}`, () => {
    assert.equal(buildWithdrawalListQuery(filters), expected);
  });
}

test('the visibility of a row is shown with the name the withdraw dialog uses', () => {
  for (const option of STATS_VISIBILITY_OPTIONS) {
    assert.equal(statsVisibilityLabel(option.value), option.label);
  }
  assert.equal(statsVisibilityLabel('whole_year'), 'Ocultar todo el año');
});

test('the reasons are asked for with the deleted ones only when they are needed', () => {
  assert.equal(withdrawalReasonsUrl(), '/api/withdrawal-reasons');
  assert.equal(withdrawalReasonsUrl(true), '/api/withdrawal-reasons?include_inactive=1');
});

test('a deleted reason is told apart from the ones that can still be picked', () => {
  assert.equal(withdrawalReasonLabel({ name: 'Motivo', isActive: true }), 'Motivo');
  assert.equal(withdrawalReasonLabel({ name: 'Motivo', isActive: false }), 'Motivo (inactivo)');
});

test('the date a student was reincorporated on is written the way the country writes it', () => {
  assert.equal(formatRevertedDate('2026-03-05T14:22:00.000Z'), '05/03/2026');
  assert.equal(formatRevertedDate('2026-12-31T12:00:00.000Z'), '31/12/2026');
});

test('the date of the reinstatement is the local one, not the one of the server', () => {
  // A moment around midnight UTC belongs to the previous day in any timezone
  // behind it, and that is the day the user saw it happen.
  const moment = new Date('2026-03-05T02:00:00.000Z');
  const localDay = String(moment.getDate()).padStart(2, '0');
  const localMonth = String(moment.getMonth() + 1).padStart(2, '0');
  assert.equal(
    formatRevertedDate('2026-03-05T02:00:00.000Z'),
    `${localDay}/${localMonth}/${moment.getFullYear()}`,
  );
});

test('the person who withdrew the student is named, or shown as missing', () => {
  assert.equal(withdrawnByName({ withdrawnBy: { id: 3, fullName: 'Ana Pérez' } }), 'Ana Pérez');
  assert.equal(withdrawnByName({ withdrawnBy: { id: 3, fullName: null } }), '—');
  assert.equal(withdrawnByName({ withdrawnBy: null }), '—');
});

const permissionRows = (canUpdate, canDelete) => ([
  { id: 1, roleId: 1, resource: 'students', canRead: true, canCreate: true, canUpdate: true, canDelete: false },
  {
    id: 2, roleId: 1, resource: 'student-withdrawals',
    canRead: true, canCreate: false, canUpdate: canUpdate, canDelete: canDelete,
  },
]);

const actionCases = [
  {
    name: 'a role that may do both gets both actions',
    rows: permissionRows(true, true),
    isSuperAdmin: false,
    revertedAt: null,
    expected: { canReinstate: true, canChangeVisibility: true },
  },
  {
    name: 'a role that may only change the visibility gets only that one',
    rows: permissionRows(true, false),
    isSuperAdmin: false,
    revertedAt: null,
    expected: { canReinstate: false, canChangeVisibility: true },
  },
  {
    name: 'a role that may only reincorporate gets only that one',
    rows: permissionRows(false, true),
    isSuperAdmin: false,
    revertedAt: null,
    expected: { canReinstate: true, canChangeVisibility: false },
  },
  {
    name: 'a role without any of the two gets neither',
    rows: permissionRows(false, false),
    isSuperAdmin: false,
    revertedAt: null,
    expected: { canReinstate: false, canChangeVisibility: false },
  },
  {
    name: 'a role without the resource gets neither',
    rows: [],
    isSuperAdmin: false,
    revertedAt: null,
    expected: { canReinstate: false, canChangeVisibility: false },
  },
  {
    name: 'a failed permission request gets neither',
    rows: null,
    isSuperAdmin: false,
    revertedAt: null,
    expected: { canReinstate: false, canChangeVisibility: false },
  },
  {
    name: 'a superadmin gets both',
    rows: null,
    isSuperAdmin: true,
    revertedAt: null,
    expected: { canReinstate: true, canChangeVisibility: true },
  },
  {
    name: 'a reincorporated student gets neither, whatever the role may do',
    rows: permissionRows(true, true),
    isSuperAdmin: false,
    revertedAt: '2026-03-05T14:22:00.000Z',
    expected: { canReinstate: false, canChangeVisibility: false },
  },
];

for (const { name, rows, isSuperAdmin, revertedAt, expected } of actionCases) {
  test(`the actions of a row: ${name}`, () => {
    const flags = resolveResourcePermissions(rows, 'student-withdrawals', isSuperAdmin);
    assert.deepEqual(withdrawalRowActions(flags, { revertedAt }), expected);
  });
}

const sampleRows = [
  { studentName: 'Ana Torres', idNumber: '0750110011' },
  { studentName: 'Luis Pérez', idNumber: '0750110022' },
  { studentName: 'Sofía Andrade', idNumber: null },
];

test('the search keeps the rows whose name or cédula contains the text', () => {
  assert.deepEqual(filterWithdrawals(sampleRows, 'ana'), [sampleRows[0]]);
  assert.deepEqual(filterWithdrawals(sampleRows, 'ANDRADE'), [sampleRows[2]]);
  assert.deepEqual(filterWithdrawals(sampleRows, '0750110022'), [sampleRows[1]]);
});

test('the search without a text keeps every row', () => {
  assert.deepEqual(filterWithdrawals(sampleRows, ''), sampleRows);
  assert.deepEqual(filterWithdrawals(sampleRows, '   '), sampleRows);
});

test('the search of a text that matches nothing returns no rows', () => {
  assert.deepEqual(filterWithdrawals(sampleRows, 'zzz'), []);
});

const listErrorCases = [
  {
    name: 'a rejected query shows what the backend said',
    err: { status: 400, error: { error: 'Parámetros de consulta inválidos' } },
    expected: 'Parámetros de consulta inválidos',
  },
  {
    name: 'a forbidden request shows what the backend said',
    err: { status: 403, error: { error: 'Sin permiso de read en student-withdrawals' } },
    expected: 'Sin permiso de read en student-withdrawals',
  },
  {
    name: 'a server failure falls back to a generic message',
    err: { status: 500, error: { error: 'boom' } },
    expected: 'No se pudieron cargar los retiros.',
  },
  {
    name: 'a network failure falls back to a generic message',
    err: { status: 0 },
    expected: 'No se pudieron cargar los retiros.',
  },
];

for (const { name, err, expected } of listErrorCases) {
  test(`the message of a failed list: ${name}`, () => {
    assert.equal(withdrawalListErrorMessage(err), expected);
  });
}

const mutationErrorCases = [
  {
    name: 'a missing withdrawal shows what the backend said and reloads',
    err: { status: 404, error: { error: 'Retiro no encontrado' } },
    expected: { message: 'Retiro no encontrado', closeAndReload: true },
  },
  {
    name: 'an already reincorporated withdrawal shows what the backend said and reloads',
    err: { status: 409, error: { error: 'El retiro ya fue revertido' } },
    expected: { message: 'El retiro ya fue revertido', closeAndReload: true },
  },
  {
    name: 'a withdrawal of another year shows what the backend said and reloads',
    err: { status: 409, error: { error: 'Solo se puede reincorporar en el año lectivo actual' } },
    expected: { message: 'Solo se puede reincorporar en el año lectivo actual', closeAndReload: true },
  },
  {
    name: 'a forbidden request shows what the backend said and keeps the dialog open',
    err: { status: 403, error: { error: 'Sin permiso de delete en student-withdrawals' } },
    expected: { message: 'Sin permiso de delete en student-withdrawals', closeAndReload: false },
  },
  {
    name: 'a rejected value shows what the backend said and keeps the dialog open',
    err: { status: 400, error: { error: 'statsVisibility inválido' } },
    expected: { message: 'statsVisibility inválido', closeAndReload: false },
  },
  {
    name: 'any other failure falls back to a generic message',
    err: { status: 500, error: { error: 'boom' } },
    expected: { message: 'No se pudo reincorporar al estudiante. Intenta nuevamente.', closeAndReload: false },
  },
];

for (const { name, err, expected } of mutationErrorCases) {
  test(`the outcome of a failed withdrawal change: ${name}`, () => {
    assert.deepEqual(
      withdrawalMutationErrorOutcome(err, 'No se pudo reincorporar al estudiante. Intenta nuevamente.'),
      expected,
    );
  });
}

test('the record of the withdrawals of a student fails with a message in Spanish', () => {
  assert.equal(WITHDRAWAL_RECORD_ERROR, 'No se pudo cargar el registro de retiros.');
});

// ----- The page of the withdrawn students -----

test('the withdrawn students have their own page under the students section', () => {
  const routesSource = readSource('src/app/app.routes.ts');
  const route = routesSource.split('\n').find(line => line.includes("path: 'withdrawn'"));
  assert.ok(route, 'the students section has a withdrawn route');

  assert.match(route, /loadComponent: \(\) => import\('\.\/features\/students\/withdrawn-students\.component'\)/);
  assert.match(route, /m\.WithdrawnStudentsComponent/);
  assert.match(route, /canActivate: \[moduleGuard\]/);
  assert.match(route, /data: \{ module: 'students' \}/);
});

test('the withdrawn students are the third entry of the students subnav', () => {
  const students = navItems.SECTIONS.find(s => s.key === 'students');
  const entry = students.subnav[2];

  assert.equal(entry.route, '/students/withdrawn');
  assert.equal(entry.icon, 'person_off');
  assert.equal(entry.label, 'Retirados');
  assert.equal(entry.moduleKey, 'students');
});

test('the page of the withdrawn students has its own header', () => {
  const pageSource = readSource('src/app/features/students/withdrawn-students.component.ts');

  assert.match(pageSource, /<app-chapter-header/);
  assert.match(pageSource, /icon="person_off"/);
  assert.match(pageSource, /eyebrowPrefix="Estudiantes"/);
  assert.match(pageSource, /eyebrowSuffix="Registro de retiros"/);
  assert.match(pageSource, /<h1 class="page-title">Estudiantes retirados<\/h1>/);
});

// ----- The list itself -----

const pageSource = readSource('src/app/features/students/withdrawn-students.component.ts');

test('the page asks for the permissions of the withdrawals once, when it loads', () => {
  assert.match(pageSource, /readonly updateFlags = signal<ResourceFlags>\(NO_FLAGS\)/);
  assert.match(
    pageSource,
    /this\.auth\.isSuperAdmin\(\) \|\| roleId === null\s*\?\s*null\s*:\s*await firstValueFrom\(/,
  );
  assert.match(
    pageSource,
    /this\.http\.get<RolePermission\[\]>\(`\/api\/roles\/permissions\/\$\{roleId\}`\)\)\.catch\(\(\) => null\)/,
  );
  assert.match(
    pageSource,
    /resolveResourcePermissions\(\s*permissionRows,\s*'student-withdrawals',\s*this\.auth\.isSuperAdmin\(\),?\s*\)/,
  );

  const requests = pageSource.match(/\/api\/roles\/permissions\//g) ?? [];
  assert.equal(requests.length, 1);
});

test('the row menu offers the actions the role may do, in both layouts', () => {
  for (const marker of ['#rowMenu="matMenu">', '#rowMenuMobile="matMenu">']) {
    const block = readMenuBlock(pageSource, marker);

    assert.match(block, /<mat-icon>history<\/mat-icon> Ver historial/);
    assert.match(block, /<mat-icon>receipt_long<\/mat-icon> Ver retiros/);

    assert.match(block, /@if \(rowActions\(item\)\.canChangeVisibility\)/);
    assert.match(block, /<mat-icon>visibility<\/mat-icon> Cambiar visibilidad/);
    assert.match(block, /@if \(rowActions\(item\)\.canReinstate\)/);
    assert.match(block, /<mat-icon>person_add<\/mat-icon> Reincorporar/);

    assert.ok(
      block.indexOf('canChangeVisibility') < block.indexOf('canReinstate'),
      'the visibility comes before the reinstatement',
    );
  }
});

test('the list follows the year selected in the topbar', () => {
  assert.match(
    pageSource,
    /effect\(\(\) => \{\s*this\.academicYearContext\.selectedId\(\);\s*untracked\(\(\) => this\.load\(\)\);\s*\}\);/,
  );
});

test('a response that arrives late does not overwrite a newer one', () => {
  const load = readMethod(pageSource, 'async load(): Promise<void>');

  assert.match(load, /const seq = \+\+this\.loadSeq;/);
  assert.match(load, /if \(seq !== this\.loadSeq\) return;/);
});

test('the list is asked for with the filters of the screen', () => {
  const load = readMethod(pageSource, 'async load(): Promise<void>');

  assert.match(load, /buildWithdrawalListQuery\(this\.filters\(\)\)/);
  assert.match(load, /this\.http\.get<WithdrawalItem\[\]>\(`\/api\/student-withdrawals\?\$\{query\}`\)/);
});

test('the reason filter disappears when the reasons cannot be loaded', () => {
  const loadReasons = readMethod(pageSource, 'private async loadReasons(): Promise<void>');

  assert.match(loadReasons, /catch \{[\s\S]*this\.reasons\.set\(null\)/);
  assert.match(pageSource, /@if \(reasons\(\) !== null\)/);
});

test('the reason filter of the withdrawn students also offers the deleted reasons', () => {
  const loadReasons = readMethod(pageSource, 'private async loadReasons(): Promise<void>');

  assert.match(loadReasons, /withdrawalReasonsUrl\(true\)/);
  assert.match(pageSource, /@for \(reason of reasons\(\); track reason\.id\) \{/);
  assert.match(pageSource, /\{\{reasonLabel\(reason\)\}\}/);
});

test('the withdraw dialog and the admin tab keep asking for the reasons without the deleted ones', () => {
  const dialogSource = readSource('src/app/features/students/student-withdraw-dialog.component.ts');
  const adminSource = readSource('src/app/features/admin/admin.component.ts');

  assert.match(dialogSource, /withdrawalReasonsUrl\(\)/);
  assert.doesNotMatch(dialogSource, /withdrawalReasonsUrl\(true\)/);

  assert.match(adminSource, /withdrawalReasonsUrl\(\)/);
  assert.doesNotMatch(adminSource, /withdrawalReasonsUrl\(true\)/);
});

test('the table shows what is known about each withdrawal', () => {
  for (const column of [
    'Estudiante', 'Curso', 'Fecha de retiro', 'Motivo', 'Visibilidad', 'Registrado por', 'Estado', 'Opciones',
  ]) {
    assert.ok(pageSource.includes(`>${column}</th>`), `the table has a ${column} column`);
  }

  assert.match(pageSource, /\{\{item\.studentName\}\}/);
  assert.match(pageSource, /@if \(item\.idNumber\) \{[^@]*\{\{item\.idNumber\}\}/);
  assert.match(pageSource, /\{\{item\.courseName\}\}/);
  assert.match(pageSource, /\{\{item\.academicYear\}\}/);
  assert.match(pageSource, /\{\{formatWithdrawalDate\(item\.withdrawalDate\)\}\}/);
  assert.match(pageSource, /\{\{item\.reason\.name\}\}/);
  assert.match(pageSource, /\{\{visibilityLabel\(item\)\}\}/);
  assert.match(pageSource, /\{\{withdrawnBy\(item\)\}\}/);
});

test('the mobile card shows the same fields as the table', () => {
  const start = pageSource.indexOf('<!-- Mobile -->');
  const end = pageSource.indexOf('#rowMenuMobile="matMenu">', start);
  assert.ok(start !== -1 && end > start, 'the page has a mobile layout');
  const card = pageSource.slice(start, end);

  assert.match(card, /\{\{item\.studentName\}\}/);
  assert.match(card, /@if \(item\.idNumber\) \{[^@]*\{\{item\.idNumber\}\}/);
  assert.match(card, /\{\{item\.courseName\}\}/);
  assert.match(card, /\{\{item\.academicYear\}\}/);
  assert.match(card, /\{\{formatWithdrawalDate\(item\.withdrawalDate\)\}\}/);
  assert.match(card, /\{\{item\.reason\.name\}\}/);
  assert.match(card, /\{\{visibilityLabel\(item\)\}\}/);
  assert.match(card, /\{\{withdrawnBy\(item\)\}\}/);
  assert.match(
    card,
    /@if \(item\.revertedAt\) \{[^}]*el \{\{formatRevertedDate\(item\.revertedAt\)\}\}@if \(item\.revertedBy\?\.fullName\) \{ · \{\{item\.revertedBy\?\.fullName\}\} \}/,
  );
});

test('every row says whether the student is still withdrawn', () => {
  assert.match(pageSource, /Retirado/);
  assert.match(pageSource, /Reincorporado/);
  assert.match(pageSource, /formatRevertedDate\(item\.revertedAt\)/);
  assert.match(pageSource, /item\.revertedBy\?\.fullName/);
});

test('the list shows one state at a time', () => {
  assert.match(pageSource, /Cargando retiros\.\.\./);
  assert.match(pageSource, /Sin retiros/);
  assert.match(pageSource, /No hay estudiantes retirados con estos filtros/);
  assert.match(pageSource, /Sin resultados/);
  assert.match(pageSource, /Ningún estudiante coincide con/);
});

test('a failed list shows what went wrong and offers to try again', () => {
  assert.match(pageSource, /@else if \(loadError\(\); as error\)/);
  assert.match(pageSource, /\{\{error\}\}/);
  assert.match(pageSource, /Reintentar/);
  assert.match(pageSource, /\(click\)="load\(\)"/);
});

test('the counter says how many withdrawals are on screen', () => {
  assert.match(pageSource, /retiro\{\{ filteredItems\(\)\.length !== 1 \? 's' : ''\}\}/);
});

// ----- The history of a withdrawn student -----

test('the history dialog takes only the fields it reads', () => {
  assert.match(
    historyDialogSource,
    /export type StudentHistoryEnrollmentRef =\s*Pick<Enrollment, 'enrollmentId' \| 'courseId' \| 'fullName' \| 'course' \| 'academicYear' \| 'idNumber'>;/,
  );
  assert.match(historyDialogSource, /enrollment: StudentHistoryEnrollmentRef;/);
  assert.match(historyDialogSource, /readOnly\?: boolean;/);
});

test('a read-only history does not navigate away', () => {
  for (const signature of [
    'goToAbsence(item: StudentHistorySummaryItem): void',
    'goToJustification(): void',
  ]) {
    const method = readMethod(historyDialogSource, signature);
    assert.match(method, /if \(this\.data\.readOnly\) return;/);
    assert.ok(
      method.indexOf('if (this.data.readOnly) return;') < method.indexOf('this.router.navigate'),
      'the guard comes before the navigation',
    );
  }
});

test('the summary items of a read-only history do not look clickable', () => {
  assert.match(historyDialogSource, /summary-item--static/);
  assert.match(historyDialogSource, /@if \(!data\.readOnly\)/);
});

test('the history dialog asks the backend for the same two endpoints', () => {
  assert.match(historyDialogSource, /\/api\/student-history\/\$\{this\.data\.enrollment\.enrollmentId\}\/summary/);
  assert.match(historyDialogSource, /\/api\/student-history\/\$\{this\.data\.enrollment\.enrollmentId\}\/timeline/);
});

test('the history of a withdrawn student opens read-only', () => {
  const openHistory = readMethod(pageSource, 'openHistory(item: WithdrawalItem): void');

  assert.match(openHistory, /this\.dialog\.open\(StudentHistoryDialogComponent, \{/);
  assert.match(openHistory, /width: '960px'/);
  assert.match(openHistory, /enrollmentId: item\.enrollmentId/);
  assert.match(openHistory, /fullName: item\.studentName/);
  assert.match(openHistory, /course: item\.courseName/);
  assert.match(openHistory, /academicYear: item\.academicYear/);
  assert.match(openHistory, /idNumber: item\.idNumber/);
  assert.match(openHistory, /courseId: item\.courseId/);
  assert.match(openHistory, /dateFrom: null/);
  assert.match(openHistory, /dateTo: null/);
  assert.match(openHistory, /readOnly: true/);
});

// ----- The record of the withdrawals of a student -----

const recordDialogSource = readSource('src/app/features/students/student-withdrawals-dialog.component.ts');

test('the record of the withdrawals asks the backend for every year of the student', () => {
  assert.match(
    recordDialogSource,
    /this\.http\.get<WithdrawalItem\[\]>\(`\/api\/student-withdrawals\/students\/\$\{this\.data\.studentId\}\/history`\)/,
  );
});

test('the record of the withdrawals says when it is loading, empty or broken', () => {
  assert.match(recordDialogSource, /class="spinner"/);
  assert.match(recordDialogSource, /Sin retiros registrados/);
  assert.match(recordDialogSource, /WITHDRAWAL_RECORD_ERROR/);
});

test('every entry of the record shows the withdrawal it describes', () => {
  assert.match(recordDialogSource, /formatWithdrawalDate\(item\.withdrawalDate\)/);
  assert.match(recordDialogSource, /\{\{item\.courseName\}\} · \{\{item\.academicYear\}\}/);
  assert.match(recordDialogSource, /Motivo: \{\{item\.reason\.name\}\}/);
  assert.match(recordDialogSource, /Visibilidad: \{\{visibilityLabel\(item\)\}\}/);
  assert.match(recordDialogSource, /@if \(item\.notes\)/);
  assert.match(recordDialogSource, /Registrado por \{\{withdrawnBy\(item\)\}\}/);
});

test('every entry of the record carries the stamp of its state', () => {
  assert.match(recordDialogSource, /class="stamp stamp-j"/);
  assert.match(recordDialogSource, /class="stamp" style="color:#475569/);
  assert.match(recordDialogSource, /Retirado/);
  assert.match(recordDialogSource, /Reincorporado/);
  assert.match(recordDialogSource, /Reincorporado el \{\{formatRevertedDate\(item\.revertedAt\)\}\}/);
});

test('the record of the withdrawals does not reload the list when it closes', () => {
  const openRecord = readMethod(pageSource, 'openRecord(item: WithdrawalItem): void');

  assert.match(openRecord, /this\.dialog\.open\(StudentWithdrawalsDialogComponent, \{/);
  assert.match(openRecord, /width: '560px'/);
  assert.match(openRecord, /studentId: item\.studentId/);
  assert.match(openRecord, /studentName: item\.studentName/);
  assert.doesNotMatch(openRecord, /this\.load\(\)/);
});

// ----- Reincorporating a student -----

test('the reinstatement asks for confirmation before it happens', () => {
  const reinstate = readMethod(pageSource, 'reinstate(item: WithdrawalItem): Promise<void>');

  assert.match(reinstate, /this\.dialog\.open\(ConfirmDialogComponent, \{/);
  assert.match(reinstate, /title: 'Reincorporar estudiante'/);
  assert.match(
    reinstate,
    /message: `¿Reincorporar a \$\{item\.studentName\} en \$\{item\.courseName\}\? Volverá a aparecer en la nómina y en los procesos normales\.`/,
  );
  assert.match(reinstate, /confirmLabel: 'Reincorporar'/);
  assert.match(reinstate, /icon: 'person_add'/);
  assert.match(reinstate, /severity: 'primary'/);
});

test('a cancelled confirmation leaves the student withdrawn', () => {
  const reinstate = readMethod(pageSource, 'reinstate(item: WithdrawalItem): Promise<void>');

  assert.match(reinstate, /if \(!confirmed\) return;/);
  assert.ok(
    reinstate.indexOf('if (!confirmed) return;') < reinstate.indexOf('this.http.post'),
    'the request only happens after the confirmation',
  );
});

test('the student is reincorporated with a request to the backend', () => {
  const reinstate = readMethod(pageSource, 'reinstate(item: WithdrawalItem): Promise<void>');

  assert.match(reinstate, /this\.http\.post<WithdrawalItem>\(`\/api\/student-withdrawals\/\$\{item\.id\}\/revert`, null\)/);
  assert.match(reinstate, /this\.notify\.success\('Estudiante reincorporado'\)/);
  assert.match(reinstate, /await this\.load\(\);/);
});

test('a failed reinstatement shows what went wrong and reloads only when it has to', () => {
  const reinstate = readMethod(pageSource, 'reinstate(item: WithdrawalItem): Promise<void>');

  assert.match(
    reinstate,
    /const outcome = withdrawalMutationErrorOutcome\(err, 'No se pudo reincorporar al estudiante\. Intenta nuevamente\.'\);/,
  );
  assert.match(reinstate, /this\.notify\.error\(outcome\.message\)/);
  assert.match(reinstate, /if \(outcome\.closeAndReload\) await this\.load\(\);/);
});

test('a row cannot be reincorporated twice', () => {
  const reinstate = readMethod(pageSource, 'reinstate(item: WithdrawalItem): Promise<void>');

  assert.match(reinstate, /if \(this\.busyId\(\) !== null\) return;/);
  assert.match(reinstate, /this\.busyId\.set\(item\.id\)/);
  assert.match(reinstate, /this\.busyId\.set\(null\)/);
});

// ----- Changing how much of the records keeps counting -----

const visibilityDialogSource = readSource('src/app/features/students/withdrawal-visibility-dialog.component.ts');

test('the visibility dialog offers the three options with the current one selected', () => {
  assert.match(visibilityDialogSource, /statsVisibilityOptions = STATS_VISIBILITY_OPTIONS/);
  assert.match(visibilityDialogSource, /selected = signal<StatsVisibility>\(this\.data\.item\.statsVisibility\)/);
  assert.match(visibilityDialogSource, /<mat-radio-group/);
  assert.match(visibilityDialogSource, /@for \(option of statsVisibilityOptions; track option\.value\)/);
  assert.match(visibilityDialogSource, /\{\{option\.label\}\}/);
  assert.match(visibilityDialogSource, /\{\{option\.help\}\}/);
});

test('the visibility dialog says who the change is about', () => {
  assert.match(visibilityDialogSource, /Cambiar visibilidad/);
  assert.match(visibilityDialogSource, /\{\{data\.item\.studentName\}\}/);
  assert.match(visibilityDialogSource, /\{\{data\.item\.courseName\}\} · \{\{data\.item\.academicYear\}\}/);
  assert.match(visibilityDialogSource, /Visibilidad en reportes/);
});

test('the visibility cannot be saved without changing it', () => {
  assert.match(
    visibilityDialogSource,
    /readonly canSave = computed\(\(\) => !this\.saving\(\) && this\.selected\(\) !== this\.data\.item\.statsVisibility\)/,
  );
  assert.match(visibilityDialogSource, /\[disabled\]="!canSave\(\)"/);
});

test('the visibility is saved with a request to the backend', () => {
  assert.match(
    visibilityDialogSource,
    /this\.http\.patch<WithdrawalItem>\(\s*`\/api\/student-withdrawals\/\$\{this\.data\.item\.id\}`,\s*\{ statsVisibility: this\.selected\(\) \}/,
  );
  assert.match(visibilityDialogSource, /this\.notify\.success\('Visibilidad actualizada'\)/);
  assert.match(visibilityDialogSource, /this\.dialogRef\.close\('updated'\)/);
});

test('a rejected visibility keeps the dialog open with the choice', () => {
  assert.match(
    visibilityDialogSource,
    /const outcome = withdrawalMutationErrorOutcome\(err, 'No se pudo actualizar la visibilidad\. Intenta nuevamente\.'\);/,
  );
  assert.match(visibilityDialogSource, /this\.notify\.error\(outcome\.message\)/);
  assert.match(visibilityDialogSource, /if \(outcome\.closeAndReload\) this\.dialogRef\.close\('stale'\);/);
});

test('the visibility dialog cannot be closed while it is saving', () => {
  assert.match(visibilityDialogSource, /this\.dialogRef\.disableClose = true/);
  assert.match(visibilityDialogSource, /this\.dialogRef\.disableClose = false/);
});

test('the list is read again after the visibility changes', () => {
  const changeVisibility = readMethod(pageSource, 'changeVisibility(item: WithdrawalItem): void');

  assert.match(changeVisibility, /this\.dialog\.open\(WithdrawalVisibilityDialogComponent, \{/);
  assert.match(changeVisibility, /width: '480px'/);
  assert.match(changeVisibility, /data: \{ item \}/);
  assert.match(changeVisibility, /if \(result === 'updated' \|\| result === 'stale'\) await this\.load\(\);/);
});

// ----- The citations inside the history -----

const modelsSource = readSource('src/app/core/models/index.ts');

test('the timeline knows how to draw a citation', () => {
  assert.ok(
    timelineSource.includes(
      "  citation:      { icon: 'campaign',   classes: 'bg-sky-50 text-sky-700 border-sky-200',             rotate: '1.5deg' },",
    ),
    'the timeline has a citation node',
  );
});

test('the history model knows the type of a citation event', () => {
  assert.match(
    modelsSource,
    /export interface TimelineEvent \{\s*type: 'enrollment' \| 'absence' \| 'tardy' \| 'justification' \| 'citation';/,
  );
});

test('the summary of the history carries the citations of the student', () => {
  assert.match(
    modelsSource,
    /export interface StudentCitationSummaryItem \{\s*id: number;\s*date: string;\s*time: string;\s*status: 'pending' \| 'closed';\s*reasons: string\[\];\s*createdAt: string;\s*\}/,
  );
  assert.match(modelsSource, /citations: \{ total: number; items: StudentCitationSummaryItem\[\] \};/);
  assert.doesNotMatch(modelsSource, /not_implemented/);
});
