import {
  DEFAULT_NODE_TYPE,
  createEmptyGraph,
  getNodeTemplateByType,
  isCfcNodeType,
  type CfcNode,
  type CfcGraph,
} from "../model.js";
import { isExecutionOrderedNode } from "../core/graph/executionOrder.js";
import type { CfcFormatAdapter } from "./types.js";

const NAMESPACE = "http://www.plcopen.org/xml/tc6_0200";

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

export const plcopenXmlFormat: CfcFormatAdapter = {
  id: "plcopen-xml",
  label: "PLCopenXML",
  fileExtension: "xml",
  serialize(graph: CfcGraph): string {
    const documentRoot = document.implementation.createDocument(NAMESPACE, "project", null);
    const root = documentRoot.documentElement;

    const cfc = documentRoot.createElementNS(NAMESPACE, "cfcEditor");
    cfc.setAttribute("version", graph.version);

    const nodes = documentRoot.createElementNS(NAMESPACE, "nodes");
    let executionOrder = 1;
    graph.nodes.forEach((node) => {
      const template = getNodeTemplateByType(node.type);
      const nodeElement = documentRoot.createElementNS(NAMESPACE, "node");
      nodeElement.setAttribute("id", node.id);
      nodeElement.setAttribute("type", node.type);
      nodeElement.setAttribute("label", node.label);
      if (isExecutionOrderedNode(node)) {
        nodeElement.setAttribute("executionOrder", String(executionOrder));
        executionOrder += 1;
      }
      nodeElement.setAttribute("x", String(node.x));
      nodeElement.setAttribute("y", String(node.y));
      nodeElement.setAttribute("width", String(Math.max(template.width, node.width)));
      nodeElement.setAttribute("height", String(Math.max(template.height, node.height)));
      nodes.append(nodeElement);
    });

    const connections = documentRoot.createElementNS(NAMESPACE, "connections");
    graph.connections.forEach((connection) => {
      const connectionElement = documentRoot.createElementNS(NAMESPACE, "connection");
      connectionElement.setAttribute("id", connection.id);
      connectionElement.setAttribute("from", connection.fromNodeId);
      connectionElement.setAttribute("fromPort", connection.fromPort);
      connectionElement.setAttribute("to", connection.toNodeId);
      connectionElement.setAttribute("toPort", connection.toPort);
      connections.append(connectionElement);
    });

    cfc.append(nodes, connections);
    root.append(cfc);

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
    const parsedNodes: Array<{ node: CfcNode; executionOrder: number; sourceIndex: number }> = [];
    for (const [sourceIndex, nodeElement] of Array.from(nodeElements).entries()) {
      const rawType = nodeElement.getAttribute("type") ?? DEFAULT_NODE_TYPE;
      const nodeType = isCfcNodeType(rawType) ? rawType : DEFAULT_NODE_TYPE;
      const template = getNodeTemplateByType(nodeType);
      const executionOrder = Math.max(1, Math.floor(parseNumberAttr(nodeElement, "executionOrder", sourceIndex + 1)));
      const width = Math.max(template.width, parseNumberAttr(nodeElement, "width", template.width));
      const height = Math.max(template.height, parseNumberAttr(nodeElement, "height", template.height));
      parsedNodes.push({
        node: {
          id: requireAttr(nodeElement, "id"),
          type: nodeType,
          label: nodeElement.getAttribute("label") ?? "Block",
          x: parseNumberAttr(nodeElement, "x"),
          y: parseNumberAttr(nodeElement, "y"),
          width,
          height,
        },
        executionOrder,
        sourceIndex,
      });
    }

    parsedNodes
      .sort((left, right) => {
        if (left.executionOrder !== right.executionOrder) {
          return left.executionOrder - right.executionOrder;
        }
        return left.sourceIndex - right.sourceIndex;
      })
      .forEach((entry) => {
        graph.nodes.push(entry.node);
      });

    const connectionElements = cfc.getElementsByTagNameNS("*", "connection");
    for (const connectionElement of Array.from(connectionElements)) {
      const rawFromPort = connectionElement.getAttribute("fromPort") ?? "output:0";
      const rawToPort = connectionElement.getAttribute("toPort") ?? "input:0";
      graph.connections.push({
        id: requireAttr(connectionElement, "id"),
        fromNodeId: requireAttr(connectionElement, "from"),
        fromPort: rawFromPort === "output" ? "output:0" : rawFromPort,
        toNodeId: requireAttr(connectionElement, "to"),
        toPort: rawToPort === "input" ? "input:0" : rawToPort,
      });
    }

    return graph;
  },
};
