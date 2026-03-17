import {
  createEmptyGraph,
  getNodeTemplateByType,
  isCfcNodeType,
  type CfcGraph,
  type CfcNode,
  type CfcNodeType,
} from "../model.js";
import { getExecutionOrderByNodeId, isExecutionOrderedNode } from "../core/graph/executionOrder.js";
import type { CfcFormatAdapter } from "./types.js";

const NAMESPACE = "http://www.plcopen.org/xml/tc6_0200";

type OgConnectionMode = "operator";

interface IncomingRef {
  targetInputIndex: number;
  refLocalId: string;
  sourceFormalParameter: string;
}

interface ParsedOgNode {
  localId: string;
  node: CfcNode;
  executionOrder: number;
  sourceIndex: number;
  inputNames: string[];
  outputNames: string[];
  incomingRefs: IncomingRef[];
}

interface ConnectorRef {
  refLocalId: string;
  formalParameter: string;
}

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

const parseNumberAttr = (element: Element | null, name: string, fallback = 0): number => {
  if (!element) {
    return fallback;
  }
  const raw = element.getAttribute(name);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const getDirectChildByLocalName = (parent: Element, localName: string): Element | null => {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) {
      return child;
    }
  }
  return null;
};

const getPosition = (element: Element): { x: number; y: number } => {
  const position = getDirectChildByLocalName(element, "position");
  return {
    x: parseNumberAttr(position, "x", 0),
    y: parseNumberAttr(position, "y", 0),
  };
};

const parsePortIndex = (port: string, kind: "input" | "output"): number => {
  const match = port.match(new RegExp(`^${kind}:(\\d+)$`));
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10);
};

const getInputNamesForType = (type: CfcNodeType): string[] => {
  if (type === "box-en-eno") {
    return ["EN", "In2", "In3"];
  }
  const count = getNodeTemplateByType(type).inputCount;
  return Array.from({ length: count }, (_value, index) => `In${index + 1}`);
};

const getOutputNamesForType = (type: CfcNodeType): string[] => {
  if (type === "box-en-eno") {
    return ["ENO", "Out2"];
  }
  const count = getNodeTemplateByType(type).outputCount;
  return Array.from({ length: count }, (_value, index) => `Out${index + 1}`);
};

const getNodeTypeFromElementType = (value: string): CfcNodeType => {
  switch (value) {
    case "composer":
      return "composer";
    case "selector":
      return "selector";
    case "sourceConnectionMark":
      return "connection-mark-source";
    case "sinkConnectionMark":
      return "connection-mark-sink";
    default:
      return "box";
  }
};

const getElementTypeForNode = (type: CfcNodeType): string | null => {
  switch (type) {
    case "composer":
      return "composer";
    case "selector":
      return "selector";
    case "connection-mark-source":
      return "sourceConnectionMark";
    case "connection-mark-sink":
      return "sinkConnectionMark";
    default:
      return null;
  }
};

const collectIncomingRefsForVariables = (variables: Element[]): IncomingRef[] => {
  const refs: IncomingRef[] = [];
  variables.forEach((variable, index) => {
    const connection = variable.getElementsByTagNameNS("*", "connection").item(0);
    if (!connection) {
      return;
    }
    const refLocalId = connection.getAttribute("refLocalId") ?? "";
    if (refLocalId.length === 0) {
      return;
    }
    refs.push({
      targetInputIndex: index,
      refLocalId,
      sourceFormalParameter: connection.getAttribute("formalParameter") ?? "",
    });
  });
  return refs;
};

const parseIncomingSingleRef = (element: Element): IncomingRef[] => {
  const connection = element.getElementsByTagNameNS("*", "connection").item(0);
  if (!connection) {
    return [];
  }
  const refLocalId = connection.getAttribute("refLocalId") ?? "";
  if (refLocalId.length === 0) {
    return [];
  }
  return [{
    targetInputIndex: 0,
    refLocalId,
    sourceFormalParameter: connection.getAttribute("formalParameter") ?? "",
  }];
};

const parseTextFromXhtml = (element: Element, fallback: string): string => {
  const xhtml = element.getElementsByTagNameNS("*", "xhtml").item(0);
  return xhtml?.textContent?.trim() || fallback;
};

