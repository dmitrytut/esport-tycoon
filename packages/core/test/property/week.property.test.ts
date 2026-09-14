import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { collectiveMorale } from "../../src/collective.ts";
import { ENERGY_MAX, ENERGY_MIN, MORALE_MAX, MORALE_MIN } from "../../src/performer.ts";
import { createRng } from "../../src/rng.ts";
import type {
  AdvanceOptions,
  AdvanceResult,
  RunState,
  StopReasonKind,
  WeekPlan,
} from "../../src/week.ts";
import { advance, UNMASKABLE_REASONS } from "../../src/week.ts";
import { collectiveArb, planArb, runStateArb, seedArb } from "./arbitraries.ts";

/** A run together with a plan written for its own members. */
const runArb: fc.Arbitrary<[RunState, WeekPlan]> = runStateArb.chain((state) =>
  fc.tuple(fc.constant(state), planArb(state.collective.members.map((member) => member.id))),
);

/** Only the four maskable reasons: a mask over the other three is rejected by design. */
const maskableArb = fc.constantFrom(
  ...([
    "activity-skipped",
    "energy-threshold",
    "morale-threshold",
    "money-negative",
  ] satisfies readonly StopReasonKind[]),
);

const optionsArb: fc.Arbitrary<AdvanceOptions> = fc.record({
  sensitivity: fc.record({ masked: fc.uniqueArray(maskableArb, { maxLength: 4 }) }),
  calendar: fc.array(fc.constantFrom("none" as const, "contest" as const, "series" as const), {
    maxLength: 8,
  }),
});

describe("the week loop: invariants", () => {
  it("never spends more slots than the pool holds", () => {
    fc.assert(
      fc.property(runArb, ([state, plan]) => {
        for (const week of advance(state, plan).weeks) {
          expect(week.slotsSpent).toBeGreaterThanOrEqual(0);
          expect(week.slotsSpent).toBeLessThanOrEqual(state.org.slots);
        }
      }),
    );
  });

  it("never lets energy or morale leave its scale", () => {
    fc.assert(
      fc.property(runArb, ([state, plan]) => {
        for (const member of advance(state, plan).state.collective.members) {
          expect(member.state.energy).toBeGreaterThanOrEqual(ENERGY_MIN);
          expect(member.state.energy).toBeLessThanOrEqual(ENERGY_MAX);
          expect(member.state.morale).toBeGreaterThanOrEqual(MORALE_MIN);
          expect(member.state.morale).toBeLessThanOrEqual(MORALE_MAX);
        }
      }),
    );
  });

  it("keeps collective morale between the lowest member and the mean", () => {
    fc.assert(
      fc.property(collectiveArb, (collective) => {
        const values = collective.members.map((member) => member.state.morale);
        const lowest = Math.min(...values);
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

        // The derived value is a whole number, so the bounds are compared as whole numbers:
        // rounding is monotonic, and this is the tightest statement that stays exact.
        expect(collectiveMorale(collective)).toBeGreaterThanOrEqual(Math.round(lowest));
        expect(collectiveMorale(collective)).toBeLessThanOrEqual(Math.round(mean));
      }),
    );
  });

  it("gives every simulated week exactly one kind", () => {
    fc.assert(
      fc.property(runArb, ([state, plan]) => {
        const result = advance(state, plan);
        const { quiet, ordinary, contest, series } = result.kinds;

        expect(quiet + ordinary + contest + series).toBe(result.weeks.length);
      }),
    );
  });

  it("stops at the last week it simulated, and never for nothing", () => {
    fc.assert(
      fc.property(runArb, ([state, plan]) => {
        const result = advance(state, plan);
        const last = result.weeks[result.weeks.length - 1];

        expect(result.stoppedAt).toBe(last?.week);
        expect(result.reasons.length).toBeGreaterThan(0);
        expect(result.state.week).toBe(result.stoppedAt + 1);
      }),
    );
  });

  it("refuses a mask over a reason the user may not miss", () => {
    fc.assert(
      fc.property(runArb, fc.constantFrom(...UNMASKABLE_REASONS), ([state, plan], kind) => {
        expect(() => advance(state, plan, { sensitivity: { masked: [kind] } })).toThrow();
      }),
    );
  });
});

describe("the week loop: determinism", () => {
  it("returns the same result for the same state, plan, mask and calendar", () => {
    fc.assert(
      fc.property(runArb, optionsArb, ([state, plan], options) => {
        expect(advance(state, plan, options)).toEqual(advance(state, plan, options));
      }),
    );
  });

  it("is reproducible for each seed on its own", () => {
    fc.assert(
      fc.property(runArb, seedArb, seedArb, ([state, plan], first, second) => {
        const runWith = (seed: number | string): AdvanceResult =>
          advance({ ...state, seed, rng: createRng(seed).state() }, plan);

        expect(runWith(first)).toEqual(runWith(first));
        expect(runWith(second)).toEqual(runWith(second));
      }),
    );
  });
});
