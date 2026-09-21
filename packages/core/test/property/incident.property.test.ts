import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Collective } from "../../src/collective.ts";
import type {
  Incident,
  IncidentTraitMultipliers,
  SelectIncidentInput,
} from "../../src/incident.ts";
import { createIncidentState, selectIncident } from "../../src/incident.ts";
import type { WeekKind } from "../../src/week.ts";
import { makeIncident } from "../fixtures.ts";
import { collectiveArb, seedArb } from "./arbitraries.ts";

/**
 * Trait-multiplier keys use a digit, which the generator's own trait-id pattern
 * (`/^[a-z-]{3,10}$/`, see `paramsArb`) can never produce. Multiplier lookups therefore
 * always miss and every candidate keeps a neutral multiplier of one — the properties below
 * are about selection identity and RNG continuation, not about trait weighting, which
 * Task 2.3 already covers.
 */
const traitMultiplierKeyArb = fc.stringMatching(/^tm[0-9]{3,6}$/);
const incidentCategoryArb = fc.stringMatching(/^[a-z]{3,10}$/);

const traitMultipliersArb: fc.Arbitrary<IncidentTraitMultipliers> = fc.dictionary(
  traitMultiplierKeyArb,
  fc.dictionary(incidentCategoryArb, fc.double({ min: 0, max: 5, noNaN: true }), {
    maxKeys: 3,
  }),
  { maxKeys: 3 },
);

const baseWeekKindArb = fc.constantFrom<WeekKind>("quiet", "ordinary", "contest", "series");

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

const incidentIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,12}$/);

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

/** Fields for the one incident every scenario keeps unconditioned and positively weighted, so
 * a positive candidate always exists and the weighted draw itself is exercised. */
const anchorIncidentFieldsArb = fc.record({
  category: incidentCategoryArb,
  weight: fc.double({ min: 0.1, max: 20, noNaN: true }),
  cooldownWeeks: fc.integer({ min: 0, max: 8 }),
});

/**
 * A catalog of unique-id, closed-shape incidents: one always-eligible anchor plus zero to
 * four incidents with arbitrary (possibly unreachable) conditions.
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

/** Everything `selectIncident` needs, before it is wired into one call's own `IncidentState`. */
interface SelectionScenario {
  readonly catalog: readonly Incident[];
  readonly collective: Collective;
  readonly seed: number | string;
  readonly currentWeek: number;
  readonly baseWeekKind: WeekKind;
  readonly cadence: number;
  readonly traitMultipliers: IncidentTraitMultipliers;
}

const scenarioArb: fc.Arbitrary<SelectionScenario> = fc.record({
  catalog: catalogArb,
  collective: collectiveArb,
  seed: seedArb,
  currentWeek: fc.integer({ min: 0, max: 500 }),
  baseWeekKind: baseWeekKindArb,
  cadence: fc.double({ min: 0, max: 1, noNaN: true }),
  traitMultipliers: traitMultipliersArb,
});

/** Builds a fresh `SelectIncidentInput` from a scenario; each call gets its own `IncidentState`. */
function buildInput(scenario: SelectionScenario): SelectIncidentInput {
  return {
    seed: scenario.seed,
    state: createIncidentState(scenario.seed),
    currentWeek: scenario.currentWeek,
    baseWeekKind: scenario.baseWeekKind,
    collective: scenario.collective,
    catalog: scenario.catalog,
    cadence: scenario.cadence,
    traitMultipliers: scenario.traitMultipliers,
  };
}

describe("selectIncident: deterministic replay", () => {
  it("gives identical selection, lifecycle state and serialized rng for structurally identical inputs", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const first = selectIncident(buildInput(scenario));
        const second = selectIncident(structuredClone(buildInput(scenario)));

        expect(second.selected).toEqual(first.selected);
        expect(second.state).toEqual(first.state);
        expect(second.state.rng).toEqual(first.state.rng);
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
        expect(widened.state.rng).toEqual(baseline.state.rng);
        expect(widened.state).toEqual(baseline.state);
      }),
    );
  });
});
