import type { ConnectionDragState } from "../../core/editor/connection.js";
import { extractInputPortDropTarget, extractOutputPortDropTarget } from "../../core/editor/connection.js";
import type { CfcConnection, CfcNode, GridPoint } from "../../model.js";
import { createBezierConnectionPath, createPolylineConnectionPath } from "../views/connectionRendererUi.js";

type RoutingMode = "bezier" | "astar";

interface RenderConnectionLayerOptions {
  svg: SVGSVGElement;
  fallbackOverlaySvg: SVGSVGElement;
  connections: CfcConnection[];
  selectedConnectionIds: Set<string>;
  deferredAutoRoutingConnectionIds: Set<string>;
  isInteractionLocked: boolean;
  routingMode: RoutingMode;
  connectionDrag: ConnectionDragState | null;
  findNode: (nodeId: string) => CfcNode | undefined;
  getOutputPortPoint: (node: CfcNode, portId: string) => { x: number; y: number };
  getInputPortPoint: (node: CfcNode, portId: string) => { x: number; y: number };
  unitToPx: (value: number) => number;
  getManualRoutePoints: (connection: CfcConnection, fromNode: CfcNode, toNode: CfcNode) => { points: GridPoint[]; isFallback: boolean };
  getAStarRoutePoints: (
    fromNode: CfcNode,
    toNode: CfcNode,
    fromPinId?: string,
    toPinId?: string,
    connectionId?: string,
  ) => { points: GridPoint[]; isFallback: boolean };
  onConnectionClick: (connectionId: string, event: MouseEvent) => void;
  onConnectionSegmentPointerDown: (connectionId: string, waypointIndex: number, event: PointerEvent) => void;
  onConnectionUnlock?: (connectionId: string, event: MouseEvent) => void;
  canDropConnection: (fromNodeId: string, fromPin: string, toNodeId: string, toPin: string) => boolean;
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

    const fromPoint = options.getOutputPortPoint(fromNode, connection.fromPin);
    const toPoint = options.getInputPortPoint(toNode, connection.toPin);

    let path: SVGPathElement;
    let isFallback = false;
    let routePoints: GridPoint[] = [];

    if (connection.routingMode === "manual") {
      const route = options.getManualRoutePoints(connection, fromNode, toNode);
      routePoints = route.points;
      isFallback = route.isFallback;
      path = createPolylineConnectionPath(routePoints, options.unitToPx);
      if (isFallback) {
        path.classList.add("cfc-connection--fallback");
      }
    } else if (options.deferredAutoRoutingConnectionIds.has(connection.id)) {
      routePoints = [fromPoint, toPoint];
      path = createPolylineConnectionPath(routePoints, options.unitToPx);
    } else if (options.routingMode === "bezier") {
      path = createBezierConnectionPath(
        options.unitToPx(fromPoint.x),
        options.unitToPx(fromPoint.y),
        options.unitToPx(toPoint.x),
        options.unitToPx(toPoint.y),
      );
    } else {
      const route = options.getAStarRoutePoints(fromNode, toNode, connection.fromPin, connection.toPin, connection.id);
      routePoints = route.points;
      isFallback = route.isFallback;
      path = createPolylineConnectionPath(route.points, options.unitToPx);
      if (isFallback) {
        path.classList.add("cfc-connection--fallback");
      }
    }
    path.classList.add("cfc-connection");
    path.dataset.connectionId = connection.id;
    if (connection.routingMode === "manual") {
      path.classList.add("cfc-connection--manual");
    }
    if (options.selectedConnectionIds.has(connection.id)) {
      path.classList.add("selected");
    }
    path.setAttribute("pointer-events", "none");

