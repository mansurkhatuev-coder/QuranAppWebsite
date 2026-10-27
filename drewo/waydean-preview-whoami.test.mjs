import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearWhoAmIPromptDismissal, dismissWhoAmIPrompt, hasDismissedWhoAmIPrompt,
  shouldPromptWhoAmI, whoAmISkipStorageKey
} from './waydean-preview-whoami.mjs';

test('asks for identity only when there is no saved person, no dismissal, and this is not the demo tree', () => {
  assert.equal(shouldPromptWhoAmI({ hasSelf: false, dismissed: false, isDemo: false }), true);
  assert.equal(shouldPromptWhoAmI({ hasSelf: true, dismissed: false, isDemo: false }), false);
  assert.equal(shouldPromptWhoAmI({ hasSelf: false, dismissed: true, isDemo: false }), false);
  assert.equal(shouldPromptWhoAmI({ hasSelf: false, dismissed: false, isDemo: true }), false);
});

test('keeps the dismissal preference separate for the demo and family tree', () => {
  assert.equal(whoAmISkipStorageKey('hoti'), 'waydean-preview:whoami-skip:v1:hoti');
  assert.equal(whoAmISkipStorageKey('demo'), 'waydean-preview:whoami-skip:v1:demo');
});

test('persists Later for this tree and clears it when a person is selected', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };

  assert.equal(hasDismissedWhoAmIPrompt(storage, 'hoti'), false);
  assert.equal(dismissWhoAmIPrompt(storage, 'hoti'), true);
  assert.equal(hasDismissedWhoAmIPrompt(storage, 'hoti'), true);
  assert.equal(hasDismissedWhoAmIPrompt(storage, 'demo'), false);
  assert.equal(clearWhoAmIPromptDismissal(storage, 'hoti'), true);
  assert.equal(hasDismissedWhoAmIPrompt(storage, 'hoti'), false);
});

test('treats unavailable browser storage as a per-visit preference', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(hasDismissedWhoAmIPrompt(storage, 'hoti'), false);
  assert.equal(dismissWhoAmIPrompt(storage, 'hoti'), false);
  assert.equal(clearWhoAmIPromptDismissal(storage, 'hoti'), false);
});
