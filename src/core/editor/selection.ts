export interface SelectionRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface BoundsRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const createSelectionRect = (startX: number, startY: number, currentX: number, currentY: number): SelectionRect => {
  return {
    left: Math.min(startX, currentX),
    right: Math.max(startX, currentX),
    top: Math.min(startY, currentY),
    bottom: Math.max(startY, currentY),
  };
};

export const toSelectionBoxSize = (rect: SelectionRect): { width: number; height: number } => {
  return {
    width: Math.max(1, rect.right - rect.left),
    height: Math.max(1, rect.bottom - rect.top),
  };
};

export const intersectsSelectionRect = (bounds: BoundsRect, rect: SelectionRect): boolean => {
  return !(bounds.right < rect.left || bounds.left > rect.right || bounds.bottom < rect.top || bounds.top > rect.bottom);
};
