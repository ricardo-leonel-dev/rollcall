// Enrollment isEnrolled field.
//
// Plain JS test, runs under `node --test` with no compilation step: the
// Angular project has no test framework wired (docs/conventions.md > Tests).
// It pins that the Enrollment model no longer declares the removed
// `isEnrolled` field and that no `isEnrolled` identifier is left in src/.
//
//   node --test tests/enrollment_is_enrolled_field.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');
const SRC_ROOT = resolve(FE_ROOT, 'src');
const TEXT_EXTENSIONS = new Set(['.ts', '.html', '.css', '.scss', '.json']);

const modelsSource = readFileSync(resolve(FE_ROOT, 'src/app/core/models/index.ts'), 'utf8');

function listSourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listSourceFiles(full));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(full))) found.push(full);
  }
  return found;
}

// Every `isEnrolled` occurrence must sit inside a comment; otherwise it is a
// leftover identifier (property access, object key, binding, ...). The
// line-comment pattern requires a character other than ':' before the '//' so
// URLs such as 'http://...' are not mistaken for a comment.
function leftoverIdentifierOccurrences(source) {
  const ranges = [];
  let m;
  for (const re of [/\/\*[\s\S]*?\*\//g, /(^|[^:])\/\/[^\n]*/gm]) {
    while ((m = re.exec(source)) !== null) ranges.push([m.index, m.index + m[0].length]);
  }
  const leftovers = [];
  const re = /\bisEnrolled\b/g;
  while ((m = re.exec(source)) !== null) {
    if (!ranges.some(([start, end]) => m.index >= start && m.index < end)) leftovers.push(m.index);
  }
  return leftovers;
}

const enrollmentInterface = modelsSource.match(/export interface Enrollment \{[^}]*\}/);

test('the Enrollment model no longer declares isEnrolled and keeps its other fields', () => {
  assert.ok(enrollmentInterface, 'the Enrollment interface must be present in core/models/index.ts');
  assert.equal(/\bisEnrolled\b/.test(enrollmentInterface[0]), false,
    'Enrollment must not declare the removed `isEnrolled` field anymore');
  for (const field of ['enrollmentId', 'academicYearId', 'courseId', 'studentId', 'rosterNumber',
    'fullName', 'age', 'studentPhone', 'guardianId', 'whatsappLink', 'isActive']) {
    assert.match(enrollmentInterface[0], new RegExp(`\\b${field}:`),
      `Enrollment must still declare \`${field}\``);
  }
});

test('no isEnrolled identifier is left in src/', () => {
  const offenders = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const index of leftoverIdentifierOccurrences(source)) {
      const line = source.slice(0, index).split('\n').length;
      offenders.push(`${file.slice(FE_ROOT.length + 1)}:${line}`);
    }
  }
  assert.deepEqual(offenders, [],
    'every `isEnrolled` in src/ must live inside a comment, not as an identifier');
});
