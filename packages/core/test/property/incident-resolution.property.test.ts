import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Incident, IncidentEffect } from "../../src/incident.ts";
import { createIncidentState, resolveIncident } from "../../src/incident.ts";
import { REPUTATION_MAX, REPUTATION_MIN } from "../../src/org.ts";
import {
  ENERGY_MAX,
  ENERGY_MIN,
  FORM_MAX,
  FORM_MIN,
  MORALE_MAX,
  MORALE_MIN,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
} from "../../src/performer.ts";
import { createRng } from "../../src/rng.ts";
import type { RunState } from "../../src/week.ts";
import { collectiveArb, orgArb, seedArb } from "./arbitraries.ts";

/** An amount large enough to push a bounded value past either edge of its scale. */
const amountArb = fc.double({ min: -1000, max: 1000, noNaN: true });

/** Every supported effect kind, with amounts wide enough to force clamping. */
const incidentEffectArb: fc.Arbitrary<IncidentEffect> = fc.oneof(
  fc.record({ kind: fc.constant("energy" as const), amount: amountArb }),
  fc.record({ kind: fc.constant("morale" as const), amount: amountArb }),
  fc.record({ kind: fc.constant("form" as const), amount: amountArb }),
  fc.record({
    kind: fc.constant("stat" as const),
    stat: fc.constantFrom(...STAT_KEYS),
    amount: amountArb,
  }),
  fc.record({ kind: fc.constant("money" as const), amount: amountArb }),
  fc.record({ kind: fc.constant("audience" as const), amount: amountArb }),
  fc.record({ kind: fc.constant("reputation" as const), amount: amountArb }),
);

/** A direct choice's effects: zero to eight arbitrary supported effects, repeats allowed. */
const effectsArb = fc.array(incidentEffectArb, { maxLength: 8 });

/**
 * A run with one incident pending for its first member, offering a single direct choice
 * whose effects are the arbitrary generated list. Only that member ever sees an effect.
 */
const pendingScenarioArb: fc.Arbitrary<{
  readonly state: RunState;
  readonly incident: Incident;
  readonly targetId: string;
  readonly otherIds: readonly string[];
  readonly effects: readonly IncidentEffect[];
}> = fc
  .tuple(collectiveArb, orgArb, seedArb, fc.nat({ max: 500 }), effectsArb)
  .map(([collective, org, seed, week, effects]) => {
    const [target, ...others] = collective.members;
    if (target === undefined) throw new Error("collectiveArb produced an empty collective");
    const incident: Incident = {
      id: "arbitrary-incident",
      category: "general",
      weight: 1,
      cooldownWeeks: 0,
      text: "{player} has a moment.",
      choices: [
        {
          id: "the-choice",
          label: "Choice",
          detail: "Arbitrary supported effects.",
          outcome: { kind: "direct", effects },
        },
      ],
    };
    const state: RunState = {
      org,
      collective,
      week,
      seed,
      rng: createRng(seed).state(),
      incidents: {
        ...createIncidentState(seed),
        pending: { incidentId: incident.id, performerId: target.id, week },
      },
    };
    return {
      state,
      incident,
      targetId: target.id,
      otherIds: others.map((performer) => performer.id),
      effects,
    };
  });

describe("resolveIncident: bounded state across arbitrary supported effects", () => {
  it("keeps the target's energy, morale, form and every stat on their declared scales", () => {
    fc.assert(
      fc.property(pendingScenarioArb, (scenario) => {
        const result = resolveIncident({
          state: scenario.state,
          catalog: [scenario.incident],
          choiceId: "the-choice",
        });

        const target = result.state.collective.members.find(
          (performer) => performer.id === scenario.targetId,
        );
        expect(target).toBeDefined();
        expect(target?.state.energy).toBeGreaterThanOrEqual(ENERGY_MIN);
        expect(target?.state.energy).toBeLessThanOrEqual(ENERGY_MAX);
        expect(target?.state.morale).toBeGreaterThanOrEqual(MORALE_MIN);
        expect(target?.state.morale).toBeLessThanOrEqual(MORALE_MAX);
        expect(target?.state.form).toBeGreaterThanOrEqual(FORM_MIN);
        expect(target?.state.form).toBeLessThanOrEqual(FORM_MAX);
        for (const key of STAT_KEYS) {
          expect(target?.stats[key]).toBeGreaterThanOrEqual(STAT_MIN);
          expect(target?.stats[key]).toBeLessThanOrEqual(STAT_MAX);
        }
      }),
    );
  });

  it("keeps organization audience and reputation on their declared scales, money unclamped", () => {
    fc.assert(
      fc.property(pendingScenarioArb, (scenario) => {
        const result = resolveIncident({
          state: scenario.state,
          catalog: [scenario.incident],
          choiceId: "the-choice",
        });

        expect(result.state.org.audience).toBeGreaterThanOrEqual(0);
        expect(result.state.org.reputation).toBeGreaterThanOrEqual(REPUTATION_MIN);
        expect(result.state.org.reputation).toBeLessThanOrEqual(REPUTATION_MAX);
        expect(Number.isFinite(result.state.org.money)).toBe(true);
      }),
    );
  });

  it("never changes a performer other than the pending target", () => {
    fc.assert(
      fc.property(pendingScenarioArb, (scenario) => {
        const before = new Map(
          scenario.state.collective.members
            .filter((performer) => scenario.otherIds.includes(performer.id))
            .map((performer) => [performer.id, performer]),
        );

        const result = resolveIncident({
          state: scenario.state,
          catalog: [scenario.incident],
          choiceId: "the-choice",
        });

        for (const id of scenario.otherIds) {
          const after = result.state.collective.members.find((performer) => performer.id === id);
          expect(after).toEqual(before.get(id));
        }
      }),
    );
  });
});
