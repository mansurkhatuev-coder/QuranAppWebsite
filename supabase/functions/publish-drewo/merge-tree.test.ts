import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeActivityLogs,
  mergeConcurrentEdits,
  mergeThreeWay,
  mergeTreesForPublish,
  type TreeNode,
} from './merge-tree.ts';

function person(
  id: string,
  name: string,
  extra: Partial<TreeNode> = {},
  sons: TreeNode[] = []
): TreeNode {
  return { id, name, ...extra, sons };
}

test('three-way keeps year from A and bio from B', () => {
  const base = person('root', 'Род', {}, [person('a', 'Иван', { born: 1900 })]);
  const server = person('root', 'Род', {}, [person('a', 'Иван', { born: 1910 })]);
  const local = person('root', 'Род', {}, [
    person('a', 'Иван', { born: 1900, bio: 'охотник' }),
  ]);
  const { tree, stats } = mergeThreeWay(server, local, base);
  const ivan = tree.sons![0];
  assert.equal(ivan.born, 1910);
  assert.equal(ivan.bio, 'охотник');
  assert.equal(stats.filled.length, 1);
  assert.equal(stats.overridden.length, 0);
});

test('three-way: same field, incoming local wins', () => {
  const base = person('root', 'Род', {}, [person('a', 'Иван', { born: 1900 })]);
  const server = person('root', 'Род', {}, [person('a', 'Иван', { born: 1910 })]);
  const local = person('root', 'Род', {}, [person('a', 'Иван', { born: 1920 })]);
  const { tree } = mergeThreeWay(server, local, base);
  assert.equal(tree.sons![0].born, 1920);
});

test('three-way: rename on server survives unrelated local edit', () => {
  const base = person('root', 'Род', {}, [person('a', 'Иван')]);
  const server = person('root', 'Род', {}, [person('a', 'Иван-А')]);
  const local = person('root', 'Род', {}, [person('a', 'Иван', { died: 1980 })]);
  const { tree } = mergeThreeWay(server, local, base);
  assert.equal(tree.sons![0].name, 'Иван-А');
  assert.equal(tree.sons![0].died, 1980);
});

test('three-way: both added sons under same parent', () => {
  const base = person('root', 'Род', {}, [person('p', 'Отец')]);
  const server = person('root', 'Род', {}, [
    person('p', 'Отец', {}, [person('x', 'Сын-А')]),
  ]);
  const local = person('root', 'Род', {}, [
    person('p', 'Отец', {}, [person('y', 'Сын-Б')]),
  ]);
  const { tree, stats } = mergeThreeWay(server, local, base);
  const names = (tree.sons![0].sons || []).map((s) => s.name).sort();
  assert.deepEqual(names, ['Сын-А', 'Сын-Б']);
  assert.equal(stats.addedSons.length, 1);
  assert.equal(stats.addedSons[0].id, 'y');
});

test('three-way does not restore a server delete', () => {
  const base = person('root', 'Род', {}, [person('gone', 'Был')]);
  const server = person('root', 'Род', {}, []);
  const local = person('root', 'Род', {}, [person('gone', 'Был')]);
  const { tree, stats } = mergeThreeWay(server, local, base);
  assert.equal((tree.sons || []).length, 0);
  assert.equal(stats.addedSons.length, 0);
});

test('three-way does not apply a local delete', () => {
  const base = person('root', 'Род', {}, [person('keep', 'Жив')]);
  const server = person('root', 'Род', {}, [person('keep', 'Жив')]);
  const local = person('root', 'Род', {}, []);
  const { tree } = mergeThreeWay(server, local, base);
  assert.equal(tree.sons![0].id, 'keep');
});

test('three-way does not reparent an existing person', () => {
  const base = person('root', 'Род', {}, [
    person('a', 'А', {}, [person('x', 'Сын')]),
    person('b', 'Б'),
  ]);
  const server = clone(base);
  const local = person('root', 'Род', {}, [
    person('a', 'А'),
    person('b', 'Б', {}, [person('x', 'Сын')]),
  ]);
  const { tree } = mergeThreeWay(server, local, base);
  const a = tree.sons!.find((n) => n.id === 'a')!;
  const b = tree.sons!.find((n) => n.id === 'b')!;
  assert.equal(a.sons![0].id, 'x');
  assert.equal((b.sons || []).length, 0);
});

test('three-way photo: local version wins; missing local photo does not delete', () => {
  const base = person('root', 'Род', {}, [person('a', 'Иван')]);
  const server = person('root', 'Род', {}, [person('a', 'Иван', { photo: '111' })]);
  const localNew = person('root', 'Род', {}, [person('a', 'Иван', { photo: '222' })]);
  const localOld = person('root', 'Род', {}, [person('a', 'Иван')]);
  assert.equal(mergeThreeWay(server, localNew, base).tree.sons![0].photo, '222');
  assert.equal(mergeThreeWay(server, localOld, base).tree.sons![0].photo, '111');
});

test('two-way does not overwrite an existing name', () => {
  const server = person('root', 'Род', {}, [person('a', 'Иван-А')]);
  const local = person('root', 'Род', {}, [person('a', 'Иван', { bio: 'текст' })]);
  const { tree } = mergeConcurrentEdits(server, local);
  assert.equal(tree.sons![0].name, 'Иван-А');
  assert.equal(tree.sons![0].bio, 'текст');
});

test('activity logs are unioned by type/time/person', () => {
  const server = JSON.stringify([
    { type: 'add', at: '2026-01-01T10:00:00.000Z', son: 'А', sonId: 'x' },
  ]);
  const local = JSON.stringify([
    { type: 'add', at: '2026-01-01T10:00:00.000Z', son: 'А', sonId: 'x' },
    { type: 'year', at: '2026-01-01T11:00:00.000Z', son: 'Б', sonId: 'y', field: 'born' },
  ]);
  const merged = JSON.parse(mergeActivityLogs(server, local));
  assert.equal(merged.length, 2);
  assert.equal(merged[1].field, 'born');
});

test('mergeTreesForPublish pretty-prints and uses three-way when base exists', () => {
  const base = person('root', 'Род', {}, [person('a', 'Иван')]);
  const server = person('root', 'Род', {}, [person('a', 'Иван', { born: 1910 })]);
  const local = person('root', 'Род', {}, [person('a', 'Иван', { bio: 'охотник' })]);
  const result = mergeTreesForPublish(
    JSON.stringify(server),
    JSON.stringify(local),
    JSON.stringify(base)
  );
  assert.equal(result.usedThreeWay, true);
  const parsed = JSON.parse(result.treeJson);
  assert.equal(parsed.sons[0].born, 1910);
  assert.equal(parsed.sons[0].bio, 'охотник');
  assert.match(result.treeJson, /\n  "id": "root"/);
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
