// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { getAdapterById } from "../../src/formats/registry.js";
import { createGraph, createNode, createConnection } from "../unit/helpers.js";
import { jsonFormat } from "../../src/formats/json.js";
import { cfcDslFormat } from "../../src/formats/cfcDsl.js";

describe("format payload fields integration", () => {
  const graph = createGraph(
    [
      createNode("N1", "input", 1, 2, { label: "In" }),
      createNode("N2", "box", 7, 3, { label: "Box" }),
      createNode("N3", "output", 14, 4, { label: "Out" }),
      createNode("N4", "comment", 5, 9, { label: "Doc" }),
    ],
    [
      createConnection("C1", "N1", "N2", { fromPort: "output:0", toPort: "input:0" }),
      createConnection("C2", "N2", "N3", { fromPort: "output:0", toPort: "input:0" }),
    ],
    "1.2",
  );

  it("writes expected fields in JSON", () => {
    const raw = jsonFormat.serialize(graph);
    const parsed = JSON.parse(raw) as {
      version: string;
      nodes: Array<Record<string, unknown>>;
      connections: Array<Record<string, unknown>>;
    };

    expect(parsed.version).toBe("1.2");
    expect(parsed.nodes).toHaveLength(4);
    expect(parsed.nodes[0]).toMatchObject({ id: "N1", type: "input", label: "In", x: 1, y: 2 });
    expect(parsed.nodes[0]).not.toHaveProperty("width");
    expect(parsed.nodes[0]).not.toHaveProperty("height");

    expect(parsed.connections).toHaveLength(2);
    expect(parsed.connections[0]).toMatchObject({
      id: "C1",
      fromNodeId: "N1",
      fromPort: "output:0",
      toNodeId: "N2",
      toPort: "input:0",
    });
  });

  it("writes expected metadata in CFC-DSL", () => {
    const raw = cfcDslFormat.serialize(graph);

    expect(raw).toContain("cfc LR");
    expect(raw).toContain("N1[/ In /] {o: 0, x: 1, y: 2}");
    expect(raw).toContain("N2[Box] {o: 1, x: 7, y: 3}");
    expect(raw).toContain("N4[* Doc *] {o: 0, x: 5, y: 9}");
    expect(raw).toContain("N1.OUT --> N2.IN1");
    expect(raw).toContain("N2.OUT --> N3.IN1");
  });

  it("writes expected attributes in PLCopenXML", () => {
    const raw = getAdapterById("plcopen-xml").serialize(graph);

    expect(raw).toContain('<cfcEditor version="1.2">');
    expect(raw).toContain('<node id="N1" type="input" label="In" x="1" y="2"/>');
    expect(raw).toContain('<node id="N2" type="box" label="Box" executionOrder="1" x="7" y="3"/>');
    expect(raw).toContain('<node id="N3" type="output" label="Out" executionOrder="2" x="14" y="4"/>');

    expect(raw).toContain('<connection id="C1" from="N1" fromPort="output:0" to="N2" toPort="input:0"/>');
    expect(raw).toContain('<connection id="C2" from="N2" fromPort="output:0" to="N3" toPort="input:0"/>');
  });

  it("writes expected structures in OG PLCopenXML", () => {
    const raw = getAdapterById("og-plcopen-xml").serialize(graph);

    expect(raw).toContain('<CFC>');
    expect(raw).toContain('<inVariable localId="1">');
    expect(raw).toContain('<position x="1" y="2"/>');
    expect(raw).toContain('<block localId="2" executionOrderId="1" typeName="Box">');
    expect(raw).toContain('<position x="7" y="3"/>');
    expect(raw).toContain('<outVariable localId="3" executionOrderId="2">');
    expect(raw).toContain('<position x="14" y="4"/>');
    expect(raw).toContain('<comment localId="4">');
    expect(raw).toContain('<position x="5" y="9"/>');
  });
});
