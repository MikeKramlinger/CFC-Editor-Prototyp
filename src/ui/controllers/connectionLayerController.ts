import type { ConnectionDragState } from "../../core/editor/connection.js";
import { extractInputPortDropTarget, extractOutputPortDropTarget } from "../../core/editor/connection.js";
import type { CfcConnection, CfcNode } from "../../model.js";
import { createBezierConnectionPath } from "../views/connectionRendererUi.js";

type RoutingMode = "bezier" | "astar";

interface RenderConnectionLayerOptions {
  svg: SVGSVGElement;
  fallbackOverlaySvg: SVGSVGElement;
  connections: CfcConnection[];
  selectedConnectionIds: Set<string>;
  routingMode: RoutingMode;
  connectionDrag: ConnectionDragState | null;
  findNode: (nodeId: string) => CfcNode | undefined;
  getOutputPortPoint: (node: CfcNode, portId: string) => { x: number; y: number };
  getInputPortPoint: (node: CfcNode, portId: string) => { x: number; y: number };
  unitToPx: (value: number) => number;
  createAStarConnectionPath: (
    fromNode: CfcNode,
    toNode: CfcNode,
    fromPortId?: string,
    toPortId?: string,
    connectionId?: string,
  ) => SVGPathElement;
  onConnectionClick: (connectionId: string, event: MouseEvent) => void;
  canDropConnection: (fromNodeId: string, fromPort: string, toNodeId: string, toPort: string) => boolean;
}

