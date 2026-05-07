import {
  createEmptyGraph,
  type CfcGraph,
} from "../model.js";
import type { CfcFormatAdapter } from "./types.js";
import {
  buildOrderedNodesFromRaw,
  buildValidConnectionsFromRaw,
  deriveDeclarationsFromNodes,
  isObjectRecord,
  toExecutionOrderedSerializableGraph,
  toStringValue,
} from "./shared.js";
import { parseDeclarations, generateDeclarations } from "../declarations/parser.js";

export const jsonFormat: CfcFormatAdapter = {
  id: "json",
  label: "JSON",
  fileExtension: "json",
  serialize(graph: CfcGraph): string {
    const payload = toExecutionOrderedSerializableGraph(graph);
    const declRaw = typeof payload.declarations === "string" ? payload.declarations : deriveDeclarationsFromNodes(payload.nodes as any);
    const declParsed = parseDeclarations(declRaw);
    const exportPayload: Record<string, unknown> = {
      version: payload.version,
      declarations: declParsed.variables.map((v) => ({ name: v.name, type: v.type})),
      nodes: payload.nodes,
      connections: payload.connections.map((c) => ({
        id: c.id,
        fromNodeId: c.fromNodeId,
        toNodeId: c.toNodeId,
        fromPin: c.fromPin,
        toPin: c.toPin,
      })),
    };
    return `${JSON.stringify(exportPayload, null, 2)}\n`;
  },
  deserialize(raw: string): CfcGraph {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Ungültiges JSON");
    }

    if (!isObjectRecord(parsed)) {
      throw new Error("Ungültiges JSON-Objekt");
    }

    const graph = createEmptyGraph();
    graph.version = toStringValue(parsed.version, "1.0");

    const nodesRaw = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const connectionsRaw = Array.isArray(parsed.connections) ? parsed.connections : [];
    
    graph.nodes = buildOrderedNodesFromRaw(nodesRaw);

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    graph.connections = buildValidConnectionsFromRaw(connectionsRaw, nodeIds);
    if (Array.isArray((parsed as any).declarations)) {
      const vars = (parsed as any).declarations as Array<Record<string, unknown>>;
      const variables = vars.map((v) => ({ name: String(v.name ?? ""), type: String(v.type ?? "")}));
      graph.declarations = generateDeclarations(variables as any);
    } else if (typeof parsed.declarations === "string" && parsed.declarations.trim().length > 0) {
      graph.declarations = parsed.declarations;
    } else {
      graph.declarations = deriveDeclarationsFromNodes(graph.nodes);
    }

    return graph;
  },
};
