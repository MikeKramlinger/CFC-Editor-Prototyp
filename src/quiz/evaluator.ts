import type { CfcConnection, CfcGraph, CfcNode, CfcNodeType } from "../model.js";
import { getExecutionOrderByNodeId } from "../core/graph/executionOrder.js";
import type {
  QuizConnectionExpectation,
  QuizEvaluationContext,
  QuizEvaluationResult,
  QuizNodeExpectation,
  QuizNodeSelector,
} from "./types.js";

const defaultTolerance = 0;

const matchesSelector = (node: CfcNode, selector: QuizNodeSelector): boolean => {
  if (selector.id && node.id !== selector.id) {
    return false;
  }
  if (selector.type && node.type !== selector.type) {
    return false;
  }
  if (selector.label && node.label !== selector.label) {
    return false;
  }
  return true;
};

const matchesNodeExpectation = (node: CfcNode, expectation: QuizNodeExpectation): boolean => {
  if (!matchesSelector(node, expectation)) {
    return false;
  }

  const tolerance = expectation.tolerance ?? defaultTolerance;
  if (typeof expectation.x === "number" && Math.abs(node.x - expectation.x) > tolerance) {
    return false;
  }
  if (typeof expectation.y === "number" && Math.abs(node.y - expectation.y) > tolerance) {
    return false;
  }
  return true;
};

const buildNodeExpectationLabel = (expectation: QuizNodeExpectation): string => {
  const parts: string[] = [];
  if (expectation.id) {
    parts.push(`id=${expectation.id}`);
  }
  if (expectation.type) {
    parts.push(`type=${expectation.type}`);
  }
  if (expectation.label) {
    parts.push(`label=${expectation.label}`);
  }
  if (typeof expectation.executionOrder === "number") {
    parts.push(`executionOrder=${expectation.executionOrder}`);
  }
  if (typeof expectation.x === "number") {
    parts.push(`x=${expectation.x}`);
  }
  if (typeof expectation.y === "number") {
    parts.push(`y=${expectation.y}`);
  }
  return parts.join(", ");
};

const getNodeExecutionOrderInGraph = (graph: CfcGraph, nodeId: string): number | null => {
  return getExecutionOrderByNodeId(graph.nodes, nodeId);
};

const findClosestNodeCandidate = (graph: CfcGraph, expectation: QuizNodeExpectation): CfcNode | null => {
  if (graph.nodes.length === 0) {
    return null;
  }

  if (expectation.id) {
    const nodeById = graph.nodes.find((node) => node.id === expectation.id);
    if (nodeById) {
      return nodeById;
    }
  }

  let candidates = [...graph.nodes];
  if (expectation.type) {
    const typed = candidates.filter((node) => node.type === expectation.type);
    if (typed.length > 0) {
      candidates = typed;
    }
  }
  if (expectation.label) {
    const labeled = candidates.filter((node) => node.label === expectation.label);
    if (labeled.length > 0) {
      candidates = labeled;
    }
  }

  const scored = candidates.map((node) => {
    let mismatchCount = 0;
    let distancePenalty = 0;

    if (typeof expectation.executionOrder === "number") {
      const executionOrder = getNodeExecutionOrderInGraph(graph, node.id);
      if (executionOrder !== expectation.executionOrder) {
        mismatchCount += 1;
      }
    }
    if (typeof expectation.x === "number") {
      const xDelta = Math.abs(node.x - expectation.x);
      if (xDelta > 0) {
        mismatchCount += 1;
      }
      distancePenalty += xDelta;
    }
    if (typeof expectation.y === "number") {
      const yDelta = Math.abs(node.y - expectation.y);
      if (yDelta > 0) {
        mismatchCount += 1;
      }
      distancePenalty += yDelta;
    }

    return { node, mismatchCount, distancePenalty };
  });

  scored.sort((left, right) => {
    if (left.mismatchCount !== right.mismatchCount) {
      return left.mismatchCount - right.mismatchCount;
    }
    return left.distancePenalty - right.distancePenalty;
  });
  return scored[0]?.node ?? null;
};

