import type { CfcNode } from "../../model.js";

const EXECUTION_ORDER_EXCLUDED_NODE_TYPES = new Set<CfcNode["type"]>([
  "input",
  "selector",
  "comment",
  "connection-mark-source",
  "connection-mark-sink",
]);

export const isExecutionOrderedNode = (node: CfcNode): boolean =>
  !EXECUTION_ORDER_EXCLUDED_NODE_TYPES.has(node.type);

export const getExecutionOrderedNodeCount = (nodes: CfcNode[]): number => {
  return nodes.filter(isExecutionOrderedNode).length;
};

export const getNextExecutionOrder = (nodes: CfcNode[]): number => {
  const currentMax = nodes.reduce((maxOrder, node) => {
    if (!isExecutionOrderedNode(node)) {
      return maxOrder;
    }

    const nodeOrder = typeof node.executionOrder === "number" ? Math.max(1, Math.floor(node.executionOrder)) : 0;
    return Math.max(maxOrder, nodeOrder);
  }, 0);

  return currentMax + 1;
};

const getNormalizedExecutionOrder = (node: CfcNode, sourceIndex: number): number => {
  if (typeof node.executionOrder === "number") {
    return Math.max(1, Math.floor(node.executionOrder));
  }
  return sourceIndex + 1;
};

const getOrderedExecutionNodes = (nodes: CfcNode[]): Array<{ node: CfcNode; sourceIndex: number }> => {
  return nodes
    .map((node, sourceIndex) => ({ node, sourceIndex }))
    .filter(({ node }) => isExecutionOrderedNode(node))
    .sort((left, right) => {
      const leftOrder = getNormalizedExecutionOrder(left.node, left.sourceIndex);
      const rightOrder = getNormalizedExecutionOrder(right.node, right.sourceIndex);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.sourceIndex - right.sourceIndex;
    });
};

export const normalizeExecutionOrders = (nodes: CfcNode[]): CfcNode[] => {
  const orderedNodes = getOrderedExecutionNodes(nodes);
  if (orderedNodes.length === 0) {
    return nodes;
  }

  const orderByNodeId = new Map(orderedNodes.map((entry, index) => [entry.node.id, index + 1] as const));
  let changed = false;

  const nextNodes = nodes.map((node, sourceIndex) => {
    if (!isExecutionOrderedNode(node)) {
      return node;
    }

    const nextOrder = orderByNodeId.get(node.id);
    if (typeof nextOrder !== "number") {
      return node;
    }

    const currentOrder = getNormalizedExecutionOrder(node, sourceIndex);
    if (currentOrder === nextOrder) {
      return node;
    }

    changed = true;
    return {
      ...node,
      executionOrder: nextOrder,
    };
  });

  return changed ? nextNodes : nodes;
};

export const getExecutionOrderByNodeId = (nodes: CfcNode[], nodeId: string): number | null => {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !isExecutionOrderedNode(node)) {
    return null;
  }

  if (typeof node.executionOrder === "number") {
    return Math.max(1, Math.floor(node.executionOrder));
  }

  const executableNodes = nodes.filter(isExecutionOrderedNode);
  const executionIndex = executableNodes.findIndex((candidate) => candidate.id === nodeId);
  if (executionIndex < 0) {
    return null;
  }
  return executionIndex + 1;
};

export const swapNodeExecutionOrder = (nodes: CfcNode[], nodeId: string, nextOrder: number): CfcNode[] => {
  const executableNodes = getOrderedExecutionNodes(nodes);
  const currentNode = nodes.find((candidate) => candidate.id === nodeId);
  if (!currentNode || !isExecutionOrderedNode(currentNode)) {
    return nodes;
  }

  const clampedOrder = Math.max(1, Math.min(executableNodes.length, Math.round(nextOrder)));
  const currentOrder = executableNodes.findIndex((entry) => entry.node.id === nodeId);
  if (currentOrder < 0 || clampedOrder - 1 === currentOrder) {
    return normalizeExecutionOrders(nodes);
  }

  const nextExecutionNodes = [...executableNodes];
  const [movingNode] = nextExecutionNodes.splice(currentOrder, 1);
  if (!movingNode) {
    return nodes;
  }
  nextExecutionNodes.splice(clampedOrder - 1, 0, movingNode);

  const reorderedExecutableNodes = nextExecutionNodes.map((entry, index) => ({
    ...entry.node,
    executionOrder: index + 1,
  }));
  const nextExecutionNodesIterator = reorderedExecutableNodes[Symbol.iterator]();
  let changed = false;

  const nextNodes = nodes.map((node, sourceIndex) => {
    if (!isExecutionOrderedNode(node)) {
      return node;
    }

    const nextExecutionNode = nextExecutionNodesIterator.next().value as CfcNode | undefined;
    if (!nextExecutionNode) {
      return node;
    }

    const currentExecutionOrder = getNormalizedExecutionOrder(node, sourceIndex);
    if (node.id === nextExecutionNode.id && currentExecutionOrder === nextExecutionNode.executionOrder) {
      return node;
    }

    changed = true;
    return nextExecutionNode;
  });

  return changed ? nextNodes : nodes;
};
