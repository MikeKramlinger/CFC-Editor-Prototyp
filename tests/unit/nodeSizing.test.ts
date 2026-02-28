import { describe, expect, it } from "vitest";
import { fitNodeWidthToLabel } from "../../src/core/editor/nodeSizing.js";
import { createNode } from "./helpers.js";

describe("node sizing", () => {
  it("keeps at least template minimum width", () => {
    const node = createNode("N1", "box", 0, 0, { label: "X", width: 1 });
    fitNodeWidthToLabel(node);

    expect(node.width).toBeGreaterThanOrEqual(6);
  });

  it("increases width for long labels", () => {
    const shortNode = createNode("N1", "box", 0, 0, { label: "Short" });
    const longNode = createNode("N2", "box", 0, 0, {
      label: "Very long label content that should require significantly more width",
    });

    fitNodeWidthToLabel(shortNode);
    fitNodeWidthToLabel(longNode);

    expect(longNode.width).toBeGreaterThan(shortNode.width);
  });

  it("applies larger horizontal padding for connection marks", () => {
    const boxNode = createNode("N1", "box", 0, 0, { label: "Same Label" });
    const markNode = createNode("N2", "connection-mark-source", 0, 0, { label: "Same Label" });

    fitNodeWidthToLabel(boxNode);
    fitNodeWidthToLabel(markNode);

    expect(markNode.width).toBeGreaterThan(boxNode.width);
  });

  it("keeps width snapped to grid (integer units)", () => {
    const node = createNode("N1", "selector", 0, 0, {
      label: "A medium label",
    });

    fitNodeWidthToLabel(node);

    expect(Number.isInteger(node.width)).toBe(true);
  });

  it("allocates extra width for split-area composer/selector content", () => {
    const boxNode = createNode("N1", "box", 0, 0, {
      label: "Long content for area-constrained layout",
    });
    const composerNode = createNode("N2", "composer", 0, 0, {
      label: "Long content for area-constrained layout",
    });
    const selectorNode = createNode("N3", "selector", 0, 0, {
      label: "Long content for area-constrained layout",
    });

    fitNodeWidthToLabel(boxNode);
    fitNodeWidthToLabel(composerNode);
    fitNodeWidthToLabel(selectorNode);

    expect(composerNode.width).toBeGreaterThan(boxNode.width);
    expect(selectorNode.width).toBeGreaterThan(boxNode.width);
  });

  it("reserves extra width for return node execution-order badge", () => {
    const label = "Very long return label that should not collide with execution order";
    const outputNode = createNode("N1", "output", 0, 0, { label });
    const returnNode = createNode("N2", "return", 0, 0, { label });

    fitNodeWidthToLabel(outputNode);
    fitNodeWidthToLabel(returnNode);

    expect(returnNode.width).toBeGreaterThan(outputNode.width);
  });
});
