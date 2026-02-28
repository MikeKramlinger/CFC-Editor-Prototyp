// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderConnectionLayer } from "../../src/ui/controllers/connectionLayerController.js";

describe("connection layer integration", () => {
  const setElementFromPoint = (value: Element | null): void => {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => value,
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("marks hovered input port as drop-allowed during astar drag", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    const fallbackSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    document.body.append(svg, fallbackSvg);

    const hoveredPort = document.createElement("div");
    hoveredPort.className = "cfc-port cfc-port--input";
    hoveredPort.dataset.nodeId = "N2";
    hoveredPort.dataset.portId = "input:0";
    document.body.append(hoveredPort);

    setElementFromPoint(hoveredPort);

    renderConnectionLayer({
      svg,
      fallbackOverlaySvg: fallbackSvg,
      connections: [],
      selectedConnectionIds: new Set(),
      routingMode: "astar",
      connectionDrag: {
        fromNodeId: "N1",
        fromPort: "output:0",
        fromPortKind: "output",
        startX: 0,
        startY: 0,
        currentX: 20,
        currentY: 20,
        currentClientX: 100,
        currentClientY: 100,
      },
      findNode: () => undefined,
      getOutputPortPoint: () => ({ x: 0, y: 0 }),
      getInputPortPoint: () => ({ x: 0, y: 0 }),
      unitToPx: (value) => value,
      createAStarConnectionPath: () => document.createElementNS("http://www.w3.org/2000/svg", "path"),
      onConnectionClick: () => undefined,
      canDropConnection: () => true,
    });

    expect(hoveredPort.classList.contains("cfc-port--drop-allowed")).toBe(true);
  });

  it("marks hovered output port as drop-blocked for invalid reverse drag", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    const fallbackSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    document.body.append(svg, fallbackSvg);

    const hoveredPort = document.createElement("div");
    hoveredPort.className = "cfc-port cfc-port--output";
    hoveredPort.dataset.nodeId = "N9";
    hoveredPort.dataset.portId = "output:0";
    document.body.append(hoveredPort);

    setElementFromPoint(hoveredPort);

    renderConnectionLayer({
      svg,
      fallbackOverlaySvg: fallbackSvg,
      connections: [],
      selectedConnectionIds: new Set(),
      routingMode: "astar",
      connectionDrag: {
        fromNodeId: "N1",
        fromPort: "input:1",
        fromPortKind: "input",
        startX: 0,
        startY: 0,
        currentX: 20,
        currentY: 20,
        currentClientX: 100,
        currentClientY: 100,
      },
      findNode: () => undefined,
      getOutputPortPoint: () => ({ x: 0, y: 0 }),
      getInputPortPoint: () => ({ x: 0, y: 0 }),
      unitToPx: (value) => value,
      createAStarConnectionPath: () => document.createElementNS("http://www.w3.org/2000/svg", "path"),
      onConnectionClick: () => undefined,
      canDropConnection: () => false,
    });

    expect(hoveredPort.classList.contains("cfc-port--drop-blocked")).toBe(true);
  });
});
