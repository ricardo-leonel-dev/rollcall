// The panel of the statistics of the withdrawals: how many students left
// the institution and why, above the list of the withdrawn students.
//
// Plain JS test, runs under `node --test` with no compilation step, like
// tests/withdrawn_students_view.test.mjs. The pure helpers (the query of the
// statistics, the share of a reason, the caption of the filters, the labels)
// are imported straight from their TypeScript source with Node's type
// stripping; the components are read as text and asserted on what they do.
//
//   node --test tests/withdrawal_stats_panel.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');

const readSource = (relativePath) => readFileSync(resolve(FE_ROOT, relativePath), 'utf8');

const withdrawalUtil = await import(
  pathToFileURL(resolve(FE_ROOT, 'src/app/shared/utils/withdrawal.util.ts')).href
);

const {
  WITHDRAWAL_STATS_EXPANDED_MIN_WIDTH,
  buildWithdrawalListQuery,
  buildWithdrawalStatsQuery,
  withdrawalReasonShare,
  withdrawalStatsCaption,
  withdrawalStatsErrorMessage,
  withdrawalStatsInitiallyExpanded,
  withdrawalStatsTotalLabel,
  withdrawalStatsUrl,
} = withdrawalUtil;

const panelSource = readSource('src/app/features/students/withdrawal-stats-panel.component.ts');
const hostSource = readSource('src/app/features/students/withdrawn-students.component.ts');

// ----- The query of the statistics -----

const emptyFilters = {
  academicYearId: null,
  courseId: null,
  reasonId: null,
  dateFrom: null,
  dateTo: null,
};

const statsQueryCases = [
  {
    name: 'the first load asks for the year selected in the topbar',
    filters: { ...emptyFilters, academicYearId: 7 },
    expected: 'academic_year_id=7',
  },
  {
    name: 'the course narrows the statistics down',
    filters: { ...emptyFilters, academicYearId: 7, courseId: 3 },
    expected: 'academic_year_id=7&course_id=3',
  },
  {
    name: 'the reason narrows the statistics down',
    filters: { ...emptyFilters, academicYearId: 7, reasonId: 5 },
    expected: 'academic_year_id=7&reason_id=5',
  },
  {
    name: 'the date from narrows the statistics down',
    filters: { ...emptyFilters, academicYearId: 7, dateFrom: '2026-03-01' },
    expected: 'academic_year_id=7&date_from=2026-03-01',
  },
  {
    name: 'the date to narrows the statistics down',
    filters: { ...emptyFilters, academicYearId: 7, dateTo: '2026-06-30' },
    expected: 'academic_year_id=7&date_to=2026-06-30',
  },
  {
    name: 'both dates narrow the statistics down',
    filters: { ...emptyFilters, academicYearId: 7, dateFrom: '2026-03-01', dateTo: '2026-06-30' },
    expected: 'academic_year_id=7&date_from=2026-03-01&date_to=2026-06-30',
  },
  {
    name: 'every filter of the panel travels with the request',
    filters: {
      academicYearId: 7, courseId: 3, reasonId: 5, dateFrom: '2026-03-01', dateTo: '2026-06-30',
    },
    expected: 'academic_year_id=7&course_id=3&reason_id=5&date_from=2026-03-01&date_to=2026-06-30',
  },
  {
    name: 'without a selected year every year is asked for',
    filters: { ...emptyFilters },
    expected: '',
  },
  {
    name: 'a course without a year is asked for on its own',
    filters: { ...emptyFilters, courseId: 3 },
    expected: 'course_id=3',
  },
];

for (const { name, filters, expected } of statsQueryCases) {
  test(`the query of the statistics: ${name}`, () => {
    assert.equal(buildWithdrawalStatsQuery(filters), expected);
  });
}

test('the statistics are asked for at their own address', () => {
  assert.equal(
    withdrawalStatsUrl({ ...emptyFilters, academicYearId: 7 }),
    '/api/student-withdrawals/stats?academic_year_id=7',
  );
  assert.equal(withdrawalStatsUrl({ ...emptyFilters }), '/api/student-withdrawals/stats');
});

