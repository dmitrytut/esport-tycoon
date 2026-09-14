import fc from "fast-check";

import type { GenerateParams, OriginProfile } from "../../src/generate.ts";
import { generatePerformer } from "../../src/generate.ts";
import type { Performer } from "../../src/performer.ts";
import { createRng } from "../../src/rng.ts";

/** Seeds accepted by `createRng`: both forms must behave the same way. */
export const seedArb = fc.oneof(fc.integer({ min: 0, max: 0xffffffff }), fc.string());

export const originArb: fc.Arbitrary<OriginProfile> = fc.record({
  id: fc.stringMatching(/^[a-z]{2,8}$/),
  language: fc.stringMatching(/^[a-z]{2}$/),
  secondLanguages: fc.array(
    fc.record({
      language: fc.stringMatching(/^[a-z]{2}$/),
      chance: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    { maxLength: 3 },
  ),
  talentDensity: fc.double({ min: 0.5, max: 1.5, noNaN: true }),
  givenNames: fc.array(fc.stringMatching(/^[A-Z][a-z]{2,8}$/), { minLength: 1, maxLength: 6 }),
  handles: fc.array(fc.stringMatching(/^[a-z]{3,9}$/), { minLength: 1, maxLength: 6 }),
});

export const paramsArb: fc.Arbitrary<GenerateParams> = fc
  .tuple(
    originArb,
    fc.integer({ min: 1, max: 5 }),
    fc.integer({ min: 16, max: 24 }),
    fc.integer({ min: 0, max: 14 }),
    fc.array(
      fc.record({
        id: fc.stringMatching(/^[a-z-]{3,10}$/),
        weight: fc.double({ min: 0.1, max: 10, noNaN: true }),
      }),
      { maxLength: 5 },
    ),
  )
  .map(([origin, level, minAge, span, traitPool]) => ({
    origin,
    level,
    minAge,
    maxAge: minAge + span,
    traitPool,
  }));

/**
 * A performer as the game actually makes them. Building one field by field would let
 * fast-check invent people the generator can never produce, and the invariants under test
 * are properties of generated performers, not of arbitrary records.
 */
export const performerArb: fc.Arbitrary<Performer> = fc
  .tuple(seedArb, paramsArb)
  .map(([seed, params]) => generatePerformer(createRng(seed), params));
