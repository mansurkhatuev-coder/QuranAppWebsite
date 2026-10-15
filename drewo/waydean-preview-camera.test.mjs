import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraLayout,
  readableFitZoom,
  clampZoom,
  MIN_MOBILE_ZOOM,
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

test('camera keeps half a viewport of panning space around the scaled tree', () => {
  assert.deepEqual(cameraLayout(900, 600, 1000, 700, 0.5), {
    extentWidth: 1400,
    extentHeight: 950,
    offsetX: 450,
    offsetY: 300
  });
});

test('camera can center people at the far edges of a scaled tree', () => {
  const layout = cameraLayout(390, 700, 18000, 2800, MIN_MOBILE_ZOOM);
  const maxScrollLeft = layout.extentWidth - 390;
  const maxScrollTop = layout.extentHeight - 700;
  const leftPersonCenter = layout.offsetX + 50 * MIN_MOBILE_ZOOM - 390 / 2;
  const rightPersonCenter = layout.offsetX + (18000 - 50) * MIN_MOBILE_ZOOM - 390 / 2;

  assert.equal(leftPersonCenter, 0.5);
  assert.equal(rightPersonCenter, maxScrollLeft - 0.5);
  assert.equal(maxScrollTop, 2800 * MIN_MOBILE_ZOOM);
});

test('mobile camera zoom allows a much wider far-out range while keeping a safe maximum', () => {
  assert.equal(clampZoom(0.01), 0.08);
  assert.equal(clampZoom(0.005, { minimum: MIN_MOBILE_ZOOM }), 0.01);
  assert.equal(clampZoom(0.015, { minimum: MIN_MOBILE_ZOOM }), 0.015);
  assert.equal(clampZoom(0.32), 0.32);
  assert.equal(clampZoom(5), 3.2);
});

test('fit can show a very large mobile tree while desktop retains its readability floor', () => {
  assert.equal(readableFitZoom(900, 600, 18000, 2800), 0.06);
  assert.equal(readableFitZoom(390, 583, 18000, 2800), 0.02);
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
  assert.deepEqual(end, { left: 3600, top: 1750 });
});
