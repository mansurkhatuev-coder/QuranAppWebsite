import type { PublicRenderJob } from "./render-job-model.mjs";

export function summarizeSuccessfulRenderPoll(
  jobs: PublicRenderJob[],
  options?: { checkingDownloadId?: string | null }
): {
  jobs: PublicRenderJob[];
  error: string;
  checkingDownload: boolean;
  shouldContinue: boolean;
};
