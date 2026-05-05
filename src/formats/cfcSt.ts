import type { CfcFormatAdapter } from "./types.js";
import { CfcGraph, CfcNode, CfcConnection, createEmptyGraph, CfcNodeType, getNodeTemplateByType } from "../model.js";
import { canOmitPortReference, serializePort } from "./shared.js";

class CfcSTParser {
  parse(text: string): CfcGraph {
    const lines = text.split(/\r?\n/);
    const graph = createEmptyGraph();
    const declLines: string[] = [];
    const connectionDrafts: Array<{ operator: "=>" | "->"; left: string; right: string }> = [];

    type State = "INIT" | "DECL" | "CFC";
    let state: State = "INIT";

    let activeNode: CfcNode | null = null;
    let nextNodeIndex = 1;
    let nextConnIndex = 1;

    const pushNode = (node: CfcNode) => {
      graph.nodes.push(node);
    };

    const pushConnection = (conn: Omit<CfcConnection, "id">) => {
      graph.connections.push({ ...conn, id: `c${nextConnIndex++}` });
    };

    const parsePortIndexFromName = (pin: string, kind: "input" | "output"): number => {
      const upper = pin.trim().toUpperCase();
      if (upper.length === 0) {
        return 0;
      }

      if (kind === "input") {
        if (upper === "EN") {
          return 0;
        }
        const match = upper.match(/^IN(\d+)$/);
        if (match) {
          return Math.max(0, Number.parseInt(match[1] ?? "1", 10) - 1);
        }
        return 0;
      }

      if (upper === "ENO" || upper === "OUT") {
        return 0;
      }
      const match = upper.match(/^OUT(\d+)$/);
      if (match) {
        return Math.max(0, Number.parseInt(match[1] ?? "1", 10) - 1);
      }
      return 0;
    };

    const trimComma = (s: string) => s.replace(/,$/, "");

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      const line = raw.trim();
      if (line.length === 0 && state !== "DECL") {
        // blank line, ignore outside declaration block
        continue;
      }

      // State transitions
      if (/^declaration\s*:/i.test(line)) {
        state = "DECL";
        continue;
      }
      if (/^end_declaration/i.test(line)) {
        state = "CFC";
        continue;
      }
      if (/^cfc\s*:/i.test(line)) {
        state = "CFC";
        continue;
      }

      if (state === "DECL") {
        declLines.push(raw);
        continue;
      }

      // CFC parsing
      if (state === "INIT" && line.length > 0) {
        // If we encounter CFC content before explicit declaration end, assume CFC
        state = "CFC";
      }

      if (state === "CFC") {
        // ignore comment lines
        if (line.startsWith("//") || line.startsWith("/*")) continue;

        // meta block begin/end
        if (line === "{") continue;
        if (line === "}") {
          activeNode = null;
          continue;
        }

        // meta assignment
        if (line.startsWith("@") && activeNode) {
          const cleaned = trimComma(line);
          const parts = cleaned.split("=");
          if (parts.length >= 2) {
            const key = (parts[0] ?? "").trim();
            let val = parts.slice(1).join("=").trim();
            // remove optional quotes
            if (/^".*"$/.test(val)) val = val.slice(1, -1);
            const num = Number(val);
            if (key === "@id") activeNode.id = val;
            else if (key === "@x") activeNode.x = isNaN(num) ? 0 : num;
            else if (key === "@y") activeNode.y = isNaN(num) ? 0 : num;
            else if (key === "@w") activeNode.width = isNaN(num) ? activeNode.width : num;
            else if (key === "@h") activeNode.height = isNaN(num) ? activeNode.height : num;
            else {
              // ignore other metadata for now
            }
          }
          continue;
        }

        // constant injection (=>)
        if (line.includes("=>")) {
          const [left, right] = line.split("=>").map(s => s.trim());
          connectionDrafts.push({ operator: "=>", left: left ?? "", right: right ?? "" });
          continue;
        }

        // normal connection (->)
        if (line.includes("->")) {
          const [left, right] = line.split("->").map(s => s.trim());
          connectionDrafts.push({ operator: "->", left: left ?? "", right: right ?? "" });
          continue;
        }

        // node declaration: accept both `Name : TYPE(...)` and `TYPE(Label)` forms
        {
          const lineNoBrace = line.replace(/\{\s*$/, "").trim();
          const hasColon = lineNoBrace.includes(":");
          let leftName = "";
          let typePart = lineNoBrace;
          if (hasColon) {
            const idx = lineNoBrace.indexOf(":");
            leftName = lineNoBrace.slice(0, idx).trim();
            typePart = lineNoBrace.slice(idx + 1).trim();
          }

          const m = /^([A-Za-z0-9_]+)(?:\((.*)\))?/.exec(typePart);
          if (m) {
            const t = m[1];
            const param = m[2];
            let baseType: CfcNodeType = "box";
            let parsedParam: string | undefined = undefined;
            switch (t) {
              case "INPUT": baseType = "input"; parsedParam = param || undefined; break;
              case "OUTPUT": baseType = "output"; parsedParam = param || undefined; break;
              case "BOX": baseType = "box"; parsedParam = param || undefined; break;
              case "BOX_EN": baseType = "box-en-eno"; parsedParam = param || undefined; break;
              case "LABEL": baseType = "label"; parsedParam = param || undefined; break;
              case "JUMP": baseType = "jump"; parsedParam = param || undefined; break;
              case "RETURN": baseType = "return"; break;
              case "COMPOSER": baseType = "composer"; parsedParam = param || undefined; break;
              case "SELECTOR": baseType = "selector"; parsedParam = param || undefined; break;
              case "CM_SOURCE": baseType = "connection-mark-source"; parsedParam = param || undefined; break;
              case "CM_SINK": baseType = "connection-mark-sink"; parsedParam = param || undefined; break;
              case "COMMENT": baseType = "comment"; parsedParam = param || undefined; break;
              default: baseType = "box"; parsedParam = param || undefined; break;
            }

            const template = getNodeTemplateByType(baseType as CfcNodeType);

            // Decide final label and typeName according to new convention
            let finalLabel = "";
            let finalTypeName: string | undefined = undefined;

            if (baseType === "box") {
              // BOX keeps the left identifier as label; parentheses are the typeName
              finalLabel = hasColon ? leftName : "";
              finalTypeName = parsedParam ? parsedParam.trim() : undefined;
            } else if (baseType === "comment") {
              // comment keeps payload in typeName (strip quotes if present)
              finalLabel = hasColon ? leftName : "";
              finalTypeName = parsedParam ? parsedParam.trim().replace(/^"(.*)"$/, "$1") : (hasColon ? leftName : undefined);
            } else {
              if (hasColon) {
                // legacy form `Name : TYPE(param)` -> keep Name as label, preserve param
                finalLabel = leftName;
                finalTypeName = parsedParam ? parsedParam.trim() : undefined;
              } else {
                // new form `TYPE(Label)` -> label is in parentheses
                finalLabel = parsedParam ? parsedParam.trim() : "";
                finalTypeName = undefined;
              }
            }

            const node: CfcNode = {
              id: `node${nextNodeIndex++}`,
              type: baseType as CfcNodeType,
              label: finalLabel,
              x: 0,
              y: 0,
              width: template.width,
              height: template.height,
              typeName: finalTypeName ? finalTypeName.trim() : undefined
            };

            pushNode(node);
            activeNode = node;
            continue;
          }
        }
      }
    }

    const nodeByName = new Map<string, CfcNode>();
    graph.nodes.forEach((node) => {
      nodeByName.set(node.id, node);
      nodeByName.set(node.label, node);
      if (node.typeName) {
        nodeByName.set(node.typeName, node);
      }
    });

    const resolveEndpoint = (raw: string, kind: "input" | "output"): { nodeId: string; port: string } => {
      const trimmed = raw.trim();
      const [namePart, pinPart = ""] = trimmed.split(".");
      const nodeName = (namePart ?? "").trim();
      const pin = pinPart.trim();
      const node = nodeByName.get(nodeName);

      if (node && pin.length === 0 && !canOmitPortReference(node.type, kind)) {
        throw new Error(`Fehlender Port fuer Knoten "${nodeName}" in ${kind}-Richtung.`);
      }

      if (!node) {
        return {
          nodeId: nodeName,
          port: pin.length > 0 ? `${kind}:${parsePortIndexFromName(pin, kind)}` : `${kind}:0`,
        };
      }

      return {
        nodeId: node.id,
        port: pin.length > 0 ? `${kind}:${parsePortIndexFromName(pin, kind)}` : `${kind}:0`,
      };
    };

    connectionDrafts.forEach((draft) => {
      const left = draft.left.trim();
      const right = draft.right.trim();
      const [leftNamePart] = left.split(".");
      const leftNodeName = (leftNamePart ?? "").trim();
      const leftNode = nodeByName.get(leftNodeName);

      const source = leftNode
        ? resolveEndpoint(left, "output")
        : draft.operator === "=>"
          ? { nodeId: "__CONST__", port: leftNodeName }
          : { nodeId: "__VAR__", port: leftNodeName };

      const target = resolveEndpoint(right, "input");

      pushConnection({
        fromNodeId: source.nodeId,
        fromPort: source.port,
        toNodeId: target.nodeId,
        toPort: target.port,
      });
    });

    // Trim leading/trailing blank lines from the parsed declaration block so
    // exported formatting newlines are not stored inside `graph.declarations`.
    while (declLines.length > 0 && /^\s*$/.test(declLines[0] ?? "")) {
      declLines.shift();
    }
    while (declLines.length > 0 && /^\s*$/.test(declLines[declLines.length - 1] ?? "")) {
      declLines.pop();
    }
    if (declLines.length === 0) {
      // No meaningful declaration content: keep model default
      graph.declarations = createEmptyGraph().declarations;
    } else {
      graph.declarations = declLines.join("\n");
    }
    return graph;
  }
}

