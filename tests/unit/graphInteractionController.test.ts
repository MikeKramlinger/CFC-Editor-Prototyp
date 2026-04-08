// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  installGraphInteractionController,
  type MarqueeSelectionState,
  type PanState,
} from "../../src/ui/controllers/graphInteractionController.js";

describe("graph interaction controller", () => {
  const setup = (locked: boolean) => {
    const canvas = document.createElement("div");
    const graphLayer = document.createElement("div");
    const contentLayer = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
    const nodeLayer = document.createElement("div");
    const selectionBox = document.createElement("div");
    document.body.append(canvas);

    let isPointerInsideGraph = false;
    let marqueeSelection: MarqueeSelectionState | null = null;
    let panState: PanState | null = null;
    let skipNextCanvasClick = false;

    installGraphInteractionController({
      canvas,
      graphLayer,
      contentLayer,
      svg,
      nodeLayer,
      selectionBox,
      getIsPointerInsideGraph: () => isPointerInsideGraph,
      setIsPointerInsideGraph: (value) => {
        isPointerInsideGraph = value;
      },
      setLastCursorUnits: () => undefined,
      getDragState: () => null,
      setDragState: () => undefined,
      getConnectionDrag: () => null,
      setConnectionDrag: () => undefined,
      getMarqueeSelection: () => marqueeSelection,
      setMarqueeSelection: (state) => {
        marqueeSelection = state;
      },
      getPanState: () => panState,
      setPanState: (state) => {
        panState = state;
      },
      getSkipNextCanvasClick: () => skipNextCanvasClick,
      setSkipNextCanvasClick: (value) => {
        skipNextCanvasClick = value;
      },
      getIsInteractionLocked: () => locked,
      isAdditiveSelection: () => false,
      closeNodeEditDialog: () => undefined,
      clientToGraphPxX: (clientX) => clientX,
      clientToGraphPxY: (clientY) => clientY,
      clientToGraphUnitX: (clientX) => clientX,
      clientToGraphUnitY: (clientY) => clientY,
      getPan: () => ({ panX: 0, panY: 0 }),
      setPan: () => undefined,
      clampPanToPositiveArea: (panX, panY) => ({ panX, panY }),
      applyZoom: () => undefined,
      updateSelectionBox: () => undefined,
      applyMarqueeSelection: () => undefined,
      moveConnectionDrag: () => undefined,
      finishConnectionDrag: () => undefined,
      findNodeForDrag: () => null,
      snapToGrid: (value) => value,
      clampUnitToNonNegative: (value) => Math.max(0, value),
      onNodeDragFinished: () => undefined,
      render: () => undefined,
      emitGraphChanged: () => undefined,
      clearSelection: () => undefined,
    });

    return {
      canvas,
      getMarqueeSelection: () => marqueeSelection,
      getPanState: () => panState,
    };
  };

  it("does not start left-button panning when interaction is locked", () => {
    const { canvas, getPanState, getMarqueeSelection } = setup(true);

    canvas.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientX: 12, clientY: 34, bubbles: true }));

    expect(getPanState()).toBeNull();
    expect(getMarqueeSelection()).toBeNull();
  });

  it("keeps right-button panning available while interaction is locked", () => {
    const { canvas, getPanState } = setup(true);

    canvas.dispatchEvent(new PointerEvent("pointerdown", { button: 2, clientX: 18, clientY: 26, bubbles: true }));

    expect(getPanState()).not.toBeNull();
    expect(getPanState()?.startClientX).toBe(18);
    expect(getPanState()?.startClientY).toBe(26);
  });
});
