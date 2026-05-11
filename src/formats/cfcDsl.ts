import {
  createEmptyGraph,
  isCfcNodeType,
  type CfcGraph,
  type CfcNode,
  type CfcNodeType,
} from "../model.js";
import type { CfcFormatAdapter, DeserializeResult } from "./types.js";
import { createDeserializeResult, createFormatError, createFormatErrorWithFallback } from "./errors.js";
import {
  collectOrderedNodeValidationErrors,
  collectDuplicateGroupedErrors,
  buildOrderedNodesFromRaw,
  buildValidConnectionsFromRaw,
  canOmitPortReference,
  serializePort,
  toExecutionOrderedSerializableGraph,
} from "./shared.js";

interface NodeMetadata {
  o: number;
  x: number;
  y: number;
}

interface ParsedNodeDraft {
  id: string;
  type: CfcNodeType;
  label: string;
  typeName?: string;
  metadata: NodeMetadata;
  invalidMetadataKeys: string[];
  missingRequiredKeys: string[];
  lineNumber: number;
}

interface ParsedConnectionDraft {
  id?: string;
  fromRaw: string;
  toRaw: string;
  lineNumber: number;
}

const HEADER = "cfc LR";

const normalizeLineEndings = (raw: string): string => raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const decodeEscapedQuotedText = (raw: string): string => {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
};

const parseMaybeQuotedText = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return decodeEscapedQuotedText(trimmed.slice(1, -1));
  }
  return trimmed;
};

const quoteIfNeeded = (value: string, forbiddenFragments: string[]): string => {
  const hasBoundarySpaces = value !== value.trim();
  const needsQuoting = hasBoundarySpaces || forbiddenFragments.some((fragment) => fragment.length > 0 && value.includes(fragment));
  return needsQuoting ? JSON.stringify(value) : value;
};

const toFiniteNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const e = new Error(`Invalid numeric value: ${value}`);
    (e as any).messageKey = "formatErrorInvalidNumber";
    throw e;
  }
  return parsed;
};

const parseMetadata = (raw: string, lineNumber: number): { metadata: NodeMetadata; invalidMetadataKeys: string[] } => {
  const pairs = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  const meta: Partial<NodeMetadata> = {};
  const invalidMetadataKeys: string[] = [];

  for (const pair of pairs) {
    const match = pair.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
    if (!match) {
      const e = new Error(`Invalid metadata syntax: ${pair}`);
      (e as any).messageKey = "formatErrorInvalidMetadata";
      (e as any).lineNumber = lineNumber;
      throw e;
    }

    const key = (match[1] ?? "").toLowerCase();
    const rawValue = (match[2] ?? "").trim();

    if (key === "o") {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        const e = new Error(`Ungültige executionOrder: "${rawValue}"`);
        (e as any).messageKey = "formatErrorInvalidExecutionOrder";
        (e as any).lineNumber = lineNumber;
        throw e;
      }
      meta[key] = value as never;
      continue;
    }

    if (key === "x" || key === "y") {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        const e = new Error(`Ungültige Koordinate ${key}: "${rawValue}" ist keine ganze Zahl`);
        (e as any).messageKey = "formatErrorInvalidCoordinates";
        (e as any).lineNumber = lineNumber;
        throw e;
      }
      if (value < 0) {
        const e = new Error(`Ungültige Koordinate ${key}: "${rawValue}" ist negativ`);
        (e as any).messageKey = "formatErrorInvalidCoordinates";
        (e as any).lineNumber = lineNumber;
        throw e;
      }
      meta[key] = value as never;
      continue;
    }

    invalidMetadataKeys.push(key);
  }

  // x and y are required; o is optional and defaults to 0
  if (typeof meta.x !== "number" || typeof meta.y !== "number") {
    const e = new Error(`Metadata must contain x and y`);
    (e as any).messageKey = "formatErrorMissingCoordinates";
    (e as any).lineNumber = lineNumber;
    throw e;
  }

  return {
    metadata: {
      o: typeof meta.o === "number" ? meta.o : 0,
      x: meta.x,
      y: meta.y,
    },
    invalidMetadataKeys,
  };
};

const parseBoxContent = (content: string): [label: string, typeName?: string] => {
  const atIndex = content.lastIndexOf("@");
  if (atIndex === -1) {
    return [content];
  }

  const label = content.slice(0, atIndex).trim();
  const typeName = content.slice(atIndex + 1).trim();

  if (label.length === 0 || typeName.length === 0) {
    return [content];
  }

  return [label, typeName];
};

