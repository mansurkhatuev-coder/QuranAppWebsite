const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const MIN_DESKTOP_ZOOM = 0.08;
export const MIN_MOBILE_ZOOM = 0.01;
export const MAX_ZOOM = 3.2;

export function clampZoom(value, { minimum = MIN_DESKTOP_ZOOM, maximum = MAX_ZOOM } = {}) {
  return Math.round(clamp(Number(value) || 0, minimum, maximum) * 1000) / 1000;
}

export function createFrameCoalescer(requestFrame, callback) {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    requestFrame(() => {
      scheduled = false;
      callback();
    });
  };
}

export function wheelZoomFactor(deltaY) {
  if (deltaY === 0) return 1;
  return deltaY < 0 ? 1.1 : 1 / 1.1;
}

export function cameraLayout(viewWidth, viewHeight, graphWidth, graphHeight, zoom) {
  const scaledWidth = graphWidth * zoom;
  const scaledHeight = graphHeight * zoom;
  // Always leave half a viewport of working space around the tree. A short
  // tree can still have a person on its top, bottom, left, or right edge that
  // should be movable to the center of the screen.
  const offsetX = viewWidth / 2;
  const offsetY = viewHeight / 2;
  return {
    extentWidth: scaledWidth + viewWidth,
    extentHeight: scaledHeight + viewHeight,
    offsetX,
    offsetY
  };
}

export function readableFitZoom(viewWidth, viewHeight, graphWidth, graphHeight, { minimumZoom } = {}) {
  const minZoom = minimumZoom ?? (viewWidth <= 700 ? MIN_MOBILE_ZOOM : 0.06);
  const factor = Math.min(
    (viewWidth - 32) / Math.max(graphWidth, 1),
    (viewHeight - 32) / Math.max(graphHeight, 1),
    1
  );
  return Math.round(clamp(factor, minZoom, 1) * 100) / 100;
}

export function zoomAroundAnchor({
  previousZoom, nextZoom, scrollLeft, scrollTop, anchorX, anchorY,
  previousAnchorX = anchorX, previousAnchorY = anchorY,
  previousOffsetX, previousOffsetY, nextOffsetX, nextOffsetY,
  maxScrollLeft, maxScrollTop
}) {
  const worldX = (scrollLeft + previousAnchorX - previousOffsetX) / previousZoom;
  const worldY = (scrollTop + previousAnchorY - previousOffsetY) / previousZoom;
  return {
    left: clamp(nextOffsetX + worldX * nextZoom - anchorX, 0, maxScrollLeft),
    top: clamp(nextOffsetY + worldY * nextZoom - anchorY, 0, maxScrollTop)
  };
}

function miniMapProjection(graphWidth, graphHeight) {
  const scale = Math.min(164 / Math.max(graphWidth, 1), 56 / Math.max(graphHeight, 1));
  return {
    scale,
    originX: 8 + (164 - graphWidth * scale) / 2,
    originY: 8 + (56 - graphHeight * scale) / 2
  };
}

export function miniMapViewport({
  graphWidth, graphHeight, zoom, scrollLeft, scrollTop,
  viewWidth, viewHeight, offsetX, offsetY
}) {
  const projection = miniMapProjection(graphWidth, graphHeight);
  const worldLeft = clamp((scrollLeft - offsetX) / zoom, 0, graphWidth);
  const worldTop = clamp((scrollTop - offsetY) / zoom, 0, graphHeight);
  const worldRight = clamp((scrollLeft + viewWidth - offsetX) / zoom, 0, graphWidth);
  const worldBottom = clamp((scrollTop + viewHeight - offsetY) / zoom, 0, graphHeight);
  return {
    ...projection,
    x: projection.originX + worldLeft * projection.scale,
    y: projection.originY + worldTop * projection.scale,
    width: Math.max(0, worldRight - worldLeft) * projection.scale,
    height: Math.max(0, worldBottom - worldTop) * projection.scale
  };
}

export function miniMapScrollTarget({
  miniX, miniY, graphWidth, graphHeight, zoom,
  viewWidth, viewHeight, offsetX, offsetY
}) {
  const projection = miniMapProjection(graphWidth, graphHeight);
  const layout = cameraLayout(viewWidth, viewHeight, graphWidth, graphHeight, zoom);
  const worldX = clamp((miniX - projection.originX) / projection.scale, 0, graphWidth);
  const worldY = clamp((miniY - projection.originY) / projection.scale, 0, graphHeight);
  return {
    left: clamp(offsetX + worldX * zoom - viewWidth / 2, 0, layout.extentWidth - viewWidth),
    top: clamp(offsetY + worldY * zoom - viewHeight / 2, 0, layout.extentHeight - viewHeight)
  };
}
