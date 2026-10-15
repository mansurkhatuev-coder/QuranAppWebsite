export function getPreviewPlaybackFrame({ startFrame, elapsedMs, sourceFps, totalFrames }) {
  const lastFrame = Math.max(0, Math.trunc(Number(totalFrames) || 0) - 1);
  const start = Math.min(lastFrame, Math.max(0, Math.trunc(Number(startFrame) || 0)));
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const fps = Math.max(1, Number(sourceFps) || 30);
  return Math.min(lastFrame, start + Math.floor(elapsed * fps / 1000));
}
