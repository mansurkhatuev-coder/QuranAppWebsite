export const DEFAULT_VIDEO_BACKGROUND_ID = "towers";

export const VIDEO_BACKGROUND_PRESETS = Object.freeze([
  Object.freeze({
    id: "towers",
    label: "Горные башни",
    videoPath: "./remotion-preview/public/video-backgrounds/towers-loop.mp4",
    posterPath: "./remotion-preview/public/video-backgrounds/towers-poster.jpg",
    muted: true
  }),
  Object.freeze({
    id: "village",
    label: "Тропа старого села",
    videoPath: "./remotion-preview/public/video-backgrounds/village-loop.mp4",
    posterPath: "./remotion-preview/public/video-backgrounds/village-poster.jpg",
    muted: true
  }),
  Object.freeze({
    id: "eagle",
    label: "Полёт орла",
    videoPath: "./remotion-preview/public/video-backgrounds/eagle-loop.mp4",
    posterPath: "./remotion-preview/public/video-backgrounds/eagle-poster.jpg",
    muted: true
  }),
  Object.freeze({
    id: "flow-chechen-village",
    label: "Башни и горное селение",
    videoPath: "./remotion-preview/public/video-backgrounds/flow-chechen-village.mp4",
    posterPath: "./remotion-preview/public/video-backgrounds/flow-chechen-village-poster.jpg",
    clipSeconds: 24,
    loop: false,
    muted: true
  }),
  Object.freeze({
    id: "flow-argun-flight",
    label: "Аргунское ущелье",
    videoPath: "./remotion-preview/public/video-backgrounds/flow-argun-flight.mp4",
    posterPath: "./remotion-preview/public/video-backgrounds/flow-argun-flight-poster.jpg",
    clipSeconds: 16,
    loop: false,
    muted: true
  })
]);

const VIDEO_BACKGROUND_IDS = new Set(VIDEO_BACKGROUND_PRESETS.map(preset => preset.id));

export function isVideoBackgroundId(value) {
  return VIDEO_BACKGROUND_IDS.has(value);
}

export function getVideoBackgroundPreset(id = DEFAULT_VIDEO_BACKGROUND_ID) {
  return VIDEO_BACKGROUND_PRESETS.find(preset => preset.id === id) ?? VIDEO_BACKGROUND_PRESETS[0];
}

export function getVideoBackgroundTimestamp(elapsedSeconds, durationSeconds, { loop = true } = {}) {
  const duration = Number(durationSeconds);
  const elapsed = Number(elapsedSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(elapsed)) return 0;
  if (!loop) return Math.min(duration, Math.max(0, elapsed));
  return ((elapsed % duration) + duration) % duration;
}

export function getVideoBackgroundOutputTimestamp(outputFrame, fps) {
  const frame = Math.max(0, Number.isFinite(Number(outputFrame)) ? Number(outputFrame) : 0);
  const frameRate = Math.max(1, Number.isFinite(Number(fps)) ? Number(fps) : 24);
  return frame / frameRate;
}

export function isVideoElementFrameRenderable(video) {
  return Boolean(video
    && Number(video.readyState) >= 2
    && !video.seeking
    && Number(video.videoWidth) > 0
    && Number(video.videoHeight) > 0);
}

function seekVideoElement(video, timestamp, timeoutMs) {
  if (Math.abs(Number(video.currentTime) - timestamp) < 0.04 && !video.seeking) return Promise.resolve(true);
  if (typeof video.addEventListener !== "function" || typeof video.removeEventListener !== "function") return Promise.resolve(false);

  return new Promise(resolve => {
    let settled = false;
    let timeoutId = null;
    const finish = didSeek => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve(didSeek);
    };
    const onSeeked = () => finish(true);
    const onError = () => finish(false);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    timeoutId = setTimeout(() => finish(false), timeoutMs);
    try {
      video.currentTime = timestamp;
      if (Math.abs(Number(video.currentTime) - timestamp) < 0.04 && !video.seeking) finish(true);
    } catch {
      finish(false);
    }
  });
}

export async function startRealtimeVideoBackground(video, { seekTimeoutMs = 1500 } = {}) {
  if (!video || Number(video.readyState) < 2 || Number(video.videoWidth) <= 0 || typeof video.play !== "function") return false;
  try {
    video.pause?.();
    if (!await seekVideoElement(video, 0, Math.max(100, Number(seekTimeoutMs) || 1500))) return false;
    await video.play();
    return true;
  } catch {
    video.pause?.();
    return false;
  }
}

export function createLoopingVideoSampleReader({ durationSeconds, createSamples, loop = true } = {}) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError("Длительность видеофона должна быть больше нуля.");
  if (typeof createSamples !== "function") throw new TypeError("Для декодера видеофона нужен источник кадров.");

  let iterator = null;
  let loopIndex = null;
  let currentSample = null;
  let nextSample = null;
  let lastTimestamp = -Infinity;
  let closed = false;

  const closeSample = sample => {
    try { sample?.close?.(); } catch { /* Ignore stale decoder samples during cleanup. */ }
  };

  const releaseCurrent = async () => {
    closeSample(currentSample);
    closeSample(nextSample);
    currentSample = null;
    nextSample = null;
    if (iterator?.return) {
      try { await iterator.return(); } catch { /* Preserve the caller's decode result. */ }
    }
    iterator = null;
  };

  const beginLoop = async nextLoopIndex => {
    await releaseCurrent();
    iterator = createSamples()[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done) throw new Error("Видеофон не содержит кадров.");
    nextSample = first.value;
    loopIndex = nextLoopIndex;
    lastTimestamp = -Infinity;
  };

  return {
    async getSampleAt(elapsedSeconds) {
      if (closed) throw new Error("Декодер видеофона уже закрыт.");
      const elapsed = Number(elapsedSeconds);
      if (!Number.isFinite(elapsed)) throw new TypeError("Время кадра видеофона должно быть числом.");
      const nextLoopIndex = loop ? Math.floor(elapsed / duration) : 0;
      const timestamp = getVideoBackgroundTimestamp(elapsed, duration, { loop });

      if (iterator === null || nextLoopIndex !== loopIndex || timestamp < lastTimestamp) {
        await beginLoop(nextLoopIndex);
      }

      while (nextSample && Number(nextSample.timestamp) <= timestamp + 0.001) {
        closeSample(currentSample);
        currentSample = nextSample;
        nextSample = null;
        const next = await iterator.next();
        if (!next.done) nextSample = next.value;
      }

      if (!currentSample && nextSample) {
        currentSample = nextSample;
        nextSample = null;
        const next = await iterator.next();
        if (!next.done) nextSample = next.value;
      }
      if (!currentSample) throw new Error("Не удалось декодировать кадр видеофона.");

      lastTimestamp = timestamp;
      return currentSample;
    },

    async close() {
      if (closed) return;
      closed = true;
      await releaseCurrent();
    }
  };
}
