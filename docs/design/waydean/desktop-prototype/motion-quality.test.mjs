import test from "node:test";
import assert from "node:assert/strict";
import * as motionQuality from "./motion-quality.mjs";

function evaluateFrameWindow(samples, options) {
  assert.equal(typeof motionQuality.analyzeFrameWindow, "function", "frame-window evaluator should be available");
  return motionQuality.analyzeFrameWindow(samples, options);
}

function nextTier(quality) {
  assert.equal(typeof motionQuality.nextLowerQuality, "function", "quality downgrade helper should be available");
  return motionQuality.nextLowerQuality(quality);
}

test("a steady 60 fps window stays at its current quality", () => {
  const result = evaluateFrameWindow(Array(60).fill(1000 / 60));
  assert.equal(result.shouldDowngrade, false);
  assert.equal(result.overrunRatio, 0);
});

test("a steady 120 Hz display does not downgrade a 60 fps animation", () => {
  const result = evaluateFrameWindow(Array(120).fill(1000 / 120));
  assert.equal(result.shouldDowngrade, false);
  assert.equal(result.overrunRatio, 0);
});

test("exactly 20 percent slow frames do not trigger a downgrade", () => {
  const samples = [...Array(48).fill(1000 / 60), ...Array(12).fill(34)];
  const result = evaluateFrameWindow(samples);
  assert.equal(result.overrunRatio, 0.2);
  assert.equal(result.shouldDowngrade, false);
});

test("more than 20 percent slow frames in a full window trigger a downgrade", () => {
  const samples = [...Array(47).fill(1000 / 60), ...Array(13).fill(34)];
  const result = evaluateFrameWindow(samples);
  assert.ok(result.overrunRatio > 0.2);
  assert.equal(result.shouldDowngrade, true);
});

test("a short slow sample cannot trigger before a full one-second window", () => {
  const result = evaluateFrameWindow(Array(10).fill(34), { elapsedMs: 500 });
  assert.equal(result.shouldDowngrade, false);
});

test("a full one-second window still reacts when a very slow device yields few frames", () => {
  const result = evaluateFrameWindow([1000], { elapsedMs: 1000 });
  assert.equal(result.overrunRatio, 1);
  assert.equal(result.shouldDowngrade, true);
});

test("automatic quality drops only one tier and never below Low", () => {
  assert.equal(nextTier("high"), "medium");
  assert.equal(nextTier("medium"), "low");
  assert.equal(nextTier("low"), "low");
});