const parseCfcNodeElement = (element: Element, sourceIndex: number): ParsedOgNode | null => {
  const localId = element.getAttribute("localId") ?? "";
  if (localId.length === 0) {
    return null;
  }

  const position = getPosition(element);
  const executionOrder = Math.max(1, parseNumberAttr(element, "executionOrderId", sourceIndex + 1));

  if (element.localName === "inVariable") {
    const template = getNodeTemplateByType("input");
    const label = (getDirectChildByLocalName(element, "expression")?.textContent ?? "Input").trim() || "Input";
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames: [],
      outputNames: ["Out1"],
      incomingRefs: [],
      node: {
        id: `N${localId}`,
        type: "input",
        label,
        x: position.x,
        y: position.y,
        width: template.width,
        height: template.height,
      },
    };
  }

  if (element.localName === "outVariable") {
    const template = getNodeTemplateByType("output");
    const label = (getDirectChildByLocalName(element, "expression")?.textContent ?? "Output").trim() || "Output";
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames: ["In1"],
      outputNames: [],
      incomingRefs: parseIncomingSingleRef(element),
      node: {
        id: `N${localId}`,
        type: "output",
        label,
        x: position.x,
        y: position.y,
        width: template.width,
        height: template.height,
      },
    };
  }

  if (element.localName === "comment") {
    const template = getNodeTemplateByType("comment");
    const label = parseTextFromXhtml(element, "Comment");
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames: [],
      outputNames: [],
      incomingRefs: [],
      node: {
        id: `N${localId}`,
        type: "comment",
        label,
        x: position.x,
        y: position.y,
        width: parseNumberAttr(element, "width", template.width),
        height: parseNumberAttr(element, "height", template.height),
      },
    };
  }

  if (element.localName === "jump") {
    const template = getNodeTemplateByType("jump");
    const label = (element.getAttribute("label") ?? "Jump").trim() || "Jump";
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames: ["In1"],
      outputNames: [],
      incomingRefs: parseIncomingSingleRef(element),
      node: {
        id: `N${localId}`,
        type: "jump",
        label,
        x: position.x,
        y: position.y,
        width: template.width,
        height: template.height,
      },
    };
  }

  if (element.localName === "label") {
    const template = getNodeTemplateByType("label");
    const label = (element.getAttribute("label") ?? "Label").trim() || "Label";
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames: [],
      outputNames: [],
      incomingRefs: [],
      node: {
        id: `N${localId}`,
        type: "label",
        label,
        x: position.x,
        y: position.y,
        width: template.width,
        height: template.height,
      },
    };
  }

  if (element.localName === "return") {
    const template = getNodeTemplateByType("return");
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames: ["In1"],
      outputNames: [],
      incomingRefs: parseIncomingSingleRef(element),
      node: {
        id: `N${localId}`,
        type: "return",
        label: "Return",
        x: position.x,
        y: position.y,
        width: template.width,
        height: template.height,
      },
    };
  }

  if (element.localName === "block") {
    const inputVariables = Array.from(element.getElementsByTagNameNS("*", "inputVariables").item(0)?.getElementsByTagNameNS("*", "variable") ?? []);
    const outputVariables = Array.from(element.getElementsByTagNameNS("*", "outputVariables").item(0)?.getElementsByTagNameNS("*", "variable") ?? []);
    const inputNames = inputVariables.map((variable, index) => variable.getAttribute("formalParameter") ?? `In${index + 1}`);
    const outputNames = outputVariables.map((variable, index) => variable.getAttribute("formalParameter") ?? `Out${index + 1}`);
    const hasEnEno = inputNames.includes("EN") && outputNames.includes("ENO");
    const type: CfcNodeType = hasEnEno ? "box-en-eno" : "box";
    const template = getNodeTemplateByType(type);
    const label = (element.getAttribute("typeName") ?? "Box").trim() || "Box";
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames,
      outputNames,
      incomingRefs: collectIncomingRefsForVariables(inputVariables),
      node: {
        id: `N${localId}`,
        type,
        label,
        x: position.x,
        y: position.y,
        width: template.width,
        height: template.height,
      },
    };
  }

  if (element.localName === "vendorElement") {
    const elementTypeValue = (element
      .getElementsByTagNameNS("*", "ElementType")
      .item(0)
      ?.textContent ?? "").trim();
    const type = getNodeTypeFromElementType(elementTypeValue);
    const template = getNodeTemplateByType(type);
    const inputVariables = Array.from(element.getElementsByTagNameNS("*", "inputVariables").item(0)?.getElementsByTagNameNS("*", "variable") ?? []);
    const outputVariables = Array.from(element.getElementsByTagNameNS("*", "outputVariables").item(0)?.getElementsByTagNameNS("*", "variable") ?? []);
    const inputNames = inputVariables.map((variable, index) => variable.getAttribute("formalParameter") ?? `In${index + 1}`);
    const outputNames = outputVariables.map((variable, index) => variable.getAttribute("formalParameter") ?? `Out${index + 1}`);
    const label = parseTextFromXhtml(element, template.label);
    return {
      localId,
      executionOrder,
      sourceIndex,
      inputNames,
      outputNames,
      incomingRefs: collectIncomingRefsForVariables(inputVariables),
      node: {
        id: `N${localId}`,
        type,
        label,
        x: position.x,
        y: position.y,
        width: template.width,
        height: template.height,
      },
    };
  }

  return null;
};

