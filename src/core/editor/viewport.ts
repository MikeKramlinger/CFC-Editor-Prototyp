export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasRectLike {
  left: number;
  top: number;
}

export const clampZoom = (value: number): number => {
  return Math.min(2, Math.max(0.1, value));
};

export const clampPanToPositiveArea = (panX: number, panY: number): { panX: number; panY: number } => {
  return {
    panX: Math.min(0, panX),
    panY: Math.min(0, panY),
  };
};

export const clientToGraphPx = (
  clientX: number,
  clientY: number,
  rect: CanvasRectLike,
  viewport: ViewportState,
): { x: number; y: number } => {
  return {
    x: (clientX - rect.left - viewport.panX) / viewport.zoom,
    y: (clientY - rect.top - viewport.panY) / viewport.zoom,
  };
};

export const computeZoomAtClient = (
  delta: number,
  clientX: number,
  clientY: number,
  rect: CanvasRectLike,
  viewport: ViewportState,
): ViewportState => {
  const graphPoint = clientToGraphPx(clientX, clientY, rect, viewport);
  const nextZoom = Math.round(clampZoom(viewport.zoom + delta) * 100) / 100;
  if (nextZoom === viewport.zoom) {
    return viewport;
  }

  const panX = clientX - rect.left - graphPoint.x * nextZoom;
  const panY = clientY - rect.top - graphPoint.y * nextZoom;
  const clampedPan = clampPanToPositiveArea(panX, panY);

  return {
    zoom: nextZoom,
    panX: clampedPan.panX,
    panY: clampedPan.panY,
  };
};
