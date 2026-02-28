import type { CfcConnection, CfcGraph, CfcNode, CfcNodeType } from "../../src/model.js";

export const createNode = (
  id: string,
  type: CfcNodeType,
  x: number,
  y: number,
  overrides: Partial<CfcNode> = {},
): CfcNode => ({
  id,
  type,
  label: `${type}-${id}`,
  x,
  y,
  width: 4,
  height: 2,
  ...overrides,
});

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
});
