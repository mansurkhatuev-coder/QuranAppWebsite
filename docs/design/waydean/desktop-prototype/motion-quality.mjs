const DEFAULTS = Object.freeze({
  windowMs: 1000,
  slowFrameRatio: 0.2,
  slowFrameMultiplier: 1.5,
  minimumBaselineMs: 12,
  maximumBaselineMs: 1000 / 60
});

export function analyzeFrameWindow(samples, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const elapsedMs = options.elapsedMs ?? settings.windowMs;
  const intervals = samples.filter(value => Number.isFinite(value) && value > 0);
  const ordered = [...intervals].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2
    ? ordered[middle]
    : ordered.length ? (ordered[middle - 1] + ordered[middle]) / 2 : null;
  const measuredInterval = median == null
    ? null
    : Math.max(settings.minimumBaselineMs, Math.min(settings.maximumBaselineMs, median));
  const threshold = measuredInterval == null ? null : measuredInterval * settings.slowFrameMultiplier;
  const slowFrames = threshold == null ? 0 : intervals.filter(interval => interval > threshold).length;
  const overrunRatio = intervals.length ? slowFrames / intervals.length : 0;

  return {
    shouldDowngrade: elapsedMs >= settings.windowMs && intervals.length > 0 && overrunRatio > settings.slowFrameRatio,
    elapsedMs,
    frameCount: intervals.length,
    measuredInterval,
    threshold,
    slowFrames,
    overrunRatio
  };
}

export function nextLowerQuality(current) {
  if (current === "high") return "medium";
  if (current === "medium") return "low";
  return "low";
}
