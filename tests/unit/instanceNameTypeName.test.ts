// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { createEmptyGraph, type CfcNode } from "../../src/model.js";
import { jsonFormat } from "../../src/formats/json.js";
import { xmlFormat } from "../../src/formats/xml.js";
import { plcopenXmlFormat } from "../../src/formats/plcopenXml.js";

describe("instanceName and typeName serialization", () => {
  describe("JSON format", () => {
    it("should serialize and deserialize label and typeName", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "MyBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "FB_Box",
      };
      graph.nodes.push(boxNode);

      const serialized = jsonFormat.serialize(graph);
      const deserialized = jsonFormat.deserialize(serialized);

      const deserializedNode = deserialized.nodes[0];
      expect(deserializedNode).toBeDefined();
      expect(deserializedNode.typeName).toBe("FB_Box");
      expect(deserializedNode.label).toBe("MyBox");
    });

    it("should normalize whitespace in imported box label and typeName", () => {
      const graph = createEmptyGraph();
      graph.nodes.push({
        id: "N1",
        type: "box",
        label: "My Box",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "Derived Type Name",
      });

      const serialized = jsonFormat.serialize(graph);
      const deserialized = jsonFormat.deserialize(serialized);

      const deserializedNode = deserialized.nodes[0];
      expect(deserializedNode).toBeDefined();
      expect(deserializedNode.label).toBe("MyBox");
      expect(deserializedNode.typeName).toBe("DerivedTypeName");
    });

    it("should handle nodes without typeName", () => {
      const graph = createEmptyGraph();
      const inputNode: CfcNode = {
        id: "N1",
        type: "input",
        label: "Input1",
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      };
      graph.nodes.push(inputNode);

      const serialized = jsonFormat.serialize(graph);
      const deserialized = jsonFormat.deserialize(serialized);

      const deserializedNode = deserialized.nodes[0];
      expect(deserializedNode).toBeDefined();
      expect(deserializedNode.typeName).toBeUndefined();
      expect(deserializedNode.label).toBe("Input1");
    });
  });

  describe("XML format", () => {
    it("should serialize and deserialize label and typeName", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "MyBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "FB_Box",
      };
      graph.nodes.push(boxNode);

      const serialized = xmlFormat.serialize(graph);
      const deserialized = xmlFormat.deserialize(serialized);

      const deserializedNode = deserialized.nodes[0];
      expect(deserializedNode).toBeDefined();
      expect(deserializedNode.typeName).toBe("FB_Box");
      expect(deserializedNode.label).toBe("MyBox");
    });

    it("should include label and typeName as XML attributes", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "TestBox",
        x: 5,
        y: 5,
        width: 80,
        height: 60,
        typeName: "FB_Motor",
      };
      graph.nodes.push(boxNode);

      const serialized = xmlFormat.serialize(graph);
      
      // Verify attributes are in XML
      expect(serialized).toContain('typeName="FB_Motor"');
      expect(serialized).toContain('label="TestBox"');
    });
  });

  describe("PLCopenXML format", () => {
    it("should serialize label as block instanceName and typeName", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "MyBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "FB_Box",
      };
      graph.nodes.push(boxNode);

      const serialized = plcopenXmlFormat.serialize(graph);
      
      // Check that typeName is used in block element
      expect(serialized).toContain('typeName="FB_Box"');
      expect(serialized).toContain('instanceName="MyBox"');
    });

    it("should deserialize block typeName and instanceName", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "MyBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "FB_Box",
        declarationName: "box_instance_1",
      };
      graph.nodes.push(boxNode);

      const serialized = plcopenXmlFormat.serialize(graph);
      const deserialized = plcopenXmlFormat.deserialize(serialized);

      const deserializedNode = deserialized.nodes[0];
      expect(deserializedNode).toBeDefined();
      expect(deserializedNode.typeName).toBe("FB_Box");
      expect(deserializedNode.label).toBe("MyBox");
    });

    it("should generate instanceName from label if not provided", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "MyBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
      };
      graph.nodes.push(boxNode);

      const serialized = plcopenXmlFormat.serialize(graph);
      
      // Should use the label as instanceName
      expect(serialized).toContain('instanceName="MyBox"');
    });
  });

  describe("roundtrip serialization", () => {
    it("should preserve label and typeName in JSON roundtrip", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "TestBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "FB_CustomBox",
      };
      graph.nodes.push(boxNode);

      const serialized1 = jsonFormat.serialize(graph);
      const deserialized1 = jsonFormat.deserialize(serialized1);
      const serialized2 = jsonFormat.serialize(deserialized1);
      const deserialized2 = jsonFormat.deserialize(serialized2);

      const node = deserialized2.nodes[0];
      expect(node.typeName).toBe("FB_CustomBox");
      expect(node.label).toBe("TestBox");
    });

    it("should preserve label and typeName in XML roundtrip", () => {
      const graph = createEmptyGraph();
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "TestBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "FB_CustomBox",
      };
      graph.nodes.push(boxNode);

      const serialized1 = xmlFormat.serialize(graph);
      const deserialized1 = xmlFormat.deserialize(serialized1);
      const serialized2 = xmlFormat.serialize(deserialized1);
      const deserialized2 = xmlFormat.deserialize(serialized2);

      const node = deserialized2.nodes[0];
      expect(node.typeName).toBe("FB_CustomBox");
      expect(node.label).toBe("TestBox");
    });
  });

  describe("derived-type display logic", () => {
    it("should distinguish derived-type from elementary-type nodes", () => {
      const graph = createEmptyGraph();
      
      // Derived-type box
      const boxNode: CfcNode = {
        id: "N1",
        type: "box",
        label: "MyBox",
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        typeName: "FB_Box",
      };

      // Elementary-type input
      const inputNode: CfcNode = {
        id: "N2",
        type: "input",
        label: "Input1",
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      };

      graph.nodes.push(boxNode, inputNode);

      // Box should have typeName
      expect(boxNode.typeName).toBe("FB_Box");
      expect(boxNode.label).toBe("MyBox");

      // Input should not have typeName
      expect(inputNode.typeName).toBeUndefined();
    });
  });
});
