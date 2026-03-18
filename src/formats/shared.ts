import {
  DEFAULT_NODE_TYPE,
  getNodeTemplateByType,
  isCfcNodeType,
  type CfcConnection,
  type CfcGraph,
  type CfcNode,
} from "../model.js";
import { getExecutionOrderByNodeId, isExecutionOrderedNode } from "../core/graph/executionOrder.js";

export const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toStringValue = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
};

export const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const normalizePort = (value: unknown, kind: "input" | "output"): string => {
  if (typeof value !== "string" || value.length === 0) {
    return `${kind}:0`;
  }

  if (value === kind) {
    return `${kind}:0`;
  }

  const match = value.match(new RegExp(`^${kind}:(\\d+)$`));
  if (!match) {
    return `${kind}:0`;
  }

  return `${kind}:${Number.parseInt(match[1] ?? "0", 10)}`;
};

export interface ParsedNodeEntry {
  node: CfcNode;
  executionOrder: number;
  sourceIndex: number;
}

export const parseNodeEntry = (entry: unknown, index: number): ParsedNodeEntry | null => {
  if (!isObjectRecord(entry)) {
    return null;
  }

  const rawType = toStringValue(entry.type, DEFAULT_NODE_TYPE);
  const type = isCfcNodeType(rawType) ? rawType : DEFAULT_NODE_TYPE;
  const template = getNodeTemplateByType(type);
  const executionOrder = Math.max(1, Math.floor(toFiniteNumber(entry.executionOrder, index + 1)));
  const width = Math.max(template.width, toFiniteNumber(entry.width, template.width));
  const height = Math.max(template.height, toFiniteNumber(entry.height, template.height));

  return {
    node: {
      id: toStringValue(entry.id, `N${index + 1}`),
      type,
      label: toStringValue(entry.label, "Block"),
      x: toFiniteNumber(entry.x),
      y: toFiniteNumber(entry.y),
      width,
      height,
    },
    executionOrder,
    sourceIndex: index,
  };
};

export const parseConnectionEntry = (entry: unknown, index: number): CfcConnection | null => {
  if (!isObjectRecord(entry)) {
    return null;
  }

  return {
    id: toStringValue(entry.id, `C${index + 1}`),
    fromNodeId: toStringValue(entry.fromNodeId, ""),
    fromPort: normalizePort(entry.fromPort, "output"),
    toNodeId: toStringValue(entry.toNodeId, ""),
    toPort: normalizePort(entry.toPort, "input"),
  };
};

export const sortParsedNodeEntries = (entries: ParsedNodeEntry[]): ParsedNodeEntry[] => {
  return [...entries].sort((left, right) => {
    if (left.executionOrder !== right.executionOrder) {
      return left.executionOrder - right.executionOrder;
    }
    return left.sourceIndex - right.sourceIndex;
  });
};

export const buildOrderedNodesFromRaw = (nodesRaw: unknown[]): CfcNode[] => {
  return sortParsedNodeEntries(
    nodesRaw
      .map((entry, index) => parseNodeEntry(entry, index))
      .filter((entry): entry is ParsedNodeEntry => entry !== null),
  ).map((entry) => entry.node);
};

export const buildValidConnectionsFromRaw = (connectionsRaw: unknown[], nodeIds: Set<string>): CfcConnection[] => {
  return connectionsRaw
    .map((entry, index) => parseConnectionEntry(entry, index))
    .filter((entry): entry is CfcConnection => entry !== null)
    .filter((connection) => nodeIds.has(connection.fromNodeId) && nodeIds.has(connection.toNodeId));
};

export const toExecutionOrderedSerializableGraph = (
  graph: CfcGraph,
): { version: string; nodes: Array<Record<string, unknown>>; connections: CfcConnection[] } => {
  return {
    version: graph.version,
    nodes: graph.nodes.map((node) => {
      const template = getNodeTemplateByType(node.type);
      const width = Math.max(template.width, toFiniteNumber(node.width, template.width));
      const height = Math.max(template.height, toFiniteNumber(node.height, template.height));
      const entry: Record<string, unknown> = {
        id: node.id,
        type: node.type,
        label: node.label,
        x: node.x,
        y: node.y,
        width,
        height,
      };
      if (isExecutionOrderedNode(node)) {
        const executionOrder = getExecutionOrderByNodeId(graph.nodes, node.id);
        if (executionOrder !== null) {
          entry.executionOrder = executionOrder;
        }
      }
      return entry;
    }),
    connections: graph.connections,
  };
};
