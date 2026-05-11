import { createEmptyGraph, type CfcGraph, type CfcNodeType } from "../model.js";
import type { CfcFormatAdapter, DeserializeResult } from "./types.js";
import { createDeserializeResult, createFormatErrorWithFallback } from "./errors.js";
import {
  buildOrderedNodesFromRaw,
  buildValidConnectionsFromRaw,
  collectOrderedNodeValidationErrors,
  deriveDeclarationsFromNodes,
  getCommonRequiredNodeAttributeSpecs,
  getExportLabelFieldName,
  getRequiredNodeAttributeSpecs,
  isObjectRecord,
  parseNodeEntry,
  toExecutionOrderedSerializableGraph,
  toStringValue,
  collectDuplicateGroupedErrors,
} from "./shared.js";
import { generateDeclarations, parseDeclarations } from "../declarations/parser.js";

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

const getJsonObjectKeys = (value: unknown): string[] => (isObjectRecord(value) ? Object.keys(value) : []);

const findInvalidExecutionOrderSyntax = (raw: string): { line: number; value: string } | null => {
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(/"executionOrder"\s*:\s*([^,}\]\s]+)/);
    if (!match) {
      continue;
    }

    const value = (match[1] ?? "").trim();
    if (!/^[-]?\d+(?:\.\d+)?$/.test(value) && !value.startsWith('"')) {
      return { line: index + 1, value };
    }
  }

  return null;
};

