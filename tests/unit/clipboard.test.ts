import { describe, expect, it } from "vitest";
import {
  createGraphClipboard,
  getClipboardPasteContext,
  resolveClipboardPasteTranslation,
} from "../../src/core/editor/clipboard.js";
import { createConnection, createGraph, createNode } from "./helpers.js";

describe("clipboard core", () => {
  it("returns null when nothing is selected", () => {
    const graph = createGraph([createNode("N1", "box", 0, 0)], []);
    expect(createGraphClipboard(graph, new Set())).toBeNull();
  });

  it("creates clipboard with selected nodes and internal connections only", () => {
    const n1 = createNode("N1", "box", 1, 1);
    const n2 = createNode("N2", "box", 8, 1);
    const n3 = createNode("N3", "box", 15, 1);

    const graph = createGraph(
      [n1, n2, n3],
      [
        createConnection("C1", "N1", "N2"),
        createConnection("C2", "N2", "N3"),
      ],
    );

    const clipboard = createGraphClipboard(graph, new Set(["N1", "N2"]));

    expect(clipboard).not.toBeNull();
    expect(clipboard?.nodes.map((node) => node.id)).toEqual(["N1", "N2"]);
    expect(clipboard?.connections).toEqual([
      { fromNodeId: "N1", fromPort: "OUT1", toNodeId: "N2", toPort: "IN1" },
    ]);
    expect(clipboard?.pasteCount).toBe(0);
  });

  it("uses cursor-centered translation when cursor position exists", () => {
    const clipboard = {
      nodes: [createNode("N1", "box", 0, 0, { width: 4, height: 2 })],
      connections: [],
      pasteCount: 0,
    };

    const context = getClipboardPasteContext(clipboard, { x: 20, y: 10 });

    expect(context.pasteCount).toBe(1);
    expect(context.translationX).toBe(18);
    expect(context.translationY).toBe(9);
  });

  it("resolves paste translation to preferred values when no collision exists", () => {
    const clipboardNodes = [createNode("N1", "box", 0, 0, { width: 4, height: 2 })];
    const existingNodes = [createNode("E1", "box", 20, 20, { width: 4, height: 2 })];

    const translation = resolveClipboardPasteTranslation(clipboardNodes, existingNodes, 5, 5);

    expect(translation).toEqual({ translationX: 5, translationY: 5 });
  });

  it("offsets paste translation when preferred placement collides", () => {
    const clipboardNodes = [createNode("N1", "box", 0, 0, { width: 4, height: 2 })];
    const existingNodes = [createNode("E1", "box", 0, 0, { width: 4, height: 2 })];

    const translation = resolveClipboardPasteTranslation(clipboardNodes, existingNodes, 0, 0);

    expect(translation.translationX).toBeGreaterThan(0);
    expect(translation.translationY).toBeGreaterThan(0);
  });

  it("clamps translated clipboard node positions at zero for collision checks", () => {
    const clipboardNodes = [createNode("N1", "box", 2, 2, { width: 4, height: 2 })];
    const existingNodes = [createNode("E1", "box", 0, 0, { width: 4, height: 2 })];

    const translation = resolveClipboardPasteTranslation(clipboardNodes, existingNodes, -5, -5);

    expect(translation.translationX).toBeGreaterThan(-5);
    expect(translation.translationY).toBeGreaterThan(-5);
  });
});
