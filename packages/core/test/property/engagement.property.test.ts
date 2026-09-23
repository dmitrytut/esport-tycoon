import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { forecastEngagements, quoteWeeklyRate } from "../../src/engagement.ts";
import { generatePerformer } from "../../src/generate.ts";
import { createRng } from "../../src/rng.ts";
import { executeWeek } from "../../src/week.ts";
import { paramsArb, performerArb, runStateArb, seedArb } from "./arbitraries.ts";

// Bounded below so the product of three scales stays representable on the one-tenth grid: a
// quote that rounds away is rejected input, exercised by the unit scenario instead.
const positiveScaleArb = fc.double({ min: 0.5, max: 10, noNaN: true });

describe("engagement quotation properties", () => {
  it("is deterministic, finite, positive and on the one-tenth grid", () => {
    fc.assert(
      fc.property(
        performerArb,
        positiveScaleArb,
        positiveScaleArb,
        positiveScaleArb,
        (performer, baseWeeklyRate, originRateScale, disciplineRateScale) => {
          const input = { performer, baseWeeklyRate, originRateScale, disciplineRateScale };
          const first = quoteWeeklyRate(input);
          const second = quoteWeeklyRate(input);

          expect(second).toBe(first);
          expect(Number.isFinite(first)).toBe(true);
          expect(first).toBeGreaterThan(0);
          expect(Number.isInteger(first * 10)).toBe(true);
        },
      ),
    );
  });

  it("is invariant under temporary-state changes", () => {
    fc.assert(
      fc.property(
        performerArb,
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: -25, max: 25, noNaN: true }),
        (performer, energy, morale, form) => {
          const changed = { ...performer, state: { energy, morale, form } };
          const rateInputs = {
            baseWeeklyRate: 2,
            originRateScale: 1.35,
            disciplineRateScale: 0.8,
          };

          expect(quoteWeeklyRate({ performer: changed, ...rateInputs })).toBe(
            quoteWeeklyRate({ performer, ...rateInputs }),
          );
        },
      ),
    );
  });

  it("does not move the generator continuation", () => {
    fc.assert(
      fc.property(seedArb, paramsArb, (seed, params) => {
        const rng = createRng(seed);
        const performer = generatePerformer(rng, params);
        const before = rng.state();

        quoteWeeklyRate({
          performer,
          baseWeeklyRate: 1,
          originRateScale: 1,
          disciplineRateScale: 1,
        });

        expect(rng.state()).toEqual(before);
      }),
    );
  });

  it("matches unchanged weekly settlement throughout its determinate prefix", () => {
    fc.assert(
      fc.property(runStateArb, (initial) => {
        const forecast = forecastEngagements({ state: initial, horizon: 4 });
        let state = initial;

        for (const expected of forecast.weeks) {
          expect(expected.kind).toBe("determinate");
          if (expected.kind !== "determinate") continue;
          const outcome = executeWeek(state, [], { marking: "none" });
          expect(outcome.result.engagementExpense).toEqual(expected.expense);
          expect(outcome.state.org.money).toBe(expected.projectedClosingBalance);
          state = outcome.state;
        }
      }),
    );
  });
});
