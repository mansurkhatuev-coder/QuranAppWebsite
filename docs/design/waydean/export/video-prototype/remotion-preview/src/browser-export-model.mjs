export const VIDEO_EXPORT_HANDOFF_KEY = "waydean.video-export.handoff.v1";

const scopes = new Set(["all", "path", "branch"]);
const aspectRatios = new Set(["16:9", "9:16", "1:1"]);
const MAX_TREE_PEOPLE = 5000;
const MAX_PERSON_FIELD_LENGTH = 200;

function asText(value, limit = MAX_PERSON_FIELD_LENGTH) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, limit)
    : "";
}

function normalizeDate(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeVideoExportHandoff(input) {
  if (!input || typeof input !== "object" || input.version !== 1) {
    throw new TypeError("Invalid video export handoff version");
  }
  const sourcePeople = input.tree?.people;
  if (!Array.isArray(sourcePeople) || sourcePeople.length < 1 || sourcePeople.length > MAX_TREE_PEOPLE) {
    throw new TypeError("Invalid video export handoff people snapshot");
  }

  const people = sourcePeople.map(person => {
    const id = asText(person?.id);
    const name = asText(person?.name);
    const generation = Number(person?.generation);
    if (!id || !name || !Number.isFinite(generation) || generation < 0 || generation > 1000) {
      throw new TypeError("Invalid person in video export handoff");
    }
    return {
      id,
      name,
      generation,
      parent: asText(person?.parent ?? person?.parentId) || null,
      born: normalizeDate(person?.born),
      died: normalizeDate(person?.died)
    };
  });

  const ids = new Set(people.map(person => person.id));
  if (ids.size !== people.length) throw new TypeError("Duplicate person in video export handoff");

  const suppliedSettings = input.settings && typeof input.settings === "object" ? input.settings : {};
  const requestedPersonId = asText(suppliedSettings.selectedPersonId ?? suppliedSettings.personId);
  return {
    version: 1,
    tree: { people },
    settings: {
      scopeType: scopes.has(suppliedSettings.scopeType) ? suppliedSettings.scopeType : "all",
      selectedPersonId: ids.has(requestedPersonId) ? requestedPersonId : people.at(-1).id,
      title: (asText(suppliedSettings.title, 80) || "История рода").slice(0, 80),
      includeDates: suppliedSettings.includeDates !== false,
      aspectRatio: aspectRatios.has(suppliedSettings.aspectRatio) ? suppliedSettings.aspectRatio : "16:9"
    }
  };
}

export function writeVideoExportHandoff(storage, input) {
  if (!storage || typeof storage.setItem !== "function") {
    throw new TypeError("Session storage is unavailable for video handoff");
  }
  const handoff = normalizeVideoExportHandoff(input);
  storage.setItem(VIDEO_EXPORT_HANDOFF_KEY, JSON.stringify(handoff));
  return handoff;
}

export function readVideoExportHandoff(storage) {
  try {
    const serialized = storage?.getItem?.(VIDEO_EXPORT_HANDOFF_KEY);
    return serialized ? normalizeVideoExportHandoff(JSON.parse(serialized)) : null;
  } catch {
    return null;
  }
}

export function chooseRecordingMimeType(MediaRecorderCtor = globalThis.MediaRecorder) {
  if (typeof MediaRecorderCtor?.isTypeSupported !== "function") return "";
  const candidates = [
    'video/mp4;codecs="avc1.42E01E"',
    "video/mp4",
    'video/webm;codecs="vp9"',
    'video/webm;codecs="vp8"',
    "video/webm"
  ];
  return candidates.find(type => {
    try {
      return MediaRecorderCtor.isTypeSupported(type);
    } catch {
      return false;
    }
  }) || "";
}

export function getBrowserVideoSupport({ canvas, MediaRecorderCtor = globalThis.MediaRecorder } = {}) {
  if (typeof canvas?.captureStream !== "function") {
    return { supported: false, mimeType: "", reason: "Этот браузер не умеет снимать кадры холста." };
  }
  if (typeof MediaRecorderCtor !== "function") {
    return { supported: false, mimeType: "", reason: "Этот браузер не умеет собирать видео из кадров." };
  }
  return { supported: true, mimeType: chooseRecordingMimeType(MediaRecorderCtor), reason: "" };
}

export function chooseVideoBitrate({ durationSeconds, targetBytes = 42 * 1024 * 1024, audioBitsPerSecond = 96_000 } = {}) {
  const duration = Math.max(1, Number(durationSeconds) || 1);
  const budgetBitsPerSecond = Math.floor((Math.max(1, Number(targetBytes) || 1) * 8) / duration);
  return Math.min(2_500_000, Math.max(500_000, budgetBitsPerSecond - Math.max(0, Number(audioBitsPerSecond) || 0)));
}

export function getRecordedVideoDurationIssue(actualDurationSeconds, expectedDurationSeconds, tolerance = 0.2) {
  const actual = Number(actualDurationSeconds);
  const expected = Number(expectedDurationSeconds);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual <= 0 || expected <= 0) return "unknown";
  const allowedShortfall = Math.min(0.8, Math.max(0, Number(tolerance) || 0));
  if (actual < expected * (1 - allowedShortfall)) return "too-short";
  // A slow device may render longer than planned, but never by orders of
  // magnitude. Safari can expose fragmented MP4 metadata as thousands of hours.
  if (actual > expected * 10) return "too-long";
  return null;
}