test('the statistics never ask for the state of the withdrawal', () => {
  for (const filters of [
    { ...emptyFilters, academicYearId: 7 },
    { ...emptyFilters, academicYearId: 7, courseId: 3, reasonId: 5, dateFrom: '2026-03-01' },
    { ...emptyFilters },
  ]) {
    const query = buildWithdrawalStatsQuery(filters);
    assert.doesNotMatch(query, /status=/);
    assert.doesNotMatch(query, /search/i);
    assert.doesNotMatch(query, /visibility/i);
  }
});

test('the statistics ask for the same values the list asks for', () => {
  const cases = [
    { academicYearId: 7, courseId: null, reasonId: 5, dateFrom: null, dateTo: null },
    { academicYearId: 7, courseId: 3, reasonId: null, dateFrom: '2026-03-01', dateTo: null },
    { academicYearId: null, courseId: 3, reasonId: 5, dateFrom: '2026-03-01', dateTo: '2026-06-30' },
    { academicYearId: 7, courseId: 3, reasonId: 5, dateFrom: '2026-03-01', dateTo: '2026-06-30' },
  ];

  for (const filters of cases) {
    const stats = new URLSearchParams(buildWithdrawalStatsQuery(filters));
    const list = new URLSearchParams(buildWithdrawalListQuery({ status: 'active', ...filters }));

    for (const key of ['reason_id', 'date_from', 'date_to']) {
      assert.equal(stats.get(key), list.get(key), `${key} is the same in both requests`);
    }
    assert.equal(stats.get('academic_year_id'), list.get('academic_year_id'));
    assert.equal(stats.get('course_id'), list.get('course_id'));
  }
});

// ----- The numbers of the panel -----

const shareCases = [
  { name: 'three of five are sixty percent', count: 3, total: 5, expected: 60 },
  { name: 'two of five are forty percent', count: 2, total: 5, expected: 40 },
  { name: 'none of five is zero percent', count: 0, total: 5, expected: 0 },
  { name: 'one of three is thirty three percent', count: 1, total: 3, expected: 33 },
  { name: 'two of two are a hundred percent', count: 2, total: 2, expected: 100 },
  { name: 'the only reason of a single withdrawal is a hundred percent', count: 1, total: 1, expected: 100 },
  { name: 'without withdrawals nothing is a share', count: 0, total: 0, expected: 0 },
  { name: 'a count over a total of zero is not a share', count: 3, total: 0, expected: 0 },
];

for (const { name, count, total, expected } of shareCases) {
  test(`the share of a reason: ${name}`, () => {
    assert.equal(withdrawalReasonShare(count, total), expected);
  });
}

test('the total of the panel is written in singular when there is one', () => {
  assert.equal(withdrawalStatsTotalLabel(1), '1 retiro vigente');
  assert.equal(withdrawalStatsTotalLabel(0), '0 retiros vigentes');
  assert.equal(withdrawalStatsTotalLabel(5), '5 retiros vigentes');
});

// ----- The caption of the filters -----

const captionSources = {
  years: [{ id: 1, name: 'Año Lectivo 2026' }],
  courses: [{ id: 3, name: '5° A' }],
  reasons: [
    { id: 5, name: 'Cambio de domicilio', isActive: true },
    { id: 9, name: 'Traslado', isActive: false },
  ],
};

