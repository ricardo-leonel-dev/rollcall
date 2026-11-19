// The "Retirar" action of the students screen and the dialog behind it.
//
// Plain JS test, runs under `node --test` with no compilation step. The
// Angular project has no test framework wired (see docs/conventions.md >
// Tests and docs/verification.md), so this file is the automated coverage for
// the feature — run it with:
//
//   node --test tests/student_withdraw_action.test.mjs
//
// The pure helpers (the date bounds, the form validation, the payload and the
// error mapping) are imported straight from their TypeScript source with
// Node's type stripping; the components are read as text and asserted on what
// they do. The page-level behavior (a real browser against a running stack)
// is covered by the smoke script kept next to the feature handoff.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');

const managementSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/students/student-management.component.ts'), 'utf8',
);
const historySource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/students/student-history.component.ts'), 'utf8',
);
const absencesSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/absences/absences.component.ts'), 'utf8',
);

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

// The input of the date, read from its tag.
function readDateInput(source) {
  const start = source.indexOf('<input matInput');
  assert.notEqual(start, -1, 'the date input exists');
  const end = source.indexOf('>', start);
  assert.notEqual(end, -1, 'the date input is closed');
  return source.slice(start, end);
}

// ----- The rows keep the numbers and the actions they have today -----

test('the roster numbers are shown exactly as the backend stores them', () => {
  assert.match(managementSource, /\{\{e\.rosterNumber\}\}/);
  assert.match(historySource, /\{\{e\.rosterNumber\}\}/);
  assert.match(absencesSource, /\{\{e\.rosterNumber\}\}/);

  for (const source of [managementSource, historySource, absencesSource]) {
    assert.doesNotMatch(source, /\$index/);
  }
});

test('the roster list is stored without renumbering the students', () => {
  const load = readMethod(managementSource, 'async load(): Promise<void>');

  assert.match(load, /this\.enrollments\.set\(data\)/);
  assert.doesNotMatch(load, /rosterNumber/);
});

test('the row menus keep Ver, Editar and Eliminar', () => {
  for (const marker of ['#rowMenu="matMenu">', '#rowMenuMobile="matMenu">']) {
    const block = readMenuBlock(managementSource, marker);
    assert.match(block, /<mat-icon>visibility<\/mat-icon> Ver/);
    assert.match(block, /<mat-icon>edit<\/mat-icon> Editar/);
    assert.match(block, /<mat-icon>delete<\/mat-icon> Eliminar/);
  }
});

test('clicking a row opens the student detail', () => {
  assert.match(managementSource, /<tr style="cursor:pointer" \(click\)="openDetail\(e, 'view'\)">/);
  assert.match(
    managementSource,
    /<div class="card" style="cursor:pointer;padding:14px 16px" \(click\)="openDetail\(e, 'view'\)">/,
  );
});

