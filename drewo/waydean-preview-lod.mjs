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

export function getOverviewLineWorldWidth(zoom, screenWidth = 1.2) {
  const scale = Number(zoom);
  const desiredWidth = Number(screenWidth);
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(desiredWidth) || desiredWidth <= 0) return 1.2;
  return desiredWidth / scale;
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
