import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  advanceYear,
  applyStatChange,
  applyStateChange,
  deserializePerformer,
  ENERGY_MAX,
  ENERGY_MIN,
  FORM_MAX,
  FORM_MIN,
  MORALE_MAX,
  MORALE_MIN,
  normalizeStats,
  type Performer,
  serializePerformer,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type Stats,
} from "../../src/performer.ts";
import { performerArb } from "./arbitraries.ts";

/** Every stat on the scale and on the one-tenth grid the normalizer promises. */
const expectStatsOnScale = (stats: Stats): void => {
  for (const key of STAT_KEYS) {
    const value = stats[key];
    expect(value).toBeGreaterThanOrEqual(STAT_MIN);
    expect(value).toBeLessThanOrEqual(STAT_MAX);
    expect(Math.round(value * 10)).toBe(value * 10);
  }
};

const expectStateInBounds = (performer: Performer): void => {
  expect(performer.state.energy).toBeGreaterThanOrEqual(ENERGY_MIN);
  expect(performer.state.energy).toBeLessThanOrEqual(ENERGY_MAX);
  expect(performer.state.morale).toBeGreaterThanOrEqual(MORALE_MIN);
  expect(performer.state.morale).toBeLessThanOrEqual(MORALE_MAX);
  expect(performer.state.form).toBeGreaterThanOrEqual(FORM_MIN);
  expect(performer.state.form).toBeLessThanOrEqual(FORM_MAX);
};

/** Deltas big enough to push past every bound, so clamping is what is actually tested. */
const statDeltaArb = fc.dictionary(
  fc.constantFrom(...STAT_KEYS),
  fc.double({ min: -50, max: 50, noNaN: true }),
);

const stateDeltaArb = fc.record(
  {
    energy: fc.double({ min: -500, max: 500, noNaN: true }),
    morale: fc.double({ min: -500, max: 500, noNaN: true }),
    form: fc.double({ min: -50, max: 50, noNaN: true }),
  },
  { requiredKeys: [] },
);

describe("performer: saving", () => {
  it("deserialize(serialize(p)) gives the same person back", () => {
    fc.assert(
      fc.property(performerArb, (performer) => {
        expect(deserializePerformer(serializePerformer(performer))).toEqual(performer);
      }),
    );
  });

  it("a snapshot does not share arrays with the performer", () => {
    fc.assert(
      fc.property(performerArb, (performer) => {
        const snapshot = serializePerformer(performer);
        expect(snapshot.languages).not.toBe(performer.languages);
        expect(snapshot.traits).not.toBe(performer.traits);
      }),
    );
  });
});

describe("performer: normalization", () => {
  it("normalizeStats is idempotent and lands on the scale", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...STAT_KEYS),
          fc.double({ min: -100, max: 100, noNaN: true }),
          {
            minKeys: STAT_KEYS.length,
          },
        ),
        (raw) => {
          const once = normalizeStats(raw as Stats);
          expectStatsOnScale(once);
          expect(normalizeStats(once)).toEqual(once);
        },
      ),
    );
  });
});

describe("performer: changes", () => {
  it("any stat change keeps the stats on the scale", () => {
    fc.assert(
      fc.property(performerArb, statDeltaArb, (performer, delta) => {
        expectStatsOnScale(applyStatChange(performer, delta).stats);
      }),
    );
  });

  it("any state change keeps energy, morale and form in bounds", () => {
    fc.assert(
      fc.property(performerArb, stateDeltaArb, (performer, delta) => {
        expectStateInBounds(applyStateChange(performer, delta));
      }),
    );
  });

  it("an empty change changes nothing", () => {
    fc.assert(
      fc.property(performerArb, (performer) => {
        expect(applyStatChange(performer, {})).toEqual(performer);
        expect(applyStateChange(performer, {})).toEqual(performer);
      }),
    );
  });

  it("a career of any length keeps the stats on the scale and ages by one a year", () => {
    fc.assert(
      fc.property(performerArb, fc.integer({ min: 1, max: 25 }), (performer, years) => {
        let aged = performer;
        for (let year = 0; year < years; year++) aged = advanceYear(aged);

        expect(aged.age).toBe(performer.age + years);
        expectStatsOnScale(aged.stats);
        expect(aged.potential).toBe(performer.potential);
        expect(aged.seed).toBe(performer.seed);
      }),
    );
  });
});
