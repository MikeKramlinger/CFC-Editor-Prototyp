// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginConnectionDrag,
  finishConnectionDrag,
  moveConnectionDrag,
} from "../../src/ui/controllers/connectionLifecycleController.js";

describe("connection lifecycle integration", () => {
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

  it("creates output->input connection on valid drop", () => {
    const targetPort = document.createElement("div");
    targetPort.className = "cfc-port cfc-port--input";
    targetPort.dataset.nodeId = "N2";
    targetPort.dataset.portId = "input:0";
    document.body.append(targetPort);

    setElementFromPoint(targetPort);

    const drag = beginConnectionDrag({
      fromNodeId: "N1",
      fromPort: "output:0",
      fromPortKind: "output",
      clientX: 100,
      clientY: 100,
      findNode: (nodeId) => ({ id: nodeId, type: "box", label: "Box", x: 0, y: 0, width: 6, height: 3 }),
      getOutputPortPoint: () => ({ x: 2, y: 2 }),
      getInputPortPoint: () => ({ x: 2, y: 2 }),
      unitToPx: (value) => value * 10,
      clientToGraphPxX: (value) => value,
      clientToGraphPxY: (value) => value,
    });

    expect(drag).not.toBeNull();
    const moved = moveConnectionDrag(drag!, 110, 110, 100, 100);

    const created: Array<{ fromNodeId: string; toNodeId: string; fromPort: string; toPort: string }> = [];
    finishConnectionDrag({
      state: moved,
      graphConnections: [],
      getNextConnectionId: () => "C1",
      onConnectionCreated: (connection) => created.push(connection),
      onConnectionSelected: () => undefined,
      onStatus: () => undefined,
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      fromNodeId: "N1",
      fromPort: "output:0",
      toNodeId: "N2",
      toPort: "input:0",
    });
  });

  it("normalizes input-start drag to canonical output->input connection", () => {
    const targetPort = document.createElement("div");
    targetPort.className = "cfc-port cfc-port--output";
    targetPort.dataset.nodeId = "N9";
    targetPort.dataset.portId = "output:0";
    document.body.append(targetPort);

    setElementFromPoint(targetPort);

    const created: Array<{ fromNodeId: string; toNodeId: string; fromPort: string; toPort: string }> = [];
    finishConnectionDrag({
      state: {
        fromNodeId: "N1",
        fromPort: "input:1",
        fromPortKind: "input",
        startX: 0,
        startY: 0,
        currentX: 1,
        currentY: 1,
        currentClientX: 50,
        currentClientY: 50,
      },
      graphConnections: [],
      getNextConnectionId: () => "C7",
      onConnectionCreated: (connection) => created.push(connection),
      onConnectionSelected: () => undefined,
      onStatus: () => undefined,
    });

    expect(created[0]).toMatchObject({
      fromNodeId: "N9",
      fromPort: "output:0",
      toNodeId: "N1",
      toPort: "input:1",
    });
  });

  it("blocks duplicate connection and reports status", () => {
    const targetPort = document.createElement("div");
    targetPort.className = "cfc-port cfc-port--input";
    targetPort.dataset.nodeId = "N2";
    targetPort.dataset.portId = "input:0";
    document.body.append(targetPort);
    setElementFromPoint(targetPort);

    const onStatus = vi.fn();
    const onConnectionCreated = vi.fn();

    finishConnectionDrag({
      state: {
        fromNodeId: "N1",
        fromPort: "output:0",
        fromPortKind: "output",
        startX: 0,
        startY: 0,
        currentX: 1,
        currentY: 1,
        currentClientX: 10,
        currentClientY: 10,
      },
      graphConnections: [
        {
          id: "C1",
          fromNodeId: "N1",
          fromPort: "output:0",
          toNodeId: "N2",
          toPort: "input:0",
        },
      ],
      getNextConnectionId: () => "C2",
      onConnectionCreated,
      onConnectionSelected: () => undefined,
      onStatus,
    });

    expect(onConnectionCreated).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith("Diese Port-Verbindung existiert bereits.");
  });

  it("allows output to input on the same node", () => {
    const targetPort = document.createElement("div");
    targetPort.className = "cfc-port cfc-port--input";
    targetPort.dataset.nodeId = "N1";
    targetPort.dataset.portId = "input:0";
    document.body.append(targetPort);
    setElementFromPoint(targetPort);

    const created: Array<{ fromNodeId: string; toNodeId: string; fromPort: string; toPort: string }> = [];

    finishConnectionDrag({
      state: {
        fromNodeId: "N1",
        fromPort: "output:0",
        fromPortKind: "output",
        startX: 0,
        startY: 0,
        currentX: 1,
        currentY: 1,
        currentClientX: 10,
        currentClientY: 10,
      },
      graphConnections: [],
      getNextConnectionId: () => "C3",
      onConnectionCreated: (connection) => created.push(connection),
      onConnectionSelected: () => undefined,
      onStatus: () => undefined,
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      fromNodeId: "N1",
      fromPort: "output:0",
      toNodeId: "N1",
      toPort: "input:0",
    });
  });
});
