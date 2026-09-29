import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { flattenTree } from './waydean-preview-model.mjs';

const familyTreePath = fileURLToPath(new URL('./family-tree.json', import.meta.url));

test('flattens parent links, generations, dates, photo flags, and child counts', () => {
  const flat = flattenTree({
    id: 'root',
    name: 'Fictional Root',
    born: '1800',
    sons: [{
      id: 'child',
      name: 'Fictional Child',
      died: 1880,
      photo: 'v1',
      sons: [{ id: 'grandchild', name: 'Fictional Grandchild', born: '1900', sons: [] }]
    }]
  });

  assert.deepEqual(flat.map(({ id, parentId, generation, born, died, hasPhoto, childCount }) => ({
    id, parentId, generation, born, died, hasPhoto, childCount
  })), [
    { id: 'root', parentId: null, generation: 1, born: 1800, died: null, hasPhoto: false, childCount: 1 },
    { id: 'child', parentId: 'root', generation: 2, born: null, died: 1880, hasPhoto: true, childCount: 1 },
    { id: 'grandchild', parentId: 'child', generation: 3, born: 1900, died: null, hasPhoto: false, childCount: 0 }
  ]);
});

test('rejects duplicate or missing person IDs', () => {
  assert.throws(() => flattenTree({ id: 'same', name: 'Root', sons: [{ id: 'same', name: 'Duplicate' }] }), /duplicate/i);
  assert.throws(() => flattenTree({ name: 'Missing ID' }), /id/i);
});

test('loads the current local family dataset without exposing records in test output', async () => {
  const root = JSON.parse(await readFile(familyTreePath, 'utf8'));
  const flat = flattenTree(root);
  assert.equal(flat.length, 157);
  assert.equal(Math.max(...flat.map(person => person.generation)), 14);
  assert.equal(flat.filter(person => person.hasPhoto).length, 1);
  assert.equal(new Set(flat.map(person => person.id)).size, 157);
});
