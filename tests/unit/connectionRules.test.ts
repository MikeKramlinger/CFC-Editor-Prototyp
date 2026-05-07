import { describe, expect, it } from "vitest";
import { getConnectionCreationBlockReason } from "../../src/core/graph/connectionRules.js";
import { createConnection } from "./helpers.js";

describe("connection rules", () => {
  it("blocks duplicate connection", () => {
    const connections = [createConnection("C1", "N1", "N2")];
    const reason = getConnectionCreationBlockReason(connections, {
      fromNodeId: "N1",
      fromPin: "OUT1",
      toNodeId: "N2",
      toPin: "IN1",
    });

    expect(reason).toBe("duplicate");
  });

  it("blocks occupied input", () => {
    const connections = [createConnection("C1", "N1", "N2")];
    const reason = getConnectionCreationBlockReason(connections, {
      fromNodeId: "N3",
      fromPin: "OUT1",
      toNodeId: "N2",
      toPin: "IN1",
    });

    expect(reason).toBe("input-occupied");
  });

  it("allows valid unique connection", () => {
    const connections = [createConnection("C1", "N1", "N2")];
    const reason = getConnectionCreationBlockReason(connections, {
      fromNodeId: "N3",
      fromPin: "OUT2",
      toNodeId: "N2",
      toPin: "IN2",
    });

    expect(reason).toBeNull();
  });
});
