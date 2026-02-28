import { describe, expect, it } from "vitest";
import { getConnectionCreationBlockReason } from "../../src/core/graph/connectionRules.js";
import { createConnection } from "./helpers.js";

describe("connection rules", () => {
  it("blocks duplicate connection", () => {
    const connections = [createConnection("C1", "N1", "N2")];
    const reason = getConnectionCreationBlockReason(connections, {
      fromNodeId: "N1",
      fromPort: "OUT1",
      toNodeId: "N2",
      toPort: "IN1",
    });

    expect(reason).toBe("duplicate");
  });

  it("blocks occupied input", () => {
    const connections = [createConnection("C1", "N1", "N2")];
    const reason = getConnectionCreationBlockReason(connections, {
      fromNodeId: "N3",
      fromPort: "OUT1",
      toNodeId: "N2",
      toPort: "IN1",
    });

    expect(reason).toBe("input-occupied");
  });

  it("allows valid unique connection", () => {
    const connections = [createConnection("C1", "N1", "N2")];
    const reason = getConnectionCreationBlockReason(connections, {
      fromNodeId: "N3",
      fromPort: "OUT2",
      toNodeId: "N2",
      toPort: "IN2",
    });

    expect(reason).toBeNull();
  });
});
