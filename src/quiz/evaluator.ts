import type { CfcConnection, CfcGraph, CfcNode, CfcNodeType } from "../model.js";
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
      const found = graph.nodes.some((node) => matchesNodeExpectation(node, requiredNode));
      if (found) {
        passedChecks.push(`Pflicht-Node ${index + 1} vorhanden.`);
      } else {
        failedChecks.push(`Pflicht-Node ${index + 1} fehlt oder ist falsch positioniert.`);
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
