import test from "node:test";
import assert from "node:assert/strict";
import {
  VIDEO_EXPORT_HANDOFF_KEY,
  normalizeVideoExportHandoff,
  readVideoExportHandoff,
  writeVideoExportHandoff,
  getBrowserVideoSupport,
  chooseRecordingMimeType,
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
    start() { this.state = "recording"; }
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
    start() { this.state = "recording"; }
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
