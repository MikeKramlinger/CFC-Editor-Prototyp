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

export const getExecutionOrderByNodeId = (nodes: CfcNode[], nodeId: string): number | null => {
  const executableNodes = nodes.filter(isExecutionOrderedNode);
  const executionIndex = executableNodes.findIndex((node) => node.id === nodeId);
  if (executionIndex < 0) {
    return null;
  }
  return executionIndex + 1;
};

export const swapNodeExecutionOrder = (nodes: CfcNode[], nodeId: string, nextOrder: number): CfcNode[] => {
  const executableNodes = nodes.filter(isExecutionOrderedNode);
  const currentExecutableIndex = executableNodes.findIndex((node) => node.id === nodeId);
  if (currentExecutableIndex < 0) {
    return nodes;
  }

  const clampedOrder = Math.max(1, Math.min(executableNodes.length, Math.round(nextOrder)));
  const targetExecutableIndex = clampedOrder - 1;
  if (targetExecutableIndex === currentExecutableIndex) {
    return nodes;
  }

  const currentNode = executableNodes[currentExecutableIndex];
  const targetNode = executableNodes[targetExecutableIndex];
  if (!currentNode || !targetNode) {
    return nodes;
  }

  const currentGraphIndex = nodes.findIndex((node) => node.id === currentNode.id);
  const targetGraphIndex = nodes.findIndex((node) => node.id === targetNode.id);
  if (currentGraphIndex < 0 || targetGraphIndex < 0) {
    return nodes;
  }

  const nextNodes = [...nodes];
  const currentGraphNode = nextNodes[currentGraphIndex];
  const targetGraphNode = nextNodes[targetGraphIndex];
  if (!currentGraphNode || !targetGraphNode) {
    return nodes;
  }

  nextNodes[currentGraphIndex] = targetGraphNode;
  nextNodes[targetGraphIndex] = currentGraphNode;
  return nextNodes;
};
