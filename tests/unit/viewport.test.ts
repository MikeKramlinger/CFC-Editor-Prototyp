import { describe, expect, it } from "vitest";
import {
  clampPanToPositiveArea,
  clampZoom,
  clientToGraphPx,
  computeZoomAtClient,
} from "../../src/core/editor/viewport.js";

describe("viewport utilities", () => {
  it("clamps zoom to configured range", () => {
    expect(clampZoom(-1)).toBe(0.1);
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(1.25)).toBe(1.25);
  });

  it("clamps pan to non-positive coordinates", () => {
    expect(clampPanToPositiveArea(10, -5)).toEqual({ panX: 0, panY: -5 });
    expect(clampPanToPositiveArea(-4, 2)).toEqual({ panX: -4, panY: 0 });
  });

  it("converts client coordinates into graph coordinates", () => {
    const point = clientToGraphPx(110, 70, { left: 10, top: 20 }, { zoom: 2, panX: -10, panY: -20 });
    expect(point).toEqual({ x: 55, y: 35 });
  });

  it("keeps graph point under cursor stable when zooming", () => {
    const rect = { left: 0, top: 0 };
    const viewport = { zoom: 1, panX: -20, panY: -30 };
    const clientX = 100;
    const clientY = 120;

    const before = clientToGraphPx(clientX, clientY, rect, viewport);
    const next = computeZoomAtClient(0.2, clientX, clientY, rect, viewport);
    const after = clientToGraphPx(clientX, clientY, rect, next);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.zoom).toBe(1.2);
  });

  it("returns same object when zoom delta has no effect", () => {
    const viewport = { zoom: 2, panX: -10, panY: -10 };
    const next = computeZoomAtClient(0.5, 20, 20, { left: 0, top: 0 }, viewport);
    expect(next).toBe(viewport);
  });
});
