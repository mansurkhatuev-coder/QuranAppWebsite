const ALIGNMENT_ANCHORS = [0.5, 0, 1];

export function getPagePersonIds(layout, pageNumber) {
  return (layout?.placements ?? [])
    .filter(placement => placement.pageNumber === pageNumber)
    .map(placement => placement.person.id);
}

export function excludePagePersonIds(excludedIds, layout, pageNumber) {
  const nextExcludedIds = new Set(excludedIds ?? []);
  getPagePersonIds(layout, pageNumber).forEach(id => nextExcludedIds.add(id));
  return nextExcludedIds;
}

export function restorePageExclusions(excludedIds, savedScopeKey, currentScopeKey, validPersonIds) {
  if (savedScopeKey !== currentScopeKey) return new Set();
  const validIds = validPersonIds instanceof Set ? validPersonIds : new Set(validPersonIds ?? []);
  return new Set((excludedIds ?? []).filter(id => validIds.has(id)));
}

function nearestAlignment(moving, peers, threshold, axis) {
  const position = axis === "x" ? "x" : "y";
  const size = axis === "x" ? "width" : "height";
  let best = null;

  for (const peer of peers) {
    for (const movingAnchor of ALIGNMENT_ANCHORS) {
      for (const peerAnchor of ALIGNMENT_ANCHORS) {
        const delta = peer[position] + peer[size] * peerAnchor - (moving[position] + moving[size] * movingAnchor);
        const distance = Math.abs(delta);
        if (distance > threshold || (best && distance >= best.distance)) continue;
        best = { delta, distance, guide: peer[position] + peer[size] * peerAnchor };
      }
    }
  }

  return best;
}

export function snapPlacementToPeers(moving, peers, threshold = 2) {
  const safePeers = Array.isArray(peers) ? peers : [];
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : 0;
  const horizontal = nearestAlignment(moving, safePeers, safeThreshold, "x");
  const vertical = nearestAlignment(moving, safePeers, safeThreshold, "y");
  const guides = {};
  if (horizontal) guides.x = horizontal.guide;
  if (vertical) guides.y = vertical.guide;
  return {
    x: moving.x + (horizontal?.delta ?? 0),
    y: moving.y + (vertical?.delta ?? 0),
    guides
  };
}
