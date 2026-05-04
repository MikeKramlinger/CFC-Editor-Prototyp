import { describe, expect, it } from "vitest";
import { parseDeclarations, syncCreatedNodeDeclaration } from "../../src/declarations/index.js";

describe("declaration normalization", () => {
  it("rejects derived types with whitespace", () => {
    const parsed = parseDeclarations(`
PROGRAM CFC
VAR
    myVar : FB Type;
END_VAR
`);

    expect(parsed.isValid).toBe(false);
    expect(parsed.errors[0]?.message).toContain("derived type name");
  });

  it("sanitizes box labels and derived type names when syncing created nodes", () => {
    const result = syncCreatedNodeDeclaration("PROGRAM CFC\nVAR\nEND_VAR", {
      type: "box",
      label: "My Box",
      typeName: "Derived Type Name",
    });

    expect(result.label).toBe("DerivedTypeName_0");
    expect(result.typeName).toBe("DerivedTypeName");
    expect(result.declarations).toContain("DerivedTypeName_0 : DerivedTypeName;");
  });
});