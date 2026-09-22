import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Collective } from "../../src/collective.ts";
import type {
  Incident,
  IncidentCooldown,
  IncidentState,
  IncidentTraitMultipliers,
  SelectIncidentInput,
} from "../../src/incident.ts";
import { createIncidentState, selectIncident } from "../../src/incident.ts";
import type { WeekKind } from "../../src/week.ts";
import { makeIncident } from "../fixtures.ts";
import { collectiveArb, seedArb } from "./arbitraries.ts";

const incidentCategoryArb = fc.stringMatching(/^[a-z]{3,10}$/);
const baseWeekKindArb = fc.constantFrom<WeekKind>("quiet", "ordinary", "contest", "series");
const incidentIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,12}$/);

/** Closed AND conditions drawn from the supported union; any field may be entirely absent. */
const incidentConditionsArb = fc.record(
  {
    energyBelow: fc.double({ min: 0, max: 100, noNaN: true }),
    moraleBelow: fc.double({ min: 0, max: 100, noNaN: true }),
    requiresTrait: fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 1, maxLength: 2 }),
    region: fc.array(fc.stringMatching(/^[a-z]{2,8}$/), { minLength: 1, maxLength: 2 }),
    baseWeekKind: fc.uniqueArray(baseWeekKindArb, { minLength: 1, maxLength: 4 }),
  },
  { requiredKeys: [] },
);

/** Fields for an incident that may or may not end up reachable by any generated performer. */
const extraIncidentFieldsArb = fc.record(
  {
    category: incidentCategoryArb,
    weight: fc.double({ min: 0, max: 20, noNaN: true }),
    cooldownWeeks: fc.integer({ min: 0, max: 8 }),
    conditions: incidentConditionsArb,
  },
  { requiredKeys: ["category", "weight", "cooldownWeeks"] },
);

/**
 * Fields for the one incident every catalog keeps unconditioned and positively weighted, so
 * a positive candidate always exists — the cadence gate always gets a chance to draw, and
 * the weighted target draw itself is always exercised.
 */
const anchorIncidentFieldsArb = fc.record({
  category: incidentCategoryArb,
  weight: fc.double({ min: 0.1, max: 20, noNaN: true }),
  cooldownWeeks: fc.integer({ min: 0, max: 8 }),
});

/**
 * A catalog of unique-id, closed-shape incidents: one always-eligible anchor first, plus
 * zero to four incidents with arbitrary (possibly unreachable) conditions.
 */
const catalogArb: fc.Arbitrary<readonly Incident[]> = fc
  .tuple(anchorIncidentFieldsArb, fc.array(extraIncidentFieldsArb, { maxLength: 4 }))
  .chain(([anchorFields, extraFields]) =>
    fc
      .uniqueArray(incidentIdArb, {
        minLength: extraFields.length + 1,
        maxLength: extraFields.length + 1,
      })
      .map((ids) => {
        const [anchorId, ...extraIds] = ids;
        if (anchorId === undefined) throw new RangeError("catalogArb produced no anchor id");
        const anchor = makeIncident(anchorId, anchorFields);
        const rest = extraFields.map((fields, index) => {
          const id = extraIds[index];
          if (id === undefined) throw new RangeError("catalogArb produced a missing extra id");
          return makeIncident(id, fields);
        });
        return [anchor, ...rest];
      }),
  );

/** A strictly positive, finite trait-category multiplier: never zero, never negative. */
const positiveMultiplierArb = fc.double({ min: 0.1, max: 5, noNaN: true });

/**
 * A catalog, collective and trait-multiplier record bundled so weighting is never dead: the
 * collective's first member always carries one extra, forced trait, and the anchor
 * incident's own category always carries a multiplier entry for that trait. Every
 * multiplier value stays strictly positive, so `categoryMultiplier`'s product — and the
 * anchor's positive-candidate guarantee — can never collapse to zero. Without this, a
 * `traitMultipliers` record built from independent random strings would (correctly, but
 * uselessly) never match any generated performer's real trait ids, leaving weighting
 * exercised in shape only, never in effect.
 */
