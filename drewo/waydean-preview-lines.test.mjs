import test from 'node:test';
import assert from 'node:assert/strict';
import { connectorPaths } from './waydean-preview-lines.mjs';

const point = (centerX, centerY) => ({ centerX, centerY });

test('one child connects at the card edges for both card heights', () => {
  for (const height of [140, 105]) {
    const positions = new Map([['p', point(100, 100)], ['c', point(100, 290)]]);
    const children = new Map([['p', [{ id: 'c' }]]]);
    const [line] = connectorPaths(positions, children, null, height);
    assert.deepEqual(line, {
      d: `M100 ${100 + height / 2} V${290 - height / 2}`,
      className: 'tree-line'
    });
  }
});

test('siblings share one stem and one bus with separate drops', () => {
  const positions = new Map([
    ['p', point(100, 100)],
    ['a', point(0, 290)],
    ['b', point(100, 290)],
    ['c', point(200, 290)]
  ]);
  const children = new Map([['p', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]]]);
  const lines = connectorPaths(positions, children, null, 140);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].d, 'M100 170 V195 M0 195 H200 M0 195 V220 M100 195 V220 M200 195 V220');
});

test('a mixed path highlights only the active child', () => {
  const positions = new Map([
    ['p', point(100, 100)], ['a', point(0, 290)], ['b', point(200, 290)]
  ]);
  const children = new Map([['p', [{ id: 'a' }, { id: 'b' }]]]);
  const lines = connectorPaths(positions, children, new Set(['p', 'a']), 140);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].className, 'tree-line dimmed');
  assert.equal(lines[1].className, 'tree-line active');
  assert.equal(lines[1].d, 'M100 170 V195 H0 V220');
});

test('filtered children without visible parents make no dangling lines', () => {
  const positions = new Map([['child', point(100, 290)]]);
  const children = new Map([['child', []]]);
  assert.deepEqual(connectorPaths(positions, children, null, 140), []);
});