export const cfcStFormat: CfcFormatAdapter = {
  id: "cfc-st",
  label: "CFC-ST",
  fileExtension: "st-cfc",

  serialize: (graph: CfcGraph): string => {
    let result = "declaration:\n";
    let declarationsContent = graph.declarations || "PROGRAM CFC\nVAR\nEND_VAR";
    declarationsContent = declarationsContent.replace(/^declaration:\s*/i, "").replace(/end_declaration\s*$/i, "");
    result += "\n" + declarationsContent.trim() + "\n\n";

    result += "cfc:\n\n";

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

    const formatEndpoint = (nodeId: string, port: string, kind: "input" | "output"): string => {
      const node = nodeById.get(nodeId);
      if (!node) {
        return port.length > 0 ? `${nodeId}.${port}` : nodeId;
      }

      const nodeName = node.label || node.id;
      if (serializePort(port, kind, node.type) === kind) {
        return nodeName;
      }

      const index = Number.parseInt((port.split(":")[1] ?? "0"), 10);
      const template = getNodeTemplateByType(node.type);
      const pin = kind === "input"
        ? (template.inputCount === 1 ? "IN1" : `IN${index + 1}`)
        : (template.outputCount === 1 ? "OUT" : index === 0 ? "OUT" : `OUT${index + 1}`);
      return `${nodeName}.${pin}`;
    };

    graph.nodes.forEach(node => {
      const tokenForType = (t: CfcNodeType) => {
        switch (t) {
          case "input": return "INPUT";
          case "output": return "OUTPUT";
          case "box": return "BOX";
          case "box-en-eno": return "BOX_EN";
          case "jump": return "JUMP";
          case "label": return "LABEL";
          case "return": return "RETURN";
          case "composer": return "COMPOSER";
          case "selector": return "SELECTOR";
          case "connection-mark-source": return "CM_SOURCE";
          case "connection-mark-sink": return "CM_SINK";
          case "comment": return "COMMENT";
          default: return "BOX";
        }
      };

      const token = tokenForType(node.type);
      let header = "";

      if (node.type === "box") {
        const labelPart = node.label && node.label.trim() ? `${node.label} : ` : "";
        header = `${labelPart}${token}(${node.typeName || ""})`;
      } else if (node.type === "comment") {
        const payload = node.typeName ?? node.label ?? "";
        header = `COMMENT("${payload}")`;
      } else if (node.type === "return") {
        header = token;
      } else {
        const inner = node.label && node.label.trim() ? node.label : (node.typeName || "");
        header = `${token}(${inner})`;
      }

      result += `${header} {\n`;
      result += `  @id = ${node.id},\n`;
      result += `  @x = ${node.x},\n`;
      result += `  @y = ${node.y}\n`;
      result += `}\n\n`;
    });

    graph.connections.forEach(conn => {
      const fromNode = nodeById.get(conn.fromNodeId);
      const toNode = nodeById.get(conn.toNodeId);

      if (conn.fromNodeId === "__CONST__" || conn.fromNodeId === "__VAR__") {
        const targetText = toNode ? formatEndpoint(conn.toNodeId, conn.toPort, "input") : `${conn.toNodeId}.${conn.toPort}`;
        result += `${conn.fromPort} => ${targetText}\n`;
      } else if (fromNode?.type === "input") {
        const sourceText = formatEndpoint(conn.fromNodeId, conn.fromPort, "output");
        const targetText = toNode ? formatEndpoint(conn.toNodeId, conn.toPort, "input") : `${conn.toNodeId}.${conn.toPort}`;
        result += `${sourceText} => ${targetText}\n`;
      } else {
        const sourceText = fromNode ? formatEndpoint(conn.fromNodeId, conn.fromPort, "output") : `${conn.fromNodeId}.${conn.fromPort}`;
        const targetText = toNode ? formatEndpoint(conn.toNodeId, conn.toPort, "input") : `${conn.toNodeId}.${conn.toPort}`;
        result += `${sourceText} -> ${targetText}\n`;
      }
    });

    return result.trim() + "\n";
  },

  deserialize: (raw: string): CfcGraph => {
    const parser = new CfcSTParser();
    return parser.parse(raw);
  }
};
