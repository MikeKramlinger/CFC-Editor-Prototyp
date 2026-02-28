import { cloneGraph, createEmptyGraph, getNodeTemplateByType, type CfcGraph } from "../model.js";
import type { QuizTask } from "./types.js";

const createNode = (
  id: string,
  type: Parameters<typeof getNodeTemplateByType>[0],
  x: number,
  y: number,
  label: string,
) => {
  const template = getNodeTemplateByType(type);
  return {
    id,
    type,
    label,
    x,
    y,
    width: template.width,
    height: template.height,
  };
};

const baseGraph: CfcGraph = {
  version: "1.0",
  nodes: [
    createNode("N1", "input", 2, 4, "In"),
    createNode("N2", "output", 28, 4, "Out"),
  ],
  connections: [],
};

export const SAMPLE_QUIZ_TASKS: QuizTask[] = [
  {
    id: "task-add-box-position",
    kind: "graph",
    title: "Box an Position",
    description: "Füge eine neue Box an Position x=12, y=8 ein.",
    initialGraph: cloneGraph(baseGraph),
    criteria: {
      minNodeCount: 3,
      requiredNodes: [{ type: "box", x: 12, y: 8 }],
    },
  },
  {
    id: "task-connect-input-box",
    kind: "graph",
    title: "Input verbinden",
    description: "Füge eine Box mit Label 'Step' ein und verbinde Input -> Box.",
    initialGraph: cloneGraph(baseGraph),
    criteria: {
      requiredNodes: [{ type: "box", label: "Step" }],
      requiredConnections: [
        {
          from: { type: "input" },
          to: { type: "box", label: "Step" },
        },
      ],
    },
  },
  {
    id: "task-clean-graph",
    kind: "graph",
    title: "Leerer Graph",
    description: "Lösche alle Nodes und Verbindungen und importiere den leeren Graphen.",
    initialGraph: cloneGraph(baseGraph),
    criteria: {
      exactNodeCount: 0,
      exactConnectionCount: 0,
    },
  },
  {
    id: "task-open-question-reasoning",
    kind: "open",
    title: "Offene Frage",
    description: "Beschreibe kurz, warum eine klare Signalrichtung im Graphen wichtig ist.",
    initialGraph: cloneGraph(baseGraph),
    placeholder: "Deine Antwort ...",
    saveMessage: "💾 Antwort gespeichert.",
  },
];

export const createEmptyQuizGraph = (): CfcGraph => createEmptyGraph();
