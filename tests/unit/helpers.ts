import type { CfcConnection, CfcGraph, CfcNode, CfcNodeType } from "../../src/model.js";
import { getNodeTemplateByType } from "../../src/model.js";

export interface TestNodeInput {
  id: CfcNode["id"];
  type: CfcNodeType;
  executionOrder?: CfcNode["executionOrder"];
  typeName?: CfcNode["typeName"];
  label?: CfcNode["label"];
  x: CfcNode["x"];
  y: CfcNode["y"];
  width?: CfcNode["width"];
  height?: CfcNode["height"];
}

const buildNode = (input: TestNodeInput): CfcNode => {
  const template = getNodeTemplateByType(input.type);
  return {
    id: input.id,
    type: input.type,
    ...(typeof input.executionOrder === "number" ? { executionOrder: input.executionOrder } : {}),
    ...(input.typeName ? { typeName: input.typeName } : {}),
    label: input.label ?? `${input.type}-${input.id}`,
    x: input.x,
    y: input.y,
    width: input.width ?? template.width,
    height: input.height ?? template.height,
  };
};

export function createNode(input: TestNodeInput): CfcNode;
export function createNode(
  id: string,
  type: CfcNodeType,
  x: number,
  y: number,
  overrides?: Partial<CfcNode>,
): CfcNode;
export function createNode(
  idOrInput: string | TestNodeInput,
  type?: CfcNodeType,
  x?: number,
  y?: number,
  overrides: Partial<CfcNode> = {},
): CfcNode {
  if (typeof idOrInput !== "string") {
    return buildNode(idOrInput);
  }

  const template = getNodeTemplateByType(type ?? "box");
  return {
    id: idOrInput,
    type: type ?? "box",
    label: `${type ?? "box"}-${idOrInput}`,
    x: x ?? 0,
    y: y ?? 0,
    width: template.width,
    height: template.height,
    ...overrides,
  };
}

export const createConnection = (
  id: string,
  fromNodeId: string,
  toNodeId: string,
  overrides: Partial<CfcConnection> = {},
): CfcConnection => ({
  id,
  fromNodeId,
  fromPort: "OUT1",
  toNodeId,
  toPort: "IN1",
  ...overrides,
});

export const createGraph = (
  nodes: CfcNode[] = [],
  connections: CfcConnection[] = [],
  version = "1.0",
): CfcGraph => ({
  version,
  nodes,
  connections,
  declarations: "PROGRAM CFC\nVAR\nEND_VAR",
});