const parseConnectorRefs = (cfcElement: Element): Map<string, ConnectorRef> => {
  const connectors = new Map<string, ConnectorRef>();
  const connectorElements = Array.from(cfcElement.getElementsByTagNameNS("*", "connector"));
  connectorElements.forEach((connector) => {
    const localId = connector.getAttribute("localId") ?? "";
    const connection = connector.getElementsByTagNameNS("*", "connection").item(0);
    if (!localId || !connection) {
      return;
    }
    const refLocalId = connection.getAttribute("refLocalId") ?? "";
    if (!refLocalId) {
      return;
    }
    connectors.set(localId, {
      refLocalId,
      formalParameter: connection.getAttribute("formalParameter") ?? "",
    });
  });
  return connectors;
};

const resolveSourceRef = (
  initialLocalId: string,
  initialFormalParameter: string,
  connectors: Map<string, ConnectorRef>,
): { localId: string; formalParameter: string } | null => {
  let localId = initialLocalId;
  let formalParameter = initialFormalParameter;
  const seen = new Set<string>();

  while (connectors.has(localId)) {
    if (seen.has(localId)) {
      return null;
    }
    seen.add(localId);
    const connector = connectors.get(localId);
    if (!connector) {
      return null;
    }
    if (!formalParameter && connector.formalParameter) {
      formalParameter = connector.formalParameter;
    }
    localId = connector.refLocalId;
  }

  return { localId, formalParameter };
};

const fallbackLocalId = (value: string | null, index: number): string => {
  if (!value) {
    return String(index + 1);
  }
  const match = value.match(/(\d+)$/);
  return match?.[1] ?? String(index + 1);
};

const appendPosition = (doc: Document, parent: Element, x: number, y: number): void => {
  const position = doc.createElementNS(NAMESPACE, "position");
  position.setAttribute("x", String(Math.round(x)));
  position.setAttribute("y", String(Math.round(y)));
  parent.append(position);
};

const createVariable = (doc: Document, formalParameter: string, isInput: boolean): Element => {
  const variable = doc.createElementNS(NAMESPACE, "variable");
  variable.setAttribute("formalParameter", formalParameter);
  const point = doc.createElementNS(NAMESPACE, isInput ? "connectionPointIn" : "connectionPointOut");
  const relPosition = doc.createElementNS(NAMESPACE, "relPosition");
  relPosition.setAttribute("x", "0");
  relPosition.setAttribute("y", "0");
  point.append(relPosition);
  if (!isInput) {
    const expression = doc.createElementNS(NAMESPACE, "expression");
    point.append(expression);
  }
  variable.append(point);
  return variable;
};

const createPlainElementTypeData = (doc: Document, value: string): Element => {
  const data = doc.createElementNS(NAMESPACE, "data");
  data.setAttribute("name", "http://www.3s-software.com/plcopenxml/cfcelementtype");
  data.setAttribute("handleUnknown", "implementation");
  const elementType = doc.createElement("ElementType");
  elementType.textContent = value;
  data.append(elementType);
  return data;
};

