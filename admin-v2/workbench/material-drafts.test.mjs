import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const sourceUrl = new URL('./material-drafts.js', import.meta.url);

async function loadStore() {
  const source = await readFile(sourceUrl, 'utf8');
  const values = new Map();
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const window = { localStorage: storage };
  vm.runInNewContext(source, { window, globalThis: window, structuredClone });
  return { api: window.AdminV2MaterialDrafts, storage };
}

const toPlainJson = (value) => JSON.parse(JSON.stringify(value));

test('material draft overlays round-trip every source field, nested source data, ID, and relationships', async () => {
  const { api, storage } = await loadStore();
  assert.ok(api, 'workbench local draft adapter should be available');

  const store = api.createStore(storage, 'draft-test');
  const source = {
    id: 'evening-5',
    title: 'Original title',
    text: 'بِسْمِ اللَّهِ',
    translation: 'Перевод',
    translationChechen: 'Чеченский',
    extraTranslations: [{ label: 'English', text: 'Text' }],
    targetCount: 3,
    source: { book: 'Сборник', url: 'https://example.test/source', unknownSourceField: 14 },
    relation: { tajweedDocIds: ['azkar-evening-5'] },
    unknownField: { keep: true },
  };
  const edited = structuredClone(source);
  edited.title = 'Изменённое название';
  edited.targetCount = 7;
  edited.source.book = 'Другой сборник';
  store.save('azkar', edited);

  const reloaded = api.createStore(storage, 'draft-test');
  assert.deepEqual(toPlainJson(reloaded.materialize('azkar', [source])), [edited]);
  assert.deepEqual(JSON.parse(reloaded.exportBackup()).records.azkar[0].record, edited);
});

test('draft IDs are scoped by collection and local deletes do not alter other records', async () => {
  const { api, storage } = await loadStore();
  assert.ok(api, 'workbench local draft adapter should be available');

  const store = api.createStore(storage, 'draft-test');
  store.delete('azkar', 'same-id');
  store.save('dua', { id: 'same-id', text: 'dua remains' });

  assert.deepEqual(toPlainJson(store.materialize('azkar', [{ id: 'same-id', text: 'azkar removed' }])), []);
  assert.deepEqual(toPlainJson(store.materialize('dua', [])), [{ id: 'same-id', text: 'dua remains' }]);
});

test('field updates preserve nested metadata and build secondary translation rows safely', async () => {
  const { api, storage } = await loadStore();
  assert.ok(api, 'workbench local draft adapter should be available');
  const store = api.createStore(storage, 'draft-test');
  const record = {
    id: 'dua-1',
    source: { book: 'Book', url: 'https://example.test', unknown: 'preserved' },
    tags: ['one', 'two'],
    extraTranslations: [],
  };

  store.updateField('dua', record, 'source.number', '12', 'number');
  store.updateField('dua', record, 'extraTranslations.0.label', 'Chechen', 'text');
  store.updateField('dua', record, 'extraTranslations.0.text', 'Текст', 'text');
  store.updateField('dua', record, 'tags', 'one, three', 'text');
  store.save('dua', record);

  const [saved] = toPlainJson(store.materialize('dua', [record]));
  assert.deepEqual(saved.source, { book: 'Book', url: 'https://example.test', unknown: 'preserved', number: 12 });
  assert.deepEqual(saved.extraTranslations, [{ label: 'Chechen', text: 'Текст' }]);
  assert.deepEqual(saved.tags, ['one', 'three']);
});

test('import rejects an unsupported or malformed backup without changing the current draft', async () => {
  const { api, storage } = await loadStore();
  assert.ok(api, 'workbench local draft adapter should be available');

  const store = api.createStore(storage, 'draft-test');
  store.save('dua', { id: 'safe', text: 'kept' });
  const before = store.exportBackup();

  assert.throws(() => store.importBackup({ schemaVersion: 99, records: {} }), /формат|верс/i);
  assert.equal(store.exportBackup(), before);
});

test('successful backup import keeps the current draft as a recovery copy', async () => {
  const { api, storage } = await loadStore();
  assert.ok(api, 'workbench local draft adapter should be available');
  const sourceStore = api.createStore(storage, 'source');
  sourceStore.save('dua', { id: 'imported', text: 'imported' });
  const backup = sourceStore.exportBackup();
  const targetStore = api.createStore(storage, 'target');
  targetStore.save('dua', { id: 'before-import', text: 'must recover' });

  targetStore.importBackup(backup);

  const recovery = JSON.parse(storage.getItem('target:backup'));
  assert.equal(recovery.records.dua[0].record.id, 'before-import');
  assert.deepEqual(toPlainJson(targetStore.materialize('dua', [])), [{ id: 'imported', text: 'imported' }]);
});

test('imported unknown fields cannot mutate the prototype of source records', async () => {
  const { api, storage } = await loadStore();
  assert.ok(api, 'workbench local draft adapter should be available');
  const store = api.createStore(storage, 'draft-test');
  const malicious = JSON.parse('{"id":"hostile","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  store.save('materials', malicious);
  const raw = store.materialize('materials', [{ id: 'hostile', title: 'Source record' }])[0];
  const [merged] = toPlainJson([raw]);

  assert.equal(merged.title, 'Source record');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(raw), null);
});
