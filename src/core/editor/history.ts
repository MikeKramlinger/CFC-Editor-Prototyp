import { cloneGraph, type CfcGraph } from "../../model.js";

const areNodesEqual = (left: CfcGraph["nodes"][number], right: CfcGraph["nodes"][number]): boolean => {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.label === right.label &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
};

const areConnectionsEqual = (
  left: CfcGraph["connections"][number],
  right: CfcGraph["connections"][number],
): boolean => {
  return (
    left.id === right.id &&
    left.fromNodeId === right.fromNodeId &&
    left.fromPort === right.fromPort &&
    left.toNodeId === right.toNodeId &&
    left.toPort === right.toPort
  );
};

export const areGraphsEqual = (left: CfcGraph, right: CfcGraph): boolean => {
  if (left.version !== right.version) {
    return false;
  }

  if (left.nodes.length !== right.nodes.length || left.connections.length !== right.connections.length) {
    return false;
  }

  for (let index = 0; index < left.nodes.length; index += 1) {
    const leftNode = left.nodes[index];
    const rightNode = right.nodes[index];
    if (!leftNode || !rightNode || !areNodesEqual(leftNode, rightNode)) {
      return false;
    }
  }

  for (let index = 0; index < left.connections.length; index += 1) {
    const leftConnection = left.connections[index];
    const rightConnection = right.connections[index];
    if (!leftConnection || !rightConnection || !areConnectionsEqual(leftConnection, rightConnection)) {
      return false;
    }
  }

  return true;
};

export interface GraphHistory {
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  commit: (before: CfcGraph, after: CfcGraph) => boolean;
  undo: (current: CfcGraph) => CfcGraph | null;
  redo: (current: CfcGraph) => CfcGraph | null;
}

export const createGraphHistory = (limit = 100): GraphHistory => {
  const safeLimit = Math.max(1, Math.floor(limit));
  const past: CfcGraph[] = [];
  const future: CfcGraph[] = [];

  const pushPast = (graph: CfcGraph): void => {
    past.push(cloneGraph(graph));
    if (past.length > safeLimit) {
      past.shift();
    }
  };

  const pushFuture = (graph: CfcGraph): void => {
    future.push(cloneGraph(graph));
    if (future.length > safeLimit) {
      future.shift();
    }
  };

  return {
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear: () => {
      past.length = 0;
      future.length = 0;
    },
    commit: (before, after) => {
      if (areGraphsEqual(before, after)) {
        return false;
      }
      pushPast(before);
      future.length = 0;
      return true;
    },
    undo: (current) => {
      const previous = past.pop();
      if (!previous) {
        return null;
      }
      pushFuture(current);
      return cloneGraph(previous);
    },
    redo: (current) => {
      const next = future.pop();
      if (!next) {
        return null;
      }
      pushPast(current);
      return cloneGraph(next);
    },
  };
};
