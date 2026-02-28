import { describe, expect, it } from "vitest";
import { computeGroupDragDelta, createGroupDragState } from "../../src/core/editor/drag.js";
import { createNode } from "./helpers.js";

describe("drag utilities", () => {
  it("returns null drag state for empty node list", () => {
    expect(createGroupDragState([], 1, 1)).toBeNull();
  });

  it("captures min start positions and node snapshots", () => {
    const nodes = [createNode("N1", "box", 5, 3), createNode("N2", "box", 2, 7)];
    const state = createGroupDragState(nodes, 10, 20);

    expect(state).not.toBeNull();
    expect(state?.minStartXUnits).toBe(2);
    expect(state?.minStartYUnits).toBe(3);
    expect(state?.nodes).toHaveLength(2);
  });

  it("computes snapped drag delta", () => {
    const state = createGroupDragState([createNode("N1", "box", 2, 2)], 10, 10);
    const delta = computeGroupDragDelta(state!, 12.4, 11.6, (value) => Math.round(value));

    expect(delta).toEqual({ deltaXUnits: 2, deltaYUnits: 2 });
  });

  it("clamps drag delta to keep nodes in positive area", () => {
    const state = createGroupDragState([createNode("N1", "box", 3, 4)], 10, 10);
    const delta = computeGroupDragDelta(state!, 0, -20, (value) => value);

    expect(delta).toEqual({ deltaXUnits: -3, deltaYUnits: -4 });
  });

  it("applies provided snap function after clamping", () => {
    const state = createGroupDragState([createNode("N1", "box", 1, 1)], 5, 5);
    const delta = computeGroupDragDelta(state!, 6.8, 6.2, (value) => Math.floor(value));

    expect(delta).toEqual({ deltaXUnits: 1, deltaYUnits: 1 });
  });
});