const collectNodeFieldMismatches = (
  graph: CfcGraph,
  candidate: CfcNode,
  expectation: QuizNodeExpectation,
): string[] => {
  const mismatches: string[] = [];
  const tolerance = expectation.tolerance ?? defaultTolerance;
  const buildMismatch = (field: string, actual: string | number, expected: string | number): string => {
    return `${field}: ${actual} ≠ ${expected}`;
  };

  if (expectation.id && candidate.id !== expectation.id) {
    mismatches.push(buildMismatch("id", candidate.id, expectation.id));
  }

  if (expectation.type && candidate.type !== expectation.type) {
    mismatches.push(buildMismatch("type", candidate.type, expectation.type));
  }

  if (expectation.label && candidate.label !== expectation.label) {
    mismatches.push(buildMismatch("label", candidate.label, expectation.label));
  }

  if (typeof expectation.executionOrder === "number") {
    const executionOrder = getNodeExecutionOrderInGraph(graph, candidate.id);
    if (executionOrder !== expectation.executionOrder) {
      const actual = executionOrder === null ? "keine" : String(executionOrder);
      mismatches.push(buildMismatch("executionOrder", actual, expectation.executionOrder));
    }
  }

  if (typeof expectation.x === "number" && Math.abs(candidate.x - expectation.x) > tolerance) {
    mismatches.push(buildMismatch("x", candidate.x, expectation.x));
  }

  if (typeof expectation.y === "number" && Math.abs(candidate.y - expectation.y) > tolerance) {
    mismatches.push(buildMismatch("y", candidate.y, expectation.y));
  }

  return mismatches;
};

const countByType = (graph: CfcGraph): Record<CfcNodeType, number> => {
  return graph.nodes.reduce<Record<CfcNodeType, number>>((acc, node) => {
    acc[node.type] += 1;
    return acc;
  }, {
    input: 0,
    output: 0,
    box: 0,
    "box-en-eno": 0,
    jump: 0,
    label: 0,
    return: 0,
    composer: 0,
    selector: 0,
    comment: 0,
    "connection-mark-source": 0,
    "connection-mark-sink": 0,
    "input-pin": 0,
    "output-pin": 0,
  });
};

const hasExpectedConnection = (graph: CfcGraph, expectation: QuizConnectionExpectation): boolean => {
  const fromNodeIds = new Set(
    graph.nodes
      .filter((node) => matchesSelector(node, expectation.from))
      .map((node) => node.id),
  );
  const toNodeIds = new Set(
    graph.nodes
      .filter((node) => matchesSelector(node, expectation.to))
      .map((node) => node.id),
  );

  return graph.connections.some((connection: CfcConnection) => {
    if (!fromNodeIds.has(connection.fromNodeId) || !toNodeIds.has(connection.toNodeId)) {
      return false;
    }
    if (expectation.fromPort && connection.fromPort !== expectation.fromPort) {
      return false;
    }
    if (expectation.toPort && connection.toPort !== expectation.toPort) {
      return false;
    }
    return true;
  });
};

