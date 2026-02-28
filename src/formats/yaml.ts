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

const quoteYamlString = (value: string): string => JSON.stringify(value);

const yamlScalar = (value: unknown): string => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null || value === undefined) {
    return "null";
  }
  return quoteYamlString(String(value));
};

const parseYamlScalar = (raw: string): unknown => {
  const value = raw.trim();
  if (value.length === 0) {
    return "";
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    if (value.startsWith('"')) {
      try {
        return JSON.parse(value);
      } catch {
        return value.slice(1, -1);
      }
    }
    return value.slice(1, -1);
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  return value;
};

const parseYamlGraph = (raw: string): Record<string, unknown> => {
  const root: Record<string, unknown> = {};
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  let section: "nodes" | "connections" | null = null;
  let currentItem: Record<string, unknown> | null = null;

  const pushCurrentItem = (): void => {
    if (!section || !currentItem) {
      return;
    }
    const target = root[section];
    if (!Array.isArray(target)) {
      root[section] = [currentItem];
    } else {
      target.push(currentItem);
    }
    currentItem = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed === "nodes:") {
      pushCurrentItem();
      section = "nodes";
      if (!Array.isArray(root.nodes)) {
        root.nodes = [];
      }
      continue;
    }

    if (trimmed === "connections:") {
      pushCurrentItem();
      section = "connections";
      if (!Array.isArray(root.connections)) {
        root.connections = [];
      }
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (!section) {
        continue;
      }
      pushCurrentItem();
      currentItem = {};
      const rest = trimmed.slice(2).trim();
      if (rest.length > 0) {
        const separator = rest.indexOf(":");
        if (separator > 0) {
          const key = rest.slice(0, separator).trim();
          const rawValue = rest.slice(separator + 1).trim();
          currentItem[key] = parseYamlScalar(rawValue);
        }
      }
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const parsedValue = parseYamlScalar(rawValue);

    if (section && currentItem) {
      currentItem[key] = parsedValue;
    } else {
      root[key] = parsedValue;
    }
  }

  pushCurrentItem();
  return root;
};

export const yamlFormat: CfcFormatAdapter = {
  id: "yaml",
  label: "YAML",
  fileExtension: "yaml",
  serialize(graph: CfcGraph): string {
    const lines: string[] = [];
    const payload = toExecutionOrderedSerializableGraph(graph);

    lines.push(`version: ${yamlScalar(payload.version)}`);
    lines.push("nodes:");
    payload.nodes.forEach((node) => {
      lines.push(`  - id: ${yamlScalar(node.id)}`);
      lines.push(`    type: ${yamlScalar(node.type)}`);
      lines.push(`    label: ${yamlScalar(node.label)}`);
      if (typeof node.executionOrder === "number") {
        lines.push(`    executionOrder: ${node.executionOrder}`);
      }
      lines.push(`    x: ${yamlScalar(node.x)}`);
      lines.push(`    y: ${yamlScalar(node.y)}`);
      lines.push(`    width: ${yamlScalar(node.width)}`);
      lines.push(`    height: ${yamlScalar(node.height)}`);
    });

    lines.push("connections:");
    payload.connections.forEach((connection) => {
      lines.push(`  - id: ${yamlScalar(connection.id)}`);
      lines.push(`    fromNodeId: ${yamlScalar(connection.fromNodeId)}`);
      lines.push(`    fromPort: ${yamlScalar(connection.fromPort)}`);
      lines.push(`    toNodeId: ${yamlScalar(connection.toNodeId)}`);
      lines.push(`    toPort: ${yamlScalar(connection.toPort)}`);
    });

    return `${lines.join("\n")}\n`;
  },
  deserialize(raw: string): CfcGraph {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseYamlGraph(raw);
    } catch {
      throw new Error("Ungültiges YAML");
    }

    if (!isObjectRecord(parsed)) {
      throw new Error("Ungültiges YAML-Objekt");
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