export function isRecordedVideoLongEnough(actualDurationSeconds, expectedDurationSeconds, tolerance = 0.2) {
  return getRecordedVideoDurationIssue(actualDurationSeconds, expectedDurationSeconds, tolerance) === null;
}

function abortError() {
  return new DOMException("Экспорт видео отменён", "AbortError");
}

export function recordCanvasVideo({
  canvas,
  totalFrames,
  fps,
  drawFrame,
  onProgress = () => {},
  signal,
  audioTracks = [],
  durationSeconds = Number(totalFrames) / Math.max(1, Number(fps) || 24),
  MediaRecorderCtor = globalThis.MediaRecorder,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
}) {
  const support = getBrowserVideoSupport({ canvas, MediaRecorderCtor });
  if (!support.supported) return Promise.reject(new Error(support.reason));
  const frameCount = Math.max(1, Math.floor(Number(totalFrames) || 0));
  const frameRate = Math.min(30, Math.max(1, Number(fps) || 24));
  let stream;
  try {
    // Use a real-time frame clock. On iOS, manually requested canvas frames
    // can be encoded with compressed timestamps even while the render loop waits.
    stream = canvas.captureStream(frameRate);
    for (const track of audioTracks) {
      if (!track || stream.getTracks?.().includes(track)) continue;
      if (typeof stream.addTrack !== "function") throw new Error("This browser cannot combine audio with the video stream.");
      stream.addTrack(track);
    }
  } catch {
    return Promise.reject(new Error("Не удалось подготовить видеопоток с холста."));
  }

  let recorder;
  try {
    const options = {
      ...(support.mimeType ? { mimeType: support.mimeType } : {}),
      videoBitsPerSecond: chooseVideoBitrate({ durationSeconds }),
      audioBitsPerSecond: 96_000
    };
    try {
      recorder = new MediaRecorderCtor(stream, options);
    } catch {
      recorder = new MediaRecorderCtor(stream, support.mimeType ? { mimeType: support.mimeType } : undefined);
    }
  } catch {
    stream.getTracks?.().forEach(track => track.stop());
    return Promise.reject(new Error("Браузер не смог начать запись видео."));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let failure = null;
    recorder.ondataavailable = event => {
      if (event.data?.size) chunks.push(event.data);
    };
    let rejectStarted;
    const started = new Promise((resolve, reject) => {
      recorder.onstart = resolve;
      rejectStarted = reject;
    });
    recorder.onerror = () => {
      failure = new Error("Запись видео прервалась в браузере.");
      rejectStarted?.(failure);
      if (recorder.state !== "inactive") recorder.stop();
    };
    recorder.onstop = () => {
      stream.getTracks?.().forEach(track => track.stop());
      if (failure) {
        reject(failure);
      } else if (signal?.aborted) {
        reject(abortError());
      } else if (!chunks.length) {
        reject(new Error("Браузер не сохранил кадры видео."));
      } else {
        resolve(new Blob(chunks, { type: recorder.mimeType || support.mimeType || "video/webm" }));
      }
    };

    try {
      const recordingType = String(recorder.mimeType || support.mimeType || "").toLowerCase();
      // Safari's fragmented MP4 timeslices can produce a wildly incorrect
      // duration index. Let MP4 emit one complete blob on stop instead.
      if (recordingType.includes("mp4")) recorder.start();
      else recorder.start(1000);
      const frameDurationMs = 1000 / frameRate;
      const waitUntil = async deadline => {
        while (true) {
          if (signal?.aborted) throw abortError();
          const remaining = deadline - globalThis.performance.now();
          if (remaining <= 0) return;
          await sleep(Math.min(remaining, 250));
        }
      };
      void (async () => {
        try {
          await started;
          for (let frame = 0; frame < frameCount; frame += 1) {
            if (signal?.aborted) throw abortError();
            const frameStartedAt = globalThis.performance.now();
            await drawFrame(frame);
            onProgress(frame + 1, frameCount);
            // Base each frame interval on the previous frame's actual start.
            // If iOS suspends timers, a recording-wide deadline makes the
            // remaining frames catch up in a burst and compress the video.
            await waitUntil(frameStartedAt + frameDurationMs);
          }
          recorder.stop();
        } catch (error) {
          failure = error;
          if (recorder.state !== "inactive") recorder.stop();
          else {
            stream.getTracks?.().forEach(track => track.stop());
            reject(error);
          }
        }
      })();
    } catch {
      stream.getTracks?.().forEach(track => track.stop());
      reject(new Error("Браузер не смог начать запись видео."));
    }
  });
}
