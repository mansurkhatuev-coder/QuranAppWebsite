import test from 'node:test';
import assert from 'node:assert/strict';
import { addChild, generateUniquePersonId, updatePerson } from './waydean-preview-edit.mjs';

test('generates a unique ID that the child editor can use when the field is blank', () => {
  const tree = { id: 'root', name: 'Root', sons: [{ id: 'existing', name: 'Existing', sons: [] }] };
  const id = generateUniquePersonId(tree);

  assert.match(id, /^local-/);
  assert.doesNotThrow(() => addChild(tree, 'root', { id, name: 'Test Child' }));
  assert.throws(() => addChild(tree, 'root', { id, name: 'Duplicate Child' }), /unique/i);
});

test('stores the selected gender when adding a child and can correct an existing person', () => {
  const tree = { id: 'root', name: 'Род', sons: [] };
  const daughter = addChild(tree, 'root', { id: 'daughter', name: 'Дочь', gender: 'female' });
  const son = addChild(tree, 'root', { id: 'son', name: 'Сын' });

  assert.equal(daughter.gender, 'female');
  assert.equal(son.gender, 'male');
  updatePerson(tree, 'son', { gender: 'female' });
  assert.equal(son.gender, 'female');
  assert.throws(() => updatePerson(tree, 'son', { gender: 'unknown' }), /пол/i);
});
