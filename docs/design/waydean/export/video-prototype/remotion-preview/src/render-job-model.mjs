import { DEFAULT_VIDEO_ASPECT_RATIO, VIDEO_FORMATS } from "./composition-config.mjs";

const scopes = new Set(["all", "path", "branch"]);
const jobStatuses = new Set(["queued", "bundling", "rendering", "cancelling", "completed", "failed", "cancelled"]);
export const LOCAL_RENDER_SCALE = 2 / 3;
const DEFAULT_LOCAL_RENDER_CONCURRENCY = "25%";
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const PERCENTAGE = /^(?:[1-9]\d?|100)%$/;

export function getLocalRenderConcurrency(env = {}) {
  const configured = env?.WAYDEAN_RENDER_CONCURRENCY;
  if (configured === undefined || configured.trim() === "") {
    return DEFAULT_LOCAL_RENDER_CONCURRENCY;
  }

  const value = configured.trim();
  if (POSITIVE_INTEGER.test(value) && Number.isSafeInteger(Number(value))) {
    return Number(value);
  }
  if (PERCENTAGE.test(value)) return value;
  throw new TypeError("Invalid render concurrency");
}

export function normalizeRenderSettings(input, validPersonIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Render settings must be an object");
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 80) throw new TypeError("Invalid render title");
  if (!scopes.has(input.scopeType)) throw new TypeError("Invalid render scope");
  if (typeof input.selectedPersonId !== "string" || !validPersonIds.has(input.selectedPersonId)) {
    throw new TypeError("Unknown render person");
  }
  if (typeof input.includeDates !== "boolean") throw new TypeError("Invalid date option");
  const aspectRatio = input.aspectRatio ?? DEFAULT_VIDEO_ASPECT_RATIO;
  if (!Object.hasOwn(VIDEO_FORMATS, aspectRatio)) throw new TypeError("Invalid aspect ratio");

  return {
    title,
    scopeType: input.scopeType,
    selectedPersonId: input.selectedPersonId,
    includeDates: input.includeDates,
    aspectRatio
  };
}

export function isValidRenderJobId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createPublicRenderJob(job, queuePosition = null) {
  const id = isValidRenderJobId(job?.id) ? job.id : "";
  const status = jobStatuses.has(job?.status) ? job.status : "failed";
  const rawProgress = Number(job?.progress);
  const progress = status === "completed"
    ? 100
    : Math.round(Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0)) * 100);
  const stage = typeof job?.stage === "string" ? job.stage : "Подготовка видео";

  return {
    id,
    status,
    progress,
    stage,
    queuePosition: status === "queued" ? queuePosition : null,
    actions: {
      cancel: ["queued", "bundling", "rendering"].includes(status),
      retry: status === "failed" || status === "cancelled"
    },
    downloadUrl: status === "completed" && id ? `/api/render/${id}/download` : null,
    error: status === "failed" ? (typeof job?.error === "string" ? job.error.slice(0, 200) : "Не удалось сформировать видео. Задание можно повторить.") : null
  };
}
