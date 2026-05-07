import { getConnectionCreationBlockReason } from "../../core/graph/connectionRules.js";
import {
  createConnectionDragState,
  extractInputPortDropTarget,
  extractOutputPortDropTarget,
  type ConnectionPortKind,
  type ConnectionDragState,
  updateConnectionDragState,
} from "../../core/editor/connection.js";
import type { CfcConnection, CfcNode } from "../../model.js";

interface BeginConnectionDragOptions {
  fromNodeId: string;
  fromPin: string;
  fromPinKind: ConnectionPortKind;
  clientX: number;
  clientY: number;
  findNode: (nodeId: string) => CfcNode | undefined;
  getOutputPortPoint: (node: CfcNode, portId: string) => { x: number; y: number };
  getInputPortPoint: (node: CfcNode, portId: string) => { x: number; y: number };
  unitToPx: (value: number) => number;
  clientToGraphPxX: (clientX: number) => number;
  clientToGraphPxY: (clientY: number) => number;
}

export const beginConnectionDrag = (options: BeginConnectionDragOptions): ConnectionDragState | null => {
  const fromNode = options.findNode(options.fromNodeId);
  if (!fromNode) {
    return null;
  }

  const startX = options.clientToGraphPxX(options.clientX);
  const startY = options.clientToGraphPxY(options.clientY);

  return createConnectionDragState(
    options.fromNodeId,
    options.fromPin,
    options.fromPinKind,
    startX,
    startY,
    options.clientToGraphPxX(options.clientX),
    options.clientToGraphPxY(options.clientY),
    options.clientX,
    options.clientY,
  );
};

export const moveConnectionDrag = (
  state: ConnectionDragState,
  nextX: number,
  nextY: number,
  nextClientX: number,
  nextClientY: number,
): ConnectionDragState => {
  return updateConnectionDragState(state, nextX, nextY, nextClientX, nextClientY);
};

interface FinishConnectionDragOptions {
  state: ConnectionDragState;
  graphConnections: CfcConnection[];
  getNextConnectionId: () => string;
  onConnectionCreated: (connection: CfcConnection) => void;
  onConnectionSelected: (connectionId: string) => void;
  onStatus: (message: string) => void;
}

export const finishConnectionDrag = (options: FinishConnectionDragOptions): void => {
  const svgOverlays = Array.from(document.querySelectorAll<SVGSVGElement>(".canvas svg"));
  const previousPointerEvents = svgOverlays.map((svg) => svg.style.pointerEvents);
  const hitPaths = Array.from(document.querySelectorAll<SVGPathElement>(".cfc-connection-hit"));
  const previousHitPointerEvents = hitPaths.map((path) => path.style.pointerEvents);
  svgOverlays.forEach((svg) => {
    svg.style.pointerEvents = "none";
  });
  hitPaths.forEach((path) => {
    path.style.pointerEvents = "none";
  });

  const dropTarget = document.elementFromPoint(options.state.currentClientX, options.state.currentClientY);

  svgOverlays.forEach((svg, index) => {
    svg.style.pointerEvents = previousPointerEvents[index] ?? "";
  });
  hitPaths.forEach((path, index) => {
    path.style.pointerEvents = previousHitPointerEvents[index] ?? "";
  });
  const dropInputTarget = extractInputPortDropTarget(dropTarget);
  const dropOutputTarget = extractOutputPortDropTarget(dropTarget);
  const expectedDropKind = options.state.fromPinKind === "output" ? "input" : "output";
  const matchingDropTarget = expectedDropKind === "input" ? dropInputTarget : dropOutputTarget;

  if (!matchingDropTarget) {
    return;
  }

  const fromNodeId =
    options.state.fromPinKind === "output" ? options.state.fromNodeId : matchingDropTarget.nodeId;
  const fromPin = options.state.fromPinKind === "output" ? options.state.fromPin : matchingDropTarget.portId;
  const toNodeId = options.state.fromPinKind === "output" ? matchingDropTarget.nodeId : options.state.fromNodeId;
  const toPin = options.state.fromPinKind === "output" ? matchingDropTarget.portId : options.state.fromPin;

  const blockReason = getConnectionCreationBlockReason(options.graphConnections, {
    fromNodeId,
    fromPin,
    toNodeId,
    toPin,
  });

  if (!blockReason) {
    const connection: CfcConnection = {
      id: options.getNextConnectionId(),
      fromNodeId,
      fromPin,
      toNodeId,
      toPin,
    };
    options.onConnectionCreated(connection);
    options.onConnectionSelected(connection.id);
    options.onStatus(`Verbindung erstellt: ${connection.fromNodeId}.${connection.fromPin} -> ${connection.toNodeId}.${connection.toPin}`);
    return;
  }

  if (blockReason === "input-occupied") {
    options.onStatus("Der Eingangs-Port ist bereits belegt.");
    return;
  }

  options.onStatus("Diese Port-Verbindung existiert bereits.");
};
