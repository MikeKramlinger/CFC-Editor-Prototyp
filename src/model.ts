export type CfcNodeType =
  | "input"
  | "output"
  | "box"
  | "box-en-eno"
  | "jump"
  | "label"
  | "return"
  | "composer"
  | "selector"
  | "comment"
  | "connection-mark-source"
  | "connection-mark-sink"
  | "input-pin"
  | "output-pin";

export interface CfcNodeTemplate {
  type: CfcNodeType;
  label: string;
  width: number;
  height: number;
  inputCount: number;
  outputCount: number;
}

export const CFC_NODE_TEMPLATES: CfcNodeTemplate[] = [
  { type: "input", label: "Input", width: 5, height: 2, inputCount: 0, outputCount: 1 },
  { type: "output", label: "Output", width: 5, height: 2, inputCount: 1, outputCount: 0 },
  { type: "box", label: "Box", width: 6, height: 3, inputCount: 2, outputCount: 1 },
  { type: "box-en-eno", label: "Box with EN/ENO", width: 7, height: 4, inputCount: 3, outputCount: 2 },
  { type: "jump", label: "Jump", width: 4, height: 2, inputCount: 1, outputCount: 0 },
  { type: "label", label: "Label", width: 4, height: 2, inputCount: 0, outputCount: 0 },
  { type: "return", label: "Return", width: 4, height: 2, inputCount: 1, outputCount: 0 },
  { type: "composer", label: "Composer", width: 6, height: 3, inputCount: 2, outputCount: 1 },
  { type: "selector", label: "Selector", width: 6, height: 3, inputCount: 1, outputCount: 2 },
  { type: "comment", label: "Comment", width: 10, height: 2, inputCount: 0, outputCount: 0 },
  { type: "connection-mark-source", label: "Connection Mark - Source", width: 10, height: 2, inputCount: 1, outputCount: 0 },
  { type: "connection-mark-sink", label: "Connection Mark - Sink", width: 10, height: 2, inputCount: 0, outputCount: 1 },
  { type: "input-pin", label: "Input Pin", width: 3, height: 2, inputCount: 0, outputCount: 1 },
  { type: "output-pin", label: "Output Pin", width: 3, height: 2, inputCount: 1, outputCount: 0 },
];

export const DEFAULT_NODE_TYPE: CfcNodeType = "box";

const nodeTemplateMap = new Map<CfcNodeType, CfcNodeTemplate>(
  CFC_NODE_TEMPLATES.map((template) => [template.type, template]),
);

export const isCfcNodeType = (value: string): value is CfcNodeType => nodeTemplateMap.has(value as CfcNodeType);

export const getNodeTemplateByType = (type: CfcNodeType): CfcNodeTemplate =>
  nodeTemplateMap.get(type) ?? nodeTemplateMap.get(DEFAULT_NODE_TYPE)!;

/**
 * Normalized node text used for box labels and derived type names.
 * Callers should store whitespace-free values here.
 */
export type NormalizedNodeName = string;

export interface CfcNode {
  id: string;
  type: CfcNodeType;
  label: NormalizedNodeName;
  x: number;
  y: number;
  width: number;
  height: number;
  typeName?: NormalizedNodeName;
}

export interface CfcConnection {
  id: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
}

export interface CfcGraph {
  version: string;
  nodes: CfcNode[];
  connections: CfcConnection[];
  declarations: string; // Raw text der Deklarationen (PROGRAM CFC VAR ... END_VAR)
}

export const createEmptyGraph = (): CfcGraph => ({
  version: "1.0",
  nodes: [],
  connections: [],
  declarations: "PROGRAM CFC\nVAR\nEND_VAR",
});

export const cloneGraph = (graph: CfcGraph): CfcGraph => ({
  version: graph.version,
  nodes: graph.nodes.map((node) => ({ ...node })),
  connections: graph.connections.map((connection) => ({ ...connection })),
  declarations: graph.declarations,
});
