// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { getAdapterById } from "../../src/formats/registry.js";
import { createGraph, createNode, createConnection } from "../unit/helpers.js";
import { jsonFormat } from "../../src/formats/json.js";
import { cfcDslFormat } from "../../src/formats/cfcDsl.js";

describe("format payload fields integration", () => {
  const graph = createGraph(
    [
      createNode({ id: "N1", type: "input", label: "In", x: 1, y: 2 }),
      createNode({ id: "N2", type: "output", executionOrder: 1, label: "Out", x: 22, y: 2, }),
      createNode({ id: "N3", type: "box", executionOrder: 2, typeName: "Box1", label: "Box1_0", x: 8, y: 2 }),
      createNode({ id: "N4", type: "box-en-eno", executionOrder: 3, typeName: "BoxwithENENO1", label: "BoxwithENENO1_0", x: 15, y: 2 }),
      createNode({ id: "N5", type: "jump", executionOrder: 4, label: "Jump1", x: 22, y: 7 }),
      createNode({ id: "N6", type: "label", executionOrder: 5, label: "Label1", x: 1, y: 7 }),
      createNode({ id: "N7", type: "return", executionOrder: 6, label: "Return1", x: 22, y: 12 }),
      createNode({ id: "N8", type: "composer", executionOrder: 7, label: "Composer1", x: 8, y: 7 }),
      createNode({ id: "N9", type: "selector", label: "Selector1", x: 15, y: 7 }),
      createNode({ id: "N10", type: "connection-mark-source", label: "CM-Source-1", x: 22, y: 17 }),
      createNode({ id: "N11", type: "connection-mark-sink", label: "CM-Sink-1", x: 1, y: 12 }),
      createNode({ id: "N12", type: "comment", label: "Doc", x: 1, y: 18 }),
    ],
    [
      createConnection("C1", "N1", "N3", { fromPort: "output:0", toPort: "input:0" }),
      createConnection("C2", "N3", "N2", { fromPort: "output:0", toPort: "input:0" }),
    ],
    "1.2",
  );

  it("writes expected structures in PLCopenXML", () => {
    const raw = getAdapterById("plcopen-xml").serialize(graph);

    expect(raw).toContain('<CFC>');

    expect(raw).toContain('<inVariable localId="0">');
    expect(raw).toContain('<position x="1" y="2" />');

    expect(raw).toContain('<outVariable localId="1" executionOrderId="1">');
    expect(raw).toContain('<position x="22" y="2" />');

    expect(raw).toContain('<block localId="2" executionOrderId="2" typeName="Box1" instanceName="Box1_0">');
    expect(raw).toContain('<position x="8" y="2" />');

    expect(raw).toContain('block localId="3" executionOrderId="3" typeName="BoxwithENENO1" instanceName="BoxwithENENO1_0">');
    expect(raw).toContain('<position x="15" y="2" />');
    
    expect(raw).toContain('<jump localId="4" executionOrderId="4" label="Jump1">');             
    expect(raw).toContain('<position x="22" y="7" />');

    expect(raw).toContain('<label localId="5" executionOrderId="5" label="Label1">');             
    expect(raw).toContain('<position x="1" y="7" />');

    expect(raw).toContain('<return localId="6" executionOrderId="6">');             
    expect(raw).toContain('<position x="22" y="12" />');  

    expect(raw).toContain('<vendorElement localId="7" executionOrderId="7">');             
    expect(raw).toContain('<position x="8" y="7" />');
    expect(raw).toContain('<xhtml xmlns="http://www.w3.org/1999/xhtml">Composer1</xhtml>');

    expect(raw).toContain('<vendorElement localId="8">');             
    expect(raw).toContain('<position x="15" y="7" />');
    expect(raw).toContain('<xhtml xmlns="http://www.w3.org/1999/xhtml">Selector1</xhtml>');

    expect(raw).toContain('<vendorElement localId="9">');             
    expect(raw).toContain('<position x="22" y="17" />');
    expect(raw).toContain('<xhtml xmlns="http://www.w3.org/1999/xhtml">CM-Source-1</xhtml>');

    expect(raw).toContain('<vendorElement localId="10">');             
    expect(raw).toContain('<position x="1" y="12" />');
    expect(raw).toContain('<xhtml xmlns="http://www.w3.org/1999/xhtml">CM-Sink-1</xhtml>');

    expect(raw).toContain('<comment localId="11" height="0" width="0">');
    expect(raw).toContain('<position x="1" y="18" />');
    expect(raw).toContain('<xhtml xmlns="http://www.w3.org/1999/xhtml">Doc</xhtml>');

    expect(raw).toContain('</CFC>');
  });

  it("writes expected attributes in XML", () => {
    const raw = getAdapterById("xml").serialize(graph);

    expect(raw).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <cfcEditor version="1.2">
        <nodes>
          <node id="N1" type="input" expression="In" x="1" y="2"/>
          <node id="N2" type="output" executionOrder="1" expression="Out" x="22" y="2"/>
          <node id="N3" type="box" executionOrder="2" typeName="Box1" instanceName="Box1_0" x="8" y="2"/>
          <node id="N4" type="box-en-eno" executionOrder="3" typeName="BoxwithENENO1" instanceName="BoxwithENENO1_0" x="15" y="2"/>
          <node id="N5" type="jump" executionOrder="4" label="Jump1" x="22" y="7"/>
          <node id="N6" type="label" executionOrder="5" label="Label1" x="1" y="7"/>
          <node id="N7" type="return" executionOrder="6" x="22" y="12"/>
          <node id="N8" type="composer" executionOrder="7" text="Composer1" x="8" y="7"/>
          <node id="N9" type="selector" text="Selector1" x="15" y="7"/>
          <node id="N10" type="connection-mark-source" signal="CM-Source-1" x="22" y="17"/>
          <node id="N11" type="connection-mark-sink" signal="CM-Sink-1" x="1" y="12"/>
          <node id="N12" type="comment" content="Doc" x="1" y="18"/>
        </nodes>
        <connections>
          <connection id="C1" from="N1" fromPort="output" to="N3" toPort="input:0"/>
          <connection id="C2" from="N3" fromPort="output:0" to="N2" toPort="input"/>
        </connections>
      </cfcEditor>"
    `);
  });

  it("writes expected fields in JSON", () => {
    const raw = jsonFormat.serialize(graph);
    const parsed = JSON.parse(raw) as {
      version: string;
      nodes: Array<Record<string, unknown>>;
      connections: Array<Record<string, unknown>>;
    };

    expect(parsed.version).toBe("1.2");
    expect(parsed.nodes).toHaveLength(12);
    expect(parsed.nodes[0]).toMatchObject({ id: "N1", type: "input", expression: "In", x: 1, y: 2 });
    expect(parsed.nodes[1]).toMatchObject({ id: "N2", type: "output", executionOrder: 1, expression: "Out", x: 22, y: 2 });
    expect(parsed.nodes[2]).toMatchObject({ id: "N3", type: "box", executionOrder: 2, typeName: "Box1", instanceName: "Box1_0", x: 8, y: 2 });
    expect(parsed.nodes[3]).toMatchObject({ id: "N4", type: "box-en-eno", executionOrder: 3, typeName: "BoxwithENENO1", instanceName: "BoxwithENENO1_0", x: 15, y: 2 });
    expect(parsed.nodes[4]).toMatchObject({ id: "N5", type: "jump", executionOrder: 4, label: "Jump1", x: 22, y: 7 });
    expect(parsed.nodes[5]).toMatchObject({ id: "N6", type: "label", executionOrder: 5, label: "Label1", x: 1, y: 7 });
    expect(parsed.nodes[6]).toMatchObject({ id: "N7", type: "return", executionOrder: 6, x: 22, y: 12 });
    expect(parsed.nodes[7]).toMatchObject({ id: "N8", type: "composer", executionOrder: 7, text: "Composer1", x: 8, y: 7 });
    expect(parsed.nodes[8]).toMatchObject({ id: "N9", type: "selector", text: "Selector1", x: 15, y: 7 });
    expect(parsed.nodes[9]).toMatchObject({ id: "N10", type: "connection-mark-source", signal: "CM-Source-1", x: 22, y: 17 });
    expect(parsed.nodes[10]).toMatchObject({ id: "N11", type: "connection-mark-sink", signal: "CM-Sink-1", x: 1, y: 12 });
    expect(parsed.nodes[11]).toMatchObject({ id: "N12", type: "comment", content: "Doc", x: 1, y: 18 });

    expect(parsed.connections).toHaveLength(2);
    expect(parsed.connections[0]).toMatchObject({
      id: "C1",
      fromNodeId: "N1",
      fromPort: "output",
      toNodeId: "N3",
      toPort: "input:0",
    });
    expect(parsed.connections[1]).toMatchObject({
      id: "C2",
      fromNodeId: "N3",
      fromPort: "output:0",
      toNodeId: "N2",
      toPort: "input",
    });
  });

  it("writes expected metadata in CFC-DSL", () => {
    const raw = cfcDslFormat.serialize(graph);

    expect(raw).toMatchInlineSnapshot(`
      "cfc LR

        N1[/In/] {x: 1, y: 2}
        N2[\\Out\\] {o: 1, x: 22, y: 2}
        N3[Box1_0 @ Box1] {o: 2, x: 8, y: 2}
        N4[+BoxwithENENO1_0 @ BoxwithENENO1] {o: 3, x: 15, y: 2}
        N5(Jump1) {o: 4, x: 22, y: 7}
        N6{{Label1}} {o: 5, x: 1, y: 7}
        N7((RETURN)) {o: 6, x: 22, y: 12}
        N8[[C: Composer1]] {o: 7, x: 8, y: 7}
        N9[[S: Selector1]] {x: 15, y: 7}
        N10>CM-Source-1] {x: 22, y: 17}
        N11[CM-Sink-1< {x: 1, y: 12}
        N12[*Doc*] {x: 1, y: 18}

        N1 --> N3.IN1
        N3.OUT --> N2

      %% DECLARATIONS
      PROGRAM CFC
      VAR
      END_VAR
      "
    `);
  });

  it("writes expected metadata in CFC-ST", () => {
    const raw = getAdapterById("cfc-st").serialize(graph);

    expect(raw).toMatchInlineSnapshot(`
      "declaration:

      PROGRAM CFC
      VAR
      END_VAR

      cfc:

      INPUT(In) {
        @id = N1,
        @x = 1,
        @y = 2
      }

      OUTPUT(Out) {
        @id = N2,
        @order = 1,
        @x = 22,
        @y = 2
      }

      Box1_0 : BOX(Box1) {
        @id = N3,
        @order = 2,
        @x = 8,
        @y = 2
      }

      BoxwithENENO1_0 : BOX_EN_ENO(BoxwithENENO1) {
        @id = N4,
        @order = 3,
        @x = 15,
        @y = 2
      }

      JUMP(Jump1) {
        @id = N5,
        @order = 4,
        @x = 22,
        @y = 7
      }

      LABEL(Label1) {
        @id = N6,
        @order = 5,
        @x = 1,
        @y = 7
      }

      RETURN {
        @id = N7,
        @order = 6,
        @x = 22,
        @y = 12
      }

      COMPOSER(Composer1) {
        @id = N8,
        @order = 7,
        @x = 8,
        @y = 7
      }

      SELECTOR(Selector1) {
        @id = N9,
        @x = 15,
        @y = 7
      }

      CM_SOURCE(CM-Source-1) {
        @id = N10,
        @x = 22,
        @y = 17
      }

      CM_SINK(CM-Sink-1) {
        @id = N11,
        @x = 1,
        @y = 12
      }

      COMMENT("Doc") {
        @id = N12,
        @x = 1,
        @y = 18
      }

      In => Box1_0.IN1
      Box1_0.OUT -> Out
      "
    `);
  });
});
