import {
  createEmptyGraph,
  type CfcGraph,
} from "../model.js";
import type { CfcFormatAdapter } from "./types.js";
import {
  buildOrderedNodesFromRaw,
  buildValidConnectionsFromRaw,
  isObjectRecord,
  toExecutionOrderedSerializableGraph,
  toStringValue,
} from "./shared.js";

export const jsonFormat: CfcFormatAdapter = {
  id: "json",
  label: "JSON",
  fileExtension: "json",
  serialize(graph: CfcGraph): string {
    const payload = toExecutionOrderedSerializableGraph(graph);
    return `${JSON.stringify(payload, null, 2)}\n`;
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

    return graph;
  },
};
