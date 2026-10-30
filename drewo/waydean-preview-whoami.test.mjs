import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as whoami from './waydean-preview-whoami.mjs';

const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('./waydean-preview-sw.js', import.meta.url), 'utf8');

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

test('persists the chosen person and keeps it if the loaded tree temporarily omits that id', () => {
  const storage = memoryStorage();
  const validIds = new Set(['person-a', 'person-b']);

  assert.equal(whoami.saveWhoAmIPerson(storage, 'hoti', 'person-b'), true);
  assert.equal(whoami.readWhoAmIPerson(storage, 'hoti', validIds), 'person-b');
  assert.equal(whoami.readWhoAmIPerson(storage, 'demo', validIds), null);
  storage.setItem(whoami.whoAmIPersonStorageKey('hoti'), 'deleted-person');
  assert.equal(whoami.readWhoAmIPerson(storage, 'hoti', validIds), null);
  assert.equal(storage.getItem(whoami.whoAmIPersonStorageKey('hoti')), 'deleted-person');
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

test('clears the saved identity only after the user explicitly resets it', () => {
  assert.equal([...appSource.matchAll(/clearWhoAmIPerson\(browserStorage/g)].length, 1);
});

test('PWA shell refreshes the self-selection persistence code', () => {
  assert.match(workerSource, /waydean-preview-shell-v40/);
  assert.match(html, /waydean-preview\.js\?v=lineage-whoami-retention-20261030-1/);
  assert.match(workerSource, /waydean-preview-whoami\.mjs\?v=identity-storage-retain-20261030-1/);
});
