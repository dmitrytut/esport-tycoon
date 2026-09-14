import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { observe } from "../../src/observe.ts";
import { STAT_KEYS, STAT_MAX, STAT_MIN } from "../../src/performer.ts";
import { performerArb } from "./arbitraries.ts";

/** Quality outside 0–1 is clamped by `observe`, so the arbitrary deliberately overshoots. */
const qualityArb = fc.double({ min: -2, max: 3, noNaN: true });

describe("observe: the fog never lies", () => {
  it("the shown range contains the true value", () => {
    fc.assert(
      fc.property(performerArb, qualityArb, (performer, quality) => {
        const observation = observe(performer, quality);

        for (const key of STAT_KEYS) {
          const range = observation.stats[key];
          expect(range.low).toBeLessThanOrEqual(performer.stats[key]);
          expect(range.high).toBeGreaterThanOrEqual(performer.stats[key]);
        }

        expect(observation.potential.low).toBeLessThanOrEqual(performer.potential);
        expect(observation.potential.high).toBeGreaterThanOrEqual(performer.potential);
      }),
    );
  });

  it("a range is ordered and stays on the scale", () => {
    fc.assert(
      fc.property(performerArb, qualityArb, (performer, quality) => {
        const observation = observe(performer, quality);

        for (const range of [
          ...STAT_KEYS.map((key) => observation.stats[key]),
          observation.potential,
        ]) {
          expect(range.low).toBeLessThanOrEqual(range.high);
          expect(range.low).toBeGreaterThanOrEqual(STAT_MIN);
          expect(range.high).toBeLessThanOrEqual(STAT_MAX);
        }
      }),
    );
  });

  it("looking twice shows the same thing", () => {
    fc.assert(
      fc.property(performerArb, qualityArb, (performer, quality) => {
        expect(observe(performer, quality)).toEqual(observe(performer, quality));
      }),
    );
  });

  it("a better scout never shows a wider range than a worse one", () => {
    fc.assert(
      fc.property(performerArb, (performer) => {
        const blind = observe(performer, 0);
        const expert = observe(performer, 1);

        for (const key of STAT_KEYS) {
          const width = (range: { low: number; high: number }): number => range.high - range.low;
          expect(width(expert.stats[key])).toBeLessThanOrEqual(width(blind.stats[key]) + 1e-9);
        }
      }),
    );
  });
});
