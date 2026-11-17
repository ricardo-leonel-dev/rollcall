// Course section field.
//
// Plain JS test, runs under `node --test` with no compilation step. The
// Angular project has no test framework wired (see docs/conventions.md >
// Tests and docs/verification.md; also CLAUDE.md > "No test or lint
// scripts are configured"), so this file is the smoke coverage for the
// course parallel-field rename — run manually as part of the smoke pass:
//
//   node --test tests/course_section_field.test.mjs
//
// It pins:
//   - the Course model interface exposes `section` (and no `paralelo`);
//   - the admin course dialog binds its input to `section`, initializes it
//     from `course?.section`, and sends `section` in the create/update
//     payload;
//   - the admin course table reads `c.section` in the desktop cell and in
//     the mobile row;
//   - no lowercase `paralelo` identifier is left anywhere in src/ (the
//     Spanish "Paralelo" label and the "en paralelo" prose inside comments
//     are allowed — the assertion targets the identifier, not the label).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');
const SRC_ROOT = resolve(FE_ROOT, 'src');

// ----- Sources (read at test time so drift fails the test) -----

const modelsSource = readFileSync(
  resolve(FE_ROOT, 'src/app/core/models/index.ts'), 'utf8',
);
const courseDialogSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/admin/course-dialog.component.ts'), 'utf8',
);
const adminSource = readFileSync(
  resolve(FE_ROOT, 'src/app/features/admin/admin.component.ts'), 'utf8',
);

// ----- Helpers for the "no leftover identifier" sweep over src/ -----

const TEXT_EXTENSIONS = new Set(['.ts', '.html', '.css', '.scss', '.json']);

function listSourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listSourceFiles(full));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(full))) {
      found.push(full);
    }
  }
  return found;
}

// Comment ranges (block + line comments). The line-comment pattern requires a
// character other than ':' before the '//' so URLs such as 'http://...' are
// not mistaken for a comment.
function commentRanges(source) {
  const ranges = [];
  for (const re of [/\/\*[\s\S]*?\*\//g, /(^|[^:])\/\/[^\n]*/gm]) {
    let m;
    while ((m = re.exec(source)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function isInside(ranges, index) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

// Every lowercase `paralelo` occurrence must sit inside a comment; otherwise
// it is a leftover identifier (property access, object key, binding, ...).
function leftoverIdentifierOccurrences(source) {
  const ranges = commentRanges(source);
  const leftovers = [];
  const re = /\bparalelo\b/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    if (!isInside(ranges, m.index)) leftovers.push(m.index);
  }
  return leftovers;
}

// ============================================================================
// The Course model exposes the renamed field
// ============================================================================

test('the Course model exposes the section field and no longer the old one', () => {
  const courseInterface = modelsSource.match(/export interface Course \{[^}]*\}/);
  assert.ok(courseInterface, 'the Course interface must be present in core/models/index.ts');

  assert.match(
    courseInterface[0],
    /\bsection:\s*string \| null;/,
    'Course must declare `section: string | null`',
  );
  assert.equal(
    /\bparalelo\b/.test(courseInterface[0]),
    false,
    'Course must not declare the old `paralelo` field anymore',
  );
});

// ============================================================================
// The admin course dialog binds, initializes and sends `section`
// ============================================================================

test('the course dialog binds its input to section and keeps the Spanish label', () => {
  assert.match(
    courseDialogSource,
    /<input matInput \[\(ngModel\)\]="section" placeholder="Ej: A">/,
    'the parallel input must bind to the section field',
  );
  assert.match(
    courseDialogSource,
    /<mat-label>Paralelo<\/mat-label>/,
    'the visible label stays in Spanish',
  );
  assert.equal(
    /<input matInput \[\(ngModel\)\]="paralelo"/.test(courseDialogSource),
    false,
    'the input must not bind to the old field anymore',
  );
});

test('the course dialog initializes the section field from the edited course', () => {
  assert.match(
    courseDialogSource,
    /section = this\.data\.course\?\.section \?\? '';/,
    'the dialog must seed the field from course.section',
  );
  assert.equal(
    /course\?\.paralelo/.test(courseDialogSource),
    false,
    'the dialog must not read the old field anymore',
  );
});

test('the course dialog sends section in the create/update payload', () => {
  const payload = courseDialogSource.match(/const payload = \{([^}]*)\};/);
  assert.ok(payload, 'the dialog must build a course payload');

  assert.match(
    payload[1],
    /section:\s*this\.section/,
    'the payload must carry the section field',
  );
  assert.equal(
    /\bparalelo\b/.test(payload[1]),
    false,
    'the payload must not carry the old field anymore',
  );
});

// ============================================================================
// The admin course table reads the renamed field in both layouts
// ============================================================================

test('the admin course table shows the section value in the desktop cell', () => {
  assert.match(
    adminSource,
    /<td>\{\{c\.section \|\| '—'\}\}<\/td>/,
    'the desktop table cell must read c.section',
  );
  assert.match(
    adminSource,
    /<th>Paralelo<\/th>/,
    'the table header stays in Spanish',
  );
});

test('the admin course table shows the section value in the mobile row', () => {
  assert.match(
    adminSource,
    /\{\{c\.section \? 'Paralelo ' \+ c\.section : ''\}\}/,
    'the mobile row subtitle must read c.section and keep the Spanish prefix',
  );
  assert.equal(
    /\bc\.paralelo\b/.test(adminSource),
    false,
    'the admin course table must not read the old field anymore',
  );
});

// ============================================================================
// No leftover identifier anywhere in src/
// ============================================================================

test('no lowercase paralelo identifier is left in src/', () => {
  const offenders = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const index of leftoverIdentifierOccurrences(source)) {
      const line = source.slice(0, index).split('\n').length;
      offenders.push(`${file.slice(FE_ROOT.length + 1)}:${line}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'every lowercase `paralelo` in src/ must live inside a comment, not as an identifier',
  );
});