const targetingBundleArb: fc.Arbitrary<{
  catalog: readonly Incident[];
  collective: Collective;
  traitMultipliers: IncidentTraitMultipliers;
}> = fc
  .tuple(
    catalogArb,
    collectiveArb,
    fc.stringMatching(/^forced-[a-z]{3,8}$/),
    positiveMultiplierArb,
    fc.array(
      fc.record({
        trait: fc.stringMatching(/^extra-[a-z]{3,8}$/),
        category: incidentCategoryArb,
        value: positiveMultiplierArb,
      }),
      { maxLength: 3 },
    ),
  )
  .map(([catalog, collective, forcedTraitId, forcedValue, extraEntries]) => {
    const [anchor] = catalog;
    if (anchor === undefined) {
      throw new RangeError("targetingBundleArb requires a non-empty catalog");
    }
    const [firstMember, ...otherMembers] = collective.members;
    if (firstMember === undefined) {
      throw new RangeError("targetingBundleArb requires a non-empty collective");
    }
    const forcedMember = { ...firstMember, traits: [...firstMember.traits, forcedTraitId] };
    const traitMultipliers: Record<string, Record<string, number>> = {
      [forcedTraitId]: { [anchor.category]: forcedValue },
    };
    for (const entry of extraEntries) {
      traitMultipliers[entry.trait] = {
        ...(traitMultipliers[entry.trait] ?? {}),
        [entry.category]: entry.value,
      };
    }
    return {
      catalog,
      collective: { ...collective, members: [forcedMember, ...otherMembers] },
      traitMultipliers,
    };
  });

/**
 * One real selection step's own inputs: used only to advance an `IncidentState` through the
 * public `selectIncident` transition, never through a private RNG helper.
 */
interface WarmupStep {
  readonly catalog: readonly Incident[];
  readonly collective: Collective;
  readonly currentWeek: number;
  readonly baseWeekKind: WeekKind;
  readonly cadence: number;
  readonly cooldown: IncidentCooldown | undefined;
}

/**
 * Interior cadence, strictly between 0 and 1: `Rng.chance` short-circuits without consuming
 * randomness at either boundary, and a warmup step exists to genuinely advance the stream.
 */
const drawingCadenceArb = fc.double({ min: 0.0001, max: 0.9999, noNaN: true });

const warmupStepArb: fc.Arbitrary<WarmupStep> = fc
  .record({
    catalog: catalogArb,
    collective: collectiveArb,
    currentWeek: fc.integer({ min: 0, max: 500 }),
    baseWeekKind: baseWeekKindArb,
    cadence: drawingCadenceArb,
  })
  .chain((step) =>
    fc
      .record({
        cooldown: fc.option(
          fc.record({
            incidentId: fc.constantFrom(...step.catalog.map((incident) => incident.id)),
            eligibleWeek: fc.integer({ min: 0, max: step.currentWeek + 20 }),
          }),
          { nil: undefined },
        ),
      })
      .map((extra): WarmupStep => ({ ...step, cooldown: extra.cooldown })),
  );

/**
 * Advances an `IncidentState` through a real history of public `selectIncident` calls,
 * clearing `pending` between them — an existing pending would reject every later step
 * inertly — and folding each step's own cooldown variation onto the returned state's own
 * `cooldowns` field. The only way to reach a genuinely non-initial, serialized lifecycle
 * state without reaching into a private RNG helper.
 */
function foldWarmup(seed: number | string, steps: readonly WarmupStep[]): IncidentState {
  let state = createIncidentState(seed);
  for (const step of steps) {
    const result = selectIncident({
      seed,
      state,
      currentWeek: step.currentWeek,
      baseWeekKind: step.baseWeekKind,
      collective: step.collective,
      catalog: step.catalog,
      cadence: step.cadence,
      traitMultipliers: {},
    });
    const cooldowns =
      step.cooldown === undefined
        ? result.state.cooldowns
        : [...result.state.cooldowns, step.cooldown];
    state = { ...result.state, pending: null, cooldowns };
  }
  return state;
}

