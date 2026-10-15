import test from "node:test";
import assert from "node:assert/strict";
import {
  createTransitionAudioTrack,
  getTransitionCueFrames
} from "./browser-transition-sound.mjs";
import { getScenePersonEmphasis } from "./remotion-preview/src/project-model.mjs";

test("maps each scene change to the first output frame where the next card highlight is visible", () => {
  const cues = getTransitionCueFrames([
    { startFrame: 0 }, { startFrame: 48 }, { startFrame: 96 }
  ], { sourceFps: 30, fps: 24, transitionFrames: 36, highlightThreshold: 0.25 });

  // Cinematic easing first crosses 25% emphasis at local source frame 14.
  assert.deepEqual(cues, [50, 88]);
});

test("cue frame coincides with the next scene card crossing the visible highlight threshold", () => {
  const story = {
    timeline: {
      totalFrames: 80,
      transitionFrames: 36,
      shots: [
        { startFrame: 0, durationFrames: 40, personIds: ["previous"] },
        { startFrame: 40, durationFrames: 40, personIds: ["next"] }
      ]
    }
  };
  const [cueFrame] = getTransitionCueFrames(story.timeline.shots, {
    sourceFps: 30, fps: 24, totalFrames: 64, transitionFrames: story.timeline.transitionFrames
  });
  const sourceFrame = Math.floor(cueFrame * 30 / 24);
  const previousOutputSourceFrame = Math.floor((cueFrame - 1) * 30 / 24);
  const localFrame = sourceFrame - story.timeline.shots[1].startFrame;
  const previousLocalFrame = previousOutputSourceFrame - story.timeline.shots[1].startFrame;

  assert.ok(getScenePersonEmphasis(story, 1, localFrame, "next") >= 0.25);
  assert.ok(getScenePersonEmphasis(story, 1, previousLocalFrame, "next") < 0.25);
});

test("creates and schedules a short, locally synthesized click", async () => {
  const events = [];
  const audioTrack = { kind: "audio" };
  let bufferLength = 0;
  class MockAudioContext {
    constructor() { this.sampleRate = 8000; this.currentTime = 2; this.destination = {}; }
    createBuffer(channels, length, sampleRate) {
      bufferLength = length;
      const samples = new Float32Array(length);
      return { samples, getChannelData: () => samples };
    }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [audioTrack] } }; }
    createBufferSource() {
      return {
        connect: node => events.push(["connect-source", node]),
        start: time => events.push(["start", time]),
        disconnect() {}
      };
    }
    createGain() {
      return { gain: { value: 0 }, connect: node => events.push(["connect-gain", node]), disconnect() {} };
    }
    async resume() { events.push(["resume"]); }
    async close() { events.push(["close"]); }
  }

  const player = createTransitionAudioTrack({ style: "click", AudioContextCtor: MockAudioContext });
  assert.deepEqual(player.audioTracks, [audioTrack]);
  await player.resume();
  player.playCue(2.25);
  await player.close();
  assert.ok(bufferLength > 0 && bufferLength <= 800, "click should last at most 100 ms");
  assert.equal(events.some(event => event[0] === "start" && event[1] === 2.25), true);
  assert.equal(events.some(event => event[0] === "close"), true);
});

test("does not create an audio context when transition sound is disabled", () => {
  const player = createTransitionAudioTrack({ style: "none", AudioContextCtor: class { constructor() { throw new Error("must not create"); } } });
  assert.equal(player, null);
});
