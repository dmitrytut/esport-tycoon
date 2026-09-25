import { describe, expect, it } from "vitest";

import { fitRoom, floorSpots, ROOM_HEIGHT, ROOM_WIDTH, WALL_HEIGHT } from "../src/layout.ts";

describe("3/4 room layout", () => {
  it.each([
    [390, 380],
    [390, 220],
    [1024, 768],
    [844, 390],
    [320, 200],
  ])("fits the whole room inside a %i×%i scene without whole-number rounding", (width, height) => {
    const fit = fitRoom(width, height);
    const drawnWidth = ROOM_WIDTH * fit.scale;
    const drawnHeight = ROOM_HEIGHT * fit.scale;
    expect(drawnWidth).toBeLessThanOrEqual(width + 1e-9);
    expect(drawnHeight).toBeLessThanOrEqual(height + 1e-9);
    expect(Math.max(drawnWidth / width, drawnHeight / height)).toBeCloseTo(1, 9);
    expect(fit.offsetX).toBeCloseTo((width - drawnWidth) / 2, 9);
    expect(fit.offsetY).toBeCloseTo((height - drawnHeight) / 2, 9);
  });

  it("keeps a fractional scale on a phone-sized scene", () => {
    expect(Number.isInteger(fitRoom(390, 380).scale)).toBe(false);
  });

  it.each([1, 3, 5, 6, 7])("stands %i members on distinct floor spots inside the room", (count) => {
    const spots = floorSpots(count);
    expect(spots).toHaveLength(count);
    expect(new Set(spots.map(({ x, y }) => `${x}:${y}`)).size).toBe(count);
    for (const { x, y, depth } of spots) {
      expect(x).toBeGreaterThan(30);
      expect(x).toBeLessThan(ROOM_WIDTH - 30);
      expect(y).toBeGreaterThan(WALL_HEIGHT);
      expect(y).toBeLessThan(ROOM_HEIGHT);
      expect(depth).toBeGreaterThan(0);
    }
  });

  it("puts later rows further back and smaller", () => {
    const [front, , , back] = floorSpots(5);
    expect(back?.y).toBeLessThan(front?.y ?? 0);
    expect(back?.depth).toBeLessThan(front?.depth ?? 0);
  });
});
