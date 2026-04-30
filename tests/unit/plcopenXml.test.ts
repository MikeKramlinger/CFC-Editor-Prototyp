// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { plcopenXmlFormat } from "../../src/formats/plcopenXml.js";
import { createGraph, createNode, createConnection } from "./helpers.js";

describe("PLCopenXML format", () => {
  describe("serialization", () => {
    it("serializes a simple input-output connection", () => {
      const graph = createGraph(
        [
          createNode("N1", "input", 0, 0, { label: "Input 1" }),
          createNode("N2", "output", 10, 0, { label: "Output 1" }),
        ],
        [createConnection("C1", "N1", "N2", { fromPort: "output:0", toPort: "input:0" })],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain("<inVariable localId=\"0\">");
      expect(xml).toContain("<expression>Input 1</expression>");
      expect(xml).toContain("<outVariable localId=\"1\"");
      expect(xml).toContain("<expression>Output 1</expression>");
      expect(xml).toContain("<connector localId=\"2\"");
      expect(xml).toContain("name=\"\"");
      expect(xml).toContain('refLocalId="0"');
      expect(xml).toContain('formalParameter="Input 1"');
    });

    it("serializes a box with correct instanceName", () => {
      const graph = createGraph(
        [createNode("N1", "box", 0, 0, { label: "FB_Box" })],
        [],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain("<block localId=\"0\"");
      expect(xml).toContain('typeName="FB_Box"');
      expect(xml).toContain('instanceName="FB_Box_0"');
    });

    it("uses typeName-specific instanceName index for multiple boxes of same type", () => {
      const graph = createGraph(
        [
          createNode("N1", "box", 0, 0, { label: "FB_Box" }),
          createNode("N2", "box", 10, 0, { label: "FB_Box" }),
          createNode("N3", "box", 20, 0, { label: "FB_Other" }),
          createNode("N4", "box", 30, 0, { label: "FB_Box" }),
        ],
        [],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain('instanceName="FB_Box_0"');
      expect(xml).toContain('instanceName="FB_Box_1"');
      expect(xml).toContain('instanceName="FB_Other_0"');
      expect(xml).toContain('instanceName="FB_Box_2"');
    });

    it("includes interface localVars for input/output variables", () => {
      const graph = createGraph(
        [
          createNode("N1", "input", 0, 0, { label: "Input 1" }),
          createNode("N2", "output", 10, 0, { label: "Output 1" }),
        ],
        [],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain("<localVars>");
      expect(xml).toContain('<variable name="Input 1">');
      expect(xml).toContain('<variable name="Output 1">');
      expect(xml).toContain("<type>");
      expect(xml).toContain("<INT />");
    });

    it("includes interface variables for blocks with derived types", () => {
      const graph = createGraph(
        [createNode("N1", "box", 0, 0, { label: "MyFunc" })],
        [],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain('<variable name="MyFunc_0">');
      expect(xml).toContain('<derived name="MyFunc" />');
    });

    it("creates self-closing ST xhtml element with xmlns", () => {
      const graph = createGraph([], []);

      const xml = plcopenXmlFormat.serialize(graph);

      // The serialized XML includes the full PLCopen structure
      expect(xml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
      // Check that xhtml is a self-closing element inside ST
      const stMatch = xml.match(/<ST[^>]*>([\s\S]*?)<\/ST>/);
      expect(stMatch).toBeTruthy();
      if (stMatch) {
        expect(stMatch[1]).toContain('<xhtml');
        expect(stMatch[1]).toContain('xmlns="http://www.w3.org/1999/xhtml"');
      }
    });

    it("uses space before /> in self-closing tags", () => {
      const graph = createGraph(
        [
          createNode("N1", "input", 0, 0, { label: "In" }),
          createNode("N2", "output", 10, 0, { label: "Out" }),
        ],
        [createConnection("C1", "N1", "N2", { fromPort: "output:0", toPort: "input:0" })],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      // Check that specific self-closing tags have space before />
      // The normalizing format should convert all self-closing tags to have space
      const lines = xml.split('\n');
      for (const line of lines) {
        // If a line ends with /> it should have space before it (but not double spaces)
        if (line.includes('/>')) {
          // Check common self-closing tags have proper spacing
          expect(line).not.toMatch(/[^ ]\/>/); // Should have space before />
        }
      }
    });

    it("creates connectors before target elements", () => {
      const graph = createGraph(
        [
          createNode("N1", "input", 0, 0, { label: "In" }),
          createNode("N2", "output", 10, 0, { label: "Out" }),
        ],
        [createConnection("C1", "N1", "N2", { fromPort: "output:0", toPort: "input:0" })],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      // Find positions in XML
      const connectorPos = xml.indexOf("<connector");
      const outVarPos = xml.indexOf("<outVariable");

      expect(connectorPos).toBeGreaterThan(-1);
      expect(outVarPos).toBeGreaterThan(-1);
      expect(connectorPos).toBeLessThan(outVarPos);
    });

    it("sets ObjectId without id attribute", () => {
      const graph = createGraph([], []);

      const xml = plcopenXmlFormat.serialize(graph);

      // Should have <ObjectId>UUID</ObjectId> but not id attribute
      expect(xml).toMatch(/<ObjectId>[a-f0-9-]{36}<\/ObjectId>/);
      expect(xml).not.toContain('ObjectId id=');
    });

    it("adds width and height attributes to comment elements", () => {
      const graph = createGraph(
        [createNode("N1", "comment", 0, 0, { label: "Test" })],
        [],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain('<comment localId="0"');
      expect(xml).toContain('width="0"');
      expect(xml).toContain('height="0"');
    });

    it("uses functionblock CallType for boxes", () => {
      const graph = createGraph(
        [createNode("N1", "box", 0, 0, { label: "Func" })],
        [],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain("<CallType");
      expect(xml).toContain(">functionblock</CallType>");
    });

    it("starts localId from 0 and increments sequentially", () => {
      const graph = createGraph(
        [
          createNode("N1", "input", 0, 0, { label: "In" }),
          createNode("N2", "box", 10, 0, { label: "B" }),
          createNode("N3", "output", 20, 0, { label: "Out" }),
        ],
        [],
      );

      const xml = plcopenXmlFormat.serialize(graph);

      expect(xml).toContain('localId="0"');
      expect(xml).toContain('localId="1"');
      expect(xml).toContain('localId="2"');
    });
  });

  describe("deserialization", () => {
    it("parses a simple PLCopenXML structure", () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0200">
  <fileHeader companyName="" productName="Test" productVersion="1.0" creationDateTime="2024-01-01T00:00:00Z" />
  <contentHeader name="Test.project" modificationDateTime="2024-01-01T00:00:00Z">
    <coordinateInfo>
      <fbd><scaling x="1" y="1" /></fbd>
      <ld><scaling x="1" y="1" /></ld>
      <sfc><scaling x="1" y="1" /></sfc>
    </coordinateInfo>
    <addData>
      <data name="http://www.3s-software.com/plcopenxml/projectinformation" handleUnknown="implementation">
        <ProjectInformation />
      </data>
    </addData>
  </contentHeader>
  <types>
    <dataTypes />
    <pous>
      <pou name="CFC" pouType="program">
        <interface>
          <localVars>
            <variable name="In"><type><INT /></type></variable>
          </localVars>
        </interface>
        <body>
          <ST><xhtml xmlns="http://www.w3.org/1999/xhtml" /></ST>
          <addData>
            <data name="http://www.3s-software.com/plcopenxml/cfc" handleUnknown="implementation">
              <CFC>
                <inVariable localId="0">
                  <position x="0" y="0" />
                  <connectionPointOut><expression /></connectionPointOut>
                  <expression>In</expression>
                </inVariable>
              </CFC>
            </data>
          </addData>
        </body>
        <addData>
          <data name="http://www.3s-software.com/plcopenxml/objectid" handleUnknown="discard">
            <ObjectId>00000000-0000-0000-0000-000000000000</ObjectId>
          </data>
        </addData>
      </pou>
    </pous>
  </types>
  <instances><configurations /></instances>
  <addData>
    <data name="http://www.3s-software.com/plcopenxml/projectstructure" handleUnknown="discard">
      <ProjectStructure><Object Name="CFC" ObjectId="00000000-0000-0000-0000-000000000000" /></ProjectStructure>
    </data>
  </addData>
</project>`;

      const graph = plcopenXmlFormat.deserialize(xml);

      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0]).toMatchObject({
        type: "input",
        label: "In",
        x: 0,
        y: 0,
      });
    });

    it("correctly handles simple serialization and structure", () => {
      // Test a simpler scenario: just verify the serialize() returns valid XML structure
      const graph = createGraph(
        [createNode("N1", "input", 0, 0, { label: "In" })],
        [],
      );

      const serialized = plcopenXmlFormat.serialize(graph);

      // Verify basic structure
      expect(serialized).toContain('<?xml version="1.0"');
      expect(serialized).toContain('<project xmlns="http://www.plcopen.org/xml/tc6_0200"');
      expect(serialized).toContain('<pou name="CFC"');
      expect(serialized).toContain('<inVariable localId="0"');
      expect(serialized).toContain('<expression>In</expression>');

      // Verify no malformed xmlns attributes
      // The xhtml element should have exactly one xmlns attribute
      const xhtmlMatch = serialized.match(/<xhtml[^>]*>/);
      expect(xhtmlMatch).toBeTruthy();
      if (xhtmlMatch) {
        const xhtmlTag = xhtmlMatch[0];
        // Count xmlns occurrences in this specific tag
        const xmlnsCount = (xhtmlTag.match(/xmlns=/g) || []).length;
        expect(xmlnsCount).toBe(1);
      }
    });
  });
});
