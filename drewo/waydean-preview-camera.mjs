const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function wheelZoomFactor(deltaY) {
  return Math.exp(-clamp(deltaY, -120, 120) * 0.001);
}

export function cameraLayout(viewWidth, viewHeight, graphWidth, graphHeight, zoom) {
  const scaledWidth = graphWidth * zoom;
  const scaledHeight = graphHeight * zoom;
  return {
    extentWidth: Math.max(viewWidth, scaledWidth),
    extentHeight: Math.max(viewHeight, scaledHeight),
    offsetX: Math.max(0, (viewWidth - scaledWidth) / 2),
    offsetY: Math.max(0, (viewHeight - scaledHeight) / 2)
  };
}

export function readableFitZoom(viewWidth, viewHeight, graphWidth, graphHeight, { minimumZoom } = {}) {
  const minZoom = minimumZoom ?? (viewWidth <= 700 ? 0.9 : 0.7);
  const factor = Math.min(
    (viewWidth - 32) / Math.max(graphWidth, 1),
    (viewHeight - 32) / Math.max(graphHeight, 1),
    1
  );
  return Math.round(clamp(factor, minZoom, 1) * 100) / 100;
}

export function zoomAroundAnchor({
  previousZoom, nextZoom, scrollLeft, scrollTop, anchorX, anchorY,
  previousOffsetX, previousOffsetY, nextOffsetX, nextOffsetY,
  maxScrollLeft, maxScrollTop
}) {
  const worldX = (scrollLeft + anchorX - previousOffsetX) / previousZoom;
  const worldY = (scrollTop + anchorY - previousOffsetY) / previousZoom;
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
