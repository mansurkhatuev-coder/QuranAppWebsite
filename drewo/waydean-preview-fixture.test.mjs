import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { flattenTree } from './waydean-preview-model.mjs';
import { masterFixtureFocus, masterFixtureVisibleRecords } from './waydean-preview-fixture.mjs';

const fixtureUrl = new URL('../docs/design/waydean/fixtures/master-tree.json', import.meta.url);

test('Master fixture uses a small synthetic tree with the approved 3-generation focus', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const records = flattenTree(fixture);
  const selected = records.find(person => person.id === 'demo-magomed');

  assert.equal(records.length, 8);
  assert.equal(Math.max(...records.map(person => person.generation)), 3);
  assert.equal(selected?.generation, 3);
  assert.equal(selected?.name, 'Магомед');
  assert.equal(selected?.born, 1825);
  assert.equal(selected?.died, 1890);
  assert.equal(selected?.parentId, 'demo-isa');
  assert.equal(new Set(records.map(person => person.id)).size, records.length);
  assert.ok(records.every(person => !person.hasPhoto));
});

test('Master fixture chooses the approved focus person for each viewport', () => {
  assert.equal(masterFixtureFocus(390), 'demo-magomed');
  assert.equal(masterFixtureFocus(1440), 'demo-isa');
});

test('mobile Master frame matches the seven-card composition while preserving the full fixture', async () => {
  const records = flattenTree(JSON.parse(await readFile(fixtureUrl, 'utf8')));
  const visible = masterFixtureVisibleRecords(records, { viewportWidth: 390 });

  assert.equal(records.length, 8);
  assert.equal(visible.length, 7);
  assert.ok(!visible.some(person => person.id === 'demo-ali'));
  assert.equal(masterFixtureVisibleRecords(records, { viewportWidth: 1440 }).length, 8);
  assert.equal(masterFixtureVisibleRecords(records, { viewportWidth: 390, requestedState: 'all-tree' }).length, 8);
  assert.equal(masterFixtureVisibleRecords(records, { viewportWidth: 390, requestedPerson: 'demo-ali' }).length, 8);
});