const captionCases = [
  {
    name: 'the year alone',
    filters: { ...emptyFilters, academicYearId: 1 },
    expected: 'Año Lectivo 2026',
  },
  {
    name: 'the year and the course',
    filters: { ...emptyFilters, academicYearId: 1, courseId: 3 },
    expected: 'Año Lectivo 2026 · 5° A',
  },
  {
    name: 'the year and the reason',
    filters: { ...emptyFilters, academicYearId: 1, reasonId: 5 },
    expected: 'Año Lectivo 2026 · Cambio de domicilio',
  },
  {
    name: 'the year and a reason that was deleted',
    filters: { ...emptyFilters, academicYearId: 1, reasonId: 9 },
    expected: 'Año Lectivo 2026 · Traslado (inactivo)',
  },
  {
    name: 'the year and the date from',
    filters: { ...emptyFilters, academicYearId: 1, dateFrom: '2026-03-01' },
    expected: 'Año Lectivo 2026 · Desde 01/03/2026',
  },
  {
    name: 'the year and the date to',
    filters: { ...emptyFilters, academicYearId: 1, dateTo: '2026-06-30' },
    expected: 'Año Lectivo 2026 · Hasta 30/06/2026',
  },
  {
    name: 'the year and both dates',
    filters: { ...emptyFilters, academicYearId: 1, dateFrom: '2026-03-01', dateTo: '2026-06-30' },
    expected: 'Año Lectivo 2026 · Del 01/03/2026 al 30/06/2026',
  },
  {
    name: 'every filter of the panel',
    filters: {
      academicYearId: 1, courseId: 3, reasonId: 5, dateFrom: '2026-03-01', dateTo: '2026-06-30',
    },
    expected: 'Año Lectivo 2026 · 5° A · Cambio de domicilio · Del 01/03/2026 al 30/06/2026',
  },
  {
    name: 'the course alone',
    filters: { ...emptyFilters, courseId: 3 },
    expected: '5° A',
  },
  {
    name: 'a course that is not in the loaded ones',
    filters: { ...emptyFilters, academicYearId: 1, courseId: 4 },
    expected: 'Año Lectivo 2026',
  },
  {
    name: 'a reason that is not in the loaded ones',
    filters: { ...emptyFilters, academicYearId: 1, reasonId: 7 },
    expected: 'Año Lectivo 2026',
  },
];

for (const { name, filters, expected } of captionCases) {
  test(`the caption of the filters: ${name}`, () => {
    assert.equal(withdrawalStatsCaption(filters, captionSources), expected);
  });
}

test('the caption is not written when no filter is active', () => {
  assert.equal(withdrawalStatsCaption({ ...emptyFilters }, captionSources), null);
});

test('the caption leaves out the reason when the reasons could not be loaded', () => {
  assert.equal(
    withdrawalStatsCaption({ ...emptyFilters, academicYearId: 1, reasonId: 5 }, {
      ...captionSources,
      reasons: null,
    }),
    'Año Lectivo 2026',
  );
});

test('the caption of the filters is not a fixed sentence', () => {
  const caption = withdrawalStatsCaption({ ...emptyFilters, academicYearId: 1 }, captionSources);
  assert.ok(caption);
  assert.doesNotMatch(caption, /Según el año/);
});

// ----- The failure of the statistics -----

const statsErrorCases = [
  {
    name: 'a rejected query shows what the backend said',
    err: { status: 400, error: { error: 'Parámetros de consulta inválidos' } },
    expected: 'Parámetros de consulta inválidos',
  },
  {
    name: 'a forbidden request shows what the backend said',
    err: { status: 403, error: { error: 'Acceso denegado' } },
    expected: 'Acceso denegado',
  },
  {
    name: 'a forbidden request without a text falls back to a generic message',
    err: { status: 403, error: {} },
    expected: 'No se pudieron cargar las estadísticas.',
  },
  {
    name: 'a server failure falls back to a generic message',
    err: { status: 500, error: { error: 'boom' } },
    expected: 'No se pudieron cargar las estadísticas.',
  },
  {
    name: 'a network failure falls back to a generic message',
    err: { status: 0 },
    expected: 'No se pudieron cargar las estadísticas.',
  },
];

for (const { name, err, expected } of statsErrorCases) {
  test(`the message of a failed statistics: ${name}`, () => {
    assert.equal(withdrawalStatsErrorMessage(err), expected);
  });
}

// ----- The opening of the panel -----

test('the panel starts collapsed on a phone and expanded on a screen', () => {
  assert.equal(WITHDRAWAL_STATS_EXPANDED_MIN_WIDTH, 768);
  assert.equal(withdrawalStatsInitiallyExpanded(375), false);
  assert.equal(withdrawalStatsInitiallyExpanded(767), false);
  assert.equal(withdrawalStatsInitiallyExpanded(768), true);
  assert.equal(withdrawalStatsInitiallyExpanded(1280), true);
});

