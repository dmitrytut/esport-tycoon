import { describe, expect, it } from "vitest";

import {
  createIncidentState,
  type EligibilityInput,
  eligibleTargetIds,
  selectIncident,
  type SelectIncidentInput,
} from "../src/incident.ts";
import { createRng } from "../src/rng.ts";
import { makeCollective, makeIncident, makePerformer } from "./fixtures.ts";

describe("createIncidentState", () => {
  it("starts with no pending incident and no cooldowns", () => {
    const state = createIncidentState(42);

    expect(state.pending).toBeNull();
    expect(state.cooldowns).toEqual([]);
  });

  it("derives its rng from the root seed's own named incidents stream", () => {
    const state = createIncidentState(42);

    expect(state.rng).toEqual(createRng(42).stream("incidents").state());
  });

  it("gives different seeds different incident streams", () => {
    expect(createIncidentState(1).rng).not.toEqual(createIncidentState(2).rng);
  });

  it("accepts a string seed the same way createRng does", () => {
    const state = createIncidentState("act-one");

    expect(state.rng).toEqual(createRng("act-one").stream("incidents").state());
  });
});

describe("eligibleTargetIds", () => {
  function baseInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
    return {
      incident: makeIncident("i1"),
      collective: makeCollective([makePerformer("a"), makePerformer("b")]),
      baseWeekKind: "ordinary",
      currentWeek: 10,
      cooldowns: [],
      ...overrides,
    };
  }

  it("makes every performer eligible when conditions is omitted", () => {
    const incident = makeIncident("i1");
    const collective = makeCollective([makePerformer("a"), makePerformer("b")]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["a", "b"]);
  });

  it("makes every performer eligible when conditions is an empty object", () => {
    const incident = makeIncident("i1", { conditions: {} });
    const collective = makeCollective([makePerformer("a"), makePerformer("b")]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["a", "b"]);
  });

  it("excludes a performer whose energy equals the threshold, strict below", () => {
    const incident = makeIncident("i1", { conditions: { energyBelow: 30 } });
    const atThreshold = makePerformer("equal", 30, 70);
    const belowThreshold = makePerformer("below", 29, 70);
    const collective = makeCollective([atThreshold, belowThreshold]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["below"]);
  });

  it("excludes a performer whose morale equals the threshold, strict below", () => {
    const incident = makeIncident("i1", { conditions: { moraleBelow: 40 } });
    const atThreshold = makePerformer("equal", 80, 40);
    const belowThreshold = makePerformer("below", 80, 39);
    const collective = makeCollective([atThreshold, belowThreshold]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["below"]);
  });

  it("excludes a performer who satisfies one field of an AND condition but not the other", () => {
    const incident = makeIncident("i1", { conditions: { energyBelow: 30, moraleBelow: 40 } });
    const onlyEnergy = { ...makePerformer("only-energy", 20, 80) };
    const both = makePerformer("both", 20, 30);
    const collective = makeCollective([onlyEnergy, both]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["both"]);
  });

  it("excludes a trait-holder at the energy boundary and includes one just below it (spec scenario)", () => {
    const incident = makeIncident("i1", {
      conditions: { energyBelow: 30, requiresTrait: ["stoic"] },
    });
    const atBoundary = { ...makePerformer("at-boundary", 30, 70), traits: ["stoic"] };
    const belowBoundary = { ...makePerformer("below-boundary", 29, 70), traits: ["stoic"] };
    const collective = makeCollective([atBoundary, belowBoundary]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["below-boundary"]);
  });

  it("requires every listed trait, not just one", () => {
    const incident = makeIncident("i1", { conditions: { requiresTrait: ["stoic", "leader"] } });
    const partial = { ...makePerformer("partial"), traits: ["stoic"] };
    const full = { ...makePerformer("full"), traits: ["stoic", "leader"] };
    const collective = makeCollective([partial, full]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["full"]);
  });

  it("matches region against the performer's origin", () => {
    const incident = makeIncident("i1", { conditions: { region: ["nordics"] } });
    const nordic = { ...makePerformer("nordic"), originId: "nordics" };
    const other = { ...makePerformer("other"), originId: "iberia" };
    const collective = makeCollective([nordic, other]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual(["nordic"]);
  });

  it("matches baseWeekKind against the supplied preliminary kind", () => {
    const incident = makeIncident("i1", { conditions: { baseWeekKind: ["quiet"] } });
    const collective = makeCollective([makePerformer("a")]);

    expect(eligibleTargetIds(baseInput({ incident, collective, baseWeekKind: "quiet" }))).toEqual([
      "a",
    ]);
    expect(
      eligibleTargetIds(baseInput({ incident, collective, baseWeekKind: "ordinary" })),
    ).toEqual([]);
  });

  it("excludes every target while a global cooldown for this incident is active", () => {
    const incident = makeIncident("i1");
    const collective = makeCollective([makePerformer("a"), makePerformer("b")]);
    const cooldowns = [{ incidentId: "i1", eligibleWeek: 12 }];

    expect(
      eligibleTargetIds(baseInput({ incident, collective, currentWeek: 11, cooldowns })),
    ).toEqual([]);
  });

  it("becomes eligible again exactly at the recorded eligible week", () => {
    const incident = makeIncident("i1");
    const collective = makeCollective([makePerformer("a"), makePerformer("b")]);
    const cooldowns = [{ incidentId: "i1", eligibleWeek: 12 }];

    expect(
      eligibleTargetIds(baseInput({ incident, collective, currentWeek: 12, cooldowns })),
    ).toEqual(["a", "b"]);
  });

  it("ignores a cooldown recorded for a different incident id", () => {
    const incident = makeIncident("i1");
    const collective = makeCollective([makePerformer("a")]);
    const cooldowns = [{ incidentId: "other-incident", eligibleWeek: 999 }];

    expect(
      eligibleTargetIds(baseInput({ incident, collective, currentWeek: 0, cooldowns })),
    ).toEqual(["a"]);
  });

  it("returns no candidates for an empty collective", () => {
    const incident = makeIncident("i1");
    const collective = makeCollective([]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual([]);
  });

  it("returns no candidates when every performer fails a condition", () => {
    const incident = makeIncident("i1", { conditions: { energyBelow: 10 } });
    const collective = makeCollective([makePerformer("a", 80), makePerformer("b", 90)]);

    expect(eligibleTargetIds(baseInput({ incident, collective }))).toEqual([]);
  });

  it("does not mutate or reorder the caller's collective", () => {
    const collective = makeCollective([makePerformer("b"), makePerformer("a")]);
    const incident = makeIncident("i1");
    const before = [...collective.members];

    eligibleTargetIds(baseInput({ incident, collective }));

    expect(collective.members).toEqual(before);
  });
});

describe("selectIncident", () => {
  function baseSelectInput(overrides: Partial<SelectIncidentInput> = {}): SelectIncidentInput {
    return {
      seed: 2,
      state: createIncidentState(2),
      currentWeek: 10,
      baseWeekKind: "ordinary",
      collective: makeCollective([makePerformer("solo")]),
      catalog: [makeIncident("solo-incident", { weight: 5 })],
      cadence: 1,
      traitMultipliers: {},
      ...overrides,
    };
  }

  it("cadence 0 leaves no pending and does not move the rng, even with a positive candidate", () => {
    const input = baseSelectInput({ cadence: 0 });

    const result = selectIncident(input);

    expect(result.selected).toBeNull();
    expect(result.state.pending).toBeNull();
    expect(result.state.rng).toEqual(input.state.rng);
  });

  it("cadence 1 selects exactly one pending incident when a positive candidate exists", () => {
    const input = baseSelectInput({ cadence: 1 });

    const result = selectIncident(input);

    expect(result.selected).toEqual({
      incidentId: "solo-incident",
      performerId: "solo",
      week: 10,
    });
    expect(result.state.pending).toEqual(result.selected);
  });

  it("treats a zero base weight and an all-zero target multiplier as unreachable, never gating cadence", () => {
    const collective = makeCollective([{ ...makePerformer("only"), traits: ["nullifier"] }]);
    const catalog = [
      makeIncident("zero-weight", { weight: 0, category: "cat" }),
      makeIncident("zero-multiplier", { weight: 5, category: "cat" }),
    ];
    const input = baseSelectInput({
      collective,
      catalog,
      cadence: 1,
      traitMultipliers: { nullifier: { cat: 0 } },
    });

    const result = selectIncident(input);

    expect(result.selected).toBeNull();
    expect(result.state).toEqual(input.state);
  });

  it("weighs incidents by base weight times the mean target multiplier, not by eligible count (pinned seed that would flip under sum/pair weighting)", () => {
    // Both incidents author the same weight (6). "a-solo" has one eligible, unboosted
    // target; "z-squad" has four. Under correct mean weighting both have effective weight
    // 6 * mean([1]) = 6 and 6 * mean([1,1,1,1]) = 6 — a tie the sort sees as ["a-solo",
    // "z-squad"]. Under the rejected weight-times-count scheme "z-squad" would instead
    // carry effective weight 24 and dominate the draw. Seed 2 is pinned because it rolls a
    // fraction that selects "a-solo" under the equal-weight scheme and would select
    // "z-squad" under the count-multiplied one.
    const collective = makeCollective([
      { ...makePerformer("solo-target"), originId: "solo-land" },
      { ...makePerformer("squad-1"), originId: "squad-land" },
      { ...makePerformer("squad-2"), originId: "squad-land" },
      { ...makePerformer("squad-3"), originId: "squad-land" },
      { ...makePerformer("squad-4"), originId: "squad-land" },
    ]);
    const catalog = [
      makeIncident("a-solo", { weight: 6, category: "cat", conditions: { region: ["solo-land"] } }),
      makeIncident("z-squad", {
        weight: 6,
        category: "cat",
        conditions: { region: ["squad-land"] },
      }),
    ];
    const input = baseSelectInput({
      seed: 2,
      state: createIncidentState(2),
      collective,
      catalog,
      cadence: 1,
    });

    const result = selectIncident(input);

    expect(result.selected).toEqual({
      incidentId: "a-solo",
      performerId: "solo-target",
      week: 10,
    });
  });

  it("lets a trait multiplier change which incident and target are chosen without touching the cadence gate", () => {
    const catalog = [
      makeIncident("a", { weight: 5, category: "cat1", conditions: { region: ["region-a"] } }),
      makeIncident("b", { weight: 5, category: "cat1", conditions: { region: ["region-b"] } }),
    ];
    const collective = makeCollective([
      { ...makePerformer("p1"), originId: "region-a" },
      { ...makePerformer("p2"), originId: "region-b", traits: ["boost"] },
    ]);

    const withoutBoost = selectIncident(
      baseSelectInput({ catalog, collective, cadence: 1, traitMultipliers: {} }),
    );
    const withBoost = selectIncident(
      baseSelectInput({
        catalog,
        collective,
        cadence: 1,
        traitMultipliers: { boost: { cat1: 4 } },
      }),
    );

    expect(withoutBoost.selected).toEqual({ incidentId: "a", performerId: "p1", week: 10 });
    expect(withBoost.selected).toEqual({ incidentId: "b", performerId: "p2", week: 10 });
    // Cadence 1 always passes without a draw either way: the gate itself is unaffected.
    expect(withoutBoost.state.rng).toEqual(withBoost.state.rng);
  });

  it("gives the same selection and final incident rng state regardless of catalog or collective order", () => {
    const catalog = [
      makeIncident("first", { weight: 3, category: "cat", conditions: {} }),
      makeIncident("second", { weight: 7, category: "cat", conditions: {} }),
    ];
    const collective = makeCollective([
      { ...makePerformer("alpha"), traits: ["boost"] },
      makePerformer("beta"),
    ]);
    const input = baseSelectInput({
      catalog,
      collective,
      cadence: 0.7,
      traitMultipliers: { boost: { cat: 2 } },
    });

    const forward = selectIncident(input);
    const reversed = selectIncident({
      ...input,
      catalog: [...catalog].reverse(),
      collective: makeCollective([...collective.members].reverse()),
    });

    expect(reversed.selected).toEqual(forward.selected);
    expect(reversed.state.rng).toEqual(forward.state.rng);
  });

  it("reproduces a pinned incident, performer and serialized rng continuation for a fixed seed", () => {
    const collective = makeCollective([
      { ...makePerformer("solo-target"), originId: "solo-land" },
      { ...makePerformer("squad-1"), originId: "squad-land" },
      { ...makePerformer("squad-2"), originId: "squad-land" },
      { ...makePerformer("squad-3"), originId: "squad-land" },
      { ...makePerformer("squad-4"), originId: "squad-land" },
    ]);
    const catalog = [
      makeIncident("a-solo", { weight: 6, category: "cat", conditions: { region: ["solo-land"] } }),
      makeIncident("z-squad", {
        weight: 6,
        category: "cat",
        conditions: { region: ["squad-land"] },
      }),
    ];
    const input = baseSelectInput({
      seed: 2,
      state: createIncidentState(2),
      collective,
      catalog,
      cadence: 1,
    });

    const result = selectIncident(input);

    expect(result.selected).toEqual({
      incidentId: "a-solo",
      performerId: "solo-target",
      week: 10,
    });
    expect(result.state.rng).toEqual([-461086731, 3797434685, 3526931618, 15]);
  });

  it("rejects inertly when an incident is already pending, before any rng movement", () => {
    const pendingState = {
      ...createIncidentState(2),
      pending: { incidentId: "already", performerId: "someone", week: 3 },
    };
    const input = baseSelectInput({ state: pendingState, cadence: 1 });

    const result = selectIncident(input);

    expect(result.selected).toBeNull();
    expect(result.state).toEqual(pendingState);
    expect(result.state.rng).toEqual(pendingState.rng);
  });
});
