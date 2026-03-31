import { computeGroupDragDelta, type DragState } from "../../core/editor/drag.js";
import type { ConnectionDragState } from "../../core/editor/connection.js";

export interface MarqueeSelectionState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
}

export interface PanState {
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
  moved: boolean;
}

interface GraphInteractionControllerOptions {
  canvas: HTMLDivElement;
  graphLayer: HTMLDivElement;
  contentLayer: HTMLDivElement;
  svg: SVGSVGElement;
  nodeLayer: HTMLDivElement;
  selectionBox: HTMLDivElement;
  getIsPointerInsideGraph: () => boolean;
  setIsPointerInsideGraph: (value: boolean) => void;
  setLastCursorUnits: (value: { x: number; y: number } | null) => void;
  getDragState: () => DragState | null;
  setDragState: (state: DragState | null) => void;
  getConnectionDrag: () => ConnectionDragState | null;
  setConnectionDrag: (state: ConnectionDragState | null) => void;
  getMarqueeSelection: () => MarqueeSelectionState | null;
  setMarqueeSelection: (state: MarqueeSelectionState | null) => void;
  getPanState: () => PanState | null;
  setPanState: (state: PanState | null) => void;
  getSkipNextCanvasClick: () => boolean;
  setSkipNextCanvasClick: (value: boolean) => void;
  getIsInteractionLocked: () => boolean;
  isAdditiveSelection: (event: MouseEvent) => boolean;
  closeNodeEditDialog: () => void;
  clientToGraphPxX: (clientX: number) => number;
  clientToGraphPxY: (clientY: number) => number;
  clientToGraphUnitX: (clientX: number) => number;
  clientToGraphUnitY: (clientY: number) => number;
  getPan: () => { panX: number; panY: number };
  setPan: (panX: number, panY: number) => void;
  clampPanToPositiveArea: (panX: number, panY: number) => { panX: number; panY: number };
  applyZoom: () => void;
  updateSelectionBox: () => void;
  applyMarqueeSelection: () => void;
  moveConnectionDrag: (event: PointerEvent) => void;
  finishConnectionDrag: () => void;
  findNodeForDrag: (nodeId: string) => { x: number; y: number; setPosition: (x: number, y: number) => void } | null;
  snapToGrid: (value: number) => number;
  clampUnitToNonNegative: (value: number) => number;
  onNodeDragFinished: () => void;
  render: () => void;
  emitGraphChanged: () => void;
  clearSelection: () => void;
}

export const installGraphInteractionController = (options: GraphInteractionControllerOptions): void => {
  options.canvas.addEventListener("pointerenter", () => {
    options.setIsPointerInsideGraph(true);
  });

  options.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  options.canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 2) {
      event.preventDefault();
      options.closeNodeEditDialog();
      const { panX, panY } = options.getPan();
      options.setPanState({
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: panX,
        startPanY: panY,
        moved: false,
      });
      options.canvas.classList.add("is-panning");
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".cfc-node-edit-dialog")) {
      return;
    }
    if (target.closest(".cfc-node") || target.closest(".cfc-connection") || target.closest(".cfc-port")) {
      return;
    }

    options.closeNodeEditDialog();

    if (!options.getIsInteractionLocked()) {
      options.setMarqueeSelection({
        startX: options.clientToGraphPxX(event.clientX),
        startY: options.clientToGraphPxY(event.clientY),
        currentX: options.clientToGraphPxX(event.clientX),
        currentY: options.clientToGraphPxY(event.clientY),
        additive: options.isAdditiveSelection(event),
      });
      options.updateSelectionBox();
      options.applyMarqueeSelection();
      return;
    }

    const { panX, panY } = options.getPan();
    options.setPanState({
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: panX,
      startPanY: panY,
      moved: false,
    });
    options.canvas.classList.add("is-panning");
  });

  options.canvas.addEventListener("pointermove", (event) => {
    options.setIsPointerInsideGraph(true);
    options.setLastCursorUnits({
      x: options.clientToGraphUnitX(event.clientX),
      y: options.clientToGraphUnitY(event.clientY),
    });

    const marqueeSelection = options.getMarqueeSelection();
    if (marqueeSelection) {
      marqueeSelection.currentX = options.clientToGraphPxX(event.clientX);
      marqueeSelection.currentY = options.clientToGraphPxY(event.clientY);
      options.updateSelectionBox();
      options.applyMarqueeSelection();
      return;
    }

    const panState = options.getPanState();
    if (panState) {
      const deltaX = event.clientX - panState.startClientX;
      const deltaY = event.clientY - panState.startClientY;
      const nextPan = options.clampPanToPositiveArea(panState.startPanX + deltaX, panState.startPanY + deltaY);
      options.setPan(nextPan.panX, nextPan.panY);
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        panState.moved = true;
      }
      options.applyZoom();
      options.setLastCursorUnits({
        x: options.clientToGraphUnitX(event.clientX),
        y: options.clientToGraphUnitY(event.clientY),
      });
      return;
    }

    if (options.getConnectionDrag()) {
      options.moveConnectionDrag(event);
      return;
    }

    const dragState = options.getDragState();
    if (!dragState) {
      return;
    }

    const pointerXUnits = options.clientToGraphUnitX(event.clientX);
    const pointerYUnits = options.clientToGraphUnitY(event.clientY);
    const dragDelta = computeGroupDragDelta(dragState, pointerXUnits, pointerYUnits, options.snapToGrid);

    dragState.nodes.forEach((dragNode) => {
      const targetNode = options.findNodeForDrag(dragNode.nodeId);
      if (!targetNode) {
        return;
      }
      targetNode.setPosition(
        options.clampUnitToNonNegative(dragNode.startXUnits + dragDelta.deltaXUnits),
        options.clampUnitToNonNegative(dragNode.startYUnits + dragDelta.deltaYUnits),
      );
    });

    options.render();
    options.emitGraphChanged();
  });

  options.canvas.addEventListener("pointerup", () => {
    const panState = options.getPanState();
    if (panState) {
      if (panState.moved) {
        options.setSkipNextCanvasClick(true);
      }
      options.setPanState(null);
      options.canvas.classList.remove("is-panning");
    }

    if (options.getMarqueeSelection()) {
      options.setSkipNextCanvasClick(true);
      options.setMarqueeSelection(null);
      options.selectionBox.style.display = "none";
    }

    options.finishConnectionDrag();
    if (options.getDragState()) {
      options.onNodeDragFinished();
    }
    options.setDragState(null);
  });

  options.canvas.addEventListener("pointerleave", () => {
    options.setIsPointerInsideGraph(false);
    if (options.getMarqueeSelection()) {
      options.setMarqueeSelection(null);
      options.selectionBox.style.display = "none";
    }
    options.setPanState(null);
    options.canvas.classList.remove("is-panning");
    options.finishConnectionDrag();
    if (options.getDragState()) {
      options.onNodeDragFinished();
    }
    options.setDragState(null);
    options.setLastCursorUnits(null);
  });
};
