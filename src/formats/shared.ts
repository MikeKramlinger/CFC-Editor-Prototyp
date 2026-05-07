import {
  DEFAULT_NODE_TYPE,
  getNodeTemplateByType,
  isCfcNodeType,
  type CfcConnection,
  type CfcGraph,
  type CfcNode,
  type CfcNodeType,
} from "../model.js";
import { fitNodeWidthToLabel } from "../core/editor/nodeSizing.js";
import { getExecutionOrderByNodeId, isExecutionOrderedNode } from "../core/graph/executionOrder.js";
import { generateDeclarations, type Variable } from "../declarations/index.js";

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

const SHORT_PORT_NODE_TYPES = new Set<CfcNodeType>([
  "input",
  "output",
  "jump",
  "return",
  "connection-mark-source",
  "connection-mark-sink",
]);

const getPortCountForKind = (type: CfcNodeType, kind: "input" | "output"): number => {
  const template = getNodeTemplateByType(type);
  return kind === "input" ? template.inputCount : template.outputCount;
};

export const canOmitPortReference = (type: CfcNodeType, kind: "input" | "output"): boolean => {
  if (!SHORT_PORT_NODE_TYPES.has(type)) {
    return false;
  }

  return getPortCountForKind(type, kind) === 1;
};

export const serializePort = (value: unknown, kind: "input" | "output", type?: CfcNodeType): string => {
  const normalized = normalizePort(value, kind);
  if (type && canOmitPortReference(type, kind) && normalized === `${kind}:0`) {
    return kind;
  }
  return normalized;
};

// Label field helpers: centralize mapping between internal `label` and
// exported/imported attribute names per node type.
export const getExportLabelFieldName = (type: CfcNodeType): string => {
  switch (type) {
    case "input":
    case "output":
      return "expression";
    case "box":
    case "box-en-eno":
      return "instanceName";
    case "jump":
    case "label":
      return "label";
    case "comment":
      return "content";
    case "composer":
    case "selector":
      return "text";
    case "connection-mark-source":
    case "connection-mark-sink":
      return "signal";
    default:
      return "label";
  }
};

export const getImportLabelValue = (record: Record<string, unknown>, type: CfcNodeType): string => {
  const fld = getExportLabelFieldName(type);
  const isBoxNode = type === "box" || type === "box-en-eno";

  if (fld === "instanceName") {
    // instanceName prefers sanitized declaration name
    return sanitizeDeclarationName(toStringValue(record.instanceName ?? record.label ?? record.declarationName, "Block")) || "Block";
  }

  if (fld === "expression") {
    return toStringValue(record.expression ?? record.label, "Block");
  }

  if (fld === "content") {
    return toStringValue(record.content ?? record.label, "Block");
  }

  if (fld === "text") {
    return toStringValue(record.text ?? record.label, "Block");
  }

  if (fld === "signal") {
    return toStringValue(record.signal ?? record.label, "Block");
  }

  // Fallback: label or other candidate fields
  return toStringValue(record.label ?? record.instanceName ?? record.expression ?? record.content ?? record.text ?? record.signal, "Block");
};

// Return a single-property object mapping the export field name to the node's label value.
export const getExportLabelEntry = (node: CfcNode): Record<string, string> => {
  if (node.type === "return") {
    return {};
  }
  const field = getExportLabelFieldName(node.type);
  return { [field]: node.label };
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
  const isBoxNode = type === "box" || type === "box-en-eno";
  const hasExplicitExecutionOrder = Object.prototype.hasOwnProperty.call(entry, "executionOrder");
  const executionOrder = Math.max(1, Math.floor(toFiniteNumber(entry.executionOrder, index + 1)));

  const asRecord = entry as Record<string, unknown>;
  const node: CfcNode = {
    id: toStringValue(entry.id, `N${index + 1}`),
    type,
    label: getImportLabelValue(asRecord, type),
    x: toFiniteNumber(entry.x),
    y: toFiniteNumber(entry.y),
    width: template.width,
    height: template.height,
  };

  if (typeof entry.typeName === "string" && entry.typeName.length > 0) {
    node.typeName = isBoxNode ? sanitizeDeclarationName(entry.typeName) || undefined : entry.typeName;
  }
  if (typeof entry.declarationName === "string" && entry.declarationName.length > 0) {
    node.label = isBoxNode ? sanitizeDeclarationName(entry.declarationName) || node.label : entry.declarationName;
  }

  if (isExecutionOrderedNode(node)) {
    node.executionOrder = executionOrder;
  }

  // Keep geometry internal and derive width automatically from label/type.
  fitNodeWidthToLabel(node);

  return {
    node,
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
    fromPin: normalizePort(entry.fromPin, "output"),
    toNodeId: toStringValue(entry.toNodeId, ""),
    toPin: normalizePort(entry.toPin, "input"),
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
  const nodeTypeById = new Map(graph.nodes.map((node) => [node.id, node.type]));

  return {
    version: graph.version,
    nodes: graph.nodes.map((node) => {
      const isExecOrdered = isExecutionOrderedNode(node);
      const executionOrder = typeof node.executionOrder === "number"
        ? Math.max(1, Math.floor(node.executionOrder))
        : (isExecOrdered ? getExecutionOrderByNodeId(graph.nodes, node.id) : null);

      return {
        id: node.id,
        type: node.type,
        ...(isExecOrdered && executionOrder !== null ? { executionOrder: executionOrder } : {}),
        ...(node.typeName ? { typeName: node.typeName } : {}),
        ...getExportLabelEntry(node),
        x: node.x,
        y: node.y,
      };
    }),
    connections: graph.connections.map((connection) => ({
      id: connection.id,
      fromNodeId: connection.fromNodeId,
      fromPin: serializePort(connection.fromPin, "output", nodeTypeById.get(connection.fromNodeId)),
      toNodeId: connection.toNodeId,
      toPin: serializePort(connection.toPin, "input", nodeTypeById.get(connection.toNodeId)),
    })),
  };
};

const sanitizeDeclarationName = (value: string): string => {
  if (!value) {
    return "";
  }
  const compact = value.replace(/[^A-Za-z0-9_]/g, "");
  if (compact.length === 0) {
    return "";
  }
  return /^[0-9]/.test(compact) ? `_${compact}` : compact;
};

const addUniqueVariable = (variables: Variable[], variable: Variable): void => {
  if (!variables.some((entry) => entry.name === variable.name)) {
    variables.push(variable);
  }
};

const isBoxType = (type: CfcNodeType): boolean => type === "box" || type === "box-en-eno";

export const deriveDeclarationsFromNodes = (nodes: CfcNode[]): string => {
  const variables: Variable[] = [];

  nodes.forEach((node) => {
    if (node.type === "input" || node.type === "output") {
      const name = sanitizeDeclarationName(node.label);
      if (!name) {
        return;
      }
      addUniqueVariable(variables, {
        name,
        type: "INT",
        isElementary: true,
      });
      return;
    }

    if (isBoxType(node.type)) {
      const name = sanitizeDeclarationName(node.label);
      const rawTypeName = node.typeName && node.typeName.trim().length > 0 ? node.typeName : node.label;
      const typeName = sanitizeDeclarationName(rawTypeName);
      if (!name || !typeName) {
        return;
      }
      addUniqueVariable(variables, {
        name,
        type: typeName,
        isElementary: false,
      });
    }
  });

  return generateDeclarations(variables);
};
