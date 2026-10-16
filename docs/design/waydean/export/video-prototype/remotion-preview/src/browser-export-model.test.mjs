import test from "node:test";
import assert from "node:assert/strict";
import {
  VIDEO_EXPORT_HANDOFF_KEY,
  normalizeVideoExportHandoff,
  readVideoExportHandoff,
  writeVideoExportHandoff,
  getBrowserVideoSupport,
  chooseRecordingMimeType,
  chooseVideoBitrate,
  isRecordedVideoLongEnough,
  recordCanvasVideo
} from "./browser-export-model.mjs";

function makeHandoff() {
  return {
    version: 1,
    tree: {
      people: [
        { id: "root", name: "Куди", generation: 1, parentId: null, born: 1200, died: null, photoUrl: "/private.jpg", email: "private@example.com" },
        { id: "child", name: "Исмаал", generation: 2, parentId: "root", born: null, died: null, notes: "private" }
      ]
    },
    settings: { scopeType: "path", personId: "child", title: "История рода", includeDates: false, aspectRatio: "9:16", ignored: "private" }
  };
}

test("video handoff keeps only the tree snapshot and public export settings", () => {
  const handoff = normalizeVideoExportHandoff(makeHandoff());

  assert.deepEqual(handoff.settings, {
    scopeType: "path",
    selectedPersonId: "child",
    title: "История рода",
    includeDates: false,
    aspectRatio: "9:16"
  });
  assert.deepEqual(handoff.tree.people[0], {
    id: "root", name: "Куди", generation: 1, parent: null, born: 1200, died: null
  });
  assert.equal(JSON.stringify(handoff).includes("private@example.com"), false);
  assert.equal(JSON.stringify(handoff).includes("private.jpg"), false);
  assert.equal(JSON.stringify(handoff).includes("private\""), false);
});

test("video handoff round-trips through session storage without changing the key", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  writeVideoExportHandoff(storage, makeHandoff());

  assert.equal(values.size, 1);
  assert.equal(values.has(VIDEO_EXPORT_HANDOFF_KEY), true);
  assert.deepEqual(readVideoExportHandoff(storage), normalizeVideoExportHandoff(makeHandoff()));
});

test("video handoff rejects malformed, unsupported, or excessively large snapshots", () => {
  assert.throws(() => normalizeVideoExportHandoff({ ...makeHandoff(), version: 2 }), /handoff/i);
  assert.throws(() => normalizeVideoExportHandoff({ ...makeHandoff(), tree: { people: [] } }), /people/i);
  assert.throws(() => normalizeVideoExportHandoff({
    ...makeHandoff(),
    tree: { people: Array.from({ length: 5001 }, (_, index) => ({ id: String(index), name: "N", generation: 1 })) }
  }), /people/i);
});

test("browser export capability requires canvas capture and MediaRecorder", () => {
  class Recorder {
    static isTypeSupported(type) { return type.startsWith("video/mp4"); }
  }
  const supportedCanvas = { captureStream() {} };
  const unsupportedCanvas = {};

  assert.equal(getBrowserVideoSupport({ canvas: supportedCanvas, MediaRecorderCtor: Recorder }).supported, true);
  assert.equal(getBrowserVideoSupport({ canvas: unsupportedCanvas, MediaRecorderCtor: Recorder }).supported, false);
  assert.equal(getBrowserVideoSupport({ canvas: supportedCanvas, MediaRecorderCtor: null }).supported, false);
});

test("recording selects a browser-supported video container", () => {
  class SafariRecorder {
    static isTypeSupported(type) { return type === 'video/mp4;codecs="avc1.42E01E"'; }
  }
  class ChromiumRecorder {
    static isTypeSupported(type) { return type === 'video/webm;codecs="vp9"'; }
  }

  assert.equal(chooseRecordingMimeType(SafariRecorder), 'video/mp4;codecs="avc1.42E01E"');
  assert.equal(chooseRecordingMimeType(ChromiumRecorder), 'video/webm;codecs="vp9"');
  assert.equal(chooseRecordingMimeType(null), "");
});

test("chooses a steady phone-friendly bitrate that keeps long exports near the storage cap", () => {
  assert.equal(chooseVideoBitrate({ durationSeconds: 245 }), 1_342_047);
  assert.equal(chooseVideoBitrate({ durationSeconds: 10 }), 2_500_000);
});

test("rejects a recording whose embedded duration is far shorter than the render timeline", () => {
  assert.equal(isRecordedVideoLongEnough(4, 245), false);
  assert.equal(isRecordedVideoLongEnough(200, 245), true);
  assert.equal(isRecordedVideoLongEnough(Number.NaN, 245), false);
});

