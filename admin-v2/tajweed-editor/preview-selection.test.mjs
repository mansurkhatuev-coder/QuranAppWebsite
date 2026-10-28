import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('requested related document is selected only when its stable ID exists', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  assert.ok(window.AdminV2PreviewSelection, 'preview selection helper should be available');
  const docs = [{ id: 'doc-a' }, { id: 'doc-b' }];
  assert.equal(window.AdminV2PreviewSelection.select(docs, 'doc-b', 'doc-a'), 'doc-b');
  assert.equal(window.AdminV2PreviewSelection.select(docs, 'unknown', 'doc-a'), '');
  assert.equal(window.AdminV2PreviewSelection.select(docs, '', 'doc-a'), 'doc-a');
  assert.equal(window.AdminV2PreviewSelection.select(docs, 'unknown', ''), '');
});

test('selected workbench source hydrates a fresh preview and keeps its complete fields', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const doc = {
    id: 'azkar-after-prayer-1',
    title: 'Source title',
    transliteration: 'source text',
    azkarIds: ['after-prayer-1'],
    marks: [{ start: 0, end: 6, rules: ['madd2'], note: 'from pack' }],
    sourceMetadata: { edition: '2026' },
  };
  const result = window.AdminV2PreviewSelection.mergeSourceDocument(
    { version: 2, activeId: '', docs: [{ id: doc.id, title: 'old seed', marks: [] }] },
    doc,
    [],
  );
  assert.equal(result.activeId, doc.id);
  assert.equal(result.docs[0].title, 'Source title');
  assert.equal(result.docs[0].marks.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.docs[0].sourceMetadata)), { edition: '2026' });
});

test('a saved preview draft overrides source text but retains source metadata and stable ID', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const doc = { id: 'azkar-a', title: 'Source', transliteration: 'from source', marks: [], edition: 'source-edition' };
  const local = { id: 'azkar-a', title: 'Local', transliteration: 'my draft', marks: [{ start: 0, end: 1, rules: ['ghunna'] }], privateNote: 'keep me' };
  const result = window.AdminV2PreviewSelection.mergeSourceDocument(
    { version: 2, activeId: 'azkar-a', docs: [local] },
    doc,
    ['azkar-a'],
  );
  assert.equal(result.docs[0].transliteration, 'my draft');
  assert.equal(result.docs[0].edition, 'source-edition');
  assert.equal(result.docs[0].privateNote, 'keep me');
});

test('editing a document selected inside the specialist editor marks only that ID as a local draft', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const ids = window.AdminV2PreviewSelection.addLocalDraftId(['doc-a'], 'doc-b');
  const result = window.AdminV2PreviewSelection.mergeSourceDocument(
    { version: 2, docs: [{ id: 'doc-a', transliteration: 'A local' }, { id: 'doc-b', transliteration: 'B local' }] },
    { id: 'doc-b', transliteration: 'fresh source', sourceMetadata: { revision: 2 } },
    ids,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(ids)), ['doc-a', 'doc-b']);
  assert.equal(result.docs.find((doc) => doc.id === 'doc-b').transliteration, 'B local');
  assert.deepEqual(JSON.parse(JSON.stringify(result.docs.find((doc) => doc.id === 'doc-b').sourceMetadata)), { revision: 2 });
});
