import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWaydeanActivity, parseWaydeanActivity, parseWaydeanBackups } from './waydean-preview-account-history.mjs';

test('parses only activity records and orders newest first', () => {
  const entries = parseWaydeanActivity(JSON.stringify([
    { type: 'add', at: '2026-10-01T10:00:00.000Z', son: 'Новый человек' },
    null,
    { type: 'rename', at: '2026-10-03T10:00:00.000Z', son: 'Имя' }
  ]));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].type, 'rename');
  assert.deepEqual(parseWaydeanActivity('{broken'), []);
});

test('describes production activity types without treating names as markup', () => {
  assert.equal(describeWaydeanActivity({ type: 'year', field: 'born', son: 'Хьасан' }), 'Изменена дата рождения · Хьасан');
  assert.equal(describeWaydeanActivity({ type: 'delete', son: '<img src=x>' }), 'Удалён человек · <img src=x>');
  assert.equal(describeWaydeanActivity({ type: 'unexpected' }), 'Изменение дерева');
});

test('normalizes server backup rows and drops rows without a safe identifier', () => {
  const backups = parseWaydeanBackups([
    { name: 'drewo-backup-1.json', label: 'Снимок', savedAt: '2026-10-01T10:00:00.000Z', personCount: 15, pinned: true },
    { name: 'drewo-2026-09-30_10-20-30.html', label: 'Старый HTML-снимок', savedAt: '2026-09-30T10:20:30.000Z' },
    { path: '../other-tree.json', label: 'Invalid' },
    null
  ]);
  assert.deepEqual(backups, [{
    name: 'drewo-backup-1.json', label: 'Снимок', savedAt: '2026-10-01T10:00:00.000Z', personCount: 15, pinned: true
  }, {
    name: 'drewo-2026-09-30_10-20-30.html', label: 'Старый HTML-снимок', savedAt: '2026-09-30T10:20:30.000Z', personCount: 0, pinned: false
  }]);
});