const parseNodeBody = (body: string, lineNumber: number): Omit<ParsedNodeDraft, "id" | "metadata" | "lineNumber"> & { invalidMetadataKeys?: string[] } => {
  let match = body.match(/^\[\/\*\s*([\s\S]*?)\s*\*\/\]$/);
  if (match) {
    return { type: "comment", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\[\*\s*([\s\S]*?)\s*\*\]$/);
  if (match) {
    return { type: "comment", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\[\/\s*([\s\S]*?)\s*\/\]$/);
  if (match) {
    return { type: "input", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\[\\\s*([\s\S]*?)\s*\\\]$/);
  if (match) {
    return { type: "output", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\[\+([^\]]+)\]$/);
  if (match) {
    const content = (match[1] ?? "").trim();
    const [label, typeName] = parseBoxContent(content);
    return { type: "box-en-eno", label, typeName, invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
  if (match) {
    return { type: "label", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\{\s*([\s\S]*?)\s*\}$/);
  if (match) {
    return { type: "label", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  if (/^\(\(\s*RETURN\s*\)\)$/i.test(body)) {
    return { type: "return", label: "RETURN", invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\(\s*([\s\S]*?)\s*\)$/);
  if (match) {
    return { type: "jump", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\[\[\s*([CS])\s*:\s*([^\]]+)\]\]$/i);
  if (match) {
    const mode = (match[1] ?? "").toUpperCase();
    return {
      type: mode === "C" ? "composer" : "selector",
      label: (match[2] ?? "").trim(),
      invalidMetadataKeys: [],
      missingRequiredKeys: [],
    };
  }

  match = body.match(/^>\s*([\s\S]*?)\s*\]$/);
  if (match) {
    return { type: "connection-mark-source", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\[\s*([\s\S]*?)\s*<$/);
  if (match) {
    return { type: "connection-mark-sink", label: parseMaybeQuotedText(match[1] ?? ""), invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  match = body.match(/^\[\[\s*T\s*:\s*([a-z0-9-]+)\s*\|\s*([\s\S]*?)\s*\]\]$/i);
  if (match) {
    const typeRaw = (match[1] ?? "").toLowerCase();
    if (!isCfcNodeType(typeRaw)) {
      const e = new Error(`Unknown node type: ${typeRaw}`);
      (e as any).messageKey = "formatErrorUnknownNodeType";
      throw e;
    }
    return {
      type: typeRaw,
      label: parseMaybeQuotedText(match[2] ?? ""),
      invalidMetadataKeys: [],
      missingRequiredKeys: [],
    };
  }

  match = body.match(/^\[([^\]]+)\]$/);
  if (match) {
    const content = (match[1] ?? "").trim();
    const [label, typeName] = parseBoxContent(content);
    return { type: "box", label, typeName, invalidMetadataKeys: [], missingRequiredKeys: [] };
  }

  const e = new Error(`Unknown node syntax: ${body}`);
  (e as any).messageKey = "formatErrorInvalidNodeSyntax";
  throw e;
};

const parseNodeLine = (line: string, lineNumber: number): ParsedNodeDraft => {
  const metadataMatch = line.match(/\{([^{}]+)\}\s*$/);
  if (!metadataMatch || metadataMatch.index === undefined) {
    const e = new Error(`Node requires metadata block {o, x, y}.`);
    (e as any).messageKey = "formatErrorMissingMetadata";
    throw e;
  }

  const parsedMetadata = parseMetadata(metadataMatch[1] ?? "", lineNumber);
  const definition = line.slice(0, metadataMatch.index).trim();
  const definitionMatch = definition.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*(.+)$/);
  if (!definitionMatch) {
    const e = new Error(`Invalid node definition.`);
    (e as any).messageKey = "formatErrorInvalidNodeSyntax";
    throw e;
  }

  const id = definitionMatch[1] ?? "";
  const body = (definitionMatch[2] ?? "").trim();
  if (body.length === 0) {
    const e = new Error(`Missing node syntax.`);
    (e as any).messageKey = "formatErrorMissingNodeBody";
    throw e;
  }

  const parsedBody = parseNodeBody(body, lineNumber);
  if (parsedBody.type !== "return" && parsedBody.label.trim().length === 0) {
    const e = new Error(`Fehlende Attribute für Knotentyp "${parsedBody.type}" (label)`);
    (e as any).messageKey = "formatErrorMissingAttributes";
    (e as any).lineNumber = lineNumber;
    throw e;
  }
  const missingRequiredKeys: string[] = [];
  const requiresExecutionOrder = (
    parsedBody.type === "output"
    || parsedBody.type === "box"
    || parsedBody.type === "box-en-eno"
    || parsedBody.type === "jump"
    || parsedBody.type === "label"
    || parsedBody.type === "return"
    || parsedBody.type === "composer"
  );
  if (requiresExecutionOrder && parsedMetadata.metadata.o === 0) {
    missingRequiredKeys.push("executionOrder");
  }
  if ((parsedBody.type === "box" || parsedBody.type === "box-en-eno") && (!parsedBody.typeName || parsedBody.typeName.trim().length === 0)) {
    missingRequiredKeys.push("typeName");
  }
  if (parsedBody.type === "box" || parsedBody.type === "box-en-eno") {
    if (!parsedBody.label || parsedBody.label.trim().length === 0) {
      missingRequiredKeys.push("instanceName");
    }
  }
  return {
    id,
    type: parsedBody.type,
    label: parsedBody.label,
    typeName: parsedBody.typeName,
    metadata: parsedMetadata.metadata,
    invalidMetadataKeys: parsedMetadata.invalidMetadataKeys,
    missingRequiredKeys,
    lineNumber,
  };
};

const parseConnectionLine = (line: string, lineNumber: number): ParsedConnectionDraft => {
  const match = line.match(/^(?:([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*)?(.+?)\s*-->\s*(.+)$/);
  if (!match) {
    const e = new Error(`Invalid connection syntax.`);
    (e as any).messageKey = "formatErrorInvalidConnectionSyntax";
    throw e;
  }

  const fromRaw = (match[2] ?? "").trim();
  const toRaw = (match[3] ?? "").trim();
  if (fromRaw.length === 0 || toRaw.length === 0) {
    const e = new Error(`Invalid connection syntax.`);
    (e as any).messageKey = "formatErrorInvalidConnectionSyntax";
    throw e;
  }

  return {
    id: (match[1] ?? "").trim() || undefined,
    fromRaw,
    toRaw,
    lineNumber,
  };
};

const parseEndpoint = (
  raw: string,
  kind: "input" | "output",
  nodeTypeById: Map<string, CfcNodeType>,
  lineNumber: number,
): { nodeId: string; port: string } => {
  const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)(?:\.(.+))?$/);
  if (!match) {
    const e = new Error(`Invalid endpoint: ${raw}`);
    (e as any).messageKey = "formatErrorInvalidEndpoint";
    (e as any).lineNumber = lineNumber;
    throw e;
  }

  const nodeId = match[1] ?? "";
  const pinRaw = (match[2] ?? "").trim();
  const nodeType = nodeTypeById.get(nodeId);
  const pin = pinRaw.startsWith("!") ? pinRaw.slice(1) : pinRaw;
  if (!nodeType && pin.length === 0) {
    const e = new Error(`Invalid endpoint: ${raw}`);
    (e as any).messageKey = "formatErrorInvalidEndpoint";
    (e as any).lineNumber = lineNumber;
    throw e;
  }
  if (nodeType && pin.length === 0 && !canOmitPortReference(nodeType, kind)) {
    const e = new Error(`Invalid endpoint: ${raw}`);
    (e as any).messageKey = "formatErrorInvalidEndpoint";
    (e as any).lineNumber = lineNumber;
    throw e;
  }
  const index = parsePinIndex(pin, kind, nodeType);

  return {
    nodeId,
    port: `${kind}:${index}`,
  };
};

const parsePinIndex = (pinRaw: string, kind: "input" | "output", nodeType?: CfcNodeType): number => {
  if (pinRaw.length === 0) {
    return 0;
  }

  const pin = pinRaw.trim().toUpperCase();

  if (kind === "input") {
    if (nodeType === "box-en-eno" && pin === "EN") {
      return 0;
    }

    if (pin === "IN") {
      return nodeType === "box-en-eno" ? 1 : 0;
    }

    const inMatch = pin.match(/^IN(\d+)$/);
    if (inMatch) {
      const value = Number.parseInt(inMatch[1] ?? "1", 10);
      return nodeType === "box-en-eno" ? value : Math.max(0, value - 1);
    }
  }

  if (kind === "output") {
    if (nodeType === "box-en-eno") {
      if (pin === "ENO") {
        return 0;
      }
      if (pin === "OUT") {
        return 1;
      }
      const outMatchWithEno = pin.match(/^OUT(\d+)$/);
      if (outMatchWithEno) {
        const value = Number.parseInt(outMatchWithEno[1] ?? "1", 10);
        return value;
      }
    }

    if (pin === "OUT") {
      return 0;
    }

    const outMatch = pin.match(/^OUT(\d+)$/);
    if (outMatch) {
      const value = Number.parseInt(outMatch[1] ?? "1", 10);
      return Math.max(0, value - 1);
    }
  }

  const numericMatch = pin.match(/^(\d+)$/);
  if (numericMatch) {
    return Math.max(0, Number.parseInt(numericMatch[1] ?? "0", 10));
  }

  return 0;
};

const readPortIndex = (port: string, kind: "input" | "output"): number => {
  const match = port.match(new RegExp(`^${kind}:(\\d+)$`));
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10);
};

const toPinName = (index: number, kind: "input" | "output", nodeType: CfcNodeType): string => {
  if (kind === "input") {
    if (nodeType === "box-en-eno") {
      if (index === 0) {
        return "EN";
      }
      return `IN${index}`;
    }
    return `IN${index + 1}`;
  }

  if (nodeType === "box-en-eno") {
    if (index === 0) {
      return "ENO";
    }
    if (index === 1) {
      return "OUT";
    }
    return `OUT${index}`;
  }

  if (index === 0) {
    return "OUT";
  }
  return `OUT${index + 1}`;
};

const toNodeSyntax = (node: CfcNode): string => {
  const typeNameSuffix = node.typeName && node.typeName.trim().length > 0 ? ` @ ${node.typeName}` : "";

  switch (node.type) {
    case "input":
      return `${node.id}[/${quoteIfNeeded(node.label, ["/]"])}/]`;
    case "output":
      return `${node.id}[\\${quoteIfNeeded(node.label, ["\\]"])}\\]`;
    case "box":
      return `${node.id}[${node.label}${typeNameSuffix}]`;
    case "box-en-eno":
      return `${node.id}[+${node.label}${typeNameSuffix}]`;
    case "jump":
      return `${node.id}(${quoteIfNeeded(node.label, [")"])})`;
    case "label":
      return `${node.id}{{${quoteIfNeeded(node.label, ["}}", "}"])}}}`;
    case "return":
      return `${node.id}((RETURN))`;
    case "composer":
      return `${node.id}[[C: ${node.label}]]`;
    case "selector":
      return `${node.id}[[S: ${node.label}]]`;
    case "comment":
      return `${node.id}[*${quoteIfNeeded(node.label, ["*]"])}*]`;
    case "connection-mark-source":
      return `${node.id}>${quoteIfNeeded(node.label, ["]"])}]`;
    case "connection-mark-sink":
      return `${node.id}[${quoteIfNeeded(node.label, ["<"])}<`;
    case "input-pin":
    case "output-pin":
      return `${node.id}[[T:${node.type}|${quoteIfNeeded(node.label, ["]]"])}]]`;
    default:
      return `${node.id}[[T:${node.type}|${quoteIfNeeded(node.label, ["]]"])}]]`;
  }
};

const toMetadataSyntax = (entry: Record<string, unknown>): string => {
  const parts: string[] = [];
  const x = typeof entry.x === "number" ? entry.x : 0;
  const y = typeof entry.y === "number" ? entry.y : 0;

  // executionOrder might be present as `executionOrder` or legacy `o` key.
  const oValue = typeof entry.executionOrder === "number"
    ? entry.executionOrder
    : (typeof entry.o === "number" ? entry.o : undefined);

  if (typeof oValue === "number" && oValue > 0) {
    const executionOrder = Math.max(1, Math.floor(oValue));
    parts.push(`o: ${executionOrder}`);
  }

  parts.push(`x: ${x}`);
  parts.push(`y: ${y}`);

  return `{${parts.join(", ")}}`;
};

const toConnectionEndpointSyntax = (
  nodeId: string,
  port: string,
  kind: "input" | "output",
  nodeTypeById: Map<string, CfcNodeType>,
): string => {
  const nodeType = nodeTypeById.get(nodeId) ?? "box";
  const serializedPort = serializePort(port, kind, nodeType);
  if (serializedPort === kind) {
    return nodeId;
  }

  const index = readPortIndex(port, kind);
  const pin = toPinName(index, kind, nodeType);
  return `${nodeId}.${pin}`;
};

const parseDslGraphWithErrors = (raw: string): DeserializeResult => {
  const normalized = normalizeLineEndings(raw);
  const lines = normalized.split("\n");

  const graph = createEmptyGraph();
  const nodeDrafts: ParsedNodeDraft[] = [];
  const connectionDrafts: ParsedConnectionDraft[] = [];
  const errors: import("./errors.js").FormatError[] = [];

  let headerFound = false;
  let declarationsStartIndex = -1;

  // Suche nach dem Deklarationsmarker
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "%% DECLARATIONS") {
      declarationsStartIndex = i + 1;
      break;
    }
  }

  // Verarbeite nur Zeilen vor den Deklarationen
  const contentLines = declarationsStartIndex >= 0 ? lines.slice(0, declarationsStartIndex - 1) : lines;

  contentLines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim().replace(/;$/, "").trim();
    if (trimmed.length === 0 || trimmed.startsWith("%%") || trimmed.startsWith("#")) {
      return;
    }

    if (!headerFound) {
      if (trimmed !== HEADER) {
        errors.push(createFormatErrorWithFallback(lineNumber, "formatErrorInvalidDslHeader", `Invalid DSL header. Expected: '${HEADER}'.`));
      } else {
        headerFound = true;
      }
      return;
    }

    if (trimmed.includes("-->")) {
      try {
        connectionDrafts.push(parseConnectionLine(trimmed, lineNumber));
      } catch (e) {
        const key = (e as any)?.messageKey ?? "formatErrorInvalidConnectionSyntax";
        const start = (e as any)?.startIndex;
        const length = (e as any)?.length;
        errors.push(createFormatErrorWithFallback(lineNumber, key, (e as Error).message, start, length));
      }
      return;
    }

    try {
      const nodeDraft = parseNodeLine(trimmed, lineNumber);
      if (nodeDraft.invalidMetadataKeys.length > 0) {
        nodeDraft.invalidMetadataKeys.forEach((invalidKey) => {
          errors.push(createFormatErrorWithFallback(lineNumber, "formatErrorInvalidMetadataKey", `Unknown metadata key (${invalidKey})`));
        });
      }
      if (nodeDraft.missingRequiredKeys.length > 0) {
        const detail = nodeDraft.missingRequiredKeys.join(", ");
        errors.push(createFormatErrorWithFallback(lineNumber, "formatErrorMissingAttributes", `Fehlende Attribute für Knotentyp "${nodeDraft.type}" (${detail})`));
      }
      nodeDrafts.push(nodeDraft);
    } catch (e) {
      const key = (e as any)?.messageKey ?? "formatErrorInvalidNodeSyntax";
      const start = (e as any)?.startIndex;
      const length = (e as any)?.length;
      const errorLineNumber = (e as any)?.lineNumber ?? lineNumber;
      if (key === "formatErrorMissingCoordinates") {
        errors.push(createFormatErrorWithFallback(errorLineNumber, "formatErrorMissingAttributes", "Fehlende Attribute für Knotentyp (x, y)"));
      } else {
        errors.push(createFormatErrorWithFallback(errorLineNumber, key, (e as Error).message, start, length));
      }
    }
  });

  if (!headerFound) {
    errors.push(createFormatErrorWithFallback(1, "formatErrorInvalidDslHeader", `Invalid DSL header. Expected: '${HEADER}'.`));
  }

  try {
    const nodesRaw = nodeDrafts.map((draft) => {
      const entry: Record<string, unknown> = {
        id: draft.id,
        type: draft.type,
        label: draft.label,
        x: draft.metadata.x,
        y: draft.metadata.y,
      };

      if (draft.metadata.o > 0) {
        entry.executionOrder = Math.floor(draft.metadata.o);
      }

      if (draft.typeName) {
        entry.typeName = draft.typeName;
      }

      return entry;
    });

    const duplicateInstanceNameErrors = collectDuplicateGroupedErrors(
      nodeDrafts
        .filter((draft) => draft.type === "box" || draft.type === "box-en-eno")
        .map((draft) => ({ key: draft.label.trim(), line: draft.lineNumber }))
        .filter((entry) => entry.key.length > 0),
      "formatErrorDuplicateInstanceName",
      (key) => `Instanzname mehrfach belegt (${key})`,
    );

    const validationErrors = collectOrderedNodeValidationErrors(
      nodeDrafts.map((draft) => ({
        node: {
          id: draft.id,
          type: draft.type,
          label: draft.label,
          x: draft.metadata.x,
          y: draft.metadata.y,
          width: 0,
          height: 0,
          ...(draft.typeName ? { typeName: draft.typeName } : {}),
        } as CfcNode,
        executionOrder: draft.metadata.o > 0 ? Math.floor(draft.metadata.o) : draft.lineNumber,
        hasExplicitExecutionOrder: draft.metadata.o > 0,
        sourceIndex: draft.lineNumber - 1,
      })),
    );
    validationErrors.push(...duplicateInstanceNameErrors);
    errors.push(...validationErrors);

    graph.nodes = buildOrderedNodesFromRaw(nodesRaw);

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const nodeTypeById = new Map(graph.nodes.map((node) => [node.id, node.type]));
    const connectionsRaw = connectionDrafts.map((draft, index) => {
      const from = parseEndpoint(draft.fromRaw, "output", nodeTypeById, draft.lineNumber);
      const to = parseEndpoint(draft.toRaw, "input", nodeTypeById, draft.lineNumber);

      return {
        id: draft.id ?? `C${index + 1}`,
        fromNodeId: from.nodeId,
        fromPin: from.port,
        toNodeId: to.nodeId,
        toPin: to.port,
      };
    });

    graph.connections = buildValidConnectionsFromRaw(connectionsRaw, nodeIds);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const isValidationError = errorMessage.includes("id bereits belegt") || errorMessage.includes("executionOrder");
    if (!isValidationError) {
      const key = errorMessage.includes("Koordinaten") || errorMessage.includes("coordinates") || errorMessage.includes("Coordinate")
        ? "formatErrorInvalidCoordinates"
        : "formatErrorInvalidNodeSyntax";
      errors.push(createFormatErrorWithFallback(1, key, errorMessage));
    }
  }

  // Extrahiere Deklarationen, wenn sie vorhanden sind
  if (declarationsStartIndex >= 0 && declarationsStartIndex < lines.length) {
    const declarationsLines = lines.slice(declarationsStartIndex);
    const declarations = declarationsLines.join("\n").trim();
    if (declarations.length > 0) {
      graph.declarations = declarations;
    }
  }

  return createDeserializeResult(graph, errors);
};

const parseDslGraph = (raw: string): CfcGraph => {
  const result = parseDslGraphWithErrors(raw);
  if (!result.isValid && result.errors.length > 0) {
    const firstError = result.errors[0]!;
    throw new Error(`${firstError.messageKey}: Line ${firstError.line}`);
  }
  return result.graph;
};

export const cfcDslFormat: CfcFormatAdapter = {
  id: "cfc-dsl",
  label: "CFC-DSL",
  fileExtension: "cfc",
  serialize(graph: CfcGraph): string {
    const indent = "  ";
    const payload = toExecutionOrderedSerializableGraph(graph);
    const lines: string[] = [HEADER];
    const nodeTypeById = new Map(graph.nodes.map((node) => [node.id, node.type]));

    if (payload.nodes.length > 0) {
      lines.push("");
      payload.nodes.forEach((entry) => {
        const node = graph.nodes.find((candidate) => candidate.id === entry.id);
        if (!node) {
          return;
        }
        lines.push(`${indent}${toNodeSyntax(node)} ${toMetadataSyntax(entry)}`);
      });
    }

    if (payload.connections.length > 0) {
      lines.push("");
      payload.connections.forEach((connection) => {
        const from = toConnectionEndpointSyntax(
          connection.fromNodeId,
          connection.fromPin,
          "output",
          nodeTypeById,
        );
        const to = toConnectionEndpointSyntax(
          connection.toNodeId,
          connection.toPin,
          "input",
          nodeTypeById,
        );
        lines.push(`${indent}${from} --> ${to}`);
      });
    }

    // Füge Deklarationen am Ende hinzu, wenn nicht leer
    if (graph.declarations && graph.declarations.trim().length > 0) {
      lines.push("");
      lines.push("%% DECLARATIONS");
      lines.push(graph.declarations);
    }

    return `${lines.join("\n")}\n`;
  },
  deserialize(raw: string): DeserializeResult {
    return parseDslGraphWithErrors(raw);
  },
};
