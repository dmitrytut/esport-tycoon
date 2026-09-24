import { describe, expect, it } from "vitest";

import { figurePositions, sceneScale } from "../src/layout.ts";

describe("temporary scene probes", () => {
  it.each(["front", "isometric"] as const)(
    "keeps fifteen distinct figures in the logical %s room",
    (layout) => {
      const positions = figurePositions(layout);
      expect(positions).toHaveLength(15);
      expect(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(15);
      for (const { x, y } of positions) {
        expect(x).toBeGreaterThanOrEqual(16);
        expect(x).toBeLessThanOrEqual(304);
        expect(y).toBeGreaterThanOrEqual(24);
        expect(y).toBeLessThanOrEqual(156);
      }
    },
  );

  it("uses whole-number scaling and clips rather than shrinking figures on narrow screens", () => {
    expect(sceneScale(390, 190)).toBe(1);
    expect(sceneScale(800, 420)).toBe(2);
    expect(sceneScale(250, 140)).toBe(1);
    expect(figurePositions("front")).not.toEqual(figurePositions("isometric"));
  });
});
