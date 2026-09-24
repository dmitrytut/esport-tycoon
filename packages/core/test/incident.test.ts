import { describe, expect, it } from "vitest";

import type { Incident, IncidentCooldown } from "../src/incident.ts";
import {
  createIncidentState,
  type EligibilityInput,
  eligibleTargetIds,
  resolveIncident,
  selectIncident,
  type SelectIncidentInput,
} from "../src/incident.ts";
import type { Org } from "../src/org.ts";
import type { Performer } from "../src/performer.ts";
import { createRng } from "../src/rng.ts";
import type { RunState } from "../src/week.ts";
import { makeCollective, makeIncident, makeOrg, makePerformer, makeState } from "./fixtures.ts";

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

  it("weights target selection by the target's own multiplier, not uniformly among eligible targets", () => {
    // One incident, two eligible targets: p1 unboosted (multiplier 1), p2 with a trait
    // that quadruples this category (multiplier 4). Seed 2 is pinned because the weighted
    // draw [1, 4] selects p2, while a uniform draw among the same two targets selects p1
    // (verified by hand against `rng.ts`'s primitives before writing this assertion).
    const catalog = [makeIncident("solo-incident", { weight: 1, category: "cat" })];
    const collective = makeCollective([
      makePerformer("p1"),
      { ...makePerformer("p2"), traits: ["boost"] },
    ]);
    const input = baseSelectInput({
      seed: 2,
      state: createIncidentState(2),
      collective,
      catalog,
      cadence: 1,
      traitMultipliers: { boost: { cat: 4 } },
    });

    const result = selectIncident(input);

    expect(result.selected).toEqual({
      incidentId: "solo-incident",
      performerId: "p2",
      week: 10,
    });
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

  it("canonicalizes multiplier summation before weighted incident selection", () => {
    // 0.1 + 0.2 + 0.3 differs by one ULP when reversed. Large legal base weights
    // amplify that difference across this seed's incident-selection boundary.
    const members = [
      { ...makePerformer("a-low"), traits: ["low"] },
      { ...makePerformer("b-mid"), traits: ["mid"] },
      { ...makePerformer("c-high"), traits: ["high"] },
    ];
    const catalog = [
      makeIncident("a-sensitive", { weight: 1e16, category: "sensitive" }),
      makeIncident("z-control", { weight: 3_507_956_279_061_864, category: "control" }),
    ];
    const input = baseSelectInput({
      seed: 2,
      state: createIncidentState(2),
      collective: makeCollective(members),
      catalog,
      cadence: 1,
      traitMultipliers: {
        low: { sensitive: 0.1 },
        mid: { sensitive: 0.2 },
        high: { sensitive: 0.3 },
      },
    });

    const forward = selectIncident(input);
    const reversed = selectIncident({
      ...input,
      collective: makeCollective([...members].reverse()),
    });

    expect(forward.selected?.incidentId).toBe("a-sensitive");
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
    expect(result.state.rng).toEqual([3833880565, 3797434685, 3526931618, 15]);
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

describe("resolveIncident", () => {
  /**
   * Builds a `RunState` with one incident pending for `target`. Each test picks its own
   * seed because the incident stream's first `int(1, 20)` draw is pinned by hand against
   * `rng.ts`'s primitives (probed once, then hardcoded) so check outcomes are deterministic.
   */
  function pendingRunState(params: {
    readonly seed: number | string;
    readonly week: number;
    readonly incidentId: string;
    readonly target: Performer;
    readonly others?: readonly Performer[];
    readonly org?: Org;
    readonly cooldowns?: readonly IncidentCooldown[];
  }): RunState {
    const { seed, week, incidentId, target, others = [], org = makeOrg(), cooldowns = [] } = params;
    const state = makeState(makeCollective([target, ...others]), org, week);
    return {
      ...state,
      seed,
      rng: createRng(seed).state(),
      incidents: {
        ...createIncidentState(seed),
        pending: { incidentId, performerId: target.id, week },
        cooldowns,
      },
    };
  }

  const directIncident: Incident = makeIncident("direct-inc", {
    cooldownWeeks: 2,
    choices: [
      {
        id: "direct-choice",
        label: "Direct",
        detail: "Applies at once.",
        outcome: {
          kind: "direct",
          effects: [
            { kind: "energy", amount: 5 },
            { kind: "energy", amount: 3 },
            { kind: "money", amount: 100 },
          ],
        },
      },
    ],
  });

  // Seed 5's incident stream draws 2 on its first int(1, 20); every fixture performer's
  // "mechanical" stat is 10, so the total is 12.
  const checkIncident: Incident = makeIncident("check-inc", {
    cooldownWeeks: 0,
    choices: [
      {
        id: "check-choice",
        label: "Check",
        detail: "A Mechanical check.",
        outcome: {
          kind: "check",
          stat: "mechanical",
          difficulty: 12,
          successEffects: [{ kind: "morale", amount: 4 }],
          failureEffects: [{ kind: "morale", amount: -6 }],
        },
      },
    ],
  });

  it("applies a direct choice's effects without a random draw and reports outcome direct", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "direct-inc", target });

    const result = resolveIncident({ state, catalog: [directIncident], choiceId: "direct-choice" });

    expect(result.resolution).toEqual({
      incidentId: "direct-inc",
      performerId: "solo",
      week: 10,
      choiceId: "direct-choice",
      outcome: "direct",
      effects: [
        { kind: "energy", amount: 5 },
        { kind: "energy", amount: 3 },
        { kind: "money", amount: 100 },
      ],
    });
    expect(result.resolution.roll).toBeUndefined();
    expect(result.resolution.total).toBeUndefined();
    expect(result.state.incidents.rng).toEqual(state.incidents.rng);
  });

  it("draws exactly one d20 for a checked choice and succeeds when stat plus roll equals difficulty", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 5, week: 10, incidentId: "check-inc", target });

    const result = resolveIncident({ state, catalog: [checkIncident], choiceId: "check-choice" });

    expect(result.resolution.outcome).toBe("success");
    expect(result.resolution.roll).toBe(2);
    expect(result.resolution.total).toBe(12);
    expect(result.resolution.effects).toEqual([{ kind: "morale", amount: 4 }]);
    expect(result.state.incidents.rng).not.toEqual(state.incidents.rng);
  });

  it("applies only the failure branch when the total falls short of the difficulty", () => {
    // Seed 1's incident stream draws 3 on its first int(1, 20); stat 10 + roll 3 = 13 < 14.
    const failIncident: Incident = makeIncident("check-inc", {
      cooldownWeeks: 0,
      choices: [
        {
          id: "check-choice",
          label: "Check",
          detail: "A Mechanical check.",
          outcome: {
            kind: "check",
            stat: "mechanical",
            difficulty: 14,
            successEffects: [{ kind: "morale", amount: 4 }],
            failureEffects: [{ kind: "morale", amount: -6 }],
          },
        },
      ],
    });
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 1, week: 10, incidentId: "check-inc", target });

    const result = resolveIncident({ state, catalog: [failIncident], choiceId: "check-choice" });

    expect(result.resolution.outcome).toBe("failure");
    expect(result.resolution.roll).toBe(3);
    expect(result.resolution.total).toBe(13);
    expect(result.resolution.effects).toEqual([{ kind: "morale", amount: -6 }]);
  });

  it("applies an organization effect once regardless of roster size and leaves performers untouched", () => {
    const audienceIncident: Incident = makeIncident("org-inc", {
      cooldownWeeks: 0,
      choices: [
        {
          id: "org-choice",
          label: "Org",
          detail: "Moves audience only.",
          outcome: { kind: "direct", effects: [{ kind: "audience", amount: 500 }] },
        },
      ],
    });
    const target = makePerformer("solo", 50, 50);
    const others = [makePerformer("other-1", 50, 50), makePerformer("other-2", 50, 50)];
    const org = makeOrg(1_000, 5, 100);
    const state = pendingRunState({
      seed: 7,
      week: 10,
      incidentId: "org-inc",
      target,
      others,
      org,
    });

    const result = resolveIncident({ state, catalog: [audienceIncident], choiceId: "org-choice" });

    expect(result.state.org.audience).toBe(600);
    expect(result.state.collective.members.find((m) => m.id === "solo")?.state).toEqual(
      target.state,
    );
    expect(result.state.collective.members.find((m) => m.id === "other-1")).toBe(others[0]);
    expect(result.state.collective.members.find((m) => m.id === "other-2")).toBe(others[1]);
  });

  it("moves only the pending target and keeps every other performer's reference untouched", () => {
    const target = makePerformer("solo", 50, 50);
    const others = [makePerformer("bystander", 40, 40)];
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "direct-inc", target, others });

    const result = resolveIncident({ state, catalog: [directIncident], choiceId: "direct-choice" });

    const movedTarget = result.state.collective.members.find((m) => m.id === "solo");
    expect(movedTarget?.state.energy).toBe(58);
    expect(result.state.collective.members.find((m) => m.id === "bystander")).toBe(others[0]);
  });

  it("applies stat, form, morale and reputation effects to their exact declared destinations", () => {
    const mixedIncident: Incident = makeIncident("mixed-inc", {
      cooldownWeeks: 0,
      choices: [
        {
          id: "mixed-choice",
          label: "Mixed",
          detail: "One effect for each of the remaining aggregation routes.",
          outcome: {
            kind: "direct",
            effects: [
              { kind: "stat", stat: "mechanical", amount: 2 },
              { kind: "form", amount: 1 },
              { kind: "morale", amount: -3 },
              { kind: "reputation", amount: 5 },
            ],
          },
        },
      ],
    });
    const target = makePerformer("solo", 50, 50);
    const others = [makePerformer("bystander", 40, 40)];
    const org = makeOrg(1_000, 5, 200);
    const state = pendingRunState({
      seed: 7,
      week: 10,
      incidentId: "mixed-inc",
      target,
      others,
      org,
    });

    const result = resolveIncident({ state, catalog: [mixedIncident], choiceId: "mixed-choice" });

    const movedTarget = result.state.collective.members.find((m) => m.id === "solo");
    expect(movedTarget?.stats.mechanical).toBe(12);
    expect(movedTarget?.state.form).toBe(1);
    expect(movedTarget?.state.morale).toBe(47);
    // Energy is untouched by this branch: only the declared routes moved.
    expect(movedTarget?.state.energy).toBe(50);
    expect(result.state.org.reputation).toBe(55);
    // Money and audience are untouched by this branch.
    expect(result.state.org.money).toBe(1_000);
    expect(result.state.org.audience).toBe(200);
    expect(result.state.collective.members.find((m) => m.id === "bystander")).toBe(others[0]);
  });

  it("sums repeated fields before one clamped, one-decimal-rounded application, not two sequential ones", () => {
    const fractionalIncident: Incident = makeIncident("fraction-inc", {
      cooldownWeeks: 0,
      choices: [
        {
          id: "fraction-choice",
          label: "Fraction",
          detail: "Two small energy effects.",
          outcome: {
            kind: "direct",
            effects: [
              { kind: "energy", amount: 0.05 },
              { kind: "energy", amount: 0.05 },
            ],
          },
        },
      ],
    });
    const target = makePerformer("solo", 80, 50);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "fraction-inc", target });

    const result = resolveIncident({
      state,
      catalog: [fractionalIncident],
      choiceId: "fraction-choice",
    });

    // Summed first: 80 + 0.05 + 0.05 = 80.1, rounded once. Applied sequentially, the first
    // 0.05 would already round to 80.1 and the second addition would round to 80.2.
    expect(result.state.collective.members[0]?.state.energy).toBe(80.1);
  });

  it("clamps a target's energy at the existing minimum and leaves every other performer unchanged", () => {
    const drainIncident: Incident = makeIncident("drain-inc", {
      cooldownWeeks: 0,
      choices: [
        {
          id: "drain-choice",
          label: "Drain",
          detail: "Drives energy below zero.",
          outcome: { kind: "direct", effects: [{ kind: "energy", amount: -50 }] },
        },
      ],
    });
    const target = makePerformer("solo", 20, 50);
    const others = [makePerformer("other", 20, 50)];
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "drain-inc", target, others });

    const result = resolveIncident({ state, catalog: [drainIncident], choiceId: "drain-choice" });

    expect(result.state.collective.members.find((m) => m.id === "solo")?.state.energy).toBe(0);
    expect(result.state.collective.members.find((m) => m.id === "other")).toBe(others[0]);
  });

  it("reports a choice-caused money crossing without inventing a stop reason or extra state field", () => {
    const debtIncident: Incident = makeIncident("debt-inc", {
      cooldownWeeks: 0,
      choices: [
        {
          id: "debt-choice",
          label: "Debt",
          detail: "Puts the org in the red.",
          outcome: { kind: "direct", effects: [{ kind: "money", amount: -100 }] },
        },
      ],
    });
    const target = makePerformer("solo", 50, 50);
    const org = makeOrg(0, 5, 0);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "debt-inc", target, org });

    const result = resolveIncident({ state, catalog: [debtIncident], choiceId: "debt-choice" });

    expect(result.resolution.effects).toEqual([{ kind: "money", amount: -100 }]);
    expect(result.state.org.money).toBe(-100);
    expect(result.resolution).not.toHaveProperty("reasons");
    expect(Object.keys(result.state).sort()).toEqual([
      "collective",
      "consecutiveNegativeWeeks",
      "engagements",
      "incidents",
      "org",
      "rng",
      "seed",
      "week",
    ]);
    expect(result.state.consecutiveNegativeWeeks).toBe(state.consecutiveNegativeWeeks);
  });

  it("installs a zero cooldown eligible the very next week", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 7, week: 4, incidentId: "check-inc", target });
    const zeroCooldownIncident: Incident = { ...checkIncident, cooldownWeeks: 0 };

    const result = resolveIncident({
      state,
      catalog: [zeroCooldownIncident],
      choiceId: "check-choice",
    });

    expect(result.state.incidents.cooldowns).toEqual([
      { incidentId: "check-inc", eligibleWeek: 5 },
    ]);
    expect(
      eligibleTargetIds({
        incident: zeroCooldownIncident,
        collective: result.state.collective,
        baseWeekKind: "ordinary",
        currentWeek: 4,
        cooldowns: result.state.incidents.cooldowns,
      }),
    ).toEqual([]);
    expect(
      eligibleTargetIds({
        incident: zeroCooldownIncident,
        collective: result.state.collective,
        baseWeekKind: "ordinary",
        currentWeek: 5,
        cooldowns: result.state.incidents.cooldowns,
      }),
    ).toEqual(["solo"]);
  });

  it("installs a positive cooldown and blocks another target until it expires", () => {
    const target = makePerformer("solo", 50, 50);
    const bystander = makePerformer("bystander", 50, 50);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "direct-inc", target });

    const result = resolveIncident({ state, catalog: [directIncident], choiceId: "direct-choice" });

    expect(result.state.incidents.cooldowns).toEqual([
      { incidentId: "direct-inc", eligibleWeek: 13 },
    ]);
    const otherTargetCollective = makeCollective([bystander]);
    expect(
      eligibleTargetIds({
        incident: directIncident,
        collective: otherTargetCollective,
        baseWeekKind: "ordinary",
        currentWeek: 12,
        cooldowns: result.state.incidents.cooldowns,
      }),
    ).toEqual([]);
    expect(
      eligibleTargetIds({
        incident: directIncident,
        collective: otherTargetCollective,
        baseWeekKind: "ordinary",
        currentWeek: 13,
        cooldowns: result.state.incidents.cooldowns,
      }),
    ).toEqual(["bystander"]);
  });

  it("replaces an existing cooldown entry for the same incident id and keeps sorted order", () => {
    const target = makePerformer("solo", 50, 50);
    const staleCooldowns: readonly IncidentCooldown[] = [
      { incidentId: "check-inc", eligibleWeek: 5 },
      { incidentId: "zzz-other", eligibleWeek: 99 },
    ];
    const state = pendingRunState({
      seed: 7,
      week: 10,
      incidentId: "check-inc",
      target,
      cooldowns: staleCooldowns,
    });
    const cooldownIncident: Incident = { ...checkIncident, cooldownWeeks: 2 };

    const result = resolveIncident({
      state,
      catalog: [cooldownIncident],
      choiceId: "check-choice",
    });

    expect(result.state.incidents.cooldowns).toEqual([
      { incidentId: "check-inc", eligibleWeek: 13 },
      { incidentId: "zzz-other", eligibleWeek: 99 },
    ]);
  });

  it("fails when nothing is pending", () => {
    const target = makePerformer("solo", 50, 50);
    const state: RunState = {
      ...pendingRunState({ seed: 7, week: 10, incidentId: "direct-inc", target }),
      incidents: { ...createIncidentState(7), pending: null },
    };

    expect(() =>
      resolveIncident({ state, catalog: [directIncident], choiceId: "direct-choice" }),
    ).toThrow();
  });

  it("fails when the pending incident id is not in the catalog", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "missing-inc", target });

    expect(() =>
      resolveIncident({ state, catalog: [directIncident], choiceId: "direct-choice" }),
    ).toThrow();
  });

  it("fails when the pending target is not a member of the collective", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "direct-inc", target });
    const withoutTarget: RunState = {
      ...state,
      collective: makeCollective([makePerformer("someone-else")]),
    };

    expect(() =>
      resolveIncident({
        state: withoutTarget,
        catalog: [directIncident],
        choiceId: "direct-choice",
      }),
    ).toThrow();
  });

  it("fails when the submitted choice does not belong to the pending incident", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "direct-inc", target });

    expect(() =>
      resolveIncident({ state, catalog: [directIncident], choiceId: "not-a-real-choice" }),
    ).toThrow();
  });

  it("an invalid choice fails before any rng draw or mutation of the incident stream", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 5, week: 10, incidentId: "check-inc", target });

    expect(() =>
      resolveIncident({ state, catalog: [checkIncident], choiceId: "does-not-exist" }),
    ).toThrow();

    // Nothing was drawn or mutated by the rejected attempt: the real choice on the same
    // state still sees the same first draw a fresh call would.
    const result = resolveIncident({ state, catalog: [checkIncident], choiceId: "check-choice" });
    expect(result.resolution.roll).toBe(2);
    expect(result.resolution.total).toBe(12);
  });

  it("resolving the same choice twice fails and does not apply its effects a second time", () => {
    const target = makePerformer("solo", 50, 50);
    const state = pendingRunState({ seed: 7, week: 10, incidentId: "direct-inc", target });

    const first = resolveIncident({ state, catalog: [directIncident], choiceId: "direct-choice" });
    expect(first.state.incidents.pending).toBeNull();
    expect(first.state.collective.members[0]?.state.energy).toBe(58);

    expect(() =>
      resolveIncident({ state: first.state, catalog: [directIncident], choiceId: "direct-choice" }),
    ).toThrow();
  });
});