// ----- The panel itself -----

test('the panel is a standalone component with a selector of its own', () => {
  assert.match(panelSource, /selector: 'app-withdrawal-stats-panel'/);
  assert.match(panelSource, /standalone: true/);
  assert.match(panelSource, /changeDetection: ChangeDetectionStrategy\.OnPush/);
});

test('the panel takes the filters, the caption and the refresh token', () => {
  assert.match(panelSource, /readonly filters = input\.required<WithdrawalStatsFilters>\(\)/);
  assert.match(panelSource, /readonly refreshToken = input\(0\)/);
  assert.match(panelSource, /readonly caption = input<string \| null>\(null\)/);
});

test('the address of the statistics comes from the filters', () => {
  assert.match(panelSource, /readonly url = computed\(\(\) => withdrawalStatsUrl\(this\.filters\(\)\)\)/);
});

test('the statistics are asked for when the address or the refresh token change, and nothing else', () => {
  const effect = panelSource.slice(
    panelSource.indexOf('effect(() => {'),
    panelSource.indexOf('untracked(() => this.load(url));'),
  );

  assert.match(effect, /const url = this\.url\(\);/);
  assert.match(effect, /this\.refreshToken\(\);/);
  assert.doesNotMatch(effect, /this\.expanded\(\)/);
  assert.doesNotMatch(effect, /this\.caption\(\)/);
  assert.match(panelSource, /untracked\(\(\) => this\.load\(url\)\)/);
});

test('a response that arrives late does not overwrite a newer one', () => {
  const load = panelSource.slice(
    panelSource.indexOf('async load('),
    panelSource.indexOf('\n  }\n', panelSource.indexOf('async load(')),
  );

  assert.match(load, /const seq = \+\+this\.loadSeq;/);
  assert.match(load, /if \(seq !== this\.loadSeq\) return;/);
  assert.match(panelSource, /private loadSeq = 0;/);
});

test('the panel shows one state at a time', () => {
  assert.match(panelSource, /Cargando estadísticas\.\.\./);
  assert.match(panelSource, /Sin retiros vigentes con estos filtros/);
  assert.match(panelSource, /No se pudieron cargar las estadísticas/);
  assert.match(panelSource, /Reintentar/);
});

test('the panel names the total of the withdrawals', () => {
  assert.match(panelSource, /Retiros vigentes por motivo/);
  assert.match(panelSource, /withdrawalStatsTotalLabel/);
});

test('the summary of the panel waits for the first answer instead of showing zero', () => {
  assert.match(panelSource, /readonly summary = computed<'loading' \| 'error' \| 'total'>/);
  assert.match(panelSource, /if \(!this\.stats\(\)\) return 'loading';/);
  assert.match(panelSource, /@if \(summary\(\) === 'loading'\)/);
  assert.match(panelSource, /@else if \(summary\(\) === 'error'\)/);
});

test('the rows of the panel keep the order of the answer and show the share of each one', () => {
  assert.match(panelSource, /@for \(row of data\.byReason; track row\.reasonId\)/);
  assert.match(panelSource, /\{\{row\.reasonName\}\}/);
  assert.match(panelSource, /\{\{row\.count\}\}/);
  assert.match(panelSource, /\{\{share\(row\)\}\} %/);
  assert.match(panelSource, /withdrawalReasonShare\(row\.count, this\.stats\(\)\?\.total \?\? 0\)/);
});

test('the panel opens collapsed on a phone and expanded on a screen', () => {
  assert.match(panelSource, /readonly expanded = signal\(withdrawalStatsInitiallyExpanded\(window\.innerWidth\)\)/);
});

test('the button of the panel opens and closes the body', () => {
  assert.match(panelSource, /<button type="button"[^>]*class="stats-toggle"/);
  assert.match(panelSource, /\[attr\.aria-expanded\]="expanded\(\)"/);
  assert.match(panelSource, /\[attr\.aria-controls\]="bodyId"/);
  assert.match(panelSource, /\(click\)="toggle\(\)"/);
  assert.match(panelSource, /expanded\.update\(v => !v\)/);
});

