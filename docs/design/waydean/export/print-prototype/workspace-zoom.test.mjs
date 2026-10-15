import assert from "node:assert/strict";
import test from "node:test";
import { clampWorkspaceZoom, getViewportFitZoom } from "./workspace-zoom.mjs";

test("workspace zoom can step out far enough to fit a very large print board", () => {
  const zoom = getViewportFitZoom({
    stageWidth: 980,
    stageHeight: 560,
    contentWidth: 120_000,
    contentHeight: 160_000,
    padding: 56
  });

  assert.ok(zoom < 0.01);
  assert.ok(zoom >= 0.001);
});

test("fit zoom is calculated from the requested canvas or single-sheet bounds", () => {
  const viewport = { stageWidth: 980, stageHeight: 560, padding: 56 };
  const canvasZoom = getViewportFitZoom({ ...viewport, contentWidth: 12_000, contentHeight: 8_000 });
  const pageZoom = getViewportFitZoom({ ...viewport, contentWidth: 2_000, contentHeight: 2_800 });

  assert.ok(canvasZoom < pageZoom);
  assert.equal(getViewportFitZoom({ ...viewport, contentWidth: 300, contentHeight: 300 }), 1.5);
});

test("manual zoom stays within the supported range", () => {
  assert.equal(clampWorkspaceZoom(-3), 0.001);
  assert.equal(clampWorkspaceZoom(0.0001), 0.001);
  assert.equal(clampWorkspaceZoom(4.2), 4);
  assert.equal(clampWorkspaceZoom(0.75), 0.75);
});