const findInvalidCoordinateSyntax = (raw: string): { line: number; value: string } | null => {
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(/"(x|y)"\s*:\s*([^,}\]\s]+)/);
    if (!match) {
      continue;
    }

    const value = (match[2] ?? "").trim();
    if (!/^[-]?\d+(?:\.\d+)?$/.test(value) && !value.startsWith('"')) {
      return { line: index + 1, value };
    }
  }

  return null;
};



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
      declarations: declParsed.variables.map((variable) => ({ name: variable.name, type: variable.type })),
      nodes: payload.nodes,
      connections: payload.connections.map((connection) => ({
        id: connection.id,
        fromNodeId: connection.fromNodeId,
        toNodeId: connection.toNodeId,
        fromPin: connection.fromPin,
        toPin: connection.toPin,
      })),
    };
    return `${JSON.stringify(exportPayload, null, 2)}\n`;
  },
  deserialize(raw: string): DeserializeResult {
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        const invalidCoordinate = findInvalidCoordinateSyntax(raw);
        if (invalidCoordinate) {
          return createDeserializeResult(createEmptyGraph(), [
            {
              line: invalidCoordinate.line,
              messageKey: "formatErrorInvalidCoordinates",
              message: `Ungültige Koordinaten: "${invalidCoordinate.value}"`,
            },
          ]);
        }
        const invalidExecutionOrder = findInvalidExecutionOrderSyntax(raw);
        if (invalidExecutionOrder) {
          return createDeserializeResult(createEmptyGraph(), [
            {
              line: invalidExecutionOrder.line,
              messageKey: "formatErrorInvalidExecutionOrder",
              message: `Ungültige executionOrder: "${invalidExecutionOrder.value}"`,
            },
          ]);
        }
        const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
        throw new Error(`Ungültiges JSON-Format: ${msg}`);
      }

      if (!isObjectRecord(parsed)) {
        throw new Error("Ungültige JSON-Struktur: Root-Element muss ein Objekt sein");
      }

      const graph = createEmptyGraph();
      graph.version = toStringValue(parsed.version, "1.0");

      const nodesRaw = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      const connectionsRaw = Array.isArray(parsed.connections) ? parsed.connections : [];

      const parsedEntries: Array<any> = [];
      const idCounts = new Map<string, number>();
      const validationErrors = nodesRaw.flatMap((entry, index) => {
        const nodeErrors: ReturnType<typeof createFormatErrorWithFallback>[] = [];
        const nodeId = isObjectRecord(entry) && typeof entry.id === "string" ? entry.id : `N${index + 1}`;
        const duplicateIndex = idCounts.get(nodeId) ?? 0;
        const lineNumber = findLineNumberByOccurrence(raw, `"id": "${nodeId}"`, duplicateIndex, index + 1);
        idCounts.set(nodeId, duplicateIndex + 1);

        if (isObjectRecord(entry)) {
          const allowedKeys = new Set([
            "id",
            "type",
            "label",
            "x",
            "y",
            "width",
            "height",
            "executionOrder",
            "typeName",
            "declarationName",
            "instanceName",
            "expression",
            "content",
            "text",
            "signal",
          ]);
          const invalidKeys = getJsonObjectKeys(entry).filter((key) => !allowedKeys.has(key));
          if (invalidKeys.length > 0) {
            nodeErrors.push(
              createFormatErrorWithFallback(lineNumber, "formatErrorInvalidAttributes", `Ungültige Attribute (${invalidKeys.join(", ")})`),
            );
          }

          const hasTypeAttr = typeof entry.type === "string" && entry.type.trim().length > 0;
          const nodeType = (hasTypeAttr ? entry.type : "box") as CfcNodeType;
          // mark whether the original export label field was present so serialization
          // can preserve omissions instead of re-adding defaulted attributes
          try {
            const fieldName = getExportLabelFieldName(nodeType);
            if (!(entry as any).__metadata) (entry as any).__metadata = {};
            (entry as any).__metadata.hadExportLabelField = Object.prototype.hasOwnProperty.call(entry, fieldName);
          } catch {
            /* ignore */
          }
          if (!(entry as any).__metadata) (entry as any).__metadata = {};
          (entry as any).__metadata.hadExecutionOrder = Object.prototype.hasOwnProperty.call(entry, "executionOrder");

          const missingKeys: string[] = [];
          const commonSpecs = getCommonRequiredNodeAttributeSpecs();
          commonSpecs.forEach((spec) => {
            const hasValue = spec.candidates.some((key) => {
              const rawValue = entry[key];
              return typeof rawValue === "string" ? rawValue.trim().length > 0 : rawValue !== undefined && rawValue !== null;
            });
            if (!hasValue) {
              missingKeys.push(spec.field);
            }
          });

          if (hasTypeAttr) {
            const requiredSpecs = getRequiredNodeAttributeSpecs(nodeType);
            requiredSpecs.forEach((spec) => {
              const hasValue = spec.candidates.some((key) => {
                const rawValue = entry[key];
                return typeof rawValue === "string" ? rawValue.trim().length > 0 : rawValue !== undefined && rawValue !== null;
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
            nodeErrors.push(
              createFormatErrorWithFallback(
                lineNumber,
                "formatErrorMissingAttributes",
                message,
              ),
            );
          }
        }

        try {
          const parsedEntry = parseNodeEntry(entry, index);
          if (parsedEntry) {
            parsedEntry.lineNumber = lineNumber;
            parsedEntries.push(parsedEntry);
          }
        } catch (error) {
          const messageKey = (error as any)?.messageKey ?? "formatErrorInvalidNodeSyntax";
          const message = error instanceof Error ? error.message : String(error);
          nodeErrors.push(createFormatErrorWithFallback(lineNumber, messageKey, message));
        }

        return nodeErrors;
      });

      validationErrors.push(...collectOrderedNodeValidationErrors(parsedEntries));
      validationErrors.push(
        ...collectDuplicateGroupedErrors(
          parsedEntries
            .filter((entry) => entry.node.type === "box" || entry.node.type === "box-en-eno")
            .map((entry) => ({ key: entry.node.label.trim(), line: entry.lineNumber ?? entry.sourceIndex + 1 }))
            .filter((entry) => entry.key.length > 0),
          "formatErrorDuplicateInstanceName",
          (key) => `Instanzname mehrfach belegt (${key})`,
        ),
      );

      const connectionIdLines = new Map<string, number[]>();
      connectionsRaw.forEach((entry, index) => {
        const connectionId = isObjectRecord(entry) && typeof entry.id === "string" ? entry.id : `C${index + 1}`;
        const duplicateIndex = connectionIdLines.get(connectionId)?.length ?? 0;
        const lineNumber = findLineNumberByOccurrence(raw, `"id": "${connectionId}"`, duplicateIndex, index + 1);
        const lines = connectionIdLines.get(connectionId) ?? [];
        lines.push(lineNumber);
        connectionIdLines.set(connectionId, lines);
      });
      connectionIdLines.forEach((lines, connectionId) => {
        if (lines.length > 1) {
          validationErrors.push({
            line: lines[0] ?? 1,
            lines: [...new Set(lines)].sort((left, right) => left - right),
            messageKey: "formatErrorDuplicateConnectionId",
            message: `Connection-ID mehrfach belegt (${connectionId})`,
          });
        }
      });

      if (validationErrors.length > 0) {
        return createDeserializeResult(graph, validationErrors);
      }

      graph.nodes = buildOrderedNodesFromRaw(nodesRaw);

      const nodeIds = new Set(graph.nodes.map((node) => node.id));
      graph.connections = buildValidConnectionsFromRaw(connectionsRaw, nodeIds);
      if (Array.isArray((parsed as any).declarations)) {
        const vars = (parsed as any).declarations as Array<Record<string, unknown>>;
        const variables = vars.map((variable) => ({ name: String(variable.name ?? ""), type: String(variable.type ?? "") }));
        graph.declarations = generateDeclarations(variables as any);
      } else if (typeof parsed.declarations === "string" && parsed.declarations.trim().length > 0) {
        graph.declarations = parsed.declarations;
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
          message: errorMessage.startsWith("Ungültig")
            ? errorMessage
            : `Ungültiges JSON: ${errorMessage}`,
        },
      ]);
    }
  },
};
