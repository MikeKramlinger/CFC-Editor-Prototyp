import { describe, expect, it } from "vitest";
import {
  createSelectionRect,
  intersectsSelectionRect,
  toSelectionBoxSize,
} from "../../src/core/editor/selection.js";

describe("selection utilities", () => {
  it("normalizes selection rectangle coordinates", () => {
    const rect = createSelectionRect(20, 10, 5, 30);
    expect(rect).toEqual({ left: 5, right: 20, top: 10, bottom: 30 });
  });

  it("returns at least 1x1 selection box size", () => {
    const size = toSelectionBoxSize({ left: 5, right: 5, top: 3, bottom: 3 });
    expect(size).toEqual({ width: 1, height: 1 });
  });

  it("computes regular selection box size", () => {
    const size = toSelectionBoxSize({ left: 2, right: 10, top: 4, bottom: 9 });
    expect(size).toEqual({ width: 8, height: 5 });
  });

  it("detects intersection correctly", () => {
    const intersects = intersectsSelectionRect(
      { left: 10, right: 20, top: 10, bottom: 20 },
      { left: 15, right: 25, top: 15, bottom: 25 },
    );
    expect(intersects).toBe(true);
  });

  it("treats touching edges as intersecting", () => {
    const intersects = intersectsSelectionRect(
      { left: 0, right: 10, top: 0, bottom: 10 },
      { left: 10, right: 20, top: 10, bottom: 20 },
    );
    expect(intersects).toBe(true);
  });

  it("returns false when clearly separated", () => {
    const intersects = intersectsSelectionRect(
      { left: 0, right: 5, top: 0, bottom: 5 },
      { left: 6, right: 10, top: 6, bottom: 10 },
    );
    expect(intersects).toBe(false);
  });
});
