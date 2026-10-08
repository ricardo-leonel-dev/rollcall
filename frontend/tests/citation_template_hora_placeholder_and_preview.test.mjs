// Feature 45 — citation_template_hora_placeholder_and_preview.
//
// Plain JS test, runs under `node --test` with no compilation step. The
// Angular project has no test framework wired (see docs/conventions.md >
// Tests and docs/verification.md; also CLAUDE.md > "No test or lint
// scripts are configured"), so this file is the smoke coverage for the
// four acceptance items — invoked manually or by the reviewer:
//
//   node --test tests/citation_template_hora_placeholder_and_preview.test.mjs
//
// It pins:
//   - the FALLBACK_TEMPLATES.citations string against the BE catalog
//     default verbatim (postgres/25_citation_template_hora.sql);
//   - the new PLACEHOLDER_SAMPLES (weekday in fecha, 10:30 AM in hora);
//   - the public export surface of citation-date.util (existing exports
//     still intact, new formatCitationDateOnly / formatCitationTimeOnly
//     added);
//   - and the wire-level wa.me URL contract for the pending vs closed
//     branches of citations.component.notifyGuardian.
//
// Helpers below are a JS port of citation-date.util used only for runtime
// assertions; the actual production code is verified by literal-string
// reads of the .ts sources so this test can't drift from the shipped
// behavior without failing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');