test('the body of the panel only exists while it is open', () => {
  const body = panelSource.slice(
    panelSource.indexOf('@if (expanded()) {'),
    panelSource.indexOf('</section>'),
  );

  assert.match(body, /<div class="stats-body" \[id\]="bodyId">/);
});

test('the caption of the filters is shown inside the body', () => {
  const body = panelSource.slice(
    panelSource.indexOf('@if (expanded()) {'),
    panelSource.indexOf('</section>'),
  );

  assert.match(body, /@if \(caption\(\); as text\)/);
  assert.match(body, /\{\{text\}\}/);
});

test('the panel does not tell a fixed sentence about the filters', () => {
  assert.doesNotMatch(panelSource, /Según el año/);
});

test('the bars of the panel are drawn with the ink of the notebook', () => {
  assert.match(panelSource, /var\(--ink-soft\)/);
  assert.doesNotMatch(panelSource, /var\(--stripe\)/);
});

test('the rows of the panel fill the two columns of the screen row by row', () => {
  assert.doesNotMatch(panelSource, /grid-auto-flow: column/);
  assert.match(panelSource, /grid-template-columns: 1fr 1fr/);
});

test('the panel tries again with the same address', () => {
  assert.match(panelSource, /\(click\)="load\(\)"/);
});

// ----- The screen of the withdrawn students -----

test('the panel sits between the filters of the screen and the list', () => {
  const filterBar = hostSource.indexOf('class="filter-bar"');
  const panel = hostSource.indexOf('<app-withdrawal-stats-panel');
  const list = hostSource.indexOf('@if (loading())');

  assert.ok(filterBar !== -1, 'the screen has its filter bar');
  assert.ok(panel !== -1, 'the screen has the panel');
  assert.ok(list !== -1, 'the screen has the states of the list');
  assert.ok(filterBar < panel, 'the panel comes after the filters');
  assert.ok(panel < list, 'the panel comes before the list');
});

test('the panel is given the filters without the state of the withdrawal', () => {
  assert.match(
    hostSource,
    /readonly statsFilters = computed<WithdrawalStatsFilters>\(\(\) => \{\s*const \{ status, \.\.\.rest \} = this\.filters\(\);\s*return rest;\s*\}\);/,
  );
  assert.match(hostSource, /\[filters\]="statsFilters\(\)"/);
  assert.match(hostSource, /\[caption\]="statsCaption\(\)"/);
  assert.match(hostSource, /\[refreshToken\]="statsRefresh\(\)"/);
});

test('the caption of the panel names the filters the screen already loaded', () => {
  assert.match(
    hostSource,
    /readonly statsCaption = computed\(\(\) =>\s*withdrawalStatsCaption\(this\.statsFilters\(\), \{\s*years: this\.academicYearContext\.years\(\),\s*courses: this\.courses\(\),\s*reasons: this\.reasons\(\),\s*\}\)\);/,
  );
});

test('the counts of the panel are asked for again after a reinstatement', () => {
  const reinstate = hostSource.slice(
    hostSource.indexOf('async reinstate(item: WithdrawalItem): Promise<void>'),
    hostSource.indexOf('\n  }\n', hostSource.indexOf('async reinstate(item: WithdrawalItem): Promise<void>')),
  );

  assert.match(reinstate, /this\.statsRefresh\.update\(n => n \+ 1\)/);
  assert.equal(
    (reinstate.match(/this\.statsRefresh\.update\(n => n \+ 1\)/g) ?? []).length,
    2,
    'the token moves once after the success and once when the list is reloaded',
  );
  assert.ok(
    reinstate.indexOf('this.statsRefresh.update(n => n + 1);') < reinstate.indexOf('await this.load();'),
    'the panel is refreshed before the list is read again',
  );
});

test('changing the visibility of a record does not ask for the counts again', () => {
  const changeVisibility = hostSource.slice(
    hostSource.indexOf('changeVisibility(item: WithdrawalItem): void'),
    hostSource.indexOf('\n  }\n', hostSource.indexOf('changeVisibility(item: WithdrawalItem): void')),
  );

  assert.doesNotMatch(changeVisibility, /statsRefresh/);
});
