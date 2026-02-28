import type { CfcConnection } from "../../model.js";

export type ConnectionCreationBlockReason = "duplicate" | "input-occupied";

export const getConnectionCreationBlockReason = (
  connections: CfcConnection[],
  candidate: Pick<CfcConnection, "fromNodeId" | "fromPort" | "toNodeId" | "toPort">,
): ConnectionCreationBlockReason | null => {
  const exists = connections.some(
    (connection) =>
      connection.fromNodeId === candidate.fromNodeId &&
      connection.fromPort === candidate.fromPort &&
      connection.toNodeId === candidate.toNodeId &&
      connection.toPort === candidate.toPort,
  );
  if (exists) {
    return "duplicate";
  }

  const inputAlreadyOccupied = connections.some(
    (connection) => connection.toNodeId === candidate.toNodeId && connection.toPort === candidate.toPort,
  );
  if (inputAlreadyOccupied) {
    return "input-occupied";
  }

  return null;
};
