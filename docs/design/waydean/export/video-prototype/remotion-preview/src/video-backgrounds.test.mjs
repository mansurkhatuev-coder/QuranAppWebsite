import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { URL } from "node:url";
import {
  createLoopingVideoSampleReader,
  DEFAULT_VIDEO_BACKGROUND_ID,
  VIDEO_BACKGROUND_PRESETS,
  getVideoBackgroundOutputTimestamp,
  getVideoBackgroundTimestamp,
  isVideoElementFrameRenderable,
  startRealtimeVideoBackground
} from "./video-backgrounds.mjs";

test("video background presets retain the original scenes and add two combined Flow reels", () => {
  assert.deepEqual(VIDEO_BACKGROUND_PRESETS.map(preset => preset.id), [
    "towers", "village", "eagle", "flow-chechen-village", "flow-argun-flight"
  ]);
  assert.equal(DEFAULT_VIDEO_BACKGROUND_ID, "towers");
  for (const preset of VIDEO_BACKGROUND_PRESETS) {
    assert.ok(preset.label);
    assert.ok(preset.videoPath.endsWith(".mp4"));
    assert.ok(preset.posterPath.endsWith(".jpg"));
    assert.equal(preset.muted, true);
    const videoAsset = new URL(`../public/video-backgrounds/${preset.videoPath.split("/").at(-1)}`, import.meta.url);
    const posterAsset = new URL(`../public/video-backgrounds/${preset.posterPath.split("/").at(-1)}`, import.meta.url);
    assert.ok(existsSync(videoAsset), `${preset.id} video loop must exist`);
    assert.ok(existsSync(posterAsset), `${preset.id} poster must exist`);
    assert.ok(statSync(videoAsset).size < 10 * 1024 * 1024, `${preset.id} loop should stay phone-friendly to download`);
  }

  const importedReels = VIDEO_BACKGROUND_PRESETS.filter(preset => preset.id.startsWith("flow-"));
  assert.equal(importedReels.length, 2);
  for (const preset of importedReels) {
    assert.equal(preset.loop, false, `${preset.id} should play once instead of repeating its short footage`);
    assert.ok(preset.clipSeconds >= 15, `${preset.id} should combine multiple source clips`);
  }
});

test("video background timestamps loop deterministically and handle negative offsets", () => {
  assert.equal(getVideoBackgroundTimestamp(42.5, 16), 10.5);
  assert.equal(getVideoBackgroundTimestamp(16, 16), 0);
  assert.equal(getVideoBackgroundTimestamp(-1, 16), 15);
  assert.equal(getVideoBackgroundTimestamp(42.5, 16, { loop: false }), 16);
  assert.equal(getVideoBackgroundTimestamp(-1, 16, { loop: false }), 0);
});

test("background clock follows output time while the tree animation speed changes", () => {
  assert.equal(getVideoBackgroundOutputTimestamp(24, 24), 1);
  assert.equal(getVideoBackgroundOutputTimestamp(48, 24), 2);
});

test("native video frames are only drawn while a decoded frame is ready", () => {
  const video = { readyState: 2, videoWidth: 1280, videoHeight: 720, seeking: false };
  assert.equal(isVideoElementFrameRenderable(video), true);
  assert.equal(isVideoElementFrameRenderable({ ...video, seeking: true }), false);
  assert.equal(isVideoElementFrameRenderable({ ...video, readyState: 1 }), false);
  assert.equal(isVideoElementFrameRenderable({ ...video, videoWidth: 0 }), false);
  assert.equal(isVideoElementFrameRenderable(null), false);
});

test("video sample reader follows output timestamps across loops and releases prior samples", async () => {
  const disposed = [];
  const clipsOpened = [];
  const createSamples = () => {
    clipsOpened.push(clipsOpened.length + 1);
    return (async function* samples() {
      for (const timestamp of [0, 0.5, 1, 1.5]) {
        yield { timestamp, close: () => disposed.push(timestamp) };
      }
    }());
  };
  const reader = createLoopingVideoSampleReader({ durationSeconds: 2, createSamples });

  assert.equal((await reader.getSampleAt(0.1)).timestamp, 0);
  assert.equal((await reader.getSampleAt(0.8)).timestamp, 0.5);
  assert.equal((await reader.getSampleAt(2.1)).timestamp, 0);
  assert.equal(clipsOpened.length, 2);
  assert.ok(disposed.includes(0.5), "samples no longer used by the output should be released");
  await reader.close();
  assert.ok(disposed.length >= 4, "closing the reader should release retained samples");
});

test("short video samples play once and hold their final frame instead of repeating", async () => {
  const openedClips = [];
  const createSamples = () => {
    openedClips.push(openedClips.length + 1);
    return (async function* samples() {
      for (const timestamp of [0, 1, 2]) yield { timestamp };
    }());
  };
  const reader = createLoopingVideoSampleReader({ durationSeconds: 3, createSamples, loop: false });

  assert.equal((await reader.getSampleAt(1.2)).timestamp, 1);
  assert.equal((await reader.getSampleAt(4)).timestamp, 2);
  assert.equal((await reader.getSampleAt(9)).timestamp, 2);
  assert.equal(openedClips.length, 1);
  await reader.close();
});

test("real-time recorder can start the muted native video at the beginning when WebCodecs is unavailable", async () => {
  let currentTime = 8;
  let playing = false;
  const listeners = new Map();
  const video = {
    readyState: 2,
    videoWidth: 1280,
    pause() { playing = false; },
    async play() { playing = true; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); }
  };
  Object.defineProperty(video, "currentTime", {
    get() { return currentTime; },
    set(value) {
      currentTime = value;
      Promise.resolve().then(() => listeners.get("seeked")?.());
    }
  });

  assert.equal(await startRealtimeVideoBackground(video), true);
  assert.equal(currentTime, 0);
  assert.equal(playing, true);
  assert.equal(listeners.size, 0, "media event listeners should be removed after seeking");
});

test("real-time video background falls back cleanly when native playback is unavailable", async () => {
  const video = { readyState: 1, videoWidth: 0, play: async () => { throw new Error("not ready"); }, pause() {} };
  assert.equal(await startRealtimeVideoBackground(video), false);
});
