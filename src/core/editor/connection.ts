export type ConnectionPortKind = "input" | "output";

export interface ConnectionDragState {
  fromNodeId: string;
  fromPort: string;
  fromPortKind: ConnectionPortKind;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  currentClientX: number;
  currentClientY: number;
}

export interface ConnectionDropTarget {
  nodeId: string;
  portId: string;
}

export const createConnectionDragState = (
  fromNodeId: string,
  fromPort: string,
  fromPortKind: ConnectionPortKind,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  currentClientX: number,
  currentClientY: number,
): ConnectionDragState => {
  return {
    fromNodeId,
    fromPort,
    fromPortKind,
    startX,
    startY,
    currentX,
    currentY,
    currentClientX,
    currentClientY,
  };
};

export const updateConnectionDragState = (
  state: ConnectionDragState,
  nextX: number,
  nextY: number,
  nextClientX: number,
  nextClientY: number,
): ConnectionDragState => {
  return {
    ...state,
    currentX: nextX,
    currentY: nextY,
    currentClientX: nextClientX,
    currentClientY: nextClientY,
  };
};

export const extractInputPortDropTarget = (dropTarget: Element | null): ConnectionDropTarget | null => {
  return extractPortDropTarget(dropTarget, "input");
};

export const extractOutputPortDropTarget = (dropTarget: Element | null): ConnectionDropTarget | null => {
  return extractPortDropTarget(dropTarget, "output");
};

const extractPortDropTarget = (dropTarget: Element | null, kind: ConnectionPortKind): ConnectionDropTarget | null => {
  const port = dropTarget?.closest(`.cfc-port--${kind}`) as HTMLElement | null;
  if (!port) {
    return null;
  }

  const nodeId = port.dataset.nodeId;
  if (!nodeId) {
    return null;
  }

  return {
    nodeId,
    portId: port.dataset.portId ?? `${kind}:0`,
  };
};
