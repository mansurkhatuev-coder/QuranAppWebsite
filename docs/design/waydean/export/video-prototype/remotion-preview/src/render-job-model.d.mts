import type { VideoAspectRatio } from "./composition-config.mjs";

export type RenderSettings = {
  title: string;
  scopeType: "all" | "path" | "branch";
  selectedPersonId: string;
  includeDates: boolean;
  aspectRatio: VideoAspectRatio;
};

export type RenderJobStatus = "queued" | "bundling" | "rendering" | "cancelling" | "completed" | "failed" | "cancelled";

export type PublicRenderJob = {
  id: string;
  status: RenderJobStatus;
  progress: number;
  stage: string;
  queuePosition: number | null;
  actions: { cancel: boolean; retry: boolean };
  downloadUrl: string | null;
  error: string | null;
};

export const LOCAL_RENDER_SCALE: number;
export function getLocalRenderConcurrency(env?: Record<string, string | undefined>): number | string;
export function normalizeRenderSettings(input: unknown, validPersonIds: ReadonlySet<string>): RenderSettings;
export function isValidRenderJobId(value: unknown): boolean;
export function createPublicRenderJob(job: {
  id?: string;
  status?: RenderJobStatus | string;
  progress?: number;
  stage?: string;
  error?: string | null;
}, queuePosition?: number | null): PublicRenderJob;