/** The final call's own inputs, independent of which `IncidentState` it is fed. */
const finalCallArb = fc.record({
  bundle: targetingBundleArb,
  currentWeek: fc.integer({ min: 0, max: 500 }),
  baseWeekKind: baseWeekKindArb,
  cadence: fc.double({ min: 0, max: 1, noNaN: true }),
});

/**
 * Everything the final `selectIncident` call under test needs, plus a genuinely non-initial
 * `IncidentState` reached only through a generated, positive number of prior public
 * selections (not a freshly minted `createIncidentState`).
 */
interface SelectionScenario {
  readonly seed: number | string;
  readonly continuationState: IncidentState;
  readonly catalog: readonly Incident[];
  readonly collective: Collective;
  readonly currentWeek: number;
  readonly baseWeekKind: WeekKind;
  readonly cadence: number;
  readonly traitMultipliers: IncidentTraitMultipliers;
}

const scenarioArb: fc.Arbitrary<SelectionScenario> = fc
  .record({
    seed: seedArb,
    warmupSteps: fc.array(warmupStepArb, { minLength: 1, maxLength: 4 }),
    finalCall: finalCallArb,
  })
  .map(({ seed, warmupSteps, finalCall }) => ({
    seed,
    continuationState: foldWarmup(seed, warmupSteps),
    catalog: finalCall.bundle.catalog,
    collective: finalCall.bundle.collective,
    currentWeek: finalCall.currentWeek,
    baseWeekKind: finalCall.baseWeekKind,
    cadence: finalCall.cadence,
    traitMultipliers: finalCall.bundle.traitMultipliers,
  }));

/** Builds a fresh `SelectIncidentInput` from a scenario's own non-initial continuation state. */
function buildInput(scenario: SelectionScenario): SelectIncidentInput {
  return {
    seed: scenario.seed,
    state: scenario.continuationState,
    currentWeek: scenario.currentWeek,
    baseWeekKind: scenario.baseWeekKind,
    collective: scenario.collective,
    catalog: scenario.catalog,
    cadence: scenario.cadence,
    traitMultipliers: scenario.traitMultipliers,
  };
}

describe("selectIncident: deterministic replay", () => {
  it("gives identical selection, lifecycle state and serialized rng for structurally identical, non-initial continuation inputs", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const first = selectIncident(structuredClone(buildInput(scenario)));
        const second = selectIncident(structuredClone(buildInput(scenario)));

        expect(second.selected).toEqual(first.selected);
        expect(second.state).toEqual(first.state);
      }),
    );
  });
});

describe("selectIncident: ineligible content does not drift the stream", () => {
  it("adding or reordering one incident with unreachable conditions leaves selection and rng untouched", () => {
    fc.assert(
      fc.property(scenarioArb, incidentIdArb, fc.nat(), (scenario, extraId, positionSeed) => {
        fc.pre(!scenario.catalog.some((incident) => incident.id === extraId));

        // `energyBelow: 0` can never match a generated performer: `collectiveArb` draws
        // energy from `[0, 100]`, and the condition is strict-below (spec "ineligible
        // content does not drift the stream").
        const unreachable = makeIncident(extraId, {
          category: "unreachable",
          weight: 999,
          cooldownWeeks: 0,
          conditions: { energyBelow: 0 },
        });
        const position = positionSeed % (scenario.catalog.length + 1);
        const widenedCatalog = [
          ...scenario.catalog.slice(0, position),
          unreachable,
          ...scenario.catalog.slice(position),
        ];

        const baseline = selectIncident(buildInput(scenario));
        const widened = selectIncident(buildInput({ ...scenario, catalog: widenedCatalog }));

        expect(widened.selected).toEqual(baseline.selected);
        expect(widened.state).toEqual(baseline.state);
      }),
    );
  });
});