test('deleting a student keeps its confirmation, url, toast and reload', () => {
  const handler = readMethod(managementSource, 'deleteStudent(e: Enrollment)');

  assert.match(handler, /this\.dialog\.open\(ConfirmDialogComponent, \{/);
  assert.match(handler, /title: 'Eliminar estudiante'/);
  assert.match(handler, /message: '¿Eliminar este estudiante\?/);
  assert.match(handler, /if \(!ok\) return;/);
  assert.match(handler, /this\.http\.delete\(`\/api\/students\/\$\{e\.studentId\}`\)/);
  assert.match(handler, /this\.notify\.success\('Eliminado'\)/);
  assert.match(handler, /await this\.load\(\);/);
});

// ----- The date the student is withdrawn on -----

const withdrawalUtil = await import(
  pathToFileURL(resolve(FE_ROOT, 'src/app/shared/utils/withdrawal.util.ts')).href
);
const {
  NOTES_MAX_LENGTH,
  STATS_VISIBILITY_OPTIONS,
  WITHDRAWAL_FORM_ERROR_MESSAGES,
  buildWithdrawalPayload,
  formatWithdrawalDate,
  validateWithdrawalForm,
  withdrawalDateBounds,
  withdrawalDateRequired,
  withdrawalErrorOutcome,
  withdrawalYearNotStarted,
} = withdrawalUtil;

const boundsCases = [
  {
    name: 'the year is open, so today is the last selectable day',
    today: '2026-11-18',
    year: { startDate: '2026-09-01', endDate: '2027-07-15' },
    expected: { min: '2026-09-01', max: '2026-11-18', defaultDate: '2026-11-18' },
  },
  {
    name: 'the year is over, so its last day becomes the default',
    today: '2027-08-01',
    year: { startDate: '2026-09-01', endDate: '2027-07-15' },
    expected: { min: '2026-09-01', max: '2027-07-15', defaultDate: '2027-07-15' },
  },
  {
    name: 'the year has not started, so no day is valid yet',
    today: '2026-08-01',
    year: { startDate: '2026-09-01', endDate: '2027-07-15' },
    expected: { min: '2026-09-01', max: '2026-08-01', defaultDate: null },
  },
  {
    name: 'without a year only today is selectable',
    today: '2026-11-18',
    year: null,
    expected: { min: null, max: '2026-11-18', defaultDate: '2026-11-18' },
  },
  {
    name: 'a year without a start date leaves the lower bound open',
    today: '2026-11-18',
    year: { startDate: null, endDate: '2026-10-31' },
    expected: { min: null, max: '2026-10-31', defaultDate: '2026-10-31' },
  },
];

for (const { name, today, year, expected } of boundsCases) {
  test(`the selectable dates of the withdrawal: ${name}`, () => {
    assert.deepEqual(withdrawalDateBounds(today, year), expected);
  });
}

// ----- The form of the withdrawal -----

const validForm = {
  date: '2026-11-10',
  reasonId: 3,
  notes: '',
  statsVisibility: 'until_withdrawal',
};

const openBounds = { min: '2026-09-01', max: '2026-11-18', defaultDate: '2026-11-18' };

test('the year that has not started yet has no valid day to pick', () => {
  assert.equal(withdrawalYearNotStarted('2026-09-01', '2026-08-01'), true);
  assert.equal(withdrawalYearNotStarted('2026-09-01', '2026-11-18'), false);
  assert.equal(withdrawalYearNotStarted(null, '2026-11-18'), false);
});

test('the date of the withdrawal is required, unless the year has not started yet', () => {
  assert.equal(withdrawalDateRequired(openBounds), true);
  assert.equal(withdrawalDateRequired({ min: null, max: '2026-11-18', defaultDate: '2026-11-18' }), true);
  assert.equal(withdrawalDateRequired({ min: '2026-09-01', max: '2026-08-01', defaultDate: null }), false);
});

const validationCases = [
  {
    name: 'a year that has not started yet',
    form: { ...validForm, date: null },
    bounds: { min: '2026-09-01', max: '2026-08-01', defaultDate: null },
    today: '2026-08-01',
    expected: 'year_not_started',
  },
  {
    name: 'a missing date',
    form: { ...validForm, date: null },
    bounds: openBounds,
    today: '2026-11-18',
    expected: 'date_required',
  },
  {
    name: 'a date in the future',
    form: { ...validForm, date: '2026-11-19' },
    bounds: openBounds,
    today: '2026-11-18',
    expected: 'date_future',
  },
  {
    name: 'a date after a year that is already over',
    form: { ...validForm, date: '2026-11-05' },
    bounds: { min: '2026-09-01', max: '2026-10-31', defaultDate: '2026-10-31' },
    today: '2026-11-18',
    expected: 'date_after_year',
  },
  {
    name: 'a date before the year starts',
    form: { ...validForm, date: '2026-08-31' },
    bounds: openBounds,
    today: '2026-11-18',
    expected: 'date_before_year',
  },
  {
    name: 'a missing reason',
    form: { ...validForm, reasonId: null },
    bounds: openBounds,
    today: '2026-11-18',
    expected: 'reason_required',
  },
  {
    name: 'a missing reason is reported before the long observations',
    form: { ...validForm, reasonId: null, notes: 'x'.repeat(1001) },
    bounds: openBounds,
    today: '2026-11-18',
    expected: 'reason_required',
  },
  {
    name: 'too many observations',
    form: { ...validForm, notes: 'x'.repeat(1001) },
    bounds: openBounds,
    today: '2026-11-18',
    expected: 'notes_too_long',
  },
  {
    name: 'a complete form',
    form: { ...validForm },
    bounds: openBounds,
    today: '2026-11-18',
    expected: null,
  },
];

for (const { name, form, bounds, today, expected } of validationCases) {
  test(`the form of the withdrawal: ${name}`, () => {
    assert.equal(validateWithdrawalForm(form, bounds, today), expected);
  });
}

test('the observations of exactly the allowed length are accepted', () => {
  const notes = 'x'.repeat(NOTES_MAX_LENGTH);
  assert.equal(
    validateWithdrawalForm({ ...validForm, notes }, openBounds, '2026-11-18'),
    null,
  );
});

test('each problem of the form has its own message', () => {
  assert.deepEqual(WITHDRAWAL_FORM_ERROR_MESSAGES, {
    year_not_started: 'El año lectivo aún no ha comenzado.',
    date_required: 'La fecha de retiro es obligatoria.',
    date_future: 'La fecha de retiro no puede ser futura.',
    date_after_year: 'La fecha debe estar dentro del año lectivo.',
    date_before_year: 'La fecha debe estar dentro del año lectivo.',
    notes_too_long: 'Las observaciones no pueden superar 1000 caracteres.',
  });
});

// ----- The visibility of the records in the reports -----

test('the report visibility options are the three the backend understands', () => {
  assert.deepEqual(STATS_VISIBILITY_OPTIONS, [
    {
      value: 'until_withdrawal',
      label: 'Hasta la fecha de retiro',
      help: 'Sus faltas y registros hasta la fecha de retiro siguen contando en reportes y estadísticas.',
    },
    {
      value: 'until_quarter_start',
      label: 'Hasta el inicio del trimestre',
      help: 'Solo cuentan sus registros anteriores al trimestre en que se retira.',
    },
    {
      value: 'whole_year',
      label: 'Ocultar todo el año',
      help: 'Ningún registro suyo de este año lectivo aparece en reportes ni estadísticas.',
    },
  ]);
});

// ----- The request that withdraws the student -----

test('the request carries the enrollment, the date, the reason, the notes and the visibility', () => {
  assert.deepEqual(
    buildWithdrawalPayload(42, {
      date: '2026-11-10',
      reasonId: 3,
      notes: '  Se mudó  ',
      statsVisibility: 'whole_year',
    }),
    {
      enrollmentId: 42,
      withdrawalDate: '2026-11-10',
      reasonId: 3,
      notes: 'Se mudó',
      statsVisibility: 'whole_year',
    },
  );
});

test('blank observations are sent as no observations', () => {
  const payload = buildWithdrawalPayload(42, {
    date: '2026-11-10',
    reasonId: 3,
    notes: '   ',
    statsVisibility: 'until_withdrawal',
  });
  assert.equal(payload.notes, null);
});

test('the enrollment and the reason are sent as numbers', () => {
  const payload = buildWithdrawalPayload(42, {
    date: '2026-11-10',
    reasonId: 3,
    notes: '',
    statsVisibility: 'until_withdrawal',
  });
  assert.equal(typeof payload.enrollmentId, 'number');
  assert.equal(typeof payload.reasonId, 'number');
});

test('the confirmation shows the date the way the country writes it', () => {
  assert.equal(formatWithdrawalDate('2026-11-10'), '10/11/2026');
});

// ----- What a failed request tells the user -----

const errorCases = [
  {
    name: 'a rejected value keeps the backend message and the dialog open',
    err: { status: 400, error: { error: 'La fecha de retiro debe estar dentro del año lectivo' } },
    expected: { message: 'La fecha de retiro debe estar dentro del año lectivo', closeAndReload: false },
  },
  {
    name: 'a forbidden request keeps the backend message and the dialog open',
    err: { status: 403, error: { error: 'Sin permiso de create en student-withdrawals' } },
    expected: { message: 'Sin permiso de create en student-withdrawals', closeAndReload: false },
  },
  {
    name: 'a missing enrollment says so in Spanish and reloads',
    err: { status: 404, error: { error: 'Enrollment not found' } },
    expected: { message: 'La matrícula ya no existe o no pertenece a tus cursos.', closeAndReload: true },
  },
  {
    name: 'an already withdrawn enrollment says so and reloads',
    err: { status: 409, error: { error: 'La matrícula ya está retirada' } },
    expected: { message: 'La matrícula ya está retirada', closeAndReload: true },
  },
  {
    name: 'an already withdrawn enrollment without a message keeps the default text',
    err: { status: 409 },
    expected: { message: 'La matrícula ya está retirada', closeAndReload: true },
  },
  {
    name: 'a server failure falls back to a generic message',
    err: { status: 500, error: { error: 'boom' } },
    expected: { message: 'No se pudo retirar al estudiante. Intenta nuevamente.', closeAndReload: false },
  },
  {
    name: 'a rejected value without a message falls back to a generic message',
    err: { status: 400 },
    expected: { message: 'No se pudo retirar al estudiante. Intenta nuevamente.', closeAndReload: false },
  },
];

for (const { name, err, expected } of errorCases) {
  test(`the outcome of a failed withdrawal: ${name}`, () => {
    assert.deepEqual(withdrawalErrorOutcome(err), expected);
  });
}

// ----- The Retirar item of the row menus -----

test('the permissions of the withdrawal are read once, when the screen loads', () => {
  assert.match(managementSource, /readonly withdrawalFlags = signal<ResourceFlags>\(NO_FLAGS\)/);
  assert.match(
    managementSource,
    /this\.http\.get<RolePermission\[\]>\(`\/api\/roles\/permissions\/\$\{roleId\}`\)\)\.catch\(\(\) => null\)/,
  );
  assert.match(
    managementSource,
    /resolveResourcePermissions\(\s*permissionRows,\s*'student-withdrawals',\s*this\.auth\.isSuperAdmin\(\)\s*\)/,
  );

  const ngOnInit = readMethod(managementSource, 'async ngOnInit()');
  assert.match(ngOnInit, /loadWithdrawalFlags\(\)/);

  const requests = managementSource.match(/\/api\/roles\/permissions\//g) ?? [];
  assert.equal(requests.length, 1);
});

test('a superadmin is offered the action without asking for any permission', () => {
  assert.match(
    managementSource,
    /this\.auth\.isSuperAdmin\(\) \|\| roleId === null\s*\?\s*null\s*:\s*await firstValueFrom\(/,
  );
});

test('the Retirar item appears in both row menus, between Editar and Eliminar', () => {
  for (const marker of ['#rowMenu="matMenu">', '#rowMenuMobile="matMenu">']) {
    const block = readMenuBlock(managementSource, marker);

    assert.match(block, /@if \(withdrawalFlags\(\)\.canCreate\)/);
    assert.match(block, /<mat-icon>person_remove<\/mat-icon> Retirar/);

    const guardAt = block.indexOf('@if (withdrawalFlags().canCreate)');
    const itemAt = block.indexOf('openWithdraw(e)');
    assert.ok(itemAt > guardAt, 'the Retirar item is inside the permission guard');
    assert.ok(
      !block.slice(guardAt, itemAt).includes('}'),
      'the Retirar item is the only thing the guard wraps',
    );

    const editAt = block.indexOf('<mat-icon>edit</mat-icon> Editar');
    const deleteAt = block.indexOf('<mat-icon>delete</mat-icon> Eliminar');
    assert.ok(editAt < itemAt && itemAt < deleteAt, 'Retirar sits between Editar and Eliminar');
  }
});

// ----- The dialog that asks how the student leaves -----

const dialogSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/students/student-withdraw-dialog.component.ts'), 'utf8',
);

test('the dialog asks the backend for the reasons when it opens', () => {
  assert.match(dialogSource, /this\.http\.get<WithdrawalReason\[\]>\('\/api\/withdrawal-reasons'\)/);
  assert.match(dialogSource, /\.filter\(r => r\.isActive\)/);
});

test('the dialog says when there is no reason to pick', () => {
  assert.match(
    dialogSource,
    /No hay motivos de retiro activos\. Un administrador puede registrarlos en Administración > Motivos de retiro\./,
  );
});

test('the dialog says when the reasons could not be loaded', () => {
  assert.match(dialogSource, /No se pudieron cargar los motivos de retiro\./);
});

test('the date picker only offers the days of the academic year', () => {
  assert.match(dialogSource, /\[min\]="minDate\(\)"/);
  assert.match(dialogSource, /\[max\]="maxDate\(\)"/);
});

test('the observations are limited to a thousand characters and counted', () => {
  assert.match(dialogSource, /maxlength="1000"/);
  assert.match(dialogSource, /\{\{ notes\(\)\.length \}\}\/1000/);
});

test('the visibility of the records is a radio group with the three options', () => {
  assert.match(dialogSource, /<mat-radio-group/);
  assert.match(dialogSource, /statsVisibilityOptions = STATS_VISIBILITY_OPTIONS/);
  assert.match(dialogSource, /statsVisibility = signal<StatsVisibility>\('until_withdrawal'\)/);
  assert.match(dialogSource, /@for \(option of statsVisibilityOptions; track option\.value\)/);
});

test('the problem of the form is shown where it belongs', () => {
  assert.match(dialogSource, /WITHDRAWAL_FORM_ERROR_MESSAGES/);
  assert.match(dialogSource, /<mat-error>\{\{ dateError\(\) \}\}<\/mat-error>/);
  assert.match(dialogSource, /<mat-error>\{\{ notesError\(\) \}\}<\/mat-error>/);
});

test('a missing date tells the user that the date is obligatory', () => {
  const dateInput = readDateInput(dialogSource);

  // A field only shows its message while its control is in an error state, so
  // the date has to carry the validator that makes an empty date invalid.
  assert.match(dateInput, /\[required\]="dateRequired\(\)"/);
  assert.match(dialogSource, /readonly dateRequired = computed\(\(\) => withdrawalDateRequired\(this\.bounds\)\)/);

  // And the field has to show that error right away, without waiting for the
  // user to leave it.
  assert.match(dateInput, /\[errorStateMatcher\]="dateErrorState"/);
  const matcher = readMethod(dialogSource, 'isErrorState(control: AbstractControl | null): boolean');
  assert.match(matcher, /return !!control && control\.invalid && this\.hasMessage\(\);/);
  assert.doesNotMatch(matcher, /touched/);
});

test('the Retirar button stays disabled while the form is not ready', () => {
  assert.match(dialogSource, /\[disabled\]="!canSubmit\(\)"/);
  assert.match(dialogSource, /readonly canSubmit = computed\(/);
});

// ----- The confirmation that comes before the withdrawal -----

test('the withdrawal asks for confirmation before it happens', () => {
  const submit = readMethod(dialogSource, 'async submit(): Promise<void>');

  assert.match(submit, /this\.dialog\.open\(ConfirmDialogComponent, \{/);
  assert.match(submit, /title: 'Retirar estudiante'/);
  assert.match(submit, /confirmLabel: 'Retirar'/);
  assert.match(submit, /icon: 'person_remove'/);
  assert.match(submit, /¿Retirar a \$\{this\.data\.enrollment\.fullName\} de \$\{this\.data\.enrollment\.course\} con fecha \$\{formatWithdrawalDate\(dateStr\)\}/);
  assert.match(submit, /Dejará de aparecer en la nómina y sus registros se mostrarán según la visibilidad elegida\./);
});

test('a cancelled confirmation leaves the student enrolled', () => {
  const submit = readMethod(dialogSource, 'async submit(): Promise<void>');

  assert.match(submit, /if \(!confirmed\) return;/);
  assert.ok(
    submit.indexOf('if (!confirmed) return;') < submit.indexOf('this.http.post'),
    'the request only happens after the confirmation',
  );
});

test('the dialog cannot be closed while the withdrawal is on its way', () => {
  assert.match(dialogSource, /this\.dialogRef\.disableClose = true/);
  assert.match(dialogSource, /this\.dialogRef\.disableClose = false/);
  assert.match(
    dialogSource,
    /<button mat-button \[disabled\]="saving\(\)" \(click\)="dialogRef\.close\(false\)">Cancelar<\/button>/,
  );
});

// ----- The request that withdraws the student -----

test('the withdrawal is sent to the backend with the data of the form', () => {
  const submit = readMethod(dialogSource, 'async submit(): Promise<void>');

  assert.match(
    submit,
    /const payload = buildWithdrawalPayload\(this\.data\.enrollment\.enrollmentId, \{/,
  );
  assert.match(submit, /this\.http\.post<WithdrawalItem>\('\/api\/student-withdrawals', payload\)/);
});

test('a successful withdrawal says so and closes the dialog', () => {
  const submit = readMethod(dialogSource, 'async submit(): Promise<void>');

  assert.match(submit, /this\.notify\.success\('Estudiante retirado'\)/);
  assert.match(submit, /this\.dialogRef\.close\('withdrawn'\)/);
});

test('a failed withdrawal shows what went wrong', () => {
  const submit = readMethod(dialogSource, 'async submit(): Promise<void>');

  assert.match(submit, /const outcome = withdrawalErrorOutcome\(err\);/);
  assert.match(submit, /this\.notify\.error\(outcome\.message\)/);
  assert.match(submit, /if \(outcome\.closeAndReload\) this\.dialogRef\.close\('stale'\);/);
});

test('the screen reloads the roster after the withdrawal', () => {
  const handler = readMethod(managementSource, 'openWithdraw(e: Enrollment)');

  assert.match(handler, /this\.academicYearContext\.years\(\)\.find\(y => y\.id === e\.academicYearId\) \?\? null/);
  assert.match(handler, /this\.dialog\.open\(StudentWithdrawDialogComponent, \{/);
  assert.match(handler, /data: \{ enrollment: e, year \}/);
  assert.match(handler, /if \(result === 'withdrawn' \|\| result === 'stale'\) await this\.load\(\);/);
});
