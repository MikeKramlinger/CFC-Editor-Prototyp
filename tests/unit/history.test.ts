import { describe, expect, it } from "vitest";
import { areGraphsEqual, createGraphHistory } from "../../src/core/editor/history.js";
import { cloneGraph } from "../../src/model.js";
import { createConnection, createGraph, createNode } from "./helpers.js";

describe("history core", () => {
  it("detects equal graphs correctly", () => {
    const graph = createGraph(
      [createNode("N1", "box", 1, 1)],
      [createConnection("C1", "N1", "N1", { toPort: "IN2" })],
    );

    expect(areGraphsEqual(graph, cloneGraph(graph))).toBe(true);
    expect(areGraphsEqual(graph, createGraph([], []))).toBe(false);
  });

  it("does not commit unchanged graph", () => {
    const history = createGraphHistory();
    const graph = createGraph([createNode("N1", "box", 1, 1)], []);

    const committed = history.commit(graph, cloneGraph(graph));

    expect(committed).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it("supports commit, undo, and redo", () => {
    const history = createGraphHistory();
    const before = createGraph([createNode("N1", "box", 1, 1)], []);
    const after = createGraph([createNode("N1", "box", 5, 1)], []);

    expect(history.commit(before, after)).toBe(true);
    expect(history.canUndo()).toBe(true);

    const undoGraph = history.undo(after);
    expect(undoGraph?.nodes[0]?.x).toBe(1);
    expect(history.canRedo()).toBe(true);

    const redoGraph = history.redo(undoGraph!);
    expect(redoGraph?.nodes[0]?.x).toBe(5);
  });

  it("clears undo and redo stacks", () => {
    const history = createGraphHistory();
    const before = createGraph([createNode("N1", "box", 1, 1)], []);
    const after = createGraph([createNode("N1", "box", 2, 1)], []);

    history.commit(before, after);
    history.undo(after);
    expect(history.canRedo()).toBe(true);

    history.clear();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("respects history limit by dropping oldest entries", () => {
    const history = createGraphHistory(2);

    const g0 = createGraph([createNode("N1", "box", 0, 0)], []);
    const g1 = createGraph([createNode("N1", "box", 1, 0)], []);
    const g2 = createGraph([createNode("N1", "box", 2, 0)], []);
    const g3 = createGraph([createNode("N1", "box", 3, 0)], []);

    history.commit(g0, g1);
    history.commit(g1, g2);
    history.commit(g2, g3);

    const undo1 = history.undo(g3);
    const undo2 = history.undo(undo1!);
    const undo3 = history.undo(undo2!);

    expect(undo1?.nodes[0]?.x).toBe(2);
    expect(undo2?.nodes[0]?.x).toBe(1);
    expect(undo3).toBeNull();
  });
});
