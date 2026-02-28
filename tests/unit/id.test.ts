import { describe, expect, it } from "vitest";
import { getNextSerialForPrefix } from "../../src/core/editor/id.js";

describe("id utilities", () => {
  it("returns 1 when no ids exist", () => {
    expect(getNextSerialForPrefix("N", [])).toBe(1);
  });

  it("returns next serial for matching prefix", () => {
    const ids = ["N1", "N2", "C7", "N9"];
    expect(getNextSerialForPrefix("N", ids)).toBe(10);
    expect(getNextSerialForPrefix("C", ids)).toBe(8);
  });

  it("ignores malformed numeric parts", () => {
    const ids = ["Nabc", "N3.9", "N4", "N-2"];
    expect(getNextSerialForPrefix("N", ids)).toBe(5);
  });

  it("floors non-integer serials", () => {
    const ids = ["N1.2", "N1.9", "N2.1"];
    expect(getNextSerialForPrefix("N", ids)).toBe(3);
  });
});
