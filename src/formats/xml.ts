import {
  DEFAULT_NODE_TYPE,
  createEmptyGraph,
  type CfcGraph,
  type CfcNodeType,
} from "../model.js";
import { isExecutionOrderedNode } from "../core/graph/executionOrder.js";
import type { CfcFormatAdapter, DeserializeResult } from "./types.js";
import { createDeserializeResult, createFormatErrorWithFallback } from "./errors.js";
import {
  buildOrderedNodesFromRaw,
  buildValidConnectionsFromRaw,
  collectOrderedNodeValidationErrors,
  deriveDeclarationsFromNodes,
  serializePort,
  getImportLabelValue,
  getExportLabelEntry,
  getExportLabelFieldName,
  parseNodeEntry,
  sortParsedNodeEntries,
  collectDuplicateGroupedErrors,
  getCommonRequiredNodeAttributeSpecs,
  getRequiredNodeAttributeSpecs,
  parseValidatedWaypoints,
} from "./shared.js";
import { parseDeclarations, generateDeclarations } from "../declarations/parser.js";

const findLineNumberByOccurrence = (raw: string, token: string, occurrence: number, fallbackLine: number): number => {
  const lines = raw.split(/\r?\n/);
  let seen = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.includes(token)) {
      if (seen === occurrence) {
        return index + 1;
      }
      seen += 1;
    }
  }
  return fallbackLine;
};

const requireAttr = (element: Element, name: string): string => {
  const value = element.getAttribute(name);
  if (!value) {
    throw new Error(`Fehlendes Attribut: ${name}`);
  }
  return value;
};

