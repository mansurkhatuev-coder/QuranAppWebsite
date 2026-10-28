import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const editorUrl = new URL('./editor.js', import.meta.url);
const selectionUrl = new URL('./preview-selection.js', import.meta.url);

async function createHarness({ failStorageWrite = false } = {}) {
  const editor = await readFile(editorUrl, 'utf8');
  const selection = await readFile(selectionUrl, 'utf8');
  const extract = (start, end) => {
    const from = editor.indexOf(start);
    const to = editor.indexOf(end, from);
    assert.notEqual(from, -1, 'missing source marker: ' + start);
    assert.notEqual(to, -1, 'missing source end marker: ' + end);
    return editor.slice(from, to);
  };
  const functions = [
    extract('  function commitCurrentToLibrary() {', '\n  function renderDocSelect()'),
    extract('  function persistLibraryNow() {', '\n  function flushLibrarySave()'),
    extract('  function flushLibrarySave() {', '\n  function scheduleSave('),
    extract('  function applyPreviewSourceDocument(sourceDocument) {', '\n  window.addEventListener("message"'),
  ].join('\n');
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (failStorageWrite) throw new Error('quota');
      values.set(key, String(value));
    },
  };
  let scheduled = false;
  const windowObject = { AdminV2PreviewSelection: {} };
  vm.runInNewContext(selection, { window: windowObject });
  const context = {
    window: windowObject,
    localStorage: storage,
    STORAGE_KEY: 'tajweed-library',
    STORAGE_BACKUP_KEY: 'tajweed-library-backup',
    PREVIEW_DOC_IDS_KEY: 'tajweed-preview-document-ids',
    LIBRARY_VERSION: 2,
    library: {
      version: 2,
      activeId: 'A',
      docs: [{ id: 'A', title: 'A', arabic: 'до правки', transliteration: 'before', marks: [] }],
    },
    doc: { id: 'A', title: 'A', arabic: 'новая правка', transliteration: 'EDIT', marks: [{ start: 0, end: 4, rule: 'ghunna' }] },
    localPreviewDocumentIds: new Set(['A']),
    workbenchPreview: true,
    els: { saveStatus: { textContent: '', classList: { add() {}, remove() {} } } },
    saveTimer: 17,
    clearTimeout() {},
    nowIso: () => '2026-10-27T00:00:00.000Z',
    normalizeDoc: (value) => ({ ...value, marks: [...(value.marks || [])] }),
    ensureSeeds: (value) => value,
    isRicherLibrary: () => false,
    renderDocSelect() {},
    syncForm() {},
    renderAll() {},
    scheduleSave() { scheduled = true; },
    get scheduled() { return scheduled; },
    selection: null,
    activeMarkIndex: -1,
    history: [],
    future: [],
  };
  vm.createContext(context);
  vm.runInContext(functions, context, { filename: 'editor-functions-under-test.js' });
  return { context, values };
}

test('preview document switch flushes the current Tajweed edit before hydrating the next document', async () => {
  const { context, values } = await createHarness();
  context.applyPreviewSourceDocument({ id: 'B', title: 'B', arabic: 'Arabic B', transliteration: 'text B', marks: [] });
  if (context.scheduled) context.flushLibrarySave();

  const saved = JSON.parse(values.get('tajweed-library'));
  assert.equal(saved.docs.find((item) => item.id === 'A').transliteration, 'EDIT');
  assert.equal(saved.docs.find((item) => item.id === 'A').arabic, 'новая правка');
  assert.deepEqual(JSON.parse(JSON.stringify(saved.docs.find((item) => item.id === 'A').marks)), [{ start: 0, end: 4, rule: 'ghunna' }]);
  assert.equal(context.doc.id, 'B');
});

test('preview document switch stays on the current document when its local save fails', async () => {
  const { context } = await createHarness({ failStorageWrite: true });
  context.applyPreviewSourceDocument({ id: 'B', title: 'B', arabic: 'Arabic B', transliteration: 'text B', marks: [] });

  assert.equal(context.doc.id, 'A');
  assert.equal(context.library.activeId, 'A');
  assert.equal(context.scheduled, false);
});
