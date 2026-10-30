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

test('embedded draft merge updates one document and preserves every other cloud document', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const merge = window.AdminV2PreviewSelection.mergeDraftDocument;
  assert.equal(typeof merge, 'function', 'embedded save needs a document-scoped merge helper');

  const remote = {
    version: 2,
    activeId: 'doc-old',
    libraryMetadata: { source: 'cloud' },
    docs: [
      { id: 'doc-a', transliteration: 'old text', serverMetadata: { edition: 3 } },
      { id: 'doc-b', transliteration: 'must remain untouched', marks: [{ start: 0, end: 4 }] },
    ],
  };
  const edited = { id: 'doc-a', transliteration: 'edited text', marks: [{ start: 0, end: 6 }] };
  const result = merge(remote, edited);

  assert.equal(result.activeId, 'doc-a');
  assert.deepEqual(JSON.parse(JSON.stringify(result.libraryMetadata)), { source: 'cloud' });
  assert.equal(result.docs.length, 2);
  assert.equal(result.docs[0].transliteration, 'edited text');
  assert.deepEqual(JSON.parse(JSON.stringify(result.docs[0].serverMetadata)), { edition: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(result.docs[1])), remote.docs[1]);
});

test('embedded draft merge appends a new document without replacing existing cloud drafts', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const remote = { version: 4, activeId: 'doc-a', docs: [{ id: 'doc-a', transliteration: 'keep' }] };
  const result = window.AdminV2PreviewSelection.mergeDraftDocument(remote, { id: 'doc-new', transliteration: 'new' });
  assert.deepEqual(JSON.parse(JSON.stringify(result.docs)), [
    { id: 'doc-a', transliteration: 'keep' },
    { id: 'doc-new', transliteration: 'new' },
  ]);
  assert.equal(result.version, 4);
  assert.equal(result.activeId, 'doc-new');
});

test('embedded cloud save reads the latest draft before writing its single edited document', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const calls = [];
  const cloud = {
    async loadDraftLibrary() {
      calls.push('load');
      return { library: { version: 2, docs: [{ id: 'doc-a' }, { id: 'doc-b', transliteration: 'keep' }] } };
    },
    async saveDraftLibrary(library) {
      calls.push({ save: library });
      return { updatedBy: 'test' };
    },
  };
  const result = await window.AdminV2PreviewSelection.saveEmbeddedDraftDocument(cloud, {
    id: 'doc-a', transliteration: 'edited', marks: [],
  });

  assert.equal(calls[0], 'load');
  assert.deepEqual(calls[1].save.docs.map((doc) => doc.id), ['doc-a', 'doc-b']);
  assert.equal(calls[1].save.docs[0].transliteration, 'edited');
  assert.equal(calls[1].save.docs[1].transliteration, 'keep');
  assert.equal(result.updatedBy, 'test');
});

test('embedded cloud save does not write if the latest draft cannot be read', async () => {
  const source = await readFile(new URL('./preview-selection.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  let writes = 0;
  const cloud = {
    async loadDraftLibrary() { throw new Error('read failed'); },
    async saveDraftLibrary() { writes += 1; },
  };
  await assert.rejects(
    window.AdminV2PreviewSelection.saveEmbeddedDraftDocument(cloud, { id: 'doc-a', transliteration: 'edited' }),
    /read failed/,
  );
  assert.equal(writes, 0);
});