const requireNumberAttr = (element: Element, name: string): number => {
  const raw = element.getAttribute(name);
  if (!raw) {
    throw new Error(`Fehlendes Attribut: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    const error = new Error(`Ungültiges Zahlenformat für ${name}: "${raw}"`);
    (error as Error & { messageKey?: string }).messageKey = "formatErrorInvalidCoordinates";
    throw error;
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
      const shouldEmitOrder = isExecutionOrderedNode(node) && (node.__metadata?.hadExecutionOrder ?? true) !== false;
      if (shouldEmitOrder) {
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
      
      if (connection.routingMode && connection.routingMode !== "auto") {
        connectionElement.setAttribute("routingMode", connection.routingMode);
      }
      
      if (connection.waypoints?.length) {
        const waypointsElem = documentRoot.createElement("waypoints");
        connection.waypoints.forEach((waypoint) => {
          const waypointElem = documentRoot.createElement("waypoint");
          waypointElem.setAttribute("x", String(waypoint.x));
          waypointElem.setAttribute("y", String(waypoint.y));
          waypointsElem.append(waypointElem);
        });
        connectionElement.append(waypointsElem);
      }
      
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
  deserialize(raw: string): DeserializeResult {
    try {
      const xml = new DOMParser().parseFromString(raw, "application/xml");
      if (xml.querySelector("parsererror")) {
        throw new Error("Invalid XML");
      }

      const graph = createEmptyGraph();
      const cfc = xml.getElementsByTagNameNS("*", "cfcEditor").item(0);
      if (!cfc) {
        return createDeserializeResult(graph, []);
      }

      graph.version = cfc.getAttribute("version") ?? "1.0";

      const nodeElements = cfc.getElementsByTagNameNS("*", "node");
      const idCounts = new Map<string, number>();
      const parseErrors: import("./errors.js").FormatError[] = [];
      const allowedNodeAttributes = new Set([
        "id",
        "type",
        "label",
        "x",
        "y",
        "executionOrder",
        "typeName",
        "declarationName",
        "instanceName",
        "expression",
        "content",
        "text",
        "signal",
      ]);
      const nodesRaw = Array.from(nodeElements).flatMap((nodeElement, sourceIndex) => {
        try {
          const nodeId = nodeElement.getAttribute("id") ?? `N${sourceIndex + 1}`;
          const duplicateIndex = idCounts.get(nodeId) ?? 0;
          const lineNumber = findLineNumberByOccurrence(raw, `id="${nodeId}"`, duplicateIndex, sourceIndex + 1);

          const invalidAttributes = Array.from(nodeElement.attributes)
            .map((attribute) => attribute.name)
            .filter((attributeName) => !allowedNodeAttributes.has(attributeName));
          if (invalidAttributes.length > 0) {
            parseErrors.push(
              createFormatErrorWithFallback(
                lineNumber,
                "formatErrorInvalidAttributes",
                `Ungültige Attribute (${invalidAttributes.join(", ")})`,
              ),
            );
          }

          const hasTypeAttr = (nodeElement.getAttribute("type") ?? "").trim().length > 0;
          const nodeType = (nodeElement.getAttribute("type") ?? DEFAULT_NODE_TYPE) as CfcNodeType;
          const missingKeys: string[] = [];
          const commonSpecs = getCommonRequiredNodeAttributeSpecs();
          commonSpecs.forEach((spec) => {
            const hasValue = spec.candidates.some((key) => {
              const requiredValue = nodeElement.getAttribute(key);
              return requiredValue && requiredValue.trim().length > 0;
            });
            if (!hasValue) {
              missingKeys.push(spec.field);
            }
          });

          if (hasTypeAttr) {
            const requiredSpecs = getRequiredNodeAttributeSpecs(nodeType);
            requiredSpecs.forEach((spec) => {
              const hasValue = spec.candidates.some((key) => {
                const requiredValue = nodeElement.getAttribute(key);
                return requiredValue && requiredValue.trim().length > 0;
              });
              if (!hasValue) {
                missingKeys.push(spec.field);
              }
            });
          }

          if (missingKeys.length > 0) {
            const detail = missingKeys.join(", ");
            const message = hasTypeAttr
              ? `Fehlende Attribute für Knotentyp "${nodeType}" (${detail})`
              : `Fehlende Attribute für Knotentyp (${detail})`;
            parseErrors.push(
              createFormatErrorWithFallback(
                lineNumber,
                "formatErrorMissingAttributes",
                message,
              ),
            );
          }
          const fieldName = getExportLabelFieldName(nodeType);
          const record: Record<string, unknown> = {
            label: nodeElement.getAttribute("label") ?? undefined,
            expression: nodeElement.getAttribute("expression") ?? undefined,
            instanceName: nodeElement.getAttribute("instanceName") ?? undefined,
            declarationName: nodeElement.getAttribute("declarationName") ?? undefined,
            content: nodeElement.getAttribute("content") ?? undefined,
            text: nodeElement.getAttribute("text") ?? undefined,
            signal: nodeElement.getAttribute("signal") ?? undefined,
            __metadata: {
              hadExportLabelField: nodeElement.hasAttribute(fieldName),
            },
          };

          const nodeRaw: Record<string, unknown> = {
            id: requireAttr(nodeElement, "id"),
            type: nodeType,
            label: getImportLabelValue(record, nodeType),
            x: requireNumberAttr(nodeElement, "x"),
            y: requireNumberAttr(nodeElement, "y"),
          };
          if (!(nodeRaw as any).__metadata) (nodeRaw as any).__metadata = {};
          (nodeRaw as any).__metadata.hadExecutionOrder = nodeElement.hasAttribute("executionOrder");
          if (nodeElement.hasAttribute("executionOrder")) {
            const rawExecutionOrder = nodeElement.getAttribute("executionOrder") ?? "";
            const executionOrder = Number(rawExecutionOrder);
            if (!Number.isFinite(executionOrder) || !Number.isInteger(executionOrder) || executionOrder < 1) {
              parseErrors.push(
                createFormatErrorWithFallback(
                  lineNumber,
                  "formatErrorInvalidExecutionOrder",
                  `Ungültige executionOrder: "${rawExecutionOrder}"`,
                ),
              );
            } else {
              nodeRaw.executionOrder = executionOrder;
            }
          }
          const typeName = nodeElement.getAttribute("typeName");
          if (typeName) {
            nodeRaw.typeName = typeName;
          }
          const declarationName = nodeElement.getAttribute("declarationName");
          if (declarationName) {
            nodeRaw.label = declarationName;
          }
          const nodeIdFromRaw = String(nodeRaw.id ?? `N${sourceIndex + 1}`);
          nodeRaw.lineNumber = lineNumber;
          idCounts.set(nodeIdFromRaw, duplicateIndex + 1);
          return [nodeRaw];
        } catch (error) {
          const lineNumber = (error as any)?.line ?? findLineNumberByOccurrence(raw, `id="${nodeElement.getAttribute("id") ?? ""}"`, 0, sourceIndex + 1);
          const messageKey = (error as any)?.messageKey ?? "formatErrorInvalidNodeSyntax";
          const errorMessage = error instanceof Error ? error.message : String(error);
          parseErrors.push(createFormatErrorWithFallback(lineNumber, messageKey, errorMessage));
          return [];
        }
      });

      const validationEntries: Array<import("./shared.js").ParsedNodeEntry> = [];
      const validationErrors = [
        ...parseErrors,
        ...nodesRaw.flatMap((entry, index) => {
          try {
            const parsedEntry = parseNodeEntry(entry, index);
            if (!parsedEntry) {
              return [];
            }
            parsedEntry.lineNumber = Number(entry.lineNumber) || index + 1;
            validationEntries.push(parsedEntry);
            return [];
          } catch (error) {
            const messageKey = (error as any)?.messageKey ?? "formatErrorInvalidNodeSyntax";
            const errorMessage = error instanceof Error ? error.message : String(error);
            const lineNumber = Number((entry as any)?.lineNumber) || index + 1;
            return [createFormatErrorWithFallback(lineNumber, messageKey, errorMessage)];
          }
        }),
      ];

      validationErrors.push(...collectOrderedNodeValidationErrors(validationEntries));
      validationErrors.push(
        ...collectDuplicateGroupedErrors(
          validationEntries
            .filter((entry) => entry.node.type === "box" || entry.node.type === "box-en-eno")
            .map((entry) => ({ key: entry.node.label.trim(), line: entry.lineNumber ?? entry.sourceIndex + 1 }))
            .filter((entry) => entry.key.length > 0),
          "formatErrorDuplicateInstanceName",
          (key) => `Instanzname mehrfach belegt (${key})`,
        ),
      );

      const connectionIdOccurrences = new Map<string, number>();
      const connectionIdEntries = Array.from(cfc.getElementsByTagNameNS("*", "connection"))
        .map((connectionElement, index) => {
          const connectionId = requireAttr(connectionElement, "id");
          const occurrence = connectionIdOccurrences.get(connectionId) ?? 0;
          connectionIdOccurrences.set(connectionId, occurrence + 1);
          return {
            key: connectionId,
            line: findLineNumberByOccurrence(raw, `id="${connectionId}"`, occurrence, index + 1),
          };
        });
      validationErrors.push(
        ...collectDuplicateGroupedErrors(
          connectionIdEntries,
          "formatErrorDuplicateConnectionId",
          (key) => `Connection-ID mehrfach belegt (${key})`,
        ),
      );

      if (validationErrors.length > 0) {
        graph.nodes = sortParsedNodeEntries(validationEntries).map((entry) => entry.node);
        return createDeserializeResult(graph, validationErrors);
      }

      graph.nodes = buildOrderedNodesFromRaw(nodesRaw);

      const connectionElements = cfc.getElementsByTagNameNS("*", "connection");
      const connectionsRaw = Array.from(connectionElements).map((connectionElement) => {
        const rawFromPin = connectionElement.getAttribute("fromPin") ?? "output:0";
        const rawToPin = connectionElement.getAttribute("toPin") ?? "input:0";
        const waypointElements = Array.from(connectionElement.getElementsByTagNameNS("*", "waypoint"));
        const parsedWaypoints = parseValidatedWaypoints(
          waypointElements.map((wp) => ({
            x: wp.getAttribute("x") ?? "",
            y: wp.getAttribute("y") ?? "",
          })),
        );
        if (parsedWaypoints.error) {
          throw new Error(parsedWaypoints.error);
        }

        return {
          id: requireAttr(connectionElement, "id"),
          fromNodeId: requireAttr(connectionElement, "from"),
          fromPin: rawFromPin === "output" ? "output:0" : rawFromPin,
          toNodeId: requireAttr(connectionElement, "to"),
          toPin: rawToPin === "input" ? "input:0" : rawToPin,
          routingMode: connectionElement.getAttribute("routingMode") ?? "auto",
          waypoints: parsedWaypoints.waypoints,
        };
      });

      const nodeIds = new Set(graph.nodes.map((node) => node.id));
      graph.connections = buildValidConnectionsFromRaw(connectionsRaw, nodeIds);

      // Restore routing mode and waypoints
      graph.connections.forEach((connection) => {
        const raw = connectionsRaw.find((c: any) => c.id === connection.id);
        if (raw) {
          if (typeof raw.routingMode === "string") {
            connection.routingMode = raw.routingMode as "auto" | "manual";
          }
          if (Array.isArray(raw.waypoints)) {
            connection.waypoints = raw.waypoints;
          }
        }
      });

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

      return createDeserializeResult(graph, []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createDeserializeResult(createEmptyGraph(), [
        {
          line: 1,
          messageKey: "formatErrorInvalidDataFormat",
          message: errorMessage,
        },
      ]);
    }
  },
};