test("canvas recording renders frames, reports progress, and closes captured tracks", async () => {
  const events = [];
  let stoppedTrack = false;
  class Recorder {
    static isTypeSupported() { return false; }
    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = "inactive";
    }
    start(...args) { this.startArgs = args; this.state = "recording"; this.onstart?.(); }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["video"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }
  const canvas = {
    captureStream: fps => {
      events.push(["capture", fps]);
      return { getTracks: () => [{ stop: () => { stoppedTrack = true; } }] };
    }
  };

  const blob = await recordCanvasVideo({
    canvas,
    totalFrames: 3,
    fps: 24,
    drawFrame: async frame => events.push(["frame", frame]),
    onProgress: (current, total) => events.push(["progress", current, total]),
    MediaRecorderCtor: Recorder,
    sleep: async () => {}
  });

  assert.equal(blob.type, "video/webm");
  assert.deepEqual(events.filter(event => event[0] === "frame"), [["frame", 0], ["frame", 1], ["frame", 2]]);
  assert.deepEqual(events.filter(event => event[0] === "progress").at(-1), ["progress", 3, 3]);
  assert.equal(stoppedTrack, true);
});

test("canvas recording uses the real-time capture clock and flushes periodic chunks", async () => {
  const events = [];
  const videoTrack = { requestFrame: () => events.push(["request-frame"]), stop() { events.push(["stop-track"]); } };
  class Recorder {
    static isTypeSupported() { return false; }
    constructor() { this.state = "inactive"; }
    start(...args) { events.push(["start", ...args]); this.state = "recording"; this.onstart?.(); }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["full-video"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }

  await recordCanvasVideo({
    canvas: { captureStream: fps => { events.push(["capture", fps]); return { getTracks: () => [videoTrack], getVideoTracks: () => [videoTrack] }; } },
    totalFrames: 3,
    fps: 24,
    drawFrame: async frame => events.push(["draw", frame]),
    MediaRecorderCtor: Recorder,
    sleep: async () => {}
  });

  assert.deepEqual(events.find(event => event[0] === "capture"), ["capture", 24]);
  assert.deepEqual(events.find(event => event[0] === "start"), ["start", 1000]);
  assert.deepEqual(events.filter(event => event[0] === "request-frame").length, 0);
  assert.deepEqual(events.filter(event => event[0] === "draw").map(event => event[1]), [0, 1, 2]);
});

test("canvas recording does not burst through frames after a delayed mobile timer", async () => {
  const frameTimes = [];
  let delayFirstWait = true;
  class Recorder {
    static isTypeSupported() { return false; }
    constructor() { this.state = "inactive"; }
    start() { this.state = "recording"; this.onstart?.(); }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["video"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }

  await recordCanvasVideo({
    canvas: { captureStream: () => ({ getTracks: () => [{ stop() {} }] }) },
    totalFrames: 3,
    fps: 24,
    drawFrame: async () => frameTimes.push(performance.now()),
    MediaRecorderCtor: Recorder,
    sleep: milliseconds => new Promise(resolve => {
      const extraDelay = delayFirstWait ? 120 : 0;
      delayFirstWait = false;
      setTimeout(resolve, milliseconds + extraDelay);
    })
  });

  assert.ok(frameTimes[2] - frameTimes[1] >= 30, "frames following a delayed timer keep their own playback interval");
});

test("starts a browser-timed canvas stream at the requested frame rate", async () => {
  const captureRates = [];
  class Recorder {
    static isTypeSupported() { return false; }
    constructor() { this.state = "inactive"; }
    start() { this.state = "recording"; this.onstart?.(); }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["video"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }

  await recordCanvasVideo({
    canvas: {
      captureStream(fps) {
        captureRates.push(fps);
        if (fps === 0) throw new Error("manual capture is unavailable");
        return { getTracks: () => [{ kind: "video", stop() {} }] };
      }
    },
    totalFrames: 2,
    fps: 24,
    drawFrame: async () => {},
    MediaRecorderCtor: Recorder,
    sleep: async () => {}
  });

  assert.deepEqual(captureRates, [24]);
});

test("canvas recording combines the requested transition sound track and stops it afterward", async () => {
  const videoTrack = { kind: "video", stopped: false, stop() { this.stopped = true; } };
  const audioTrack = { kind: "audio", stopped: false, stop() { this.stopped = true; } };
  const tracks = [videoTrack];
  const stream = {
    addTrack(track) { tracks.push(track); },
    getTracks() { return tracks; }
  };
  class Recorder {
    static isTypeSupported() { return false; }
    constructor(recordedStream) {
      assert.equal(recordedStream.getTracks().includes(audioTrack), true);
      this.state = "inactive";
    }
    start() { this.state = "recording"; this.onstart?.(); }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["video+audio"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }

  await recordCanvasVideo({
    canvas: { captureStream: () => stream },
    totalFrames: 1,
    fps: 24,
    drawFrame: async () => {},
    audioTracks: [audioTrack],
    MediaRecorderCtor: Recorder,
    sleep: async () => {}
  });

  assert.equal(videoTrack.stopped, true);
  assert.equal(audioTrack.stopped, true);
});
