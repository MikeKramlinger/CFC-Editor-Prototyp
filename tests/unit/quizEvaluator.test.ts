import { describe, expect, it } from "vitest";
import { evaluateQuizTask } from "../../src/quiz/evaluator.js";
import { getNodeTemplateByType, type CfcGraph } from "../../src/model.js";
import type { QuizTask } from "../../src/quiz/types.js";

const makeGraph = (): CfcGraph => {
  const input = getNodeTemplateByType("input");
  const box = getNodeTemplateByType("box");
  return {
    version: "1.0",
    nodes: [
      { id: "N1", type: "input", label: "In", x: 2, y: 4, width: input.width, height: input.height },
      { id: "N2", type: "box", label: "Step", x: 12, y: 8, width: box.width, height: box.height },
    ],
    connections: [
      {
        id: "C1",
        fromNodeId: "N1",
        fromPort: "output:0",
        toNodeId: "N2",
        toPort: "input:0",
      },
    ],
  };
};

describe("quiz evaluator", () => {
  it("passes when required node and connection are present", () => {
    const task: QuizTask = {
      id: "t1",
      kind: "graph",
      title: "Task",
      description: "desc",
      initialGraph: makeGraph(),
      criteria: {
        requiredNodes: [{ type: "box", label: "Step", x: 12, y: 8 }],
        requiredConnections: [{ from: { type: "input" }, to: { type: "box", label: "Step" } }],
      },
    };

    const result = evaluateQuizTask({ graph: makeGraph(), task });

    expect(result.success).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
  });

  it("fails when position does not match", () => {
    const wrong = makeGraph();
    wrong.nodes[1]!.x = 13;

    const task: QuizTask = {
      id: "t2",
      kind: "graph",
      title: "Task",
      description: "desc",
      initialGraph: makeGraph(),
      criteria: {
        requiredNodes: [{ type: "box", label: "Step", x: 12, y: 8 }],
      },
    };

    const result = evaluateQuizTask({ graph: wrong, task });

    expect(result.success).toBe(false);
    expect(result.failedChecks[0]).toContain("Pflicht-Node");
  });
});
