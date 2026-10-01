const DETAIL_TO_COMPACT = 82;
const COMPACT_TO_DETAIL = 88;
const COMPACT_TO_OVERVIEW = 56;
const OVERVIEW_TO_COMPACT = 62;

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
