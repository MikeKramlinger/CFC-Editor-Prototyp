import { describe, expect, it } from "vitest";
import {
  getExecutionOrderByNodeId,
  getExecutionOrderedNodeCount,
  isExecutionOrderedNode,
  swapNodeExecutionOrder,
} from "../../src/core/graph/executionOrder.js";
import { createNode } from "./helpers.js";

describe("execution order", () => {
  it("excludes non-executable node types", () => {
    const executableNode = createNode("N1", "box", 0, 0);
    const excludedNode = createNode("N2", "comment", 1, 0);

    expect(isExecutionOrderedNode(executableNode)).toBe(true);
    expect(isExecutionOrderedNode(excludedNode)).toBe(false);
    expect(getExecutionOrderedNodeCount([executableNode, excludedNode])).toBe(1);
  });

  it("returns order only for executable nodes", () => {
    const nodes = [
      createNode("N1", "input", 0, 0),
      createNode("N2", "box", 1, 0),
      createNode("N3", "box", 2, 0),
    ];

    expect(getExecutionOrderByNodeId(nodes, "N2")).toBe(1);
    expect(getExecutionOrderByNodeId(nodes, "N3")).toBe(2);
    expect(getExecutionOrderByNodeId(nodes, "N1")).toBeNull();
  });

  it("swaps executable node positions based on desired order", () => {
    const nodes = [
      createNode("N1", "input", 0, 0),
      createNode("N2", "box", 1, 0),
      createNode("N3", "box", 2, 0),
    ];

    const swapped = swapNodeExecutionOrder(nodes, "N3", 1);

    expect(swapped[1]?.id).toBe("N3");
    expect(swapped[2]?.id).toBe("N2");
  });
});
