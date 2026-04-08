import { getNodeTemplateByType, type CfcNode } from "../../model.js";

export interface NodeRenderModel {
  node: CfcNode;
  executionOrder: number | null;
  selected: boolean;
  interactive: boolean;
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  snapPortYToInteger: boolean;
}

export interface NodeRenderCallbacks {
  onOutputPortPointerDown: (nodeId: string, portId: string, clientX: number, clientY: number) => void;
  onInputPortPointerDown: (nodeId: string, portId: string, clientX: number, clientY: number) => void;
}

export const createNodeElement = (model: NodeRenderModel, callbacks: NodeRenderCallbacks): HTMLDivElement => {
  const { node, executionOrder, selected, interactive, leftPx, topPx, widthPx, heightPx, snapPortYToInteger } = model;
  const template = getNodeTemplateByType(node.type);
  const pxPerUnit = node.height > 0 ? heightPx / node.height : 24;

  const floorIfFractional = (value: number): number => {
    return Number.isInteger(value) ? value : Math.floor(value);
  };

  const getRegularSnappedCenters = (portCount: number): number[] => {
    if (portCount <= 1) {
      return [floorIfFractional(node.y + node.height / 2)];
    }

    const exactGap = node.height / (portCount + 1);
    const exactCenters = Array.from({ length: portCount }, (_, index) => node.y + exactGap * (index + 1));
    const firstExact = exactCenters[0] ?? node.y;

    const candidateSteps = Array.from(new Set([Math.floor(exactGap), Math.ceil(exactGap)].map((value) => Math.max(1, value))));
    const candidateStarts = Array.from(new Set([Math.floor(firstExact), Math.ceil(firstExact)]));

    let bestCenters: number[] = exactCenters.map(floorIfFractional);
    let bestError = Number.POSITIVE_INFINITY;

    for (const step of candidateSteps) {
      for (const start of candidateStarts) {
        const centers = Array.from({ length: portCount }, (_, index) => start + index * step);
        const error = centers.reduce((sum, center, index) => {
          const exact = exactCenters[index] ?? center;
          return sum + Math.abs(center - exact);
        }, 0);
        if (error < bestError) {
          bestError = error;
          bestCenters = centers;
        }
      }
    }

    return bestCenters;
  };

  const getPortTop = (portIndex: number, portCount: number): string => {
    if (!snapPortYToInteger) {
      return `${((portIndex + 1) / (portCount + 1)) * 100}%`;
    }

    const snappedCenters = getRegularSnappedCenters(portCount);
    const centerUnitY = snappedCenters[Math.max(0, Math.min(portIndex, snappedCenters.length - 1))] ?? floorIfFractional(node.y);
    const topPxForCenter = (centerUnitY - node.y) * pxPerUnit;
    return `${topPxForCenter}px`;
  };

  const nodeElement = document.createElement("div");
  nodeElement.className = "cfc-node";
  nodeElement.dataset.nodeType = node.type;
  nodeElement.style.pointerEvents = interactive ? "auto" : "none";
  nodeElement.style.cursor = interactive ? "move" : "default";
  if (selected) {
    nodeElement.classList.add("selected");
  }

  nodeElement.style.left = `${leftPx}px`;
  nodeElement.style.top = `${topPx}px`;
  nodeElement.style.width = `${widthPx}px`;
  nodeElement.style.height = `${heightPx}px`;
  nodeElement.style.setProperty("--node-height", `${heightPx}px`);

  const inputPorts: HTMLDivElement[] = [];
  for (let portIndex = 0; portIndex < template.inputCount; portIndex += 1) {
    const inputPort = document.createElement("div");
    let inputPortClass = "cfc-port cfc-port--input";
    if (node.type === "jump") {
      inputPortClass += " cfc-port--input-arrow";
    }
    if (node.type === "return") {
      inputPortClass += " cfc-port--input-return";
    }
    if (node.type === "connection-mark-source") {
      inputPortClass += " cfc-port--input-notch-source";
    }
    inputPort.className = inputPortClass;
    inputPort.dataset.nodeId = node.id;
    inputPort.dataset.port = "input";
    const portId = `input:${portIndex}`;
    inputPort.dataset.portId = portId;
    inputPort.style.top = getPortTop(portIndex, template.inputCount);

    if (interactive) {
      inputPort.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        const rect = inputPort.getBoundingClientRect();
        callbacks.onInputPortPointerDown(node.id, portId, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
    }

    inputPorts.push(inputPort);
  }

  const outputPorts: HTMLDivElement[] = [];
  for (let portIndex = 0; portIndex < template.outputCount; portIndex += 1) {
    const outputPort = document.createElement("div");
    const portId = `output:${portIndex}`;
    let outputPortClass = "cfc-port cfc-port--output";
    if (node.type === "connection-mark-sink") {
      outputPortClass += " cfc-port--output-notch-sink";
    }
    outputPort.className = outputPortClass;
    outputPort.dataset.nodeId = node.id;
    outputPort.dataset.port = "output";
    outputPort.dataset.portId = portId;
    outputPort.style.top = getPortTop(portIndex, template.outputCount);

    if (interactive) {
      outputPort.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        const rect = outputPort.getBoundingClientRect();
        callbacks.onOutputPortPointerDown(node.id, portId, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
    }

    outputPorts.push(outputPort);
  }

  const title = document.createElement("div");
  title.className = "cfc-node__title";
  title.textContent = node.label;

  const id = document.createElement("div");
  id.className = "cfc-node__id";
  id.textContent = `${node.id} • ${template.label}`;

  const orderBadge = document.createElement("div");
  orderBadge.className = "cfc-node__order";
  orderBadge.textContent = String(executionOrder ?? "");
  orderBadge.style.display = executionOrder === null ? "none" : "block";

  nodeElement.append(...inputPorts, orderBadge, title, id, ...outputPorts);
  return nodeElement;
};