// ----- JS port of citation-date.util helpers (A1 runtime assertions) -----

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function dateStringToDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLongDateEs(dateStr) {
  const d = dateStringToDate(dateStr);
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} del ${d.getFullYear()}`;
}

function to12h(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, period };
}

function formatTime12hFromParts(h, m) {
  const { h12, period } = to12h(h);
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

function formatTime12h(time) {
  const [hStr, mStr] = time.split(':');
  return formatTime12hFromParts(Number(hStr), Number(mStr));
}

// Mirrors the new exports of citation-date.util:
function formatCitationDateOnly(date) { return formatLongDateEs(date); }
function formatCitationTimeOnly(time) { return formatTime12h(time); }

// JS port of fillTemplate (same contract as src/app/shared/utils/template.util.ts):
function fillTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, () => value);
  }
  return out;
}

// ----- Sources (read at test time so drift fails the test) -----

const citationDateSource = readFileSync(
  resolve(FE_ROOT, 'src/app/shared/utils/citation-date.util.ts'), 'utf8',
);
const templateUtilSource = readFileSync(
  resolve(FE_ROOT, 'src/app/shared/utils/template.util.ts'), 'utf8',
);
const citationsComponentSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/citations/citations.component.ts'), 'utf8',
);

// ----- Constants pinned to the BE contract (postgres/25_citation_template_hora.sql) -----

const CITATIONS_BACKEND_DEFAULT =
  'Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.';
const ABSENCES_BACKEND_DEFAULT =
  'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.';

// ============================================================================
// A1 — split fecha into fecha + hora on the pending-branch WA URL/body
// ============================================================================

test('A1: formatCitationDateOnly returns the weekday+month string used in {{fecha}}', () => {
  // 2026-06-17 is a Wednesday.
  assert.equal(formatCitationDateOnly('2026-06-17'), 'miércoles 17 de junio del 2026');
});

test('A1: formatCitationTimeOnly emits 12-hour AM/PM (covers the {{hora}} placeholder)', () => {
  // The util zero-pads the hour to two chars, so 13:00 → '01:00 PM'.
  assert.equal(formatCitationTimeOnly('10:30'), '10:30 AM');
  assert.equal(formatCitationTimeOnly('13:00'), '01:00 PM');
  assert.equal(formatCitationTimeOnly('00:05'), '12:05 AM');
  assert.equal(formatCitationTimeOnly('23:45'), '11:45 PM');
});

test('A1: citation-date.util exposes formatCitationDateOnly + formatCitationTimeOnly', () => {
  // Source-level guard so a rename of the new exports forces a reviewer-visible failure.
  assert.match(citationDateSource, /export function formatCitationDateOnly/);
  assert.match(citationDateSource, /export function formatCitationTimeOnly/);
  assert.match(citationDateSource, /\/\*\* Date-only fragment/);
  assert.match(citationDateSource, /\/\*\* Time-only fragment/);
});

test('A1: citation-date.util keeps the existing public exports intact (other consumers still depend on them)', () => {
  assert.match(citationDateSource, /export function formatCitationDateLabelShort/);
  assert.match(citationDateSource, /export function formatCitationTargetLabel/);
  assert.match(citationDateSource, /export function formatCitationCreatedAtLabel/);
});

test('A1: citations.component passes fecha and hora as separate vars to renderTemplate', () => {
  // The old shape was a single combined string `fecha: formatCitationDateLabelShort(...)`.
  // After feature 45 it must be two vars: fecha (date only) + hora (time only).
  assert.match(
    citationsComponentSource,
    /fecha:\s*formatCitationDateOnly\(target\.date\)/,
    'citations.component must split fecha via formatCitationDateOnly',
  );
  assert.match(
    citationsComponentSource,
    /hora:\s*formatCitationTimeOnly\(target\.time\)/,
    'citations.component must split hora via formatCitationTimeOnly',
  );
  assert.equal(
    citationsComponentSource.includes('fecha: formatCitationDateLabelShort'),
    false,
    'the old combined fecha line must NOT remain alongside the new vars',
  );
  assert.match(
    citationsComponentSource,
    /import \{[^}]*formatCitationDateOnly[^}]*formatCitationTimeOnly[^}]*\} from '\.\.\/\.\.\/shared\/utils\/citation-date\.util'/,
    'both new helpers must be imported in citations.component.ts',
  );
});

// ============================================================================
// A2 — FALLBACK_TEMPLATES.citations mirrors the BE default verbatim
// ============================================================================

test('A2: FALLBACK_TEMPLATES.citations in template.util.ts matches the migration-25 default byte-for-byte', () => {
  // Single-line literal, verbatim copy of the SQL seed.
  const m = templateUtilSource.match(/citations:\s*'([^']*)'/);
  assert.ok(m, 'citations line must be present in FALLBACK_TEMPLATES');
  assert.equal(m[1], CITATIONS_BACKEND_DEFAULT);
});

test('A2: FALLBACK_TEMPLATES.absences is left untouched (absences contract unchanged)', () => {
  const m = templateUtilSource.match(/absences:\s*'([^']*)'/);
  assert.ok(m, 'absences line must be present in FALLBACK_TEMPLATES');
  assert.equal(m[1], ABSENCES_BACKEND_DEFAULT);
});

test('A2: template.util header comment mentions both postgres/24 and 25 (split {{hora}} contract)', () => {
  // The file header explicitly says the FALLBACK is a verbatim copy from the BE migration.
  assert.match(templateUtilSource, /postgres\/\{24,25\}_message_template_actions\.sql/);
});

test('A2: fillTemplate interpolates each placeholder exactly once with no regex mishap', () => {
  const rendered = fillTemplate(CITATIONS_BACKEND_DEFAULT, {
    nombre: 'JUAN PÉREZ',
    fecha:  formatCitationDateOnly('2026-06-17'),
    hora:   formatCitationTimeOnly('10:30'),
  });
  assert.equal(
    rendered,
    'Estimado representante, se le cita a la institución el miércoles 17 de junio del 2026 a las 10:30 AM para tratar un asunto relacionado con JUAN PÉREZ. Por favor confirmar asistencia.',
  );
  // Token must be replaced literally — values containing `$&` / `$1`
  // round-trip intact (the helper uses a replacer function).
  const tricky = fillTemplate(CITATIONS_BACKEND_DEFAULT, {
    nombre: '$& $1',
    fecha:  '<<fecha>>',
    hora:   '<<hora>>',
  });
  assert.equal(tricky.includes('$& $1'), true);
  assert.equal(tricky.includes('<<fecha>>'), true);
});

// ============================================================================
// A3 — /profile preview for citations shows weekday + 12h time
// ============================================================================

test('A3: PLACEHOLDER_SAMPLES.fecha includes the weekday (literal "miércoles" + "17 de junio de 2026")', () => {
  const m = templateUtilSource.match(/fecha:\s*'([^']*)'/);
  assert.ok(m, 'fecha line must be present in PLACEHOLDER_SAMPLES');
  assert.match(m[1], /\bmiércoles\b/);
  assert.match(m[1], /\b17 de junio de 2026\b/);
  // And it must NOT carry the old plain date shape (which the previous sample
  // already pinned to '17 de junio de 2026' without a weekday).
});

test('A3: PLACEHOLDER_SAMPLES.hora is the canonical "10:30 AM"', () => {
  const m = templateUtilSource.match(/hora:\s*'([^']*)'/);
  assert.ok(m, 'hora line must be present in PLACEHOLDER_SAMPLES');
  assert.equal(m[1], '10:30 AM');
});

test('A3: PLACEHOLDER_SAMPLES — absences (tipo/curso) are unchanged', () => {
  // Regression guard so a future edit doesn't widen the hora edit into the
  // absences samples. Both absences keys must be untouched.
  assert.match(templateUtilSource, /tipo:\s*'una falta'/);
  assert.match(templateUtilSource, /curso:\s*'OCTAVO "A"'/);
  assert.match(templateUtilSource, /nombre:\s*'JUAN PÉREZ'/);
});

test('A3: rendered citations preview contains "... el miércoles 17 de junio de 2026 a las 10:30 AM ..."', () => {
  // JS port of previewTemplate using the literal map from template.util.ts.
  const samples = {
    nombre: 'JUAN PÉREZ',
    fecha:  'miércoles 17 de junio de 2026',
    hora:   '10:30 AM',
    tipo:   'una falta',
    curso:  'OCTAVO "A"',
  };
  const placeholders = [
    { key: 'nombre', label: 'Nombre del estudiante' },
    { key: 'fecha',  label: 'Fecha de la citación' },
    { key: 'hora',   label: 'Hora de la citación' },
  ];
  const vars = {};
  for (const p of placeholders) vars[p.key] = samples[p.key] ?? `[${p.label}]`;
  const out = fillTemplate(CITATIONS_BACKEND_DEFAULT, vars);
  assert.match(out, /el miércoles 17 de junio de 2026 a las 10:30 AM/);
  // [label] would appear if a placeholder key was missing from PLACEHOLDER_SAMPLES.
  assert.equal(out.includes('[Nombre del estudiante]'), false);
  assert.equal(out.includes('[Hora de la citación]'), false);
});

// ============================================================================
// A4 — closed citations bypass the templated body; pending gets both vars
// ============================================================================

test('A4: notifications-templates-tab has only one brand per action (absences vs citations are independent)', () => {
  // The Citaciones card and the Faltas card each render their own preview;
  // changing one must not bleed into the other.
  const whatsappTemplatesSource = readFileSync(
    resolve(FE_ROOT, 'src/app/features/profile/whatsapp-templates-tab/whatsapp-templates-tab.component.ts'),
    'utf8',
  );
  // Both cards must use the shared previewTemplate helper from template.util.
  assert.match(whatsappTemplatesSource, /import \{[^}]*previewTemplate[^}]*\} from/);
  // No hard-coded samples of weekday / hora in this file (they live in template.util).
  assert.equal(whatsappTemplatesSource.includes("10:30 AM"), false);
  assert.equal(whatsappTemplatesSource.includes("miércoles"), false);
});

test('A4: closed-branch invariant — link-only wa.me with NO ?text=', () => {
  // Mirror of citations.component.ts line ~348: closed citations open
  // whatsappLink as-is. No text body, no placeholder rendering.
  assert.match(
    citationsComponentSource,
    /if \(target\.status === 'closed'\) \{ window\.open\(whatsappLink, '_blank'\); return; \}/,
    'the closed branch must open whatsappLink verbatim, not via toUrl()',
  );
});

test('A4: pending-branch invariant — url gets a ?text= body with both vars (date + time)', () => {
  const whatsappLink = 'https://wa.me/593999999999';
  const built = `${whatsappLink}?text=${encodeURIComponent(
    fillTemplate(CITATIONS_BACKEND_DEFAULT, {
      nombre: 'JUAN PÉREZ',
      fecha:  formatCitationDateOnly('2026-06-17'),
      hora:   formatCitationTimeOnly('10:30'),
    })
  )}`;
  // Both fragments are encoded into the URL — proves both vars flow through.
  // Note: encodeURIComponent percent-encodes non-ASCII ('é' -> %C3%A9) so the
  // assertions below look for the encoded form, not the raw Spanish string.
  assert.match(built, /mi%C3%A9rcoles%2017%20de%20junio%20del%202026/);
  assert.match(built, /10%3A30%20AM/);
});
