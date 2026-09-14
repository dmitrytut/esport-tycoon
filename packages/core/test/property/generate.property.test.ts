import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { generatePerformer } from "../../src/generate.ts";
import {
  ENERGY_MAX,
  ENERGY_MIN,
  MORALE_MAX,
  MORALE_MIN,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
} from "../../src/performer.ts";
import { createRng } from "../../src/rng.ts";
import { paramsArb, seedArb } from "./arbitraries.ts";

describe("generate: a generated performer is a valid performer", () => {
  it("stats, age, ceiling and state stay within their bounds", () => {
    fc.assert(
      fc.property(seedArb, paramsArb, (seed, params) => {
        const performer = generatePerformer(createRng(seed), params);

        let best = STAT_MIN;
        for (const key of STAT_KEYS) {
          const value = performer.stats[key];
          expect(value).toBeGreaterThanOrEqual(STAT_MIN);
          expect(value).toBeLessThanOrEqual(STAT_MAX);
          if (value > best) best = value;
        }

        expect(performer.age).toBeGreaterThanOrEqual(params.minAge ?? 16);
        expect(performer.age).toBeLessThanOrEqual(params.maxAge ?? 28);
        expect(performer.peakAge).toBeGreaterThanOrEqual(19);
        expect(performer.peakAge).toBeLessThanOrEqual(24);

        // The ceiling is above the best current stat, otherwise a rookie is "already ready".
        expect(performer.potential).toBeGreaterThanOrEqual(best);
        expect(performer.potential).toBeLessThanOrEqual(STAT_MAX);

        expect(performer.state.energy).toBeGreaterThanOrEqual(ENERGY_MIN);
        expect(performer.state.energy).toBeLessThanOrEqual(ENERGY_MAX);
        expect(performer.state.morale).toBeGreaterThanOrEqual(MORALE_MIN);
        expect(performer.state.morale).toBeLessThanOrEqual(MORALE_MAX);
        expect(performer.state.form).toBe(0);
      }),
    );
  });

  it("languages start with the region's own and never repeat", () => {
    fc.assert(
      fc.property(seedArb, paramsArb, (seed, params) => {
        const { languages } = generatePerformer(createRng(seed), params);

        expect(languages[0]).toBe(params.origin.language);
        expect(new Set(languages).size).toBe(languages.length);
        for (const language of languages.slice(1)) {
          expect(params.origin.secondLanguages.map((entry) => entry.language)).toContain(language);
        }
      }),
    );
  });

  it("traits come from the pool, never repeat, and never exceed three", () => {
    fc.assert(
      fc.property(seedArb, paramsArb, (seed, params) => {
        const { traits } = generatePerformer(createRng(seed), params);
        const pool = (params.traitPool ?? []).map((option) => option.id);

        expect(traits.length).toBeLessThanOrEqual(Math.min(3, pool.length));
        expect(new Set(traits).size).toBe(traits.length);
        for (const trait of traits) expect(pool).toContain(trait);
      }),
    );
  });

  it("name and handle come from the region's pools", () => {
    fc.assert(
      fc.property(seedArb, paramsArb, (seed, params) => {
        const performer = generatePerformer(createRng(seed), params);

        expect(params.origin.givenNames).toContain(performer.name);
        expect(params.origin.handles).toContain(performer.handle);
        expect(performer.originId).toBe(params.origin.id);
        expect(performer.id.startsWith(`${params.origin.id}-`)).toBe(true);
      }),
    );
  });

  it("the same seed and parameters give the same person", () => {
    fc.assert(
      fc.property(seedArb, paramsArb, (seed, params) => {
        expect(generatePerformer(createRng(seed), params)).toEqual(
          generatePerformer(createRng(seed), params),
        );
      }),
    );
  });

  it("generating one performer does not depend on what was drawn before", () => {
    fc.assert(
      fc.property(seedArb, paramsArb, fc.integer({ min: 1, max: 30 }), (seed, params, noise) => {
        const alone = generatePerformer(createRng(seed), params);

        const rng = createRng(seed);
        const drawnSeed = rng.nextUint32();
        const other = rng.stream(`performer:${drawnSeed}`);
        for (let i = 0; i < noise; i++) other.nextUint32();

        // A fresh stream on the same root seed must still produce the same person: the draw
        // above belongs to another performer's stream and must not leak into this one.
        expect(generatePerformer(createRng(seed), params)).toEqual(alone);
      }),
    );
  });
});
