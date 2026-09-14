import { describe, expect, it } from "vitest";

import { type GenerateParams, generatePerformer } from "../src/generate.ts";
import { observe } from "../src/observe.ts";
import { STAT_KEYS } from "../src/performer.ts";
import { createRng } from "../src/rng.ts";

const params: GenerateParams = {
  origin: {
    id: "cis",
    language: "ru",
    secondLanguages: [{ language: "en", chance: 0.35 }],
    talentDensity: 1.3,
    givenNames: ["Artem", "Nikita"],
    handles: ["kabanchik", "tapok"],
  },
  level: 3,
};

describe("information fog (specs/0001, item 2)", () => {
  it("the estimate does not change between calls", () => {
    const performer = generatePerformer(createRng(42), params);
    expect(observe(performer, 0.4)).toEqual(observe(performer, 0.4));
  });

  it("the truth is always inside the shown range", () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const performer = generatePerformer(rng, params);
      for (const quality of [0, 0.5, 1]) {
        const view = observe(performer, quality);
        for (const key of STAT_KEYS) {
          expect(view.stats[key].low).toBeLessThanOrEqual(performer.stats[key]);
          expect(view.stats[key].high).toBeGreaterThanOrEqual(performer.stats[key]);
        }
        expect(view.potential.low).toBeLessThanOrEqual(performer.potential);
        expect(view.potential.high).toBeGreaterThanOrEqual(performer.potential);
      }
    }
  });

  it("the best scout narrows the range, but never zeroes it out", () => {
    const rng = createRng(7);
    let wideTotal = 0;
    let sharpTotal = 0;
    const count = 100;
    for (let i = 0; i < count; i++) {
      const performer = generatePerformer(rng, params);
      const wide = observe(performer, 0);
      const sharp = observe(performer, 1);
      for (const key of STAT_KEYS) {
        wideTotal += wide.stats[key].high - wide.stats[key].low;
        sharpTotal += sharp.stats[key].high - sharp.stats[key].low;
        expect(sharp.stats[key].high - sharp.stats[key].low).toBeGreaterThan(0);
      }
    }
    expect(sharpTotal).toBeLessThan(wideTotal / 2);
  });

  it("the ceiling is seen worse than current stats", () => {
    const rng = createRng(11);
    let statWidth = 0;
    let potentialWidth = 0;
    for (let i = 0; i < 100; i++) {
      const performer = generatePerformer(rng, params);
      const view = observe(performer, 0.5);
      potentialWidth += view.potential.high - view.potential.low;
      for (const key of STAT_KEYS) statWidth += (view.stats[key].high - view.stats[key].low) / 6;
    }
    expect(potentialWidth).toBeGreaterThan(statWidth);
  });

  it("quality outside 0…1 does not break the range", () => {
    const performer = generatePerformer(createRng(13), params);
    expect(observe(performer, -5)).toEqual(observe(performer, 0));
    expect(observe(performer, 99)).toEqual(observe(performer, 1));
  });
});
