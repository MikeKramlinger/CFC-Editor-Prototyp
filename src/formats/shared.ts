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
  hasExplicitExecutionOrder: boolean;
  sourceIndex: number;
}

export const parseNodeEntry = (entry: unknown, index: number): ParsedNodeEntry | null => {
  if (!isObjectRecord(entry)) {
    return null;
  }

  let type = DEFAULT_NODE_TYPE;
  if (typeof entry.type === "string" && entry.type.length > 0) {
    if (!isCfcNodeType(entry.type)) {
      const nodeId = toStringValue(entry.id, `N${index + 1}`);
      throw new Error(`Ungültige Nodes: ungültiger type "${entry.type}" bei Node "${nodeId}".`);
    }
    type = entry.type;
  }
  const template = getNodeTemplateByType(type);
  const hasExplicitExecutionOrder = Object.prototype.hasOwnProperty.call(entry, "executionOrder");
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
    hasExplicitExecutionOrder,
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

const joinQuoted = (values: string[]): string => values.map((value) => `"${value}"`).join(", ");

const collectUniqueNodeIdError = (entries: ParsedNodeEntry[]): string | null => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  entries.forEach((entry) => {
    const id = entry.node.id;
    if (seen.has(id)) {
      duplicates.add(id);
      return;
    }
    seen.add(id);
  });

  if (duplicates.size > 0) {
    const duplicateIds = [...duplicates].sort((left, right) => left.localeCompare(right));
    return `id bereits belegt (${joinQuoted(duplicateIds)})`;
  }
  return null;
};

const collectExplicitExecutionOrderErrors = (entries: ParsedNodeEntry[]): string[] => {
  const errors: string[] = [];
  const explicitEntries = entries.filter((entry) => entry.hasExplicitExecutionOrder);
  if (explicitEntries.length === 0) {
    return errors;
  }

  const seenOrders = new Set<number>();
  const duplicateOrders = new Set<number>();
  explicitEntries.forEach((entry) => {
    if (seenOrders.has(entry.executionOrder)) {
      duplicateOrders.add(entry.executionOrder);
      return;
    }
    seenOrders.add(entry.executionOrder);
  });

  if (duplicateOrders.size > 0) {
    const duplicateOrderText = [...duplicateOrders].sort((left, right) => left - right).join(", ");
    errors.push(`executionOrder bereits belegt (${duplicateOrderText})`);
  }

  const sortedOrders = [...seenOrders].sort((left, right) => left - right);
  const isContinuous = sortedOrders.every((order, index) => order === index + 1);
  if (!isContinuous) {
    errors.push(
      `executionOrder muss durchgängig nummeriert sein (erwartet 1..${sortedOrders.length}, gefunden ${sortedOrders.join(", ")})`,
    );
  }
  return errors;
};

export const buildOrderedNodesFromRaw = (nodesRaw: unknown[]): CfcNode[] => {
  const entries = nodesRaw
    .map((entry, index) => parseNodeEntry(entry, index))
    .filter((entry): entry is ParsedNodeEntry => entry !== null);

  const validationErrors: string[] = [];
  const uniqueIdError = collectUniqueNodeIdError(entries);
  if (uniqueIdError) {
    validationErrors.push(uniqueIdError);
  }
  validationErrors.push(...collectExplicitExecutionOrderErrors(entries));
  if (validationErrors.length > 0) {
    throw new Error(`Ungültige Nodes: ${validationErrors.join(" | ")}.`);
  }

  return sortParsedNodeEntries(entries).map((entry) => entry.node);
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
