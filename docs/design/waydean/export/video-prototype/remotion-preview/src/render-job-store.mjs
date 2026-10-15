import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicRenderJob, isValidRenderJobId, normalizeRenderSettings } from "./render-job-model.mjs";

const statuses = new Set(["queued", "bundling", "rendering", "cancelling", "completed", "failed", "cancelled"]);
const INTERRUPTION_ERROR = "Локальный сервер перезапустился во время экспорта. Задание можно повторить.";
const SAFE_FAILURE_ERROR = "Не удалось сформировать видео. Задание можно повторить.";
const MISSING_ARTIFACT_ERROR = "Локальный MP4 больше не найден. Задание можно повторить.";
const SAFE_STAGES = new Set(["В очереди", "Подготовка композиции", "Рендер кадров", "Сборка MP4", "Видео готово", "Отмена экспорта", "Отменено", "Экспорт прерван", "Ошибка рендера"]);

function publicList(jobs, retryChildren) {
  const waiting = [...jobs.values()].filter(job => job.status === "queued").sort((a, b) => a.sequence - b.sequence);
  const queuedPositions = new Map(waiting.map((job, index) => [job.id, index + 1]));
  return [...jobs.values()].sort((a, b) => a.sequence - b.sequence).map(job => {
    const publicJob = createPublicRenderJob(job, queuedPositions.get(job.id) ?? null);
    if (retryChildren.has(job.id) && publicJob.actions.retry) {
      return { ...publicJob, actions: { ...publicJob.actions, retry: false } };
    }
    return publicJob;
  });
}

export async function createRenderJobStore({ directory, outputDirectory, validPersonIds, maxQueued = 3, idFactory = randomUUID }) {
  if (!Number.isInteger(maxQueued) || maxQueued < 1) throw new TypeError("Invalid queue limit");
  await mkdir(directory, { recursive: true });
  const jobs = new Map();
  const retryChildren = new Map();
  const persistChains = new Map();
  let sequence = 0;

  const filePath = id => path.join(directory, `${id}.json`);
  const persist = job => {
    const manifest = {
      id: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      settings: job.settings,
      error: job.error ?? null,
      sequence: job.sequence,
      retryOf: job.retryOf ?? null
    };
    const target = filePath(job.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const previous = persistChains.get(job.id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      await writeFile(temporary, JSON.stringify(manifest), { encoding: "utf8", flag: "wx" });
      await rename(temporary, target);
    });
    persistChains.set(job.id, next);
    return next.finally(() => {
      if (persistChains.get(job.id) === next) persistChains.delete(job.id);
    });
  };

  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (!isValidRenderJobId(id)) continue;
    try {
      const saved = JSON.parse(await readFile(filePath(id), "utf8"));
      if (saved?.id !== id || !statuses.has(saved.status)) continue;
      const safeSettings = normalizeRenderSettings(saved.settings, validPersonIds);
      const savedSequence = Number.isSafeInteger(saved.sequence) && saved.sequence > 0 ? saved.sequence : ++sequence;
      sequence = Math.max(sequence, savedSequence);
      const interrupted = ["bundling", "rendering", "cancelling"].includes(saved.status);
      const completedArtifactExists = saved.status === "completed" && outputDirectory
        ? await stat(path.join(outputDirectory, `${id}.mp4`)).then(info => info.isFile()).catch(() => false)
        : saved.status === "completed";
      const missingArtifact = saved.status === "completed" && !completedArtifactExists;
      if (interrupted && outputDirectory) await rm(path.join(outputDirectory, `${id}.mp4`), { force: true }).catch(() => {});
      const job = {
        id,
        status: interrupted || missingArtifact ? "failed" : saved.status,
        progress: Number.isFinite(saved.progress) ? Math.max(0, Math.min(1, saved.progress)) : 0,
        stage: interrupted ? "Экспорт прерван" : (SAFE_STAGES.has(saved.stage) ? saved.stage : "В очереди"),
        settings: safeSettings,
        error: interrupted ? INTERRUPTION_ERROR : missingArtifact ? MISSING_ARTIFACT_ERROR : (saved.status === "failed" ? SAFE_FAILURE_ERROR : null),
        sequence: savedSequence,
        retryOf: isValidRenderJobId(saved.retryOf) ? saved.retryOf : null
      };
      jobs.set(id, job);
      if (job.retryOf && !retryChildren.has(job.retryOf)) retryChildren.set(job.retryOf, id);
      if (interrupted || missingArtifact) await persist(job);
    } catch {
      // Invalid or partially written manifests are ignored and never supply file paths.
    }
  }

  const getPublic = id => {
    const job = jobs.get(id);
    if (!job) return null;
    return publicList(jobs, retryChildren).find(item => item.id === id) ?? null;
  };
  const enqueueJob = async (input, retryOf = null) => {
    const queuedCount = [...jobs.values()].filter(job => job.status === "queued").length;
    if (queuedCount >= maxQueued) {
      const error = new Error("Локальная очередь экспорта заполнена. Повторите запрос позже.");
      error.code = "QUEUE_FULL";
      throw error;
    }
    const settings = normalizeRenderSettings(input, validPersonIds);
    const id = idFactory();
    if (!isValidRenderJobId(id) || jobs.has(id)) throw new Error("Render job id generator returned an invalid id");
    const job = { id, status: "queued", progress: 0, stage: "В очереди", settings, error: null, sequence: ++sequence, retryOf };
    jobs.set(id, job);
    if (retryOf) retryChildren.set(retryOf, id);
    await persist(job);
    return getPublic(id);
  };

  return {
    directory,
    maxQueued,
    list: () => publicList(jobs, retryChildren),
    get: getPublic,
    getInternal: id => jobs.get(id) ?? null,
    nextQueued: () => [...jobs.values()].filter(job => job.status === "queued").sort((a, b) => a.sequence - b.sequence)[0] ?? null,
    enqueue: enqueueJob,
    update: async (id, patch) => {
      const job = jobs.get(id);
      if (!job) return null;
      if (patch.status && !statuses.has(patch.status)) throw new TypeError("Invalid render job status");
      Object.assign(job, patch);
      if (job.status === "failed") job.error = SAFE_FAILURE_ERROR;
      if (job.status === "cancelled") job.error = null;
      await persist(job);
      return getPublic(id);
    },
    cancel: async id => {
      const job = jobs.get(id);
      if (!job || ["completed", "failed", "cancelled"].includes(job.status)) return null;
      if (job.status === "queued") {
        job.status = "cancelled";
        job.stage = "Отменено";
        job.progress = 0;
      } else {
        job.status = "cancelling";
        job.stage = "Отмена экспорта";
      }
      await persist(job);
      return getPublic(id);
    },
    retry: async id => {
      const existingRetryId = retryChildren.get(id);
      if (existingRetryId) return getPublic(existingRetryId);
      const previous = jobs.get(id);
      if (!previous || !["failed", "cancelled"].includes(previous.status)) return null;
      return enqueueJob(previous.settings, id);
    },
    markQueuedCancelled: async id => {
      const job = jobs.get(id);
      if (!job || job.status !== "queued") return null;
      job.status = "cancelled";
      job.stage = "Отменено";
      await persist(job);
      return getPublic(id);
    }
  };
}

export { INTERRUPTION_ERROR };
