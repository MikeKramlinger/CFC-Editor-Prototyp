import type { CfcConnection } from "../../model.js";

export type ConnectionCreationBlockReason = "duplicate" | "input-occupied";

export const getConnectionCreationBlockReason = (
  connections: CfcConnection[],
  candidate: Pick<CfcConnection, "fromNodeId" | "fromPin" | "toNodeId" | "toPin">,
): ConnectionCreationBlockReason | null => {
  const exists = connections.some(
    (connection) =>
      connection.fromNodeId === candidate.fromNodeId &&
      connection.fromPin === candidate.fromPin &&
      connection.toNodeId === candidate.toNodeId &&
      connection.toPin === candidate.toPin,
  );
  if (exists) {
    return "duplicate";
  }

  const inputAlreadyOccupied = connections.some(
    (connection) => connection.toNodeId === candidate.toNodeId && connection.toPin === candidate.toPin,
  );
  if (inputAlreadyOccupied) {
    return "input-occupied";
  }

  return null;
};
