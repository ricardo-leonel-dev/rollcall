// The timeline of the history of a student: the events it knows how to draw
// and the way it treats an event type it has never heard of.
//
// Plain JS test, runs under `node --test` with no compilation step, like
// tests/withdrawal_stats_panel.test.mjs. The look-up of the style of an event
// is a pure helper, imported straight from its TypeScript source with Node's
// type stripping; the component delegates to it.
//
//   node --test tests/history_timeline_withdrawal_types.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');

const { TYPE_META, timelineMeta: style } = await import(
  pathToFileURL(resolve(FE_ROOT, 'src/app/shared/utils/timeline-meta.util.ts')).href
);

const KNOWN = ['enrollment', 'absence', 'tardy', 'justification', 'citation', 'withdrawal', 'reinstatement'];

test('the timeline knows exactly the event types of the model', () => {
  assert.deepEqual(Object.keys(TYPE_META).sort(), [...KNOWN].sort());
});

test('every event of the timeline is drawn with its own icon', () => {
  const icons = KNOWN.map(type => style(type).icon);

  assert.equal(new Set(icons).size, KNOWN.length, 'no two events share their icon');
});

test('a withdrawal is drawn with its own icon and color', () => {
  const meta = style('withdrawal');

  assert.equal(meta.icon, 'logout');
  assert.equal(meta.classes, 'bg-pink-50 text-pink-600 border-pink-200');
});

test('a reinstatement is drawn with its own icon and a color apart from the justification', () => {
  const meta = style('reinstatement');

  assert.equal(meta.icon, 'how_to_reg');
  assert.equal(meta.classes, 'bg-teal-50 text-teal-700 border-teal-200');
  assert.notEqual(meta.classes, style('justification').classes);
});

test('an event type the build has never heard of is drawn in a neutral way', () => {
  const meta = style('promotion');

  assert.ok(meta, 'the timeline has a style for a type it does not know');
  assert.equal(meta.icon, 'timeline');
  assert.equal(meta.classes, 'bg-gray-50 text-gray-600 border-gray-200');
});
