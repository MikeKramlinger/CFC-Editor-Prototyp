import {
  createEmptyGraph,
  getNodeTemplateByType,
  isCfcNodeType,
  type CfcGraph,
  type CfcNode,
  type CfcNodeType,
} from "../model.js";
import type { CfcFormatAdapter } from "./types.js";
import {
  buildOrderedNodesFromRaw,
  buildValidConnectionsFromRaw,
  toExecutionOrderedSerializableGraph,
} from "./shared.js";

interface NodeMetadata {
  o: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

interface ParsedNodeDraft {
  id: string;
  type: CfcNodeType;
  label: string;
  metadata: NodeMetadata;
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

const toFiniteNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Ungültiger Zahlenwert: ${value}`);
  }
  return parsed;
};

const parseMetadata = (raw: string, lineNumber: number): NodeMetadata => {
  const pairs = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  const meta: Partial<NodeMetadata> = {};

  for (const pair of pairs) {
    const match = pair.match(/^([a-zA-Z]+)\s*:\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      throw new Error(`Ungültige Metadaten-Syntax in Zeile ${lineNumber}: "${pair}"`);
    }

    const key = (match[1] ?? "").toLowerCase();
    const value = toFiniteNumber(match[2] ?? "0");

    if (key === "o" || key === "x" || key === "y" || key === "w" || key === "h") {
      meta[key] = value as never;
      continue;
    }

    throw new Error(`Unbekannter Metadaten-Schlüssel in Zeile ${lineNumber}: "${key}"`);
  }

  if (typeof meta.o !== "number" || typeof meta.x !== "number" || typeof meta.y !== "number") {
    throw new Error(`Metadaten in Zeile ${lineNumber} muessen o, x und y enthalten.`);
  }

  return {
    o: meta.o,
    x: meta.x,
    y: meta.y,
    w: meta.w,
    h: meta.h,
  };
};

const parseNodeBody = (body: string, lineNumber: number): Omit<ParsedNodeDraft, "id" | "metadata" | "lineNumber"> => {
  let match = body.match(/^\[\/\s*"((?:\\.|[^"\\])*)"\s*\/\]$/);
  if (match) {
    return { type: "input", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  match = body.match(/^\[\\\s*"((?:\\.|[^"\\])*)"\s*\\\]$/);
  if (match) {
    return { type: "output", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  match = body.match(/^\[\+([^\]]+)\]$/);
  if (match) {
    return { type: "box-en-eno", label: (match[1] ?? "").trim() };
  }

  match = body.match(/^\(\s*"((?:\\.|[^"\\])*)"\s*\)$/);
  if (match) {
    return { type: "jump", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  match = body.match(/^\{\{\s*"((?:\\.|[^"\\])*)"\s*\}\}$/);
  if (match) {
    return { type: "label", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  match = body.match(/^\{\s*"((?:\\.|[^"\\])*)"\s*\}$/);
  if (match) {
    return { type: "label", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  if (/^\(\(\s*RETURN\s*\)\)$/i.test(body)) {
    return { type: "return", label: "RETURN" };
  }

  match = body.match(/^\[\[\s*([CS])\s*:\s*([^\]]+)\]\]$/i);
  if (match) {
    const mode = (match[1] ?? "").toUpperCase();
    return {
      type: mode === "C" ? "composer" : "selector",
      label: (match[2] ?? "").trim(),
    };
  }

  match = body.match(/^\[\/\*\s*"((?:\\.|[^"\\])*)"\s*\*\/\]$/);
  if (match) {
    return { type: "comment", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  match = body.match(/^>\s*"((?:\\.|[^"\\])*)"\]$/);
  if (match) {
    return { type: "connection-mark-source", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  match = body.match(/^\[\s*"((?:\\.|[^"\\])*)"\s*<$/);
  if (match) {
    return { type: "connection-mark-sink", label: decodeEscapedQuotedText(match[1] ?? "") };
  }

  match = body.match(/^\[\[\s*T\s*:\s*([a-z0-9-]+)\s*\|\s*"((?:\\.|[^"\\])*)"\s*\]\]$/i);
  if (match) {
    const typeRaw = (match[1] ?? "").toLowerCase();
    if (!isCfcNodeType(typeRaw)) {
      throw new Error(`Unbekannter Node-Typ in Zeile ${lineNumber}: "${typeRaw}"`);
    }
    return {
      type: typeRaw,
      label: decodeEscapedQuotedText(match[2] ?? ""),
    };
  }

  match = body.match(/^\[([^\]]+)\]$/);
  if (match) {
    return { type: "box", label: (match[1] ?? "").trim() };
  }

  throw new Error(`Unbekannte Node-Syntax in Zeile ${lineNumber}: "${body}"`);
};

const parseNodeLine = (line: string, lineNumber: number): ParsedNodeDraft => {
  const metadataMatch = line.match(/\{([^{}]+)\}\s*$/);
  if (!metadataMatch || metadataMatch.index === undefined) {
    throw new Error(`Node in Zeile ${lineNumber} benoetigt einen Metadatenblock {o, x, y}.`);
  }

  const metadata = parseMetadata(metadataMatch[1] ?? "", lineNumber);
  const definition = line.slice(0, metadataMatch.index).trim();
  const definitionMatch = definition.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*(.+)$/);
  if (!definitionMatch) {
    throw new Error(`Ungueltige Node-Definition in Zeile ${lineNumber}.`);
  }

  const id = definitionMatch[1] ?? "";
  const body = (definitionMatch[2] ?? "").trim();
  if (body.length === 0) {
    throw new Error(`Fehlende Node-Syntax in Zeile ${lineNumber}.`);
  }

  const parsedBody = parseNodeBody(body, lineNumber);
  return {
    id,
    type: parsedBody.type,
    label: parsedBody.label,
    metadata,
    lineNumber,
  };
};

const parseConnectionLine = (line: string, lineNumber: number): ParsedConnectionDraft => {
  const match = line.match(/^(?:([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*)?(.+?)\s*-->\s*(.+)$/);
  if (!match) {
    throw new Error(`Ungueltige Verbindungs-Syntax in Zeile ${lineNumber}.`);
  }

  const fromRaw = (match[2] ?? "").trim();
  const toRaw = (match[3] ?? "").trim();
  if (fromRaw.length === 0 || toRaw.length === 0) {
    throw new Error(`Ungueltige Verbindungs-Syntax in Zeile ${lineNumber}.`);
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
    throw new Error(`Ungueltiger Endpunkt in Zeile ${lineNumber}: "${raw}"`);
  }

  const nodeId = match[1] ?? "";
  const pinRaw = (match[2] ?? "").trim();
  const nodeType = nodeTypeById.get(nodeId);
  const pin = pinRaw.startsWith("!") ? pinRaw.slice(1) : pinRaw;
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

const quote = (value: string): string => JSON.stringify(value);

const toNodeSyntax = (node: CfcNode): string => {
  switch (node.type) {
    case "input":
      return `${node.id}[/ ${quote(node.label)} /]`;
    case "output":
      return `${node.id}[\\ ${quote(node.label)} \\]`;
    case "box":
      return `${node.id}[${node.label}]`;
    case "box-en-eno":
      return `${node.id}[+${node.label}]`;
    case "jump":
      return `${node.id}(${quote(node.label)})`;
    case "label":
      return `${node.id}{{ ${quote(node.label)} }}`;
    case "return":
      return `${node.id}(( RETURN ))`;
    case "composer":
      return `${node.id}[[C: ${node.label}]]`;
    case "selector":
      return `${node.id}[[S: ${node.label}]]`;
    case "comment":
      return `${node.id}[/* ${quote(node.label)} */]`;
    case "connection-mark-source":
      return `${node.id}>${quote(node.label)}]`;
    case "connection-mark-sink":
      return `${node.id}[${quote(node.label)}<`;
    case "input-pin":
    case "output-pin":
      return `${node.id}[[T: ${node.type} | ${quote(node.label)}]]`;
    default:
      return `${node.id}[[T: ${node.type} | ${quote(node.label)}]]`;
  }
};

const toMetadataSyntax = (entry: Record<string, unknown>): string => {
  const executionOrder = typeof entry.executionOrder === "number" ? Math.max(1, Math.floor(entry.executionOrder)) : 0;
  const x = typeof entry.x === "number" ? entry.x : 0;
  const y = typeof entry.y === "number" ? entry.y : 0;
  const w = typeof entry.width === "number" ? entry.width : 0;
  const h = typeof entry.height === "number" ? entry.height : 0;
  return `{o: ${executionOrder}, x: ${x}, y: ${y}, w: ${w}, h: ${h}}`;
};

const toConnectionEndpointSyntax = (
  nodeId: string,
  port: string,
  kind: "input" | "output",
  nodeTypeById: Map<string, CfcNodeType>,
): string => {
  const nodeType = nodeTypeById.get(nodeId) ?? "box";
  const index = readPortIndex(port, kind);
  const pin = toPinName(index, kind, nodeType);
  return `${nodeId}.${pin}`;
};

const parseDslGraph = (raw: string): CfcGraph => {
  const normalized = normalizeLineEndings(raw);
  const lines = normalized.split("\n");

  const graph = createEmptyGraph();
  const nodeDrafts: ParsedNodeDraft[] = [];
  const connectionDrafts: ParsedConnectionDraft[] = [];

  let headerFound = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim().replace(/;$/, "").trim();
    if (trimmed.length === 0 || trimmed.startsWith("%%") || trimmed.startsWith("#")) {
      return;
    }

    if (!headerFound) {
      if (trimmed !== HEADER) {
        throw new Error(`Ungueltiger DSL-Header in Zeile ${lineNumber}. Erwartet: "${HEADER}".`);
      }
      headerFound = true;
      return;
    }

    if (trimmed.includes("-->")) {
      connectionDrafts.push(parseConnectionLine(trimmed, lineNumber));
      return;
    }

    nodeDrafts.push(parseNodeLine(trimmed, lineNumber));
  });

  if (!headerFound) {
    throw new Error(`Ungueltiger DSL-Header. Erwartet: "${HEADER}".`);
  }

  const nodesRaw = nodeDrafts.map((draft) => {
    const template = getNodeTemplateByType(draft.type);
    const width = Math.max(template.width, typeof draft.metadata.w === "number" ? draft.metadata.w : template.width);
    const height = Math.max(template.height, typeof draft.metadata.h === "number" ? draft.metadata.h : template.height);
    const entry: Record<string, unknown> = {
      id: draft.id,
      type: draft.type,
      label: draft.label,
      x: draft.metadata.x,
      y: draft.metadata.y,
      width,
      height,
    };

    if (draft.metadata.o > 0) {
      entry.executionOrder = Math.floor(draft.metadata.o);
    }

    return entry;
  });

  graph.nodes = buildOrderedNodesFromRaw(nodesRaw);

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const nodeTypeById = new Map(graph.nodes.map((node) => [node.id, node.type]));
  const connectionsRaw = connectionDrafts.map((draft, index) => {
    const from = parseEndpoint(draft.fromRaw, "output", nodeTypeById, draft.lineNumber);
    const to = parseEndpoint(draft.toRaw, "input", nodeTypeById, draft.lineNumber);

    return {
      id: draft.id ?? `C${index + 1}`,
      fromNodeId: from.nodeId,
      fromPort: from.port,
      toNodeId: to.nodeId,
      toPort: to.port,
    };
  });

  graph.connections = buildValidConnectionsFromRaw(connectionsRaw, nodeIds);
  return graph;
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
          connection.fromPort,
          "output",
          nodeTypeById,
        );
        const to = toConnectionEndpointSyntax(
          connection.toNodeId,
          connection.toPort,
          "input",
          nodeTypeById,
        );
        lines.push(`${indent}${from} --> ${to}`);
      });
    }

    return `${lines.join("\n")}\n`;
  },
  deserialize(raw: string): CfcGraph {
    try {
      return parseDslGraph(raw);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ungueltige CFC-DSL: ${error.message}`);
      }
      throw new Error("Ungueltige CFC-DSL");
    }
  },
};
