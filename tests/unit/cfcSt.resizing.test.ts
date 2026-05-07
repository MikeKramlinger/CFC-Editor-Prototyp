import { describe, it, expect } from "vitest";
import { cfcStFormat } from "../../src/formats/cfcSt.js";
import { getNodeTemplateByType } from "../../src/model.js";

describe("CFC-ST resizing", () => {
  it("resizes BOX nodes to fit long typeName on deserialize", async () => {
    const raw = `declaration:\n\ncfc:\n\nBOX(MyVeryLongDerivedTypeNameThatShouldForceWidth)`;
    const graph = cfcStFormat.deserialize(raw);
    expect(graph.nodes.length).toBeGreaterThan(0);
    const node = graph.nodes[0];
    const template = getNodeTemplateByType(node.type);
    // Dump for debug
    // eslint-disable-next-line no-console
    console.log({ typeName: node.typeName, width: node.width, templateWidth: template.width });
    // Confirm node was resized to fit the long typeName during deserialization
    expect(node.width).toBeGreaterThan(template.width);
  });
});
