import {
  DEFAULT_NODE_TYPE,
  createEmptyGraph,
  type CfcGraph,
  type CfcNodeType,
} from "../model.js";
import { isExecutionOrderedNode } from "../core/graph/executionOrder.js";
import type { CfcFormatAdapter } from "./types.js";
import { buildOrderedNodesFromRaw, buildValidConnectionsFromRaw, deriveDeclarationsFromNodes, serializePort, getImportLabelValue, getExportLabelEntry } from "./shared.js";
import { parseDeclarations, generateDeclarations } from "../declarations/parser.js";

const requireAttr = (element: Element, name: string): string => {
  const value = element.getAttribute(name);
  if (!value) {
    throw new Error(`Fehlendes Attribut: ${name}`);
  }
  return value;
};

const parseNumberAttr = (element: Element, name: string, fallback = 0): number => {
  const raw = element.getAttribute(name);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const formatXml = (xml: string): string => {
  const normalized = xml
    .replace(/\r\n/g, "\n")
    .replace(/>\s+</g, "><")
    .replace(/(>)(<)(\/?)/g, "$1\n$2$3");

  const lines = normalized.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const formatted: string[] = [];
  let depth = 0;

  lines.forEach((line) => {
    if (line.startsWith("</")) {
      depth = Math.max(0, depth - 1);
    }

    formatted.push(`${"  ".repeat(depth)}${line}`);

    const isOpeningTag = /^<[^!?/][^>]*>$/.test(line);
    const isSelfClosing = /\/>$/.test(line);
    if (isOpeningTag && !isSelfClosing) {
      depth += 1;
    }
  });

  return formatted.join("\n");
};

export const xmlFormat: CfcFormatAdapter = {
  id: "xml",
  label: "XML",
  fileExtension: "xml",
  serialize(graph: CfcGraph): string {
    const documentRoot = document.implementation.createDocument(null, "cfcEditor", null);
    const root = documentRoot.documentElement;
    root.setAttribute("version", graph.version);
    const nodeTypeById = new Map(graph.nodes.map((node) => [node.id, node.type]));

    const nodes = documentRoot.createElement("nodes");
    let executionOrderIndex = 0;
    graph.nodes.forEach((node) => {
      const nodeElement = documentRoot.createElement("node");
      nodeElement.setAttribute("id", node.id);
      nodeElement.setAttribute("type", node.type);
      if (isExecutionOrderedNode(node)) {
        const nodeExecutionOrder = typeof node.executionOrder === "number" ? Math.max(1, Math.floor(node.executionOrder)) : executionOrderIndex + 1;
        nodeElement.setAttribute("executionOrder", String(nodeExecutionOrder));
        executionOrderIndex++;
      }
      if (node.typeName) {
        nodeElement.setAttribute("typeName", node.typeName);
      }
      // Use helper to produce the export label entry and write it as attribute
      const labelEntry = getExportLabelEntry(node as any);
      for (const [k, v] of Object.entries(labelEntry)) {
        nodeElement.setAttribute(k, v);
      }
      nodeElement.setAttribute("x", String(node.x));
      nodeElement.setAttribute("y", String(node.y));
      nodes.append(nodeElement);
    });

    const connections = documentRoot.createElement("connections");
    graph.connections.forEach((connection) => {
      const connectionElement = documentRoot.createElement("connection");
      connectionElement.setAttribute("id", connection.id);
      connectionElement.setAttribute("from", connection.fromNodeId);
      connectionElement.setAttribute("fromPin", serializePort(connection.fromPin, "output", nodeTypeById.get(connection.fromNodeId)));
      connectionElement.setAttribute("to", connection.toNodeId);
      connectionElement.setAttribute("toPin", serializePort(connection.toPin, "input", nodeTypeById.get(connection.toNodeId)));
      connections.append(connectionElement);
    });

    if (graph.declarations && graph.declarations.trim().length > 0) {
      const parsed = parseDeclarations(graph.declarations);
      const declElem = documentRoot.createElement("declarations");
      parsed.variables.forEach((v) => {
        const varElem = documentRoot.createElement("variable");
        varElem.setAttribute("name", v.name);
        varElem.setAttribute("type", v.type);
        declElem.append(varElem);
      });

      root.append(declElem, nodes, connections);
    } else {
      root.append(nodes, connections);
    }

    const serialized = new XMLSerializer().serializeToString(documentRoot).replace(/^<\?xml[^>]*>\s*/i, "");
    return `<?xml version="1.0" encoding="UTF-8"?>\n${formatXml(serialized)}`;
  },
  deserialize(raw: string): CfcGraph {
    const xml = new DOMParser().parseFromString(raw, "application/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("Ungültiges XML");
    }

    const graph = createEmptyGraph();
    const cfc = xml.getElementsByTagNameNS("*", "cfcEditor").item(0);
    if (!cfc) {
      return graph;
    }

    graph.version = cfc.getAttribute("version") ?? "1.0";

    const nodeElements = cfc.getElementsByTagNameNS("*", "node");
    const nodesRaw = Array.from(nodeElements).map((nodeElement, sourceIndex) => {
      const nodeType = (nodeElement.getAttribute("type") ?? DEFAULT_NODE_TYPE) as CfcNodeType;
      const record: Record<string, unknown> = {
        label: nodeElement.getAttribute("label") ?? undefined,
        expression: nodeElement.getAttribute("expression") ?? undefined,
        instanceName: nodeElement.getAttribute("instanceName") ?? undefined,
        declarationName: nodeElement.getAttribute("declarationName") ?? undefined,
        content: nodeElement.getAttribute("content") ?? undefined,
        text: nodeElement.getAttribute("text") ?? undefined,
        signal: nodeElement.getAttribute("signal") ?? undefined,
      };

      const nodeRaw: Record<string, unknown> = {
        id: requireAttr(nodeElement, "id"),
        type: nodeType,
        label: getImportLabelValue(record, nodeType),
        x: parseNumberAttr(nodeElement, "x"),
        y: parseNumberAttr(nodeElement, "y"),
      };
      if (nodeElement.hasAttribute("executionOrder")) {
        nodeRaw.executionOrder = Math.max(1, Math.floor(parseNumberAttr(nodeElement, "executionOrder", sourceIndex + 1)));
      }
      const typeName = nodeElement.getAttribute("typeName");
      if (typeName) {
        nodeRaw.typeName = typeName;
      }
      const declarationName = nodeElement.getAttribute("declarationName");
      if (declarationName) {
        nodeRaw.label = declarationName;
      }
      return nodeRaw;
    });

    graph.nodes = buildOrderedNodesFromRaw(nodesRaw);

    const connectionElements = cfc.getElementsByTagNameNS("*", "connection");
    const connectionsRaw = Array.from(connectionElements).map((connectionElement) => {
      const rawFromPin = connectionElement.getAttribute("fromPin") ?? "output:0";
      const rawToPin = connectionElement.getAttribute("toPin") ?? "input:0";
      return {
        id: requireAttr(connectionElement, "id"),
        fromNodeId: requireAttr(connectionElement, "from"),
        fromPin: rawFromPin === "output" ? "output:0" : rawFromPin,
        toNodeId: requireAttr(connectionElement, "to"),
        toPin: rawToPin === "input" ? "input:0" : rawToPin,
      };
    });

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    graph.connections = buildValidConnectionsFromRaw(connectionsRaw, nodeIds);

    const declElements = cfc.getElementsByTagNameNS("*", "declarations");
    const declEl = declElements && declElements.length > 0 ? declElements.item(0) : null;
    const variableElements = declEl ? Array.from(declEl.getElementsByTagName("variable")) : [];

    if (variableElements.length > 0) {
      const variables = variableElements.map((ve) => ({
        name: ve.getAttribute("name") ?? "",
        type: ve.getAttribute("type") ?? ""
      }));
      
      graph.declarations = generateDeclarations(variables as any);
    } else {
      graph.declarations = deriveDeclarationsFromNodes(graph.nodes);
    }

    return graph;
  },
};
