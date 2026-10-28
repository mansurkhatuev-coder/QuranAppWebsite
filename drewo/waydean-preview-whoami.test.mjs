import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as whoami from './waydean-preview-whoami.mjs';

const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

test('keeps the saved identity key separate for the demo and family tree', () => {
  assert.equal(whoami.whoAmIPersonStorageKey('hoti'), 'waydean-preview:my-person:v1:hoti');
  assert.equal(whoami.whoAmIPersonStorageKey('demo'), 'waydean-preview:my-person:v1:demo');
});

test('persists the chosen person and rejects a saved id missing from the loaded tree', () => {
  const storage = memoryStorage();
  const validIds = new Set(['person-a', 'person-b']);

  assert.equal(whoami.saveWhoAmIPerson(storage, 'hoti', 'person-b'), true);
  assert.equal(whoami.readWhoAmIPerson(storage, 'hoti', validIds), 'person-b');
  assert.equal(whoami.readWhoAmIPerson(storage, 'demo', validIds), null);
  storage.setItem(whoami.whoAmIPersonStorageKey('hoti'), 'deleted-person');
  assert.equal(whoami.readWhoAmIPerson(storage, 'hoti', validIds), null);
  assert.equal(storage.getItem(whoami.whoAmIPersonStorageKey('hoti')), null);
});

test('clears the saved identity without breaking when browser storage is unavailable', () => {
  const storage = memoryStorage();
  whoami.saveWhoAmIPerson(storage, 'hoti', 'person-a');
  assert.equal(whoami.clearWhoAmIPerson(storage, 'hoti'), true);
  assert.equal(whoami.readWhoAmIPerson(storage, 'hoti', new Set(['person-a'])), null);

  const blockedStorage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.equal(whoami.readWhoAmIPerson(blockedStorage, 'hoti', new Set(['person-a'])), null);
  assert.equal(whoami.saveWhoAmIPerson(blockedStorage, 'hoti', 'person-a'), false);
  assert.equal(whoami.clearWhoAmIPerson(blockedStorage, 'hoti'), false);
});

test('does not show a Who are you dialog automatically when the tree opens or a tab returns', () => {
  assert.doesNotMatch(html, /id="whoAmIPrompt"/);
  assert.doesNotMatch(appSource, /maybePromptWhoAmI/);
  assert.match(html, /id="whoAmI"/);
  assert.match(appSource, /\$\('#whoAmI'\)\.addEventListener\('click'/);
});