describe("selectIncident: continues the saved rng stream rather than restarting it", () => {
  it("gives a different rng continuation for two distinct, real prior-selection histories", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.array(warmupStepArb, { minLength: 1, maxLength: 4 }),
        fc.array(warmupStepArb, { minLength: 1, maxLength: 4 }),
        finalCallArb,
        (seed, warmupA, warmupB, finalCall) => {
          const continuationA = foldWarmup(seed, warmupA);
          const continuationB = foldWarmup(seed, warmupB);
          fc.pre(JSON.stringify(continuationA.rng) !== JSON.stringify(continuationB.rng));

          const buildFinal = (state: IncidentState): SelectIncidentInput => ({
            seed,
            state,
            currentWeek: finalCall.currentWeek,
            baseWeekKind: finalCall.baseWeekKind,
            collective: finalCall.bundle.collective,
            catalog: finalCall.bundle.catalog,
            // Cadence 1 short-circuits `Rng.chance` without a draw, then unconditionally
            // draws exactly one incident-index and one target-index float — a fixed offset
            // of two draws applied to both continuations. Any smaller, chance-dependent
            // offset (e.g. a fractional cadence) could let two continuations at different
            // positions land on the exact same combined position by coincidence, since this
            // rng's evolution depends only on how many draws happen, never on their values.
            cadence: 1,
            traitMultipliers: finalCall.bundle.traitMultipliers,
          });

          const resultA = selectIncident(buildFinal(continuationA));
          const resultB = selectIncident(buildFinal(continuationB));

          expect(resultA.state.rng).not.toEqual(resultB.state.rng);
        },
      ),
    );
  });
});

/**
 * A collective whose target draw has exactly one possible winner: the first member is the
 * only one carrying a positive category multiplier for the given category, and every other
 * member carries a real, distinct trait whose declared multiplier is exactly zero for that
 * same category. `Rng.weightedIndex` can only ever land on a positive-weight entry (spec
 * "Zero weights are unreachable"), so the winner is forced regardless of where the rng
 * stream happens to be — the one shape that can tell a correct `categoryMultiplier` from a
 * mutated one purely through `selectIncident`'s own public result.
 */
const soleWinnerArb: fc.Arbitrary<{
  collective: Collective;
  traitMultipliers: IncidentTraitMultipliers;
  category: string;
  winnerId: string;
}> = fc
  .tuple(
    collectiveArb,
    incidentCategoryArb,
    fc.stringMatching(/^forced-[a-z]{3,8}$/),
    fc.stringMatching(/^zeroed-[a-z]{3,8}$/),
    positiveMultiplierArb,
  )
  .map(([collective, category, boostTraitId, zeroTraitId, boostValue]) => {
    const [winner, ...rest] = collective.members;
    if (winner === undefined) {
      throw new RangeError("soleWinnerArb requires a non-empty collective");
    }
    const boostedWinner = { ...winner, traits: [...winner.traits, boostTraitId] };
    const zeroedRest = rest.map((member) => ({
      ...member,
      traits: [...member.traits, zeroTraitId],
    }));
    return {
      collective: { ...collective, members: [boostedWinner, ...zeroedRest] },
      traitMultipliers: {
        [boostTraitId]: { [category]: boostValue },
        [zeroTraitId]: { [category]: 0 },
      },
      category,
      winnerId: boostedWinner.id,
    };
  });

describe("selectIncident: a category multiplier decides which target wins a weighted draw", () => {
  it("always selects the sole eligible member whose category multiplier is positive", () => {
    fc.assert(
      fc.property(
        soleWinnerArb,
        seedArb,
        fc.integer({ min: 0, max: 500 }),
        baseWeekKindArb,
        (built, seed, currentWeek, baseWeekKind) => {
          const catalog = [makeIncident("only", { category: built.category, weight: 1 })];
          const input: SelectIncidentInput = {
            seed,
            state: createIncidentState(seed),
            currentWeek,
            baseWeekKind,
            collective: built.collective,
            catalog,
            // Always passes without a draw: the cadence gate is not this property's concern.
            cadence: 1,
            traitMultipliers: built.traitMultipliers,
          };

          const result = selectIncident(input);

          expect(result.selected?.performerId).toBe(built.winnerId);
        },
      ),
    );
  });
});
