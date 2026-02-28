import { describe, expect, it } from "vitest";
import {
  appendAndCompactRoute,
  computeOrthogonalRoute,
  doesHorizontalSegmentTouchObstacle,
} from "../../src/core/editor/routing.js";

describe("routing utilities", () => {
  it("detects horizontal segment touching obstacle", () => {
    const touches = doesHorizontalSegmentTouchObstacle({ x: 2, y: 2, width: 3, height: 2 }, 0, 10, 3);
    expect(touches).toBe(true);
  });

  it("returns false when y does not overlap obstacle", () => {
    const touches = doesHorizontalSegmentTouchObstacle({ x: 2, y: 2, width: 3, height: 2 }, 0, 10, 10);
    expect(touches).toBe(false);
  });

  it("computes simple straight route without obstacles", () => {
    const route = computeOrthogonalRoute({
      nodes: [],
      start: { x: 0, y: 0 },
      startExit: { x: 1, y: 0 },
      end: { x: 5, y: 0 },
      allowPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 5, y: 0 },
      ],
      searchMargin: 6,
      bendPenalty: 25,
    });

    expect(route).not.toBeNull();
    expect(route?.[0]).toEqual({ x: 0, y: 0 });
    expect(route?.at(-1)).toEqual({ x: 5, y: 0 });
  });

  it("finds detour around obstacle", () => {
    const route = computeOrthogonalRoute({
      nodes: [{ x: 2, y: -1, width: 2, height: 2 }],
      start: { x: 0, y: 0 },
      startExit: { x: 1, y: 0 },
      end: { x: 6, y: 0 },
      allowPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 6, y: 0 },
      ],
      searchMargin: 8,
      bendPenalty: 25,
    });

    expect(route).not.toBeNull();
    expect(route?.some((point) => point.y !== 0)).toBe(true);
  });

  it("returns null when destination cannot be reached within bounded search", () => {
    const route = computeOrthogonalRoute({
      nodes: [{ x: -10, y: -10, width: 40, height: 40 }],
      start: { x: 0, y: 0 },
      startExit: { x: 1, y: 0 },
      end: { x: 5, y: 0 },
      allowPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 5, y: 0 },
      ],
      searchMargin: 1,
      bendPenalty: 25,
    });

    expect(route).toBeNull();
  });

  it("compacts duplicate route points when appending", () => {
    const route = appendAndCompactRoute(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 0 },
      ],
    );

    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});