export const renderConnectionLayer = (options: RenderConnectionLayerOptions): void => {
  const shouldOverlayNodes = options.connectionDrag !== null && options.routingMode === "astar";
  options.svg.innerHTML = "";
  options.fallbackOverlaySvg.innerHTML = "";
  document.querySelectorAll<HTMLElement>(".cfc-port--drop-allowed, .cfc-port--drop-blocked").forEach((port) => {
    port.classList.remove("cfc-port--drop-allowed", "cfc-port--drop-blocked");
  });

  options.connections.forEach((connection) => {
    const fromNode = options.findNode(connection.fromNodeId);
    const toNode = options.findNode(connection.toNodeId);
    if (!fromNode || !toNode) {
      return;
    }

    const fromPoint = options.getOutputPortPoint(fromNode, connection.fromPort);
    const toPoint = options.getInputPortPoint(toNode, connection.toPort);

    const path =
      options.routingMode === "bezier"
        ? createBezierConnectionPath(
            options.unitToPx(fromPoint.x),
            options.unitToPx(fromPoint.y),
            options.unitToPx(toPoint.x),
            options.unitToPx(toPoint.y),
          )
        : options.createAStarConnectionPath(fromNode, toNode, connection.fromPort, connection.toPort, connection.id);
    const isFallback = path.classList.contains("cfc-connection--fallback");
    path.classList.add("cfc-connection");
    path.dataset.connectionId = connection.id;
    if (options.selectedConnectionIds.has(connection.id)) {
      path.classList.add("selected");
    }
    path.setAttribute("pointer-events", "none");

    const hitPath = path.cloneNode(true) as SVGPathElement;
    hitPath.classList.add("cfc-connection-hit");
    hitPath.dataset.connectionId = connection.id;
    hitPath.setAttribute("pointer-events", "stroke");
    hitPath.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onConnectionClick(connection.id, event);
    });

    if (isFallback) {
      options.fallbackOverlaySvg.append(path);
    } else {
      options.svg.append(path);
    }
    options.svg.append(hitPath);
  });

  if (options.connectionDrag) {
    if (options.routingMode === "bezier") {
      options.svg.append(
        createBezierConnectionPath(
          options.connectionDrag.startX,
          options.connectionDrag.startY,
          options.connectionDrag.currentX,
          options.connectionDrag.currentY,
          true,
        ),
      );
    } else {
      const previewLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
      previewLine.setAttribute(
        "d",
        `M ${options.connectionDrag.startX} ${options.connectionDrag.startY} L ${options.connectionDrag.currentX} ${options.connectionDrag.currentY}`,
      );
      previewLine.setAttribute("stroke", "#1f6feb");
      previewLine.setAttribute("fill", "none");
      previewLine.setAttribute("stroke-width", "2.5");
      previewLine.setAttribute("stroke-dasharray", "5 4");
      previewLine.setAttribute("pointer-events", "none");
      options.svg.append(previewLine);

      const previousPointerEvents = options.svg.style.pointerEvents;
      const hitPaths = Array.from(document.querySelectorAll<SVGPathElement>(".cfc-connection-hit"));
      const previousHitPointerEvents = hitPaths.map((path) => path.style.pointerEvents);
      hitPaths.forEach((path) => {
        path.style.pointerEvents = "none";
      });
      options.svg.style.pointerEvents = "none";
      const hoveredElement = document.elementFromPoint(
        options.connectionDrag.currentClientX,
        options.connectionDrag.currentClientY,
      );
      options.svg.style.pointerEvents = previousPointerEvents;
      hitPaths.forEach((path, index) => {
        path.style.pointerEvents = previousHitPointerEvents[index] ?? "";
      });
      const isDraggingFromOutput = options.connectionDrag.fromPortKind === "output";
      const hoveredPort = (hoveredElement as HTMLElement | null)?.closest(
        isDraggingFromOutput ? ".cfc-port--input" : ".cfc-port--output",
      ) as HTMLElement | null;
      const dropTarget = isDraggingFromOutput
        ? extractInputPortDropTarget(hoveredElement)
        : extractOutputPortDropTarget(hoveredElement);

      let canDrop = false;
      if (dropTarget && hoveredPort) {
        const fromNodeId = isDraggingFromOutput ? options.connectionDrag.fromNodeId : dropTarget.nodeId;
        const fromPort = isDraggingFromOutput ? options.connectionDrag.fromPort : dropTarget.portId;
        const toNodeId = isDraggingFromOutput ? dropTarget.nodeId : options.connectionDrag.fromNodeId;
        const toPort = isDraggingFromOutput ? dropTarget.portId : options.connectionDrag.fromPort;
        canDrop = options.canDropConnection(
          fromNodeId,
          fromPort,
          toNodeId,
          toPort,
        );
        hoveredPort.classList.add(canDrop ? "cfc-port--drop-allowed" : "cfc-port--drop-blocked");
      }

      const indicator = document.createElementNS("http://www.w3.org/2000/svg", "g");
      indicator.setAttribute("pointer-events", "none");

      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", String(options.connectionDrag.currentX));
      ring.setAttribute("cy", String(options.connectionDrag.currentY));
      ring.setAttribute("r", "8");
      ring.setAttribute("fill", canDrop ? "rgba(46, 160, 67, 0.2)" : "rgba(224, 49, 49, 0.2)");
      ring.setAttribute("stroke", canDrop ? "#2ea043" : "#e03131");
      ring.setAttribute("stroke-width", "1.5");
      indicator.append(ring);

      const mark = document.createElementNS("http://www.w3.org/2000/svg", "path");
      if (canDrop) {
        mark.setAttribute(
          "d",
          `M ${options.connectionDrag.currentX - 3} ${options.connectionDrag.currentY} L ${options.connectionDrag.currentX - 1} ${options.connectionDrag.currentY + 3} L ${options.connectionDrag.currentX + 4} ${options.connectionDrag.currentY - 3}`,
        );
        mark.setAttribute("stroke", "#2ea043");
      } else {
        mark.setAttribute(
          "d",
          `M ${options.connectionDrag.currentX - 3} ${options.connectionDrag.currentY - 3} L ${options.connectionDrag.currentX + 3} ${options.connectionDrag.currentY + 3} M ${options.connectionDrag.currentX + 3} ${options.connectionDrag.currentY - 3} L ${options.connectionDrag.currentX - 3} ${options.connectionDrag.currentY + 3}`,
        );
        mark.setAttribute("stroke", "#e03131");
      }
      mark.setAttribute("fill", "none");
      mark.setAttribute("stroke-width", "1.75");
      mark.setAttribute("stroke-linecap", "round");
      mark.setAttribute("stroke-linejoin", "round");
      indicator.append(mark);

      options.svg.append(indicator);
    }
  }

  options.svg.style.zIndex = shouldOverlayNodes ? "25" : "0";
  options.svg.style.pointerEvents = "auto";
};
