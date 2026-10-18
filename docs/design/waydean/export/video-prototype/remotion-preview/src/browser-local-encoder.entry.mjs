import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  getEncodableVideoCodecs
} from "mediabunny";
let aacEncoderReady = false;

async function ensureAacEncoder() {
  if (aacEncoderReady || await canEncodeAudio("aac")) return;
  const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
  registerAacEncoder();
  aacEncoderReady = true;
}

export async function canEncodeTimestampedMp4({ width, height, bitrate, includeAudio = true } = {}) {
  if (typeof globalThis.VideoEncoder !== "function" || typeof globalThis.VideoFrame !== "function") return false;
  try {
    const videoCodecs = await getEncodableVideoCodecs(["avc"], { width, height, bitrate });
    if (!videoCodecs.includes("avc")) return false;
    if (includeAudio) {
      await ensureAacEncoder();
      if (!(await canEncodeAudio("aac"))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function encodeTimestampedMp4({
  canvas,
  totalFrames,
  fps,
  bitrate,
  audioBuffer = null,
  signal,
  drawFrame,
  onProgress = () => {}
} = {}) {
  const frameCount = Math.max(1, Math.floor(Number(totalFrames) || 0));
  const frameRate = Math.min(30, Math.max(1, Math.floor(Number(fps) || 24)));
  if (!canvas || typeof drawFrame !== "function") throw new TypeError("Для MP4 нужны холст и функция отрисовки кадра.");
  if (typeof globalThis.VideoEncoder !== "function") throw new Error("Это устройство не поддерживает точный локальный рендер MP4.");
  if (audioBuffer) await ensureAacEncoder();

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new BufferTarget()
  });
  const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate: Math.max(500_000, Number(bitrate) || 1_000_000) });
  output.addVideoTrack(videoSource, { frameRate });
  const audioSource = audioBuffer
    ? new AudioBufferSource({ codec: "aac", bitrate: 96_000 })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  try {
    await output.start();
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (signal?.aborted) throw new DOMException("Экспорт видео отменён", "AbortError");
      await drawFrame(frame);
      await videoSource.add(frame / frameRate, 1 / frameRate, { keyFrame: frame === 0 });
      onProgress(frame + 1, frameCount);
    }
    if (audioSource && audioBuffer) await audioSource.add(audioBuffer);
    if (signal?.aborted) throw new DOMException("Экспорт видео отменён", "AbortError");
    await output.finalize();
    const data = output.target.buffer;
    if (!data) throw new Error("Браузер не собрал MP4-файл.");
    return new Blob([data], { type: "video/mp4" });
  } catch (error) {
    try { await output.cancel(); } catch { /* Preserve the original export error. */ }
    throw error;
  }
}
