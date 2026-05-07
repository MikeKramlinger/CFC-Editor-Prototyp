// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { cfcStFormat } from "../../src/formats/cfcSt.js";
import { createNode, createConnection, createGraph } from "./helpers.js";

describe("CFC-ST format unit tests", () => {
  it("serializes declaration block and cfc header with blank line", () => {
    const graph = createGraph([
      createNode("N1", "box", 0, 0, { label: "Main" }),
    ]);
    graph.declarations = "PROGRAM TEST\nVAR\nEND_VAR";

    const out = cfcStFormat.serialize(graph);
    expect(out).toContain("declaration:\n\nPROGRAM TEST");
    expect(out).toContain("\ncfc:\n\n");
  });

  it("serializes execution order metadata for CFC nodes", () => {
    const graph = createGraph([
      createNode("INP", "input", 0, 0, { label: "In" }),
      createNode("BOX", "box", 10, 0, { label: "Main", executionOrder: 1 }),
      createNode("OUT", "output", 20, 0, { label: "Out", executionOrder: 2 }),
    ]);

    const out = cfcStFormat.serialize(graph);

    expect(out).toContain("@order = 1");
    expect(out).toContain("@order = 2");
    expect(out).not.toContain("@order = 0");
  });

  it("omits explicit port for single-port node types (short-port) on serialize", () => {
    const nodes = [
      createNode("INP", "input", 0, 0, { label: "In" }),
      createNode("OUT", "output", 20, 0, { label: "Out" }),
    ];

    const connections = [
      // input -> output (input is a single-port source; should be serialized without .OUT)
      createConnection("C1", "INP", "OUT", { fromPort: "output:0", toPort: "input:0" }),
    ];

    const graph = createGraph(nodes, connections);

    const s = cfcStFormat.serialize(graph);
    // Expect no explicit .OUT or .IN1 when both sides are single-port and allowed
    expect(s).toContain("In => Out");
  });

  it("parses short-port notation into normalized ports", () => {
    const raw = `declaration:

PROGRAM CFC
VAR
END_VAR

cfc:

INPUT(In) {
  @id = INP,
  @x = 0,
  @y = 0
}

OUTPUT(Out) {
  @id = OUT,
  @x = 20,
  @y = 0
}

In => Out
`;

    const graph = cfcStFormat.deserialize(raw);
    expect(graph.nodes.some((n) => n.id === "INP")).toBe(true);
    expect(graph.nodes.some((n) => n.id === "OUT")).toBe(true);
    expect(graph.connections).toHaveLength(1);
    expect(graph.connections[0]).toMatchObject({ fromNodeId: "INP", toNodeId: "OUT", fromPort: "output:0", toPort: "input:0" });
  });

  it("uses explicit execution order metadata when parsing nodes", () => {
    const raw = `declaration:

PROGRAM CFC
VAR
END_VAR

cfc:

INPUT(In) {
  @id = INP,
  @order = 1,
  @x = 0,
  @y = 0
}

OUTPUT(Out) {
  @id = OUT,
  @order = 2,
  @x = 20,
  @y = 0
}

BOX(Main) {
  @id = BOX,
  @order = 1,
  @x = 10,
  @y = 0
}
`;

    const graph = cfcStFormat.deserialize(raw);

    expect(graph.nodes.map((node) => node.id)).toEqual(["INP", "OUT", "BOX"]);
    expect(graph.nodes.find((node) => node.id === "BOX")?.executionOrder).toBe(1);
    expect(graph.nodes.find((node) => node.id === "OUT")?.executionOrder).toBe(2);
    expect(graph.nodes.find((node) => node.id === "INP")?.executionOrder).toBeUndefined();
  });
});
