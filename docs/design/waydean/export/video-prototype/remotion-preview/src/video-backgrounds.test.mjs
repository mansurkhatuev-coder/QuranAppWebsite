import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { URL } from "node:url";
import {
  createLoopingVideoSampleReader,
  DEFAULT_VIDEO_BACKGROUND_ID,
  VIDEO_BACKGROUND_PRESETS,
  getVideoBackgroundTimestamp,
  startRealtimeVideoBackground
} from "./video-backgrounds.mjs";

test("video background presets expose the three requested silent scenes with poster and clip assets", () => {
  assert.deepEqual(VIDEO_BACKGROUND_PRESETS.map(preset => preset.id), ["towers", "village", "eagle"]);
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
});

test("video background timestamps loop deterministically and handle negative offsets", () => {
  assert.equal(getVideoBackgroundTimestamp(42.5, 16), 10.5);
  assert.equal(getVideoBackgroundTimestamp(16, 16), 0);
  assert.equal(getVideoBackgroundTimestamp(-1, 16), 15);
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
