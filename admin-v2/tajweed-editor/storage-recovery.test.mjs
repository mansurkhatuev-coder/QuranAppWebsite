import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function bootWith(stored, backup) {
  const source = await readFile(new URL('./editor.js', import.meta.url), 'utf8');
  const extract = (start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `missing ${start}`);
    return source.slice(from, to);
  };
  const code = [
    extract('  function libraryStats(lib) {', '\n  function readBackupLibrary()'),
    extract('  function boot() {', '\n  boot();'),
    'boot();',
  ].join('\n');
  const context = {
    window: { location: { search: '' } }, URLSearchParams,
    els: { saveStatus: { textContent: '', classList: { add() {} } } },
    library: null, doc: null, workbenchPreview: false,
    loadStored: () => stored, readBackupLibrary: () => backup,
    ensureSeeds() {}, normalizeDoc: (value) => value, emptyDoc: () => ({}),
    renderRulesUi() {}, bindCanvasPointer() {}, bindChrome() {},
    loadLocalPreviewDocumentIds() {}, syncForm() {}, renderDocSelect() {},
    renderAll() {}, scheduleSave() {},
  };
  vm.runInNewContext(code, context);
  return context;
}

test('a saved shorter text and intentionally removed marks survive the next opening', async () => {
  const saved = { activeId: 'A', docs: [{ id: 'A', transliteration: 'короче', marks: [] }] };
  const backup = { activeId: 'A', docs: [{ id: 'A', transliteration: 'старый длинный текст', marks: [{ start: 0, end: 1 }] }] };
  const result = await bootWith(saved, backup);
  assert.equal(result.doc.transliteration, 'короче');
  assert.equal(result.doc.marks.length, 0);
});

test('a readable backup is used when the saved library cannot be read', async () => {
  const backup = { activeId: 'A', docs: [{ id: 'A', transliteration: 'резерв', marks: [] }] };
  const result = await bootWith(null, backup);
  assert.equal(result.doc.transliteration, 'резерв');
  assert.match(result.els.saveStatus.textContent, /Восстановлен бэкап/);
});

test('malformed saved values are treated as unreadable instead of as a legacy document', async () => {
  const source = await readFile(new URL('./editor.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function loadStored() {');
  const end = source.indexOf('\n  function syncForm()', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    STORAGE_KEY: 'test', LIBRARY_VERSION: 2,
    localStorage: { getItem: () => '{}' },
    normalizeDoc: (value) => value || {}, seedDoc: (value) => value,
    emptyLibrary: () => ({ activeId: 'seed', docs: [{ id: 'seed' }] }),
    ensureSeeds: (value) => value,
  };
  vm.runInNewContext(source.slice(start, end), context);
  assert.equal(context.loadStored(), null);
  context.localStorage.getItem = () => 'null';
  assert.equal(context.loadStored(), null);
  context.localStorage.getItem = () => JSON.stringify({ id: 'legacy', text: 'старый формат' });
  assert.equal(context.loadStored().activeId, 'legacy');
});