export const evaluateQuizTask = ({ graph, task }: QuizEvaluationContext): QuizEvaluationResult => {
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const { criteria } = task;

  if (typeof criteria.exactNodeCount === "number") {
    if (graph.nodes.length === criteria.exactNodeCount) {
      passedChecks.push(`Node-Anzahl ist genau ${criteria.exactNodeCount}.`);
    } else {
      failedChecks.push(`Node-Anzahl muss genau ${criteria.exactNodeCount} sein (aktuell: ${graph.nodes.length}).`);
    }
  }

  if (typeof criteria.minNodeCount === "number") {
    if (graph.nodes.length >= criteria.minNodeCount) {
      passedChecks.push(`Mindestens ${criteria.minNodeCount} Nodes vorhanden.`);
    } else {
      failedChecks.push(`Mindestens ${criteria.minNodeCount} Nodes erforderlich (aktuell: ${graph.nodes.length}).`);
    }
  }

  if (typeof criteria.exactConnectionCount === "number") {
    if (graph.connections.length === criteria.exactConnectionCount) {
      passedChecks.push(`Verbindungsanzahl ist genau ${criteria.exactConnectionCount}.`);
    } else {
      failedChecks.push(
        `Verbindungsanzahl muss genau ${criteria.exactConnectionCount} sein (aktuell: ${graph.connections.length}).`,
      );
    }
  }

  if (typeof criteria.minConnectionCount === "number") {
    if (graph.connections.length >= criteria.minConnectionCount) {
      passedChecks.push(`Mindestens ${criteria.minConnectionCount} Verbindungen vorhanden.`);
    } else {
      failedChecks.push(
        `Mindestens ${criteria.minConnectionCount} Verbindungen erforderlich (aktuell: ${graph.connections.length}).`,
      );
    }
  }

  if (criteria.requiredNodeCounts) {
    const typeCounts = countByType(graph);
    for (const [type, required] of Object.entries(criteria.requiredNodeCounts)) {
      const typed = type as CfcNodeType;
      const current = typeCounts[typed];
      if (typeof required !== "number") {
        continue;
      }
      if (current >= required) {
        passedChecks.push(`Mindestens ${required} Nodes vom Typ ${typed} vorhanden.`);
      } else {
        failedChecks.push(`Es fehlen Nodes vom Typ ${typed}: benötigt ${required}, aktuell ${current}.`);
      }
    }
  }

  if (criteria.requiredNodes) {
    criteria.requiredNodes.forEach((requiredNode, index) => {
      const foundExact = graph.nodes.some((node) => {
        if (!matchesSelector(node, requiredNode)) {
          return false;
        }
        if (typeof requiredNode.executionOrder === "number") {
          const executionOrder = getNodeExecutionOrderInGraph(graph, node.id);
          if (executionOrder !== requiredNode.executionOrder) {
            return false;
          }
        }
        return matchesNodeExpectation(node, requiredNode);
      });

      if (foundExact) {
        passedChecks.push(`Pflicht-Node ${index + 1} vorhanden.`);
      } else {
        const candidate = findClosestNodeCandidate(graph, requiredNode);
        if (!candidate) {
          const expected = buildNodeExpectationLabel(requiredNode);
          failedChecks.push(`Pflicht-Node ${index + 1} fehlt (${expected}).`);
          return;
        }

        const mismatches = collectNodeFieldMismatches(graph, candidate, requiredNode);
        if (mismatches.length === 0) {
          const expected = buildNodeExpectationLabel(requiredNode);
          failedChecks.push(`Pflicht-Node ${index + 1} fehlt (${expected}).`);
          return;
        }

        failedChecks.push(`Pflicht-Node ${index + 1}: ${mismatches.join(" | ")}.`);
      }
    });
  }

  if (criteria.forbiddenNodes) {
    criteria.forbiddenNodes.forEach((forbiddenNode, index) => {
      const found = graph.nodes.some((node) => matchesNodeExpectation(node, forbiddenNode));
      if (found) {
        failedChecks.push(`Verbotene Node ${index + 1} gefunden.`);
      } else {
        passedChecks.push(`Keine verbotene Node ${index + 1} vorhanden.`);
      }
    });
  }

  if (criteria.requiredConnections) {
    criteria.requiredConnections.forEach((requiredConnection, index) => {
      if (hasExpectedConnection(graph, requiredConnection)) {
        passedChecks.push(`Pflicht-Verbindung ${index + 1} vorhanden.`);
      } else {
        failedChecks.push(`Pflicht-Verbindung ${index + 1} fehlt.`);
      }
    });
  }

  return {
    success: failedChecks.length === 0,
    passedChecks,
    failedChecks,
  };
};
