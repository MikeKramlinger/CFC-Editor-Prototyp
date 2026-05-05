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

        // node declaration (Name : TYPE(...))
        if (line.includes(":")) {
          const [left, right] = line.split(":").map(s => s.trim());
          const nodeName = left ?? "";
          const typePart = right ?? "";
          const m = /^([A-Za-z0-9_]+)(?:\((.*)\))?/.exec(typePart);
          let baseType: CfcNodeType = "box";
          let typeName: string | undefined;
          if (m) {
            const t = m[1];
            const param = m[2];
            switch (t) {
              case "INPUT": baseType = "input"; typeName = param || undefined; break;
              case "OUTPUT": baseType = "output"; typeName = param || undefined; break;
              case "BOX": baseType = "box"; typeName = param || undefined; break;
              case "BOX_EN": baseType = "box-en-eno"; typeName = param || undefined; break;
              case "LABEL": baseType = "label"; typeName = param || undefined; break;
              case "JUMP": baseType = "jump"; typeName = param || undefined; break;
              case "RETURN": baseType = "return"; break;
              case "COMPOSER": baseType = "composer"; break;
              case "SELECTOR": baseType = "selector"; break;
              case "CONNECTION_MARK_SOURCE": baseType = "connection-mark-source"; break;
              case "CONNECTION_MARK_SINK": baseType = "connection-mark-sink"; break;
              case "COMMENT": baseType = "comment"; if (param) typeName = param.replace(/^"|"$/g, ""); break;
              default: baseType = "box"; typeName = param || undefined; break;
            }
          }

          const template = getNodeTemplateByType(baseType as CfcNodeType);
          const node: CfcNode = {
            id: `node${nextNodeIndex++}`,
            type: baseType as CfcNodeType,
            label: nodeName.trim(),
            x: 0,
            y: 0,
            width: template.width,
            height: template.height,
            typeName: typeName ? typeName.trim() : undefined
          };

          pushNode(node);
          activeNode = node;
          continue;
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

    graph.declarations = declLines.join("\n");
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
      let typeStr = "BOX(";
      switch (node.type) {
        case "input": typeStr = `INPUT(${node.typeName || ""})`; break;
        case "output": typeStr = `OUTPUT(${node.typeName || ""})`; break;
        case "box": typeStr = `BOX(${node.typeName || ""})`; break;
        case "box-en-eno": typeStr = `BOX_EN(${node.typeName || ""})`; break;
        case "jump": typeStr = `JUMP(${node.typeName || ""})`; break;
        case "label": typeStr = `LABEL(${node.typeName || ""})`; break;
        case "return": typeStr = `RETURN`; break;
        case "composer": typeStr = `COMPOSER`; break;
        case "selector": typeStr = `SELECTOR`; break;
        case "comment": typeStr = `COMMENT("${node.typeName || ""}")`; break;
        default: typeStr = `BOX(${node.typeName || ""})`; break;
      }

      result += `${node.label} : ${typeStr} {\n`;
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

    return result;
  },

  deserialize: (raw: string): CfcGraph => {
    const parser = new CfcSTParser();
    return parser.parse(raw);
  }
};
