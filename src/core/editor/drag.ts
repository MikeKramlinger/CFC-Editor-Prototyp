import type { CfcNode } from "../../model.js";

export interface DragNodeSnapshot {
  nodeId: string;
  startXUnits: number;
  startYUnits: number;
}

export interface DragState {
  startPointerXUnits: number;
  startPointerYUnits: number;
  minStartXUnits: number;
  minStartYUnits: number;
  nodes: DragNodeSnapshot[];
}

export const createGroupDragState = (
  nodes: CfcNode[],
  startPointerXUnits: number,
  startPointerYUnits: number,
): DragState | null => {
  if (nodes.length === 0) {
    return null;
  }

  return {
    startPointerXUnits,
    startPointerYUnits,
    minStartXUnits: Math.min(...nodes.map((entry) => entry.x)),
    minStartYUnits: Math.min(...nodes.map((entry) => entry.y)),
    nodes: nodes.map((entry) => ({
      nodeId: entry.id,
      startXUnits: entry.x,
      startYUnits: entry.y,
    })),
  };
};

export const computeGroupDragDelta = (
  dragState: DragState,
  pointerXUnits: number,
  pointerYUnits: number,
  snapToGrid: (value: number) => number,
): { deltaXUnits: number; deltaYUnits: number } => {
  const rawDeltaXUnits = pointerXUnits - dragState.startPointerXUnits;
  const rawDeltaYUnits = pointerYUnits - dragState.startPointerYUnits;

  const clampedDeltaXUnits = Math.max(rawDeltaXUnits, -dragState.minStartXUnits);
  const clampedDeltaYUnits = Math.max(rawDeltaYUnits, -dragState.minStartYUnits);

  return {
    deltaXUnits: snapToGrid(clampedDeltaXUnits),
    deltaYUnits: snapToGrid(clampedDeltaYUnits),
  };
};
