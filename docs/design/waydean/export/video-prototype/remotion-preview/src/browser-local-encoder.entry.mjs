import {
  AudioBufferSource,
  ALL_FORMATS,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
  VideoSampleSink,
  canEncodeAudio,
  getEncodableVideoCodecs
} from "mediabunny";
import { createLoopingVideoSampleReader } from "./video-backgrounds.mjs";
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

export async function openVideoBackgroundReader({ url, signal } = {}) {
  if (typeof globalThis.VideoDecoder !== "function") {
    throw new Error("Этот браузер не поддерживает покадровое декодирование видеофона.");
  }
  if (!url) throw new TypeError("Для декодера видеофона нужен адрес ролика.");

  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  const abortInput = () => { void input.dispose(); };
  signal?.addEventListener("abort", abortInput, { once: true });

  try {
    if (signal?.aborted) throw new DOMException("Экспорт видео отменён", "AbortError");
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      throw new Error("Браузер не может декодировать выбранный видеофон.");
    }

    const durationSeconds = await input.computeDuration();
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("У выбранного видеофона не удалось определить длительность.");
    }

    const sink = new VideoSampleSink(track);
    const samples = createLoopingVideoSampleReader({
      durationSeconds,
      createSamples: () => sink.samples(0, durationSeconds)
    });
    let closed = false;

    return {
      durationSeconds,
      getSampleAt: samples.getSampleAt,
      async close() {
        if (closed) return;
        closed = true;
        signal?.removeEventListener("abort", abortInput);
        await samples.close();
        await input.dispose();
      }
    };
  } catch (error) {
    signal?.removeEventListener("abort", abortInput);
    await input.dispose();
    throw error;
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
