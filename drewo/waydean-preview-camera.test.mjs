import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraLayout,
  readableFitZoom,
  zoomAroundAnchor,
  wheelZoomFactor,
  miniMapViewport,
  miniMapScrollTarget
} from './waydean-preview-camera.mjs';

test('a large wheel event remains one controlled zoom step', () => {
  assert.ok(wheelZoomFactor(900) > 0.85);
  assert.ok(wheelZoomFactor(-900) < 1.15);
  assert.equal(wheelZoomFactor(0), 1);
});

test('a scaled graph smaller than the viewport stays centered', () => {
  assert.deepEqual(cameraLayout(900, 600, 1000, 700, 0.5), {
    extentWidth: 900,
    extentHeight: 600,
    offsetX: 200,
    offsetY: 125
  });
});

test('fit keeps cards readable when the full tree is much wider than the viewport', () => {
  assert.equal(readableFitZoom(900, 600, 18000, 2800), 0.7);
  assert.equal(readableFitZoom(390, 583, 18000, 2800), 0.9);
  assert.equal(readableFitZoom(900, 600, 1000, 700), 0.81);
});

test('compact Master framing may zoom below the normal mobile floor to show the approved composition', () => {
  assert.equal(readableFitZoom(320, 420, 368, 400, { minimumZoom: 0.65 }), 0.78);
});

test('zoom keeps the same world point under the pointer', () => {
  const next = zoomAroundAnchor({
    previousZoom: 1,
    nextZoom: 1.5,
    scrollLeft: 400,
    scrollTop: 300,
    anchorX: 200,
    anchorY: 100,
    previousOffsetX: 0,
    previousOffsetY: 0,
    nextOffsetX: 0,
    nextOffsetY: 0,
    maxScrollLeft: 2000,
    maxScrollTop: 2000
  });
  assert.deepEqual(next, { left: 700, top: 500 });
});

test('mini-map window follows horizontal and vertical scrolling', () => {
  const common = {
    graphWidth: 4000,
    graphHeight: 2000,
    zoom: 1,
    viewWidth: 800,
    viewHeight: 500,
    offsetX: 0,
    offsetY: 0
  };
  const initial = miniMapViewport({ ...common, scrollLeft: 0, scrollTop: 0 });
  const moved = miniMapViewport({ ...common, scrollLeft: 1600, scrollTop: 750 });
  assert.equal(initial.x, 34);
  assert.equal(initial.y, 8);
  assert.ok(Math.abs((moved.x - initial.x) - 44.8) < 1e-9);
  assert.ok(Math.abs((moved.y - initial.y) - 21) < 1e-9);
  assert.equal(moved.width, initial.width);
  assert.equal(moved.height, initial.height);
});

test('mini-map click centers the requested world location and clamps to extents', () => {
  const params = {
    graphWidth: 4000,
    graphHeight: 2000,
    zoom: 1,
    viewWidth: 800,
    viewHeight: 500,
    offsetX: 0,
    offsetY: 0
  };
  const middle = miniMapScrollTarget({ ...params, miniX: 90, miniY: 36 });
  assert.deepEqual(middle, { left: 1600, top: 750 });
  const end = miniMapScrollTarget({ ...params, miniX: 180, miniY: 80 });
  assert.deepEqual(end, { left: 3200, top: 1500 });
});