    const hitPath = path.cloneNode(true) as SVGPathElement;
    hitPath.classList.add("cfc-connection-hit");
    hitPath.dataset.connectionId = connection.id;
    hitPath.setAttribute("stroke", "transparent");
    hitPath.setAttribute("stroke-width", "2");
    hitPath.setAttribute("stroke-linecap", "butt");
    hitPath.setAttribute("stroke-linejoin", "miter");
    hitPath.setAttribute("pointer-events", options.isInteractionLocked ? "none" : "stroke");
    if (!options.isInteractionLocked) {
      hitPath.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onConnectionClick(connection.id, event);
      });
    }

    if (isFallback) {
      options.fallbackOverlaySvg.append(path);
    } else {
      options.svg.append(path);
    }
    options.svg.append(hitPath);

    // Add segment hit areas for manual connections (with draggable segments)
    // OR for selected connections (to allow manual conversion on drag)
    const shouldHaveSegmentHits = connection.routingMode === "manual" || options.selectedConnectionIds.has(connection.id);

    if (shouldHaveSegmentHits && routePoints.length >= 4) {
      for (let index = 1; index < routePoints.length - 2; index += 1) {
        const start = routePoints[index];
        const end = routePoints[index + 1];
        if (!start || !end) {
          continue;
        }
        const segmentHit = document.createElementNS("http://www.w3.org/2000/svg", "path");
        segmentHit.classList.add("cfc-connection-segment-hit");
        segmentHit.setAttribute(
          "d",
          `M ${options.unitToPx(start.x)} ${options.unitToPx(start.y)} L ${options.unitToPx(end.x)} ${options.unitToPx(end.y)}`,
        );
        segmentHit.setAttribute("stroke", "transparent");
        segmentHit.setAttribute("stroke-width", "6");
        segmentHit.setAttribute("fill", "none");
        segmentHit.setAttribute("pointer-events", options.isInteractionLocked ? "none" : "stroke");
        if (!options.isInteractionLocked) {
          segmentHit.style.cursor = start.x === end.x ? "ew-resize" : "ns-resize";
        }
        segmentHit.dataset.connectionId = connection.id;
        segmentHit.dataset.waypointIndex = String(index);
        if (!options.isInteractionLocked) {
          segmentHit.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            options.onConnectionSegmentPointerDown(connection.id, index, event);
          });
        }
        options.svg.append(segmentHit);
      }
    }

    if (connection.routingMode === "manual") {
      (connection.waypoints ?? []).forEach((point) => {
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        marker.classList.add("cfc-connection-marker");
        marker.setAttribute("cx", String(options.unitToPx(point.x)));
        marker.setAttribute("cy", String(options.unitToPx(point.y)));
        marker.setAttribute("r", "3.5");
        marker.setAttribute("pointer-events", "none");
        options.svg.append(marker);
      });

      // Show lock icon only when selected and already manually routed
      if (options.selectedConnectionIds.has(connection.id)) {
        const offsetFromPin = 12;
        const verticalOffset = 12;
        const targetPointX = options.unitToPx(toPoint.x);
        const targetPointY = options.unitToPx(toPoint.y);

        const lockGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // Allow clicks on the lock icon
        lockGroup.setAttribute("pointer-events", options.isInteractionLocked ? "none" : "auto");

        if (!options.isInteractionLocked) {
          lockGroup.style.cursor = "pointer";
        }

        const lockText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lockText.setAttribute("x", String(targetPointX - offsetFromPin));
        lockText.setAttribute("y", String(targetPointY - verticalOffset + 5));
        lockText.setAttribute("text-anchor", "middle");
        lockText.setAttribute("font-size", "12");
        lockText.setAttribute("fill", "#ffffff");
        lockText.setAttribute("font-weight", "bold");
        lockText.textContent = "🔒";
        lockGroup.append(lockText);

        if (!options.isInteractionLocked && options.onConnectionUnlock) {
          lockGroup.addEventListener("click", (ev) => {
            ev.stopPropagation();
            options.onConnectionUnlock && options.onConnectionUnlock(connection.id, ev as MouseEvent);
          });
        }

        options.svg.append(lockGroup);
      }
    }
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
      const isDraggingFromOutput = options.connectionDrag.fromPinKind === "output";
      const hoveredPort = (hoveredElement as HTMLElement | null)?.closest(
        isDraggingFromOutput ? ".cfc-port--input" : ".cfc-port--output",
      ) as HTMLElement | null;
      const dropTarget = isDraggingFromOutput
        ? extractInputPortDropTarget(hoveredElement)
        : extractOutputPortDropTarget(hoveredElement);

      let canDrop = false;
      if (dropTarget && hoveredPort) {
        const fromNodeId = isDraggingFromOutput ? options.connectionDrag.fromNodeId : dropTarget.nodeId;
        const fromPin = isDraggingFromOutput ? options.connectionDrag.fromPin : dropTarget.portId;
        const toNodeId = isDraggingFromOutput ? dropTarget.nodeId : options.connectionDrag.fromNodeId;
        const toPin = isDraggingFromOutput ? dropTarget.portId : options.connectionDrag.fromPin;
        canDrop = options.canDropConnection(
          fromNodeId,
          fromPin,
          toNodeId,
          toPin,
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
