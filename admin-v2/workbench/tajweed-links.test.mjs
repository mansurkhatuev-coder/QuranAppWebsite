import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadHelper() {
  const source = await readFile(new URL('./tajweed-links.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AdminV2TajweedLinks;
}

test('does not select an unrelated Tajweed document for an unlinked record', async () => {
  const links = await loadHelper();
  const docs = [{ id: 'other', azkarIds: ['another-record'] }];
  assert.equal(links.findRelated('azkar', { id: 'target-record' }, docs, 'azkar:target-record'), null);
});

test('creates an empty linked document for an unlinked record instead of opening the first library document', async () => {
  const links = await loadHelper();
  const created = links.createDraft({
    kind: 'materials',
    item: { id: 'local-text-7', title: 'Исторический текст', arabic: 'عَرَبِيّ', transliteration: 'translit' },
    reference: 'materials:local-text-7',
    documents: [{ id: 'other', azkarIds: ['another-record'] }],
  });
  assert.equal(created.sourceRecordId, 'materials:local-text-7');
  assert.equal(created.sourceMaterialId, 'local-text-7');
  assert.equal(created.title, 'Исторический текст');
  assert.equal(created.arabic, 'عَرَبِيّ');
  assert.equal(created.transliteration, 'translit');
  assert.deepEqual(JSON.parse(JSON.stringify(created.marks)), []);
});

test('local Tajweed drafts override the same source ID and preserve separate source documents', async () => {
  const links = await loadHelper();
  const result = links.mergeDocuments(
    [{ id: 'a', title: 'source', marks: [{ start: 0, end: 1 }] }, { id: 'b', title: 'second' }],
    [{ id: 'a', title: 'local', marks: [], privateMetadata: { keep: true } }],
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'local');
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].privateMetadata)), { keep: true });
  assert.equal(result[1].title, 'second');
});
