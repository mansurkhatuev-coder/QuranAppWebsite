import test from 'node:test';
import assert from 'node:assert/strict';
import { compactRouteClass, nextLodLevel } from './waydean-preview-lod.mjs';

test('detail switches down to compact by rendered card width', () => {
  assert.equal(nextLodLevel('detail', 58), 'detail');
  assert.equal(nextLodLevel('detail', 57.9), 'compact');
});

test('compact uses hysteresis at both boundaries', () => {
  assert.equal(nextLodLevel('compact', 34), 'compact');
  assert.equal(nextLodLevel('compact', 58), 'compact');
  assert.equal(nextLodLevel('compact', 64), 'compact');
  assert.equal(nextLodLevel('compact', 33.9), 'overview');
  assert.equal(nextLodLevel('compact', 64.1), 'detail');
});

test('overview switches back only after the wider return threshold', () => {
  assert.equal(nextLodLevel('overview', 40), 'overview');
  assert.equal(nextLodLevel('overview', 40.1), 'compact');
  assert.equal(nextLodLevel('overview', 64.1), 'detail');
});

test('large zoom jumps may skip an intermediate visual level', () => {
  assert.equal(nextLodLevel('detail', 28), 'overview');
  assert.equal(nextLodLevel('overview', 100), 'detail');
});

test('only people on the selected or active route retain compact labels', () => {
  const routePeople = new Set(['selected', 'parent']);
  assert.equal(compactRouteClass('selected', routePeople), ' route');
  assert.equal(compactRouteClass('parent', routePeople), ' route');
  assert.equal(compactRouteClass('sibling', routePeople), '');
});
