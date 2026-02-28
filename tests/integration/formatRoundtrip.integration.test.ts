// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { getAdapterById, listAdapters } from "../../src/formats/registry.js";
import { createGraph, createNode, createConnection } from "../unit/helpers.js";
import { jsonFormat } from "../../src/formats/json.js";
import { yamlFormat } from "../../src/formats/yaml.js";

const createReferenceGraph = () => {
  const nodes = [
    createNode("N1", "input", 0, 0, { label: "Input α" }),
    createNode("N2", "box", 6, 0, { label: "Main \"Box\"" }),
    createNode("N3", "composer", 12, 0, { label: "Composer / Bereich" }),
    createNode("N4", "selector", 18, 0, { label: "Selector äöü" }),
    createNode("N5", "comment", 24, 0, { label: "Kommentar" }),
    createNode("N6", "output", 30, 0, { label: "Output" }),
  ];

  const connections = [
    createConnection("C1", "N1", "N2", { fromPort: "output:0", toPort: "input:0" }),
    createConnection("C2", "N2", "N3", { fromPort: "output:0", toPort: "input:1" }),
    createConnection("C3", "N3", "N4", { fromPort: "output:0", toPort: "input:0" }),
    createConnection("C4", "N4", "N6", { fromPort: "output:1", toPort: "input:0" }),
  ];

  return createGraph(nodes, connections, "1.1");
};

describe("format roundtrip integration", () => {
  it("supports serialize -> deserialize -> serialize idempotency for all adapters", () => {
    const referenceGraph = createReferenceGraph();

    for (const adapter of listAdapters()) {
      const firstSerialized = adapter.serialize(referenceGraph);
      const firstParsed = adapter.deserialize(firstSerialized);
      const secondSerialized = adapter.serialize(firstParsed);

      expect(secondSerialized.length).toBeGreaterThan(0);
      expect(adapter.deserialize(secondSerialized)).toEqual(firstParsed);
    }
  });

  it("keeps graph stable after two full roundtrips per adapter", () => {
    const referenceGraph = createReferenceGraph();

    for (const adapter of listAdapters()) {
      const s1 = adapter.serialize(referenceGraph);
      const g1 = adapter.deserialize(s1);
      const s2 = adapter.serialize(g1);
      const g2 = adapter.deserialize(s2);

      expect(g2).toEqual(g1);
    }
  });

  it("normalizes edge cases on JSON deserialize", () => {
    const raw = JSON.stringify({
      version: "2.0",
      nodes: [
        { id: "A", type: "unknown", label: "X", executionOrder: 2, x: 1, y: 2, width: 3, height: 4 },
        { id: "B", type: "box", label: "Y", executionOrder: 1, x: 5, y: 6, width: 7, height: 8 },
      ],
      connections: [
        { id: "C1", fromNodeId: "B", fromPort: "output", toNodeId: "A", toPort: "input" },
        { id: "C2", fromNodeId: "B", fromPort: "bad", toNodeId: "NOPE", toPort: "bad" },
      ],
    });

    const graph = jsonFormat.deserialize(raw);

    expect(graph.nodes[0]?.id).toBe("B");
    expect(graph.nodes[1]?.type).toBe("box");
    expect(graph.connections).toHaveLength(1);
    expect(graph.connections[0]).toMatchObject({ fromPort: "output:0", toPort: "input:0" });
  });

  it("normalizes edge cases on YAML deserialize", () => {
    const raw = `version: "3.0"
nodes:
  - id: A
    type: nope
    label: X
    executionOrder: 2
    x: 1
    y: 1
    width: 4
    height: 2
  - id: B
    type: box
    label: Y
    executionOrder: 1
    x: 2
    y: 2
    width: 5
    height: 3
connections:
  - id: C1
    fromNodeId: B
    fromPort: output
    toNodeId: A
    toPort: input
  - id: C2
    fromNodeId: B
    fromPort: output:0
    toNodeId: Z
    toPort: input:0
`;

    const graph = yamlFormat.deserialize(raw);

    expect(graph.version).toBe("3.0");
    expect(graph.nodes[0]?.id).toBe("B");
    expect(graph.connections).toHaveLength(1);
    expect(graph.connections[0]).toMatchObject({ fromPort: "output:0", toPort: "input:0" });
  });

  it("throws on unknown adapter lookup", () => {
    expect(() => getAdapterById("does-not-exist")).toThrow("Unbekanntes Datenformat");
  });
});
