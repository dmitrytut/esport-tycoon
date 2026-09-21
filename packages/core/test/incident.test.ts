import { describe, expect, it } from "vitest";

import { createIncidentState, type EligibilityInput, eligibleTargetIds } from "../src/incident.ts";
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
