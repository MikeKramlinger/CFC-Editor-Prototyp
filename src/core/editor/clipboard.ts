import type { CfcGraph, CfcNode } from "../../model.js";

export interface GraphClipboard {
  nodes: CfcNode[];
  connections: Array<Pick<CfcGraph["connections"][number], "fromNodeId" | "fromPort" | "toNodeId" | "toPort">>;
  pasteCount: number;
}

export interface ClipboardPasteContext {
  pasteCount: number;
  translationX: number;
  translationY: number;
}

interface NodeRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const createGraphClipboard = (graph: CfcGraph, selectedNodeIds: Set<string>): GraphClipboard | null => {
  if (selectedNodeIds.size === 0) {
    return null;
  }

  const selectedNodes = graph.nodes.filter((node) => selectedNodeIds.has(node.id));
  if (selectedNodes.length === 0) {
    return null;
  }

  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const internalConnections = graph.connections
    .filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId))
    .map((connection) => ({
      fromNodeId: connection.fromNodeId,
      fromPort: connection.fromPort,
      toNodeId: connection.toNodeId,
      toPort: connection.toPort,
    }));

  return {
    nodes: selectedNodes.map((node) => ({ ...node })),
    connections: internalConnections,
    pasteCount: 0,
  };
};

export const getClipboardPasteContext = (
  clipboard: GraphClipboard,
  cursorUnits: { x: number; y: number } | null,
): ClipboardPasteContext => {
  const pasteCount = clipboard.pasteCount + 1;
  const hasCursorTarget = cursorUnits !== null;
  const cascadeOffsetUnits = hasCursorTarget ? 0 : pasteCount;

  const sourceLeft = Math.min(...clipboard.nodes.map((node) => node.x));
  const sourceTop = Math.min(...clipboard.nodes.map((node) => node.y));
  const sourceRight = Math.max(...clipboard.nodes.map((node) => node.x + node.width));
  const sourceBottom = Math.max(...clipboard.nodes.map((node) => node.y + node.height));
  const sourceCenterX = (sourceLeft + sourceRight) / 2;
  const sourceCenterY = (sourceTop + sourceBottom) / 2;

  const targetCenterX = (cursorUnits?.x ?? sourceCenterX) + cascadeOffsetUnits;
  const targetCenterY = (cursorUnits?.y ?? sourceCenterY) + cascadeOffsetUnits;

  return {
    pasteCount,
    translationX: hasCursorTarget ? targetCenterX - sourceCenterX : cascadeOffsetUnits,
    translationY: hasCursorTarget ? targetCenterY - sourceCenterY : cascadeOffsetUnits,
  };
};

const clampUnitToNonNegative = (value: number): number => Math.max(0, value);

const doNodeRectsOverlap = (firstRect: NodeRect, secondRect: NodeRect): boolean => {
  return !(
    firstRect.right <= secondRect.left ||
    firstRect.left >= secondRect.right ||
    firstRect.bottom <= secondRect.top ||
    firstRect.top >= secondRect.bottom
  );
};

const doesPastePlacementCollide = (
  clipboardNodes: CfcNode[],
  existingNodes: Array<Pick<CfcNode, "x" | "y" | "width" | "height">>,
  translationX: number,
  translationY: number,
): boolean => {
  return clipboardNodes.some((sourceNode) => {
    const pastedNodeRect = {
      left: clampUnitToNonNegative(sourceNode.x + translationX),
      right: clampUnitToNonNegative(sourceNode.x + translationX) + sourceNode.width,
      top: clampUnitToNonNegative(sourceNode.y + translationY),
      bottom: clampUnitToNonNegative(sourceNode.y + translationY) + sourceNode.height,
    };

    return existingNodes.some((existingNode) => {
      const existingNodeRect = {
        left: existingNode.x,
        right: existingNode.x + existingNode.width,
        top: existingNode.y,
        bottom: existingNode.y + existingNode.height,
      };

      return doNodeRectsOverlap(pastedNodeRect, existingNodeRect);
    });
  });
};

export const resolveClipboardPasteTranslation = (
  clipboardNodes: CfcNode[],
  existingNodes: Array<Pick<CfcNode, "x" | "y" | "width" | "height">>,
  preferredTranslationX: number,
  preferredTranslationY: number,
): { translationX: number; translationY: number } => {
  if (!doesPastePlacementCollide(clipboardNodes, existingNodes, preferredTranslationX, preferredTranslationY)) {
    return {
      translationX: preferredTranslationX,
      translationY: preferredTranslationY,
    };
  }

  const maxOffset = 500;
  for (let offsetUnits = 1; offsetUnits <= maxOffset; offsetUnits += 1) {
    const translationX = preferredTranslationX + offsetUnits;
    const translationY = preferredTranslationY + offsetUnits;

    if (!doesPastePlacementCollide(clipboardNodes, existingNodes, translationX, translationY)) {
      return { translationX, translationY };
    }
  }

  return {
    translationX: preferredTranslationX,
    translationY: preferredTranslationY,
  };
};
