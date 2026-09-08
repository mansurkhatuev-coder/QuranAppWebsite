import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectPersonIndex,
  listAddedPeople,
  buildAdditionNotification,
} from './added-people.ts';

const before = {
  id: 'r',
  name: 'Root',
  sons: [{ id: 'a', name: 'Ali', sons: [] }],
};

const afterOne = {
  id: 'r',
  name: 'Root',
  sons: [
    { id: 'a', name: 'Ali', sons: [{ id: 'b', name: 'Bek', sons: [] }] },
  ],
};

test('listAddedPeople returns only new ids with names and father', () => {
  const added = listAddedPeople(before, afterOne);
  assert.deepEqual(added, [{ id: 'b', name: 'Bek', fatherName: 'Ali' }]);
});

test('listAddedPeople empty when only rename', () => {
  const renamed = {
    id: 'r',
    name: 'Root',
    sons: [{ id: 'a', name: 'Aliyan', sons: [] }],
  };
  assert.deepEqual(listAddedPeople(before, renamed), []);
});

test('buildAdditionNotification: single', () => {
  const n = buildAdditionNotification(
    'Хьоти некъ',
    [{ id: 'b', name: 'Bek', fatherName: 'Ali' }],
    './'
  );
  assert.equal(n.title, 'Хьоти некъ');
  assert.equal(n.body, 'Добавлен: Bek (отец: Ali)');
  assert.equal(n.url, './?focus=b');
});

test('buildAdditionNotification: many', () => {
  const people = [
    { id: '1', name: 'A', fatherName: null },
    { id: '2', name: 'B', fatherName: null },
    { id: '3', name: 'C', fatherName: null },
    { id: '4', name: 'D', fatherName: null },
  ];
  const n = buildAdditionNotification('Хьоти некъ', people, './');
  assert.equal(n.title, 'Хьоти некъ');
  assert.equal(n.body, 'Добавлено человек: 4 — A, B, C и ещё 1');
  assert.equal(n.url, './');
});

test('collectPersonIndex walks sons', () => {
  const idx = collectPersonIndex(afterOne);
  assert.equal(idx.get('b')?.name, 'Bek');
  assert.equal(idx.get('b')?.fatherName, 'Ali');
});
