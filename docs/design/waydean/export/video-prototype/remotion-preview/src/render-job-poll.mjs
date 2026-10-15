const ACTIVE_STATUSES = new Set(["queued", "bundling", "rendering", "cancelling"]);

export function summarizeSuccessfulRenderPoll(jobs, { checkingDownloadId = null } = {}) {
  const checkingDownload = Boolean(checkingDownloadId && jobs.some(
    job => job.id === checkingDownloadId && job.status === "completed"
  ));
  return {
    jobs,
    error: "",
    checkingDownload,
    shouldContinue: checkingDownload || jobs.some(job => ACTIVE_STATUSES.has(job.status))
  };
}
