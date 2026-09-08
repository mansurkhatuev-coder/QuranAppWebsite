import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSendPushForTree, type DrewoTreeRow } from './push-notify.ts';

test('shouldSendPushForTree: enabled + premium', () => {
  const row: DrewoTreeRow = {
    tree_id: 'hoti-neq',
    name: 'Хьоти некъ',
    premium: true,
    notifications_enabled: true,
  };
  assert.equal(shouldSendPushForTree(row, { requirePremium: false }), true);
});

test('shouldSendPushForTree: notifications_enabled false', () => {
  const row: DrewoTreeRow = {
    tree_id: 'x',
    name: 'X',
    premium: true,
    notifications_enabled: false,
  };
  assert.equal(shouldSendPushForTree(row, { requirePremium: false }), false);
});

test('shouldSendPushForTree: requirePremium blocks free', () => {
  const row: DrewoTreeRow = {
    tree_id: 'free',
    name: 'Free',
    premium: false,
    notifications_enabled: true,
  };
  assert.equal(shouldSendPushForTree(row, { requirePremium: true }), false);
  assert.equal(shouldSendPushForTree(row, { requirePremium: false }), true);
});

test('shouldSendPushForTree: missing row → false', () => {
  assert.equal(shouldSendPushForTree(null, { requirePremium: false }), false);
});
