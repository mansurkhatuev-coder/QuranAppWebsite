import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('record identity separates sources even when the underlying IDs match', async () => {
  const source = await readFile(new URL('./record-identity.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });

  assert.ok(window.AdminV2RecordIdentity, 'record identity helper should be available');
  const { create, parse } = window.AdminV2RecordIdentity;
  const support = create('dua-support', 'same/id:1');
  const general = create('dua-general', 'same/id:1');

  assert.notEqual(support, general);
  assert.deepEqual(JSON.parse(JSON.stringify(parse(support))), { collection: 'dua-support', id: 'same/id:1' });
  assert.deepEqual(JSON.parse(JSON.stringify(parse(general))), { collection: 'dua-general', id: 'same/id:1' });
});

test('record identity rejects invalid collections and malformed references', async () => {
  const source = await readFile(new URL('./record-identity.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const { create, parse } = window.AdminV2RecordIdentity;

  assert.throws(() => create('', 'id'), /collection|source/i);
  assert.throws(() => create('azkar', ''), /ID/i);
  assert.equal(parse('invalid'), null);
});

test('selection resolves the exact collection when records share an ID', async () => {
  const source = await readFile(new URL('./record-identity.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const { create, find } = window.AdminV2RecordIdentity;
  const records = [
    { id: 'same-id', category: 'support_dua', title: 'Поддержка' },
    { id: 'same-id', category: 'general_dua', title: 'Случаи жизни' },
  ];

  const selected = find(records, create('dua-general', 'same-id'), (record) =>
    record.category === 'support_dua' ? 'dua-support' : 'dua-general');

  assert.equal(selected.title, 'Случаи жизни');
  assert.equal(find(records, create('dua-support', 'same-id'), (record) =>
    record.category === 'support_dua' ? 'dua-support' : 'dua-general'), records[0]);
});

test('source identity survives category edits without becoming record data', async () => {
  const source = await readFile(new URL('./record-identity.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const { collectionOf, tag } = window.AdminV2RecordIdentity;
  const record = { id: 'same-id', category: 'support_dua' };

  tag(record, 'dua-support');
  record.category = 'general_dua';

  assert.equal(collectionOf(record, 'dua'), 'dua-support');
  assert.equal(JSON.stringify(record), '{"id":"same-id","category":"general_dua"}');
});

test('azkar links do not guess between dua sources when a stable ID is ambiguous', async () => {
  const source = await readFile(new URL('./record-identity.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const { buildAzkarLinks, tag } = window.AdminV2RecordIdentity;
  const support = tag({ id: 'shared-id', category: 'support_dua', title: 'Поддержка' }, 'dua-support');
  const general = tag({ id: 'shared-id', category: 'general_dua', title: 'Случаи жизни' }, 'dua-general');
  const document = { id: 'tajweed-1', azkarIds: ['shared-id'] };

  const links = buildAzkarLinks([document], [], [support, general]);

  assert.equal(links.length, 1);
  assert.equal(links[0].id, 'shared-id');
  assert.equal(links[0].collection, 'azkar');
  assert.equal(links[0].duaRecord, null);
  assert.deepEqual(JSON.parse(JSON.stringify(links[0].docs.map((entry) => entry.id))), ['tajweed-1']);
  assert.equal(support.id, 'shared-id');
  assert.equal(general.id, 'shared-id');
});
