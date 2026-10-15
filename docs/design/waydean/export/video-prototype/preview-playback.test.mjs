import test from "node:test";
import assert from "node:assert/strict";
import { getPreviewPlaybackFrame } from "./preview-playback.mjs";

test("preview playback maps elapsed time to source frames without advancing early", () => {
  assert.equal(getPreviewPlaybackFrame({ startFrame: 12, elapsedMs: 32, sourceFps: 30, totalFrames: 100 }), 12);
  assert.equal(getPreviewPlaybackFrame({ startFrame: 12, elapsedMs: 34, sourceFps: 30, totalFrames: 100 }), 13);
});

test("preview playback clamps at the final frame", () => {
  assert.equal(getPreviewPlaybackFrame({ startFrame: 8, elapsedMs: 10000, sourceFps: 30, totalFrames: 10 }), 9);
});
