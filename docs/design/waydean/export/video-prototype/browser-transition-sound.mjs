import { SCENE_TRANSITION_FRAMES, easeCinematic } from "./cinematic-timeline.mjs";

const SUPPORTED_STYLES = new Set(["click", "whoosh"]);
export const ACTIVE_HIGHLIGHT_EMPHASIS_THRESHOLD = 0.25;

function getHighlightStartOffset(transitionFrames, threshold) {
  const frameCount = Math.max(1, Math.floor(Number(transitionFrames) || SCENE_TRANSITION_FRAMES));
  const target = Math.min(1, Math.max(0, Number(threshold) || 0));
  if (frameCount <= 1 || target <= 0) return 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const progress = easeCinematic(frame / (frameCount - 1));
    if (progress >= target) return frame;
  }
  return frameCount - 1;
}

export function getTransitionCueFrames(shots, {
  sourceFps,
  fps,
  totalFrames = Infinity,
  transitionFrames = SCENE_TRANSITION_FRAMES,
  highlightThreshold = ACTIVE_HIGHLIGHT_EMPHASIS_THRESHOLD,
  speed = 1
} = {}) {
  const sourceRate = Number(sourceFps);
  const outputRate = Number(fps);
  const playbackSpeed = Number(speed);
  if (!(sourceRate > 0) || !(outputRate > 0) || !(playbackSpeed > 0)) return [];

  const highlightOffset = getHighlightStartOffset(transitionFrames, highlightThreshold);
  const cues = new Set();
  for (const shot of (Array.isArray(shots) ? shots : []).slice(1)) {
    const startFrame = Number(shot?.startFrame);
    if (!Number.isFinite(startFrame) || startFrame <= 0) continue;
    const visibleHighlightFrame = startFrame + highlightOffset;
    const outputFrame = Math.ceil(visibleHighlightFrame * outputRate / sourceRate / playbackSpeed);
    if (outputFrame < totalFrames) cues.add(outputFrame);
  }
  return [...cues].sort((left, right) => left - right);
}

function buildClickBuffer(context) {
  const sampleRate = Number(context.sampleRate) || 44100;
  const duration = 0.08;
  const length = Math.ceil(sampleRate * duration);
  const buffer = context.createBuffer(1, length, sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const transient = Math.exp(-time * 720);
    const warmBody = Math.sin(2 * Math.PI * (930 - 230 * time / duration) * time) * Math.exp(-time * 54);
    const softTick = Math.sin(2 * Math.PI * 1880 * time) * Math.exp(-time * 92);
    const noiseSeed = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    const noise = (noiseSeed - Math.floor(noiseSeed)) * 2 - 1;
    samples[index] = warmBody * 0.17 + softTick * 0.055 + noise * transient * 0.07;
  }
  return buffer;
}

function buildWhooshBuffer(context) {
  const sampleRate = Number(context.sampleRate) || 44100;
  const duration = 0.82;
  const length = Math.ceil(sampleRate * duration);
  const buffer = context.createBuffer(1, length, sampleRate);
  const samples = buffer.getChannelData(0);
  let filteredNoise = 0;
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const progress = index / Math.max(1, length - 1);
    const time = index / sampleRate;
    const noiseSeed = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    const whiteNoise = (noiseSeed - Math.floor(noiseSeed)) * 2 - 1;
    filteredNoise += (whiteNoise - filteredNoise) * 0.14;
    const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * progress)), 1.45);
    const sweepFrequency = 185 - progress * 88;
    phase += (2 * Math.PI * sweepFrequency) / sampleRate;
    const lowSweep = Math.sin(phase) * (0.12 + 0.08 * Math.sin(progress * Math.PI));
    samples[index] = (filteredNoise * 0.28 + whiteNoise * 0.075 + lowSweep) * envelope;
  }
  return buffer;
}

export async function createTransitionAudioTrack({
  style = "click",
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  monitor = false
} = {}) {
  if (!SUPPORTED_STYLES.has(style) || typeof AudioContextCtor !== "function") return null;

  let context;
  let destination;
  let soundBuffer;
  try {
    context = new AudioContextCtor();
    if (typeof context.createMediaStreamDestination !== "function") {
      void context.close?.();
      return null;
    }
    destination = context.createMediaStreamDestination();
    soundBuffer = style === "whoosh" ? buildWhooshBuffer(context) : buildClickBuffer(context);
  } catch {
    void context?.close?.();
    return null;
  }

  let closed = false;
  return {
    audioTracks: destination.stream?.getAudioTracks?.() ?? [],
    duration: Number(soundBuffer.duration) || (style === "click" ? 0.08 : 1),
    async resume() {
      if (context.state === "suspended") await context.resume();
    },
    playCue(atTime = context.currentTime) {
      if (closed) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = soundBuffer;
      gain.gain.value = style === "whoosh" ? 0.44 : 0.52;
      source.connect(gain);
      gain.connect(destination);
      if (monitor && context.destination) gain.connect(context.destination);
      source.onended = () => {
        source.disconnect?.();
        gain.disconnect?.();
      };
      source.start(Math.max(context.currentTime, Number(atTime) || 0));
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const track of destination.stream?.getAudioTracks?.() ?? []) track.stop?.();
      await context.close?.();
    }
  };
}

export async function createTransitionAudioBuffer({
  style = "click",
  cueTimes = [],
  durationSeconds = 0,
  OfflineAudioContextCtor = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext
} = {}) {
  const duration = Number(durationSeconds);
  if (!SUPPORTED_STYLES.has(style) || !(duration > 0) || typeof OfflineAudioContextCtor !== "function") return null;
  const times = [...new Set((Array.isArray(cueTimes) ? cueTimes : [])
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value >= 0 && value < duration))];
  if (!times.length) return null;

  const sampleRate = 44_100;
  try {
    const context = new OfflineAudioContextCtor(1, Math.ceil(duration * sampleRate), sampleRate);
    const soundBuffer = style === "whoosh" ? buildWhooshBuffer(context) : buildClickBuffer(context);
    for (const time of times) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = soundBuffer;
      gain.gain.value = style === "whoosh" ? 0.44 : 0.52;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(time);
    }
    return await context.startRendering();
  } catch {
    return null;
  }
}
