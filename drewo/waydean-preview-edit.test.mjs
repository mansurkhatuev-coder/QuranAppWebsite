import test from 'node:test';
import assert from 'node:assert/strict';
import { addChild, generateUniquePersonId } from './waydean-preview-edit.mjs';

test('generates a unique ID that the child editor can use when the field is blank', () => {
  const tree = { id: 'root', name: 'Root', sons: [{ id: 'existing', name: 'Existing', sons: [] }] };
  const id = generateUniquePersonId(tree);

  assert.match(id, /^local-/);
  assert.doesNotThrow(() => addChild(tree, 'root', { id, name: 'Test Child' }));
  assert.throws(() => addChild(tree, 'root', { id, name: 'Duplicate Child' }), /unique/i);
});
