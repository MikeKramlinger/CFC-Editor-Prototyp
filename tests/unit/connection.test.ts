import { describe, expect, it } from "vitest";
import {
  createConnectionDragState,
  extractInputPortDropTarget,
  extractOutputPortDropTarget,
  updateConnectionDragState,
} from "../../src/core/editor/connection.js";

describe("connection drag utilities", () => {
  it("creates drag state with provided values", () => {
    const state = createConnectionDragState("N1", "OUT1", "output", 1, 2, 3, 4, 100, 200);
    expect(state).toMatchObject({
      fromNodeId: "N1",
      fromPort: "OUT1",
      fromPortKind: "output",
      startX: 1,
      startY: 2,
      currentX: 3,
      currentY: 4,
      currentClientX: 100,
      currentClientY: 200,
    });
  });

  it("updates only current drag coordinates", () => {
    const state = createConnectionDragState("N1", "OUT1", "output", 1, 2, 3, 4, 100, 200);
    const updated = updateConnectionDragState(state, 9, 8, 300, 400);

    expect(updated.startX).toBe(1);
    expect(updated.currentX).toBe(9);
    expect(updated.currentClientY).toBe(400);
  });

  it("extracts input drop target with explicit port id", () => {
    const port = { dataset: { nodeId: "N2", portId: "IN3" } };
    const dropTarget = {
      closest: (selector: string) => (selector === ".cfc-port--input" ? port : null),
    } as unknown as Element;

    const result = extractInputPortDropTarget(dropTarget);

    expect(result).toEqual({ nodeId: "N2", portId: "IN3" });
  });

  it("extracts output drop target with fallback port id", () => {
    const port = { dataset: { nodeId: "N4" } };
    const dropTarget = {
      closest: (selector: string) => (selector === ".cfc-port--output" ? port : null),
    } as unknown as Element;

    const result = extractOutputPortDropTarget(dropTarget);

    expect(result).toEqual({ nodeId: "N4", portId: "output:0" });
  });

  it("returns null when no matching input port exists", () => {
    const dropTarget = {
      closest: () => null,
    } as unknown as Element;

    expect(extractInputPortDropTarget(dropTarget)).toBeNull();
  });

  it("returns null when port has no node id", () => {
    const port = { dataset: { portId: "IN1" } };
    const dropTarget = {
      closest: (selector: string) => (selector === ".cfc-port--input" ? port : null),
    } as unknown as Element;

    expect(extractInputPortDropTarget(dropTarget)).toBeNull();
  });
});
