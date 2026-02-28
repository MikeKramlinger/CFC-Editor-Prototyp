import { describe, it, expect } from "vitest";
import { createGraphHistory } from "../../src/core/editor/history.js";
import { createEmptyGraph } from "../../src/model.js";

describe("GraphHistory limit", () => {
  it("respects the provided limit for past stack and allows undos up to that limit", () => {
    const limit = 3;
    const history = createGraphHistory(limit);

    const g0 = createEmptyGraph();
    const g1 = createEmptyGraph();
    g1.nodes.push({ id: "N1", type: "box", label: "A", x: 1, y: 1, width: 1, height: 1 });
    const g2 = createEmptyGraph();
    g2.nodes.push({ id: "N2", type: "box", label: "B", x: 2, y: 2, width: 1, height: 1 });
    const g3 = createEmptyGraph();
    g3.nodes.push({ id: "N3", type: "box", label: "C", x: 3, y: 3, width: 1, height: 1 });
    const g4 = createEmptyGraph();
    g4.nodes.push({ id: "N4", type: "box", label: "D", x: 4, y: 4, width: 1, height: 1 });

    // Commit a sequence of changes. Past should grow but be capped at `limit`.
    history.commit(g0, g1); // past: [g0]
    history.commit(g1, g2); // past: [g0, g1]
    history.commit(g2, g3); // past: [g0, g1, g2]
    history.commit(g3, g4); // past should drop oldest and become [g1, g2, g3]

    // Undo step-by-step and collect results
    let current = g4;
    const undone: string[] = [];

    while (history.canUndo()) {
      const prev = history.undo(current);
      if (!prev) break;
      undone.push(prev.nodes.map(n => n.id).join(","));
      current = prev;
    }

    // We committed 4 times but limit is 3, so we can only undo at most 3 times
    expect(undone.length).toBeLessThanOrEqual(limit);
    // The first undo should return the most recent committed 'before' state (g3)
    expect(undone[0]).toBe("N3");
  });
});
