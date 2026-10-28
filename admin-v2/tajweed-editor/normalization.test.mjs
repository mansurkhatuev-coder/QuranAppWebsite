import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('normalization keeps unrecognized document and mark metadata while clamping ranges', async () => {
  const source = await readFile(new URL('./normalization.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const normalizer = window.AdminV2TajweedNormalization;
  const doc = normalizer.normalizeDoc({
    id: 'doc-1',
    text: 'abc',
    transliteration: 'abc',
    publisherMetadata: { edition: 4 },
    marks: [{ start: 1, end: 99, rules: ['ghunna', 'unknown-rule'], accent: true, tajweedSource: 'manual' }],
  }, { version: 2, ruleMap: ['ghunna'] });

  assert.deepEqual(JSON.parse(JSON.stringify(doc.publisherMetadata)), { edition: 4 });
  assert.equal(doc.transliteration, 'abc');
  assert.equal(doc.marks[0].end, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(doc.marks[0].tajweedSource)), 'manual');
  assert.deepEqual(JSON.parse(JSON.stringify(doc.marks[0].rules)), ['ghunna']);
});

test('an explicitly cleared transliteration stays empty while legacy text is still migrated', async () => {
  const source = await readFile(new URL('./normalization.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const normalize = window.AdminV2TajweedNormalization.normalizeDoc;

  const cleared = normalize({ transliteration: '', text: 'старый текст', marks: [{ start: 0, end: 2 }] });
  assert.equal(cleared.transliteration, '');
  assert.equal(cleared.marks.length, 0);
  assert.equal(normalize({ text: 'старый текст' }).transliteration, 'старый текст');
});

test('the workbench uses the same empty-transliteration rule', async () => {
  const source = await readFile(new URL('../workbench/prototype.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function normalizeTajweedDoc(raw) {');
  const end = source.indexOf('\n  function normalizedMarks(', start);
  assert.ok(start >= 0 && end > start);
  const context = { TAJWEED_SCHEMA_VERSION: 2, clampMark: () => null };
  vm.runInNewContext(source.slice(start, end), context);

  assert.equal(context.normalizeTajweedDoc({ transliteration: '', text: 'старый текст' }).transliteration, '');
  assert.equal(context.normalizeTajweedDoc({ text: 'старый текст' }).transliteration, 'старый текст');
});
