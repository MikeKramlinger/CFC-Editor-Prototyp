// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { getAdapterById, listAdapters } from "../../src/formats/registry.js";
import { getNodeTemplateByType } from "../../src/model.js";
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
  const adaptersWithoutOg = () => listAdapters().filter((adapter) => adapter.id !== "og-plcopen-xml");

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
        { id: "A", label: "X", executionOrder: 2, x: 1, y: 2, width: 3, height: 4 },
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

  it("throws on invalid explicit node type in JSON", () => {
    const raw = JSON.stringify({
      version: "1.0",
      nodes: [
        { id: "N1", type: "boxa", label: "A", x: 1, y: 1 },
      ],
      connections: [],
    });

    expect(() => jsonFormat.deserialize(raw)).toThrow("ungültiger type");
  });

  it("throws on invalid explicit node type in PLCopenXML", () => {
    const raw = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0200">
  <cfcEditor version="1.0">
    <nodes>
      <node id="N1" type="boxa" label="Bad" x="2" y="4" width="5" height="2"/>
    </nodes>
    <connections/>
  </cfcEditor>
</project>`;

    const adapter = getAdapterById("plcopen-xml");
    expect(() => adapter.deserialize(raw)).toThrow("ungültiger type");
  });

  it("throws on duplicate node ids in JSON", () => {
    const raw = JSON.stringify({
      version: "1.0",
      nodes: [
        { id: "N1", type: "box", label: "A", executionOrder: 1, x: 1, y: 1 },
        { id: "N1", type: "box", label: "B", executionOrder: 1, x: 4, y: 1 },
      ],
      connections: [],
    });

    let message = "";
    try {
      jsonFormat.deserialize(raw);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("id bereits belegt");
    expect(message).toContain("executionOrder bereits belegt");
  });

  it("throws on non-contiguous executionOrder in YAML", () => {
    const raw = `version: "1.0"
nodes:
  - id: N1
    type: box
    label: A
    executionOrder: 1
    x: 1
    y: 1
    width: 6
    height: 3
  - id: N2
    type: box
    label: B
    executionOrder: 3
    x: 8
    y: 1
    width: 6
    height: 3
connections:
`;

    expect(() => yamlFormat.deserialize(raw)).toThrow("executionOrder muss durchgängig nummeriert sein");
  });

  it("throws on duplicate id and executionOrder in PLCopenXML node list", () => {
    const raw = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0200">
  <cfcEditor version="1.0">
    <nodes>
      <node id="N1" type="input" label="In" x="2" y="4" width="5" height="2"/>
      <node id="N2" type="output" label="Out" executionOrder="1" x="28" y="4" width="5" height="2"/>
      <node id="N2" type="box" label="Out" executionOrder="1" x="12" y="8" width="5" height="2"/>
    </nodes>
    <connections/>
  </cfcEditor>
</project>`;

    const adapter = getAdapterById("plcopen-xml");
    let message = "";
    try {
      adapter.deserialize(raw);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("id bereits belegt");
    expect(message).toContain("executionOrder bereits belegt");
  });

  it("throws on unknown adapter lookup", () => {
    expect(() => getAdapterById("does-not-exist")).toThrow("Unbekanntes Datenformat");
  });

  it("registers OGPLCopenXML format", () => {
    const adapter = getAdapterById("og-plcopen-xml");
    expect(adapter.label).toBe("OGPLCopenXML");
    expect(adapter.fileExtension).toBe("xml");
  });

  it("deserializes OGPLCopenXML sample structures", () => {
    const raw = `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0200">
  <types>
    <pous>
      <pou name="CFC" pouType="program">
        <body>
          <addData>
            <data name="http://www.3s-software.com/plcopenxml/cfc" handleUnknown="implementation">
              <CFC>
                <inVariable localId="1">
                  <position x="12" y="11" />
                  <expression>InputA</expression>
                </inVariable>
                <block localId="2" executionOrderId="1" typeName="MainBox">
                  <position x="37" y="11" />
                  <inputVariables>
                    <variable formalParameter="In1">
                      <connectionPointIn>
                        <connection refLocalId="1" />
                      </connectionPointIn>
                    </variable>
                    <variable formalParameter="In2">
                      <connectionPointIn>
                        <connection refLocalId="1" />
                      </connectionPointIn>
                    </variable>
                  </inputVariables>
                  <outputVariables>
                    <variable formalParameter="Out1">
                      <connectionPointOut>
                        <expression />
                      </connectionPointOut>
                    </variable>
                  </outputVariables>
                </block>
                <vendorElement localId="8" executionOrderId="2">
                  <position x="37" y="26" />
                  <alternativeText>
                    <xhtml xmlns="http://www.w3.org/1999/xhtml">ComposerX</xhtml>
                  </alternativeText>
                  <inputVariables>
                    <variable formalParameter="In1">
                      <connectionPointIn>
                        <connection refLocalId="2" formalParameter="Out1" />
                      </connectionPointIn>
                    </variable>
                  </inputVariables>
                  <outputVariables>
                    <variable formalParameter="Out1">
                      <connectionPointOut>
                        <expression />
                      </connectionPointOut>
                    </variable>
                  </outputVariables>
                  <addData>
                    <data name="http://www.3s-software.com/plcopenxml/cfcelementtype" handleUnknown="implementation">
                      <ElementType xmlns="">composer</ElementType>
                    </data>
                  </addData>
                </vendorElement>
                <outVariable localId="4" executionOrderId="3">
                  <position x="86" y="13" />
                  <connectionPointIn>
                    <connection refLocalId="8" formalParameter="Out1" />
                  </connectionPointIn>
                  <expression>OutputA</expression>
                </outVariable>
              </CFC>
            </data>
          </addData>
        </body>
      </pou>
    </pous>
  </types>
</project>`;

    const adapter = getAdapterById("og-plcopen-xml");
    const graph = adapter.deserialize(raw);

    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.some((node) => node.type === "input" && node.label === "InputA")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "box" && node.label === "MainBox")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "composer" && node.label === "ComposerX")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "output" && node.label === "OutputA")).toBe(true);
    expect(graph.connections.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps minimum node sizes across adapters except OGPLCopenXML", () => {
    const graph = createGraph([
      createNode("N1", "box", 0, 0, { width: 1, height: 1 }),
      createNode("N2", "comment", 8, 0, { width: 2, height: 1 }),
      createNode("N3", "return", 14, 0, { width: 1, height: 1 }),
    ]);

    for (const adapter of adaptersWithoutOg()) {
      const parsed = adapter.deserialize(adapter.serialize(graph));
      for (const node of parsed.nodes) {
        const template = getNodeTemplateByType(node.type);
        expect(node.width).toBeGreaterThanOrEqual(template.width);
        expect(node.height).toBeGreaterThanOrEqual(template.height);
      }
    }
  });

  it("preserves resized comment geometry across adapters except OGPLCopenXML", () => {
    const graph = createGraph([
      createNode("N1", "comment", 0, 0, { label: "Resizable", width: 16, height: 5 }),
    ]);

    for (const adapter of adaptersWithoutOg()) {
      const parsed = adapter.deserialize(adapter.serialize(graph));
      const comment = parsed.nodes.find((node) => node.id === "N1");
      expect(comment).toBeDefined();
      expect(comment!.width).toBe(16);
      expect(comment!.height).toBe(5);
    }
  });
});
