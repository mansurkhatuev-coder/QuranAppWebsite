import test from 'node:test';
import assert from 'node:assert/strict';
import { compactRouteClass, nextLodLevel } from './waydean-preview-lod.mjs';

test('detail switches down to compact by rendered card width', () => {
  assert.equal(nextLodLevel('detail', 82), 'detail');
  assert.equal(nextLodLevel('detail', 81.9), 'compact');
});

test('compact uses hysteresis at both boundaries', () => {
  assert.equal(nextLodLevel('compact', 56), 'compact');
  assert.equal(nextLodLevel('compact', 82), 'compact');
  assert.equal(nextLodLevel('compact', 88), 'compact');
  assert.equal(nextLodLevel('compact', 55.9), 'overview');
  assert.equal(nextLodLevel('compact', 88.1), 'detail');
});

test('overview switches back only after the wider return threshold', () => {
  assert.equal(nextLodLevel('overview', 62), 'overview');
  assert.equal(nextLodLevel('overview', 62.1), 'compact');
  assert.equal(nextLodLevel('overview', 88.1), 'detail');
});

test('large zoom jumps may skip an intermediate visual level', () => {
  assert.equal(nextLodLevel('detail', 40), 'overview');
  assert.equal(nextLodLevel('overview', 100), 'detail');
});

test('only people on the selected or active route retain compact labels', () => {
  const routePeople = new Set(['selected', 'parent']);
  assert.equal(compactRouteClass('selected', routePeople), ' route');
  assert.equal(compactRouteClass('parent', routePeople), ' route');
  assert.equal(compactRouteClass('sibling', routePeople), '');
});
