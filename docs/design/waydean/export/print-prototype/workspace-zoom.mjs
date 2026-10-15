export const MIN_WORKSPACE_ZOOM = 0.001;
export const MAX_WORKSPACE_ZOOM = 4;

export function clampWorkspaceZoom(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return MIN_WORKSPACE_ZOOM;
  return Math.min(MAX_WORKSPACE_ZOOM, Math.max(MIN_WORKSPACE_ZOOM, zoom));
}

export function getViewportFitZoom({
  stageWidth,
  stageHeight,
  contentWidth,
  contentHeight,
  padding = 56,
  maxZoom = 1.5
}) {
  const values = [stageWidth, stageHeight, contentWidth, contentHeight, padding, maxZoom].map(Number);
  if (values.some(value => !Number.isFinite(value)) || contentWidth <= 0 || contentHeight <= 0) {
    return clampWorkspaceZoom(1);
  }

  const availableWidth = Math.max(120, stageWidth - padding);
  const availableHeight = Math.max(120, stageHeight - padding);
  return clampWorkspaceZoom(Math.min(maxZoom, availableWidth / contentWidth, availableHeight / contentHeight));
}
