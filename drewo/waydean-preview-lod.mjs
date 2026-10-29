const DETAIL_TO_COMPACT = 58;
const COMPACT_TO_DETAIL = 64;
const COMPACT_TO_OVERVIEW = 34;
const OVERVIEW_TO_COMPACT = 40;

export function getOverviewMarkerWorldSize(zoom) {
  const scale = Number(zoom);
  if (!Number.isFinite(scale) || scale <= 0) return 8;
  const desiredSize = Math.min(8, Math.max(3, scale * 100));
  return desiredSize / scale;
}

/** Quantize only miniature-card styling so pinch transforms do not recalculate six CSS vars every frame. */
export function getCameraLodStyleZoom(zoom) {
  const scale = Number(zoom);
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  const step = Math.log(1.05);
  return Math.exp(Math.round(Math.log(scale) / step) * step);
}

export function getOverviewCardWorldSize(zoom) {
  const scale = Number(zoom);
  if (!Number.isFinite(scale) || scale <= 0) return { width: 8, height: 5.6 };
  const screenSize = getOverviewMarkerWorldSize(scale);
  return { width: screenSize * 1.5, height: screenSize * 0.7 };
}

export function getOverviewLineWorldWidth(zoom, screenWidth = 1.2) {
  const scale = Number(zoom);
  const desiredWidth = Number(screenWidth);
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(desiredWidth) || desiredWidth <= 0) return 1.2;
  return desiredWidth / scale;
}

export function getConnectorCardHeight(level, cardHeight) {
  const height = Number(cardHeight);
  if (!Number.isFinite(height) || height < 0) return 0;
  // Overview silhouettes are painted over the connector layer. Extend each
  // connector to the node center so its visible end meets the small silhouette.
  return level === 'overview' ? 0 : height;
}

export function compactRouteClass(personId, routePeople) {
  return routePeople?.has(personId) ? ' route' : '';
}

/** Choose a visual detail level from the rendered card width, with hysteresis. */
export function nextLodLevel(currentLevel, renderedCardWidth) {
  if (!Number.isFinite(renderedCardWidth)) return 'detail';

  if (currentLevel === 'overview') {
    if (renderedCardWidth > COMPACT_TO_DETAIL) return 'detail';
    if (renderedCardWidth > OVERVIEW_TO_COMPACT) return 'compact';
    return 'overview';
  }

  if (currentLevel === 'compact') {
    if (renderedCardWidth < COMPACT_TO_OVERVIEW) return 'overview';
    if (renderedCardWidth > COMPACT_TO_DETAIL) return 'detail';
    return 'compact';
  }

  if (renderedCardWidth < COMPACT_TO_OVERVIEW) return 'overview';
  if (renderedCardWidth < DETAIL_TO_COMPACT) return 'compact';
  return 'detail';
}
