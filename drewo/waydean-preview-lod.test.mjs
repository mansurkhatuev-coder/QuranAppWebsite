import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactRouteClass, getOverviewCardWorldSize, nextLodLevel } from './waydean-preview-lod.mjs';
import * as lod from './waydean-preview-lod.mjs';

const lodCss = readFileSync(new URL('./waydean-preview-lod.css', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');

test('overview markers keep a readable screen size at every supported zoom', () => {
  for (const [zoom, expectedScreenSize] of [[0.01, 3], [0.02, 3], [0.08, 8], [0.19, 8], [0.34, 8]]) {
    assert.ok(Math.abs(lod.getOverviewMarkerWorldSize(zoom) * zoom - expectedScreenSize) < 1e-9);
  }
});

test('overview keeps person cards as small rectangles instead of round dots', () => {
  for (const zoom of [0.01, 0.02, 0.08, 0.19, 0.34]) {
    const size = getOverviewCardWorldSize(zoom);
    const screenWidth = size.width * zoom;
    const screenHeight = size.height * zoom;
    assert.ok(screenWidth > screenHeight, `expected a card silhouette at ${zoom}x`);
    assert.ok(screenHeight >= 2, `expected a visible card silhouette at ${zoom}x`);
    assert.ok(screenWidth <= 12.1, `overview cards should not overwhelm dense trees at ${zoom}x`);
  }
});

test('overview card borders keep their screen-pixel width while the tree zoom changes', () => {
  for (const zoom of [0.01, 0.02, 0.08, 0.19, 0.34]) {
    const worldBorderWidth = lod.getOverviewLineWorldWidth(zoom, 1.2);
    assert.ok(Math.abs(worldBorderWidth * zoom - 1.2) < 1e-9,
      `overview border should stay 1.2 screen pixels at ${zoom}x`);
  }
  assert.ok(previewSource.includes('--overview-card-border-width'), 'the camera layout must publish the compensating border width');
  assert.ok(/border:\s*var\(--overview-card-border-width/.test(lodCss), 'overview cards must use that compensating width');
  assert.ok(!/isMobile\s*\?\s*'detail'\s*:/.test(previewSource),
    'mobile overview must use the same visible card silhouettes as desktop');
});

test('overview connectors run beneath the mini-card so the line meets its visible edge', () => {
  assert.equal(lod.getConnectorCardHeight('overview', 140), 0,
    'overview connectors should continue behind the mini-card to its center');
  assert.equal(lod.getConnectorCardHeight('compact', 140), 140);
  assert.ok(previewSource.includes('getConnectorCardHeight(lodLevel, cardHeight)'),
    'tree connector paths must use the current rendered LOD');
  assert.ok(previewSource.includes('if (levelChanged) renderTreeConnectors()'),
    'connector geometry must refresh when zoom crosses an LOD threshold');
  assert.ok(/\.graph\[data-lod="overview"\] \.person-node::after/.test(lodCss),
    'overview mini-cards must paint above connectors that end at their center');
});

test('invalid connector card heights fail closed to a zero-length inset', () => {
  assert.equal(lod.getConnectorCardHeight('detail', Number.NaN), 0);
  assert.equal(lod.getConnectorCardHeight('compact', -1), 0);
});

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