const createCallTypeData = (doc: Document, value: OgConnectionMode): Element => {
  const data = doc.createElementNS(NAMESPACE, "data");
  data.setAttribute("name", "http://www.3s-software.com/plcopenxml/cfccalltype");
  data.setAttribute("handleUnknown", "implementation");
  const callType = doc.createElement("CallType");
  callType.textContent = value;
  data.append(callType);
  return data;
};

const makeObjectId = (): string => {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000";
};

export const ogPlcopenXmlFormat: CfcFormatAdapter = {
  id: "og-plcopen-xml",
  label: "OGPLCopenXML",
  fileExtension: "xml",
  serialize(graph: CfcGraph): string {
    const doc = document.implementation.createDocument(NAMESPACE, "project", null);
    const root = doc.documentElement;

    const now = new Date().toISOString();
    const fileHeader = doc.createElementNS(NAMESPACE, "fileHeader");
    fileHeader.setAttribute("companyName", "");
    fileHeader.setAttribute("productName", "CODESYS");
    fileHeader.setAttribute("productVersion", "CODESYS V3.5 SP20 Patch 2");
    fileHeader.setAttribute("creationDateTime", now);

    const contentHeader = doc.createElementNS(NAMESPACE, "contentHeader");
    contentHeader.setAttribute("name", "Export.project");
    contentHeader.setAttribute("modificationDateTime", now);

    const coordinateInfo = doc.createElementNS(NAMESPACE, "coordinateInfo");
    ["fbd", "ld", "sfc"].forEach((name) => {
      const element = doc.createElementNS(NAMESPACE, name);
      const scaling = doc.createElementNS(NAMESPACE, "scaling");
      scaling.setAttribute("x", "1");
      scaling.setAttribute("y", "1");
      element.append(scaling);
      coordinateInfo.append(element);
    });
    contentHeader.append(coordinateInfo);

    const contentAddData = doc.createElementNS(NAMESPACE, "addData");
    const projectInfoData = doc.createElementNS(NAMESPACE, "data");
    projectInfoData.setAttribute("name", "http://www.3s-software.com/plcopenxml/projectinformation");
    projectInfoData.setAttribute("handleUnknown", "implementation");
    projectInfoData.append(doc.createElementNS(NAMESPACE, "ProjectInformation"));
    contentAddData.append(projectInfoData);
    contentHeader.append(contentAddData);

    const types = doc.createElementNS(NAMESPACE, "types");
    types.append(doc.createElementNS(NAMESPACE, "dataTypes"));
    const pous = doc.createElementNS(NAMESPACE, "pous");
    const pou = doc.createElementNS(NAMESPACE, "pou");
    pou.setAttribute("name", "CFC");
    pou.setAttribute("pouType", "program");
    pou.append(doc.createElementNS(NAMESPACE, "interface"));

    const body = doc.createElementNS(NAMESPACE, "body");
    const st = doc.createElementNS(NAMESPACE, "ST");
    st.append(doc.createElementNS("http://www.w3.org/1999/xhtml", "xhtml"));
    body.append(st);

    const bodyAddData = doc.createElementNS(NAMESPACE, "addData");
    const cfcData = doc.createElementNS(NAMESPACE, "data");
    cfcData.setAttribute("name", "http://www.3s-software.com/plcopenxml/cfc");
    cfcData.setAttribute("handleUnknown", "implementation");
    const cfc = doc.createElementNS(NAMESPACE, "CFC");

    const localIdByNodeId = new Map<string, string>();
    graph.nodes.forEach((node, index) => {
      localIdByNodeId.set(node.id, fallbackLocalId(node.id, index));
    });

    const inputConnectionTargets = new Map<string, Array<Element | null>>();

    graph.nodes.forEach((node, index) => {
      const localId = localIdByNodeId.get(node.id) ?? String(index + 1);
      const template = getNodeTemplateByType(node.type);
      const executionOrder = isExecutionOrderedNode(node)
        ? getExecutionOrderByNodeId(graph.nodes, node.id) ?? index + 1
        : index + 1;

      if (node.type === "input") {
        const inVariable = doc.createElementNS(NAMESPACE, "inVariable");
        inVariable.setAttribute("localId", localId);
        appendPosition(doc, inVariable, node.x, node.y);
        const connectionPointOut = doc.createElementNS(NAMESPACE, "connectionPointOut");
        connectionPointOut.append(doc.createElementNS(NAMESPACE, "expression"));
        inVariable.append(connectionPointOut);
        const expression = doc.createElementNS(NAMESPACE, "expression");
        expression.textContent = node.label;
        inVariable.append(expression);
        cfc.append(inVariable);
        inputConnectionTargets.set(node.id, []);
        return;
      }

      if (node.type === "output") {
        const outVariable = doc.createElementNS(NAMESPACE, "outVariable");
        outVariable.setAttribute("localId", localId);
        outVariable.setAttribute("executionOrderId", String(executionOrder));
        appendPosition(doc, outVariable, node.x, node.y);
        const connectionPointIn = doc.createElementNS(NAMESPACE, "connectionPointIn");
        const relPosition = doc.createElementNS(NAMESPACE, "relPosition");
        relPosition.setAttribute("x", "0");
        relPosition.setAttribute("y", "0");
        connectionPointIn.append(relPosition);
        outVariable.append(connectionPointIn);
        const expression = doc.createElementNS(NAMESPACE, "expression");
        expression.textContent = node.label;
        outVariable.append(expression);
        cfc.append(outVariable);
        inputConnectionTargets.set(node.id, [connectionPointIn]);
        return;
      }

      if (node.type === "comment") {
        const comment = doc.createElementNS(NAMESPACE, "comment");
        comment.setAttribute("localId", localId);
        comment.setAttribute("height", String(template.height));
        comment.setAttribute("width", String(template.width));
        appendPosition(doc, comment, node.x, node.y);
        const content = doc.createElementNS(NAMESPACE, "content");
        const xhtml = doc.createElementNS("http://www.w3.org/1999/xhtml", "xhtml");
        xhtml.textContent = node.label;
        content.append(xhtml);
        comment.append(content);
        cfc.append(comment);
        inputConnectionTargets.set(node.id, []);
        return;
      }

      if (node.type === "jump") {
        const jump = doc.createElementNS(NAMESPACE, "jump");
        jump.setAttribute("localId", localId);
        jump.setAttribute("executionOrderId", String(executionOrder));
        jump.setAttribute("label", node.label);
        appendPosition(doc, jump, node.x, node.y);
        const connectionPointIn = doc.createElementNS(NAMESPACE, "connectionPointIn");
        const relPosition = doc.createElementNS(NAMESPACE, "relPosition");
        relPosition.setAttribute("x", "0");
        relPosition.setAttribute("y", "0");
        connectionPointIn.append(relPosition);
        jump.append(connectionPointIn);
        cfc.append(jump);
        inputConnectionTargets.set(node.id, [connectionPointIn]);
        return;
      }

      if (node.type === "return") {
        const returnElement = doc.createElementNS(NAMESPACE, "return");
        returnElement.setAttribute("localId", localId);
        returnElement.setAttribute("executionOrderId", String(executionOrder));
        appendPosition(doc, returnElement, node.x, node.y);
        const connectionPointIn = doc.createElementNS(NAMESPACE, "connectionPointIn");
        const relPosition = doc.createElementNS(NAMESPACE, "relPosition");
        relPosition.setAttribute("x", "0");
        relPosition.setAttribute("y", "0");
        connectionPointIn.append(relPosition);
        returnElement.append(connectionPointIn);
        cfc.append(returnElement);
        inputConnectionTargets.set(node.id, [connectionPointIn]);
        return;
      }

      if (node.type === "label") {
        const label = doc.createElementNS(NAMESPACE, "label");
        label.setAttribute("localId", localId);
        label.setAttribute("executionOrderId", String(executionOrder));
        label.setAttribute("label", node.label);
        appendPosition(doc, label, node.x, node.y);
        cfc.append(label);
        inputConnectionTargets.set(node.id, []);
        return;
      }

      const elementType = getElementTypeForNode(node.type);
      if (elementType) {
        const vendorElement = doc.createElementNS(NAMESPACE, "vendorElement");
        vendorElement.setAttribute("localId", localId);
        if (isExecutionOrderedNode(node)) {
          vendorElement.setAttribute("executionOrderId", String(executionOrder));
        }
        appendPosition(doc, vendorElement, node.x, node.y);

        const alternativeText = doc.createElementNS(NAMESPACE, "alternativeText");
        const xhtml = doc.createElementNS("http://www.w3.org/1999/xhtml", "xhtml");
        xhtml.textContent = node.label;
        alternativeText.append(xhtml);
        vendorElement.append(alternativeText);

        const inputNames = getInputNamesForType(node.type);
        const outputNames = getOutputNamesForType(node.type);

        const targets: Array<Element | null> = [];
        if (inputNames.length > 0) {
          const inputVariables = doc.createElementNS(NAMESPACE, "inputVariables");
          inputNames.forEach((formalParameter, portIndex) => {
            const variable = createVariable(doc, formalParameter, true);
            const point = variable.getElementsByTagNameNS("*", "connectionPointIn").item(0);
            const relPosition = variable.getElementsByTagNameNS("*", "relPosition").item(0);
            if (relPosition) {
              relPosition.setAttribute("y", String(portIndex));
            }
            targets.push(point);
            inputVariables.append(variable);
          });
          vendorElement.append(inputVariables);
        }

        if (outputNames.length > 0) {
          const outputVariables = doc.createElementNS(NAMESPACE, "outputVariables");
          outputNames.forEach((formalParameter, portIndex) => {
            const variable = createVariable(doc, formalParameter, false);
            const relPosition = variable.getElementsByTagNameNS("*", "relPosition").item(0);
            if (relPosition) {
              relPosition.setAttribute("y", String(portIndex));
            }
            outputVariables.append(variable);
          });
          vendorElement.append(outputVariables);
        }

        const addData = doc.createElementNS(NAMESPACE, "addData");
        addData.append(createPlainElementTypeData(doc, elementType));
        vendorElement.append(addData);

        cfc.append(vendorElement);
        inputConnectionTargets.set(node.id, targets);
        return;
      }

      const block = doc.createElementNS(NAMESPACE, "block");
      block.setAttribute("localId", localId);
      if (isExecutionOrderedNode(node)) {
        block.setAttribute("executionOrderId", String(executionOrder));
      }
      block.setAttribute("typeName", node.label);
      appendPosition(doc, block, node.x, node.y);

      const inputNames = getInputNamesForType(node.type);
      const outputNames = getOutputNamesForType(node.type);

      const inputVariables = doc.createElementNS(NAMESPACE, "inputVariables");
      const targets: Array<Element | null> = [];
      inputNames.forEach((formalParameter, portIndex) => {
        const variable = createVariable(doc, formalParameter, true);
        const point = variable.getElementsByTagNameNS("*", "connectionPointIn").item(0);
        const relPosition = variable.getElementsByTagNameNS("*", "relPosition").item(0);
        if (relPosition) {
          relPosition.setAttribute("y", String(portIndex));
        }
        targets.push(point);
        inputVariables.append(variable);
      });
      block.append(inputVariables);

      block.append(doc.createElementNS(NAMESPACE, "inOutVariables"));

      const outputVariables = doc.createElementNS(NAMESPACE, "outputVariables");
      outputNames.forEach((formalParameter, portIndex) => {
        const variable = createVariable(doc, formalParameter, false);
        const relPosition = variable.getElementsByTagNameNS("*", "relPosition").item(0);
        if (relPosition) {
          relPosition.setAttribute("y", String(portIndex));
        }
        outputVariables.append(variable);
      });
      block.append(outputVariables);

      const addData = doc.createElementNS(NAMESPACE, "addData");
      addData.append(createCallTypeData(doc, "operator"));
      block.append(addData);

      cfc.append(block);
      inputConnectionTargets.set(node.id, targets);
    });

    const outputNameByNodeId = new Map<string, string[]>();
    graph.nodes.forEach((node) => {
      outputNameByNodeId.set(node.id, getOutputNamesForType(node.type));
    });

    graph.connections.forEach((connection) => {
      const sourceLocalId = localIdByNodeId.get(connection.fromNodeId);
      const targetSlots = inputConnectionTargets.get(connection.toNodeId);
      if (!sourceLocalId || !targetSlots || targetSlots.length === 0) {
        return;
      }
      const targetIndex = parsePortIndex(connection.toPort, "input");
      const targetPoint = targetSlots[targetIndex] ?? targetSlots[0] ?? null;
      if (!targetPoint) {
        return;
      }

      const connectionElement = doc.createElementNS(NAMESPACE, "connection");
      connectionElement.setAttribute("refLocalId", sourceLocalId);
      const sourceNames = outputNameByNodeId.get(connection.fromNodeId) ?? [];
      const sourceIndex = parsePortIndex(connection.fromPort, "output");
      const formal = sourceNames[sourceIndex] ?? sourceNames[0] ?? "Out1";
      connectionElement.setAttribute("formalParameter", formal);
      targetPoint.append(connectionElement);
    });

    cfcData.append(cfc);
    bodyAddData.append(cfcData);
    body.append(bodyAddData);
    pou.append(body);

    const pouAddData = doc.createElementNS(NAMESPACE, "addData");
    const objectIdData = doc.createElementNS(NAMESPACE, "data");
    objectIdData.setAttribute("name", "http://www.3s-software.com/plcopenxml/objectid");
    objectIdData.setAttribute("handleUnknown", "discard");
    const objectId = doc.createElementNS(NAMESPACE, "ObjectId");
    const idValue = makeObjectId();
    objectId.textContent = idValue;
    objectId.setAttribute("id", idValue);
    objectIdData.append(objectId);
    pouAddData.append(objectIdData);
    pou.append(pouAddData);

    pous.append(pou);
    types.append(pous);

    const instances = doc.createElementNS(NAMESPACE, "instances");
    instances.append(doc.createElementNS(NAMESPACE, "configurations"));

    const projectAddData = doc.createElementNS(NAMESPACE, "addData");
    const projectStructureData = doc.createElementNS(NAMESPACE, "data");
    projectStructureData.setAttribute("name", "http://www.3s-software.com/plcopenxml/projectstructure");
    projectStructureData.setAttribute("handleUnknown", "discard");
    const projectStructure = doc.createElementNS(NAMESPACE, "ProjectStructure");
    const object = doc.createElementNS(NAMESPACE, "Object");
    object.setAttribute("Name", "CFC");
    object.setAttribute("ObjectId", idValue);
    projectStructure.append(object);
    projectStructureData.append(projectStructure);
    projectAddData.append(projectStructureData);

    root.append(fileHeader, contentHeader, types, instances, projectAddData);

    const serialized = new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*>\s*/i, "");
    return `<?xml version="1.0" encoding="utf-8"?>\n${formatXml(serialized)}`;
  },
  deserialize(raw: string): CfcGraph {
    const xml = new DOMParser().parseFromString(raw, "application/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("Ungültiges XML");
    }

    const graph = createEmptyGraph();
    const cfc = xml.getElementsByTagNameNS("*", "CFC").item(0);
    if (!cfc) {
      return graph;
    }

    const connectors = parseConnectorRefs(cfc);
    const parsedNodes = Array.from(cfc.children)
      .map((child, index) => parseCfcNodeElement(child, index))
      .filter((entry): entry is ParsedOgNode => entry !== null);

    const byLocalId = new Map(parsedNodes.map((entry) => [entry.localId, entry]));

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

    let connectionSerial = 1;
    parsedNodes.forEach((targetNode) => {
      targetNode.incomingRefs.forEach((incoming) => {
        const resolved = resolveSourceRef(incoming.refLocalId, incoming.sourceFormalParameter, connectors);
        if (!resolved) {
          return;
        }
        const sourceNode = byLocalId.get(resolved.localId);
        if (!sourceNode) {
          return;
        }

        const outputIndex = Math.max(0, sourceNode.outputNames.indexOf(resolved.formalParameter));
        const inputIndex = Math.max(0, incoming.targetInputIndex);

        graph.connections.push({
          id: `C${connectionSerial}`,
          fromNodeId: sourceNode.node.id,
          fromPort: `output:${outputIndex}`,
          toNodeId: targetNode.node.id,
          toPort: `input:${inputIndex}`,
        });
        connectionSerial += 1;
      });
    });

    graph.nodes = graph.nodes.map((node) => {
      if (isCfcNodeType(node.type)) {
        return node;
      }
      return {
        ...node,
        type: "box",
      };
    });

    return graph;
  },
};
