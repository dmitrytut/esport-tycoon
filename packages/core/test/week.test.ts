import { describe, expect, it } from "vitest";

import type { IncidentInput } from "../src/incident.ts";
import { createIncidentState } from "../src/incident.ts";
import type { SeasonCalendar } from "../src/season.ts";
import type { AdvanceOptions, RunState, StopReasonKind, WeekPlan } from "../src/week.ts";
import { advance, executeWeek, WEEKLY_ENERGY_RECOVERY } from "../src/week.ts";
import {
  makeActivity,
  makeCollective,
  makeIncident,
  makeOrg,
  makePerformer,
  makeState,
} from "./fixtures.ts";

const ids = ["a", "b", "c", "d", "e"];
const five = (energy = 80, morale = 70) => ids.map((id) => makePerformer(id, energy, morale));

const emptyWeeks = (count: number): WeekPlan => ({
  weeks: Array.from({ length: count }, () => []),
});

const calendar = (
  startWeek: number,
  markings: readonly ("none" | "contest" | "series")[],
): SeasonCalendar => ({
  startWeek,
  entries: markings.map((marking, relativeWeek) => ({
    id: { kind: "season-entry", season: 1, relativeWeek },
    relativeWeek,
    week: startWeek + relativeWeek,
    marking,
  })),
});

const unmarkedCalendar = (startWeek: number): SeasonCalendar =>
  calendar(
    startWeek,
    Array.from({ length: 100 }, () => "none"),
  );

const advanceUnmarked = (
  state: RunState,
  plan: WeekPlan,
  options: Omit<AdvanceOptions, "calendar"> = {},
) => advance(state, plan, { calendar: unmarkedCalendar(state.week), ...options });

// A threshold reason names one performer, so a five-member crisis produces five of them.
// These tests are about which kinds a week produced, not how many people crossed.
const kindsOf = (reasons: readonly { readonly kind: StopReasonKind }[]): StopReasonKind[] =>
  [...new Set(reasons.map((reason) => reason.kind))].sort();

const sour = makeActivity({
  id: "sour",
  slots: 1,
  effects: [{ kind: "morale", amount: -10 }],
});

describe("the slot pool", () => {
  it("skips an activity that does not fit and keeps going with the next", () => {
    const plan = [
      { activity: makeActivity({ id: "camp", slots: 3 }) },
      { activity: makeActivity({ id: "camp-again", slots: 3 }) },
      { activity: makeActivity({ id: "talk", slots: 1 }) },
    ];

    const { result } = executeWeek(makeState(makeCollective(five())), plan, { marking: "none" });

    expect(result.executed.map((entry) => entry.activityId)).toEqual(["camp", "talk"]);
    expect(result.skipped).toEqual([{ activityId: "camp-again", cause: "slots" }]);
    expect(result.slotsSpent).toBe(4);
  });

  it("never executes an activity larger than the whole pool", () => {
    const state = makeState(makeCollective(five()), makeOrg(10_000, 2));

    const { result } = executeWeek(state, [{ activity: makeActivity({ id: "camp", slots: 3 }) }], {
      marking: "none",
    });

    expect(result.executed).toHaveLength(0);
    expect(result.skipped).toEqual([{ activityId: "camp", cause: "slots" }]);
    expect(result.slotsSpent).toBe(0);
  });
});

describe("energy paid by participants", () => {
  it("excludes the member who cannot afford it and executes for the rest", () => {
    const members = [...five().slice(0, 4), makePerformer("e", 14)];
    const heavy = makeActivity({ id: "camp", slots: 1, energy: 30 });

    const outcome = executeWeek(makeState(makeCollective(members)), [{ activity: heavy }], {
      marking: "none",
    });
    const after = outcome.state.collective.members;

    expect(outcome.result.executed).toEqual([
      { activityId: "camp", participantIds: ["a", "b", "c", "d"], excludedIds: ["e"] },
    ]);
    // Everyone recovers at the end of the week; only the four paid the 30.
    expect(after.slice(0, 4).map((member) => member.state.energy)).toEqual([65, 65, 65, 65]);
    expect(after[4]?.state.energy).toBe(14 + WEEKLY_ENERGY_RECOVERY);
  });

  it("skips the activity and spends no slot when nobody can afford it", () => {
    const state = makeState(makeCollective(five(10)));
    const heavy = makeActivity({ id: "camp", slots: 2, energy: 30 });

    const { result } = executeWeek(state, [{ activity: heavy }], { marking: "none" });

    expect(result.executed).toHaveLength(0);
    expect(result.skipped).toEqual([{ activityId: "camp", cause: "energy" }]);
    expect(result.slotsSpent).toBe(0);
  });
});

describe("effects", () => {
  it("moves people, and moves the org once rather than once per participant", () => {
    const rich = makeActivity({
      id: "showcase",
      slots: 1,
      energy: 10,
      effects: [
        { kind: "stat", stat: "collective", amount: 0.5 },
        { kind: "morale", amount: 4 },
        { kind: "money", amount: 100 },
        { kind: "reputation", amount: 3 },
      ],
    });

    const outcome = executeWeek(makeState(makeCollective(five())), [{ activity: rich }], {
      marking: "none",
    });
    const first = outcome.state.collective.members[0];

    expect(first?.stats.collective).toBe(10.5);
    expect(first?.state.morale).toBe(74);
    expect(first?.state.energy).toBe(80 - 10 + WEEKLY_ENERGY_RECOVERY);
    expect(outcome.state.org.money).toBe(10_100);
    expect(outcome.state.org.reputation).toBe(53);
  });

  it("credits a flat money effect regardless of the audience", () => {
    const activity = makeActivity({
      id: "flat-fee",
      effects: [{ kind: "money", amount: 400, scale: "flat" }],
    });
    const state = makeState(makeCollective(five()), makeOrg(10_000, 5, 50_000));

    expect(executeWeek(state, [{ activity }], { marking: "none" }).state.org.money).toBe(10_400);
  });

  it("scales audience-driven money by the current reach", () => {
    const stream = makeActivity({
      id: "stream",
      effects: [{ kind: "money", amount: 5_000, scale: "audience" }],
    });
    const unknown = makeState(makeCollective(five()), makeOrg(10_000, 5, 0));
    const established = makeState(makeCollective(five()), makeOrg(10_000, 5, 50_000));

    expect(executeWeek(unknown, [{ activity: stream }], { marking: "none" }).state.org.money).toBe(
      10_000,
    );
    expect(
      executeWeek(established, [{ activity: stream }], { marking: "none" }).state.org.money,
    ).toBe(12_500);
  });

  it("keeps a finite high-audience payout below its base after money normalization", () => {
    const activity = makeActivity({
      id: "large-reach",
      effects: [{ kind: "money", amount: 1, scale: "audience" }],
    });
    const state = makeState(makeCollective(five()), makeOrg(0, 5, 1_000_000_000));

    expect(executeWeek(state, [{ activity }], { marking: "none" }).state.org.money).toBe(0.9);
  });

  it("uses audience gained earlier in the same week for later income", () => {
    const grow = makeActivity({
      id: "grow",
      effects: [{ kind: "audience", amount: 400 }],
    });
    const campaign = makeActivity({
      id: "campaign",
      effects: [{ kind: "money", amount: 5_000, scale: "audience" }],
    });
    const state = makeState(makeCollective(five()), makeOrg(10_000, 5, 50_000));

    const outcome = executeWeek(state, [{ activity: grow }, { activity: campaign }], {
      marking: "none",
    });

    expect(outcome.state.org.audience).toBe(50_400);
    expect(outcome.state.org.money).toBe(12_510);
  });

  it("moves audience once rather than once per participant", () => {
    const grow = makeActivity({
      id: "grow",
      effects: [{ kind: "audience", amount: 400 }],
    });
    const state = makeState(makeCollective(five().slice(0, 4)), makeOrg(10_000, 5, 100));

    expect(executeWeek(state, [{ activity: grow }], { marking: "none" }).state.org.audience).toBe(
      500,
    );
  });

  it("leaves audience unchanged across weeks without an audience effect", () => {
    const state = makeState(makeCollective(five()), makeOrg(10_000, 5, 750));

    expect(advanceUnmarked(state, emptyWeeks(4)).state.org.audience).toBe(750);
  });

  it("aims a member activity at the one named", () => {
    const drill = makeActivity({
      id: "drill",
      target: "member",
      effects: [{ kind: "stat", stat: "mechanical", amount: 0.3 }],
    });

    const outcome = executeWeek(
      makeState(makeCollective(five())),
      [{ activity: drill, memberId: "c" }],
      { marking: "none" },
    );

    expect(outcome.state.collective.members.map((member) => member.stats.mechanical)).toEqual([
      10, 10, 10.3, 10, 10,
    ]);
  });
});

describe("the week tick is the only source of recovery", () => {
  it("raises energy by exactly the weekly recovery and changes nothing else", () => {
    const state = makeState(makeCollective(five()));

    const after = executeWeek(state, [], { marking: "none" }).state.collective.members[0];

    expect(after?.state).toEqual({ energy: 80 + WEEKLY_ENERGY_RECOVERY, morale: 70, form: 0 });
    expect(after?.stats).toEqual(state.collective.members[0]?.stats);
  });

  it("leaves the state it was handed untouched, so reading twice reads the same run", () => {
    const state = makeState(makeCollective(five()));
    const snapshot = JSON.stringify(state);

    executeWeek(state, [{ activity: sour }], { marking: "none" });
    executeWeek(state, [{ activity: sour }], { marking: "none" });

    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("stop reasons", () => {
  it("fires a threshold reason on the way down and not once more while the value stays low", () => {
    const state = makeState(makeCollective(five(80, 35)));
    const plan: WeekPlan = {
      weeks: [
        [{ activity: sour }],
        [{ activity: sour }],
        [{ activity: sour }],
        [{ activity: sour }],
      ],
    };

    const result = advanceUnmarked(state, plan, { sensitivity: { masked: ["morale-threshold"] } });

    expect(kindsOf(result.weeks[0]?.reasons ?? [])).toContain("morale-threshold");
    expect(kindsOf(result.weeks[1]?.reasons ?? [])).not.toContain("morale-threshold");
    expect(kindsOf(result.weeks[2]?.reasons ?? [])).not.toContain("morale-threshold");
    expect(result.stoppedAt).toBe(3);
  });

  it("fires again after the value climbed back and fell a second time", () => {
    const lift = makeActivity({ id: "lift", effects: [{ kind: "morale", amount: 15 }] });
    const dive = makeActivity({ id: "dive", effects: [{ kind: "morale", amount: -15 }] });

    const first = executeWeek(makeState(makeCollective(five(80, 35))), [{ activity: sour }], {
      marking: "none",
    });
    const back = executeWeek(first.state, [{ activity: lift }], { marking: "none" });
    const again = executeWeek(back.state, [{ activity: dive }], { marking: "none" });

    expect(kindsOf(first.result.reasons)).toContain("morale-threshold");
    expect(kindsOf(back.result.reasons)).not.toContain("morale-threshold");
    expect(kindsOf(again.result.reasons)).toContain("morale-threshold");
  });

  it("reports both reasons when one week produces two", () => {
    const state = makeState(makeCollective(five(40)), makeOrg(10_000, 2));
    const drain = makeActivity({ id: "drain", slots: 1, energy: 35 });
    const heavy = makeActivity({ id: "heavy", slots: 2 });

    const { result } = executeWeek(state, [{ activity: drain }, { activity: heavy }], {
      marking: "none",
    });

    expect(kindsOf(result.reasons)).toEqual(["activity-skipped", "energy-threshold"]);
  });

  it("reports the balance falling through zero once, not every week it stays under", () => {
    const bill = makeActivity({ id: "bill", effects: [{ kind: "money", amount: -250 }] });
    const state = makeState(makeCollective(five()), makeOrg(100));

    const first = executeWeek(state, [{ activity: bill }], { marking: "none" });
    const second = executeWeek(first.state, [{ activity: bill }], { marking: "none" });

    expect(first.state.org.money).toBe(-150);
    expect(kindsOf(first.result.reasons)).toContain("money-negative");
    expect(second.state.org.money).toBe(-400);
    expect(kindsOf(second.result.reasons)).not.toContain("money-negative");
  });

  it("stops the week before a contested one", () => {
    const state = makeState(makeCollective(five()));
    const result = advance(state, emptyWeeks(4), {
      calendar: calendar(0, ["none", "series", "none", "none"]),
    });

    expect(result.reasons).toEqual([{ kind: "contest-ahead", marking: "series" }]);
  });
});

describe("incident selection", () => {
  const soloInput = (incident = makeIncident("brawl")): IncidentInput => ({
    catalog: [incident],
    cadence: 1,
    traitMultipliers: {},
  });

  /** A run whose incident lifecycle already has one incident awaiting a choice. */
  const pendingState = (): RunState => ({
    ...makeState(makeCollective(five())),
    incidents: {
      ...createIncidentState(42),
      pending: { incidentId: "old", performerId: "a", week: 0 },
    },
  });

  it("selects an incident and reports both its id and its target", () => {
    const state = makeState(makeCollective([makePerformer("solo")]));

    const { state: next, result } = executeWeek(state, [], {
      marking: "none",
      incidentInput: soloInput(),
    });

    expect(result.reasons).toEqual([
      { kind: "incident-pending", incidentId: "brawl", performerId: "solo" },
    ]);
    // The returned state's own incident lifecycle must carry the same identity, not just
    // the week result: a caller resumes from `next`, not from `result.reasons`.
    expect(next.incidents.pending).toEqual({ incidentId: "brawl", performerId: "solo", week: 0 });
    expect(next.incidents.rng).not.toEqual(state.incidents.rng);
  });

  it("reads the base kind as quiet for eligibility while the final kind becomes ordinary", () => {
    const state = makeState(makeCollective([makePerformer("solo")]));
    const incident = makeIncident("brawl", { conditions: { baseWeekKind: ["quiet"] } });

    const { result } = executeWeek(state, [], {
      marking: "none",
      incidentInput: soloInput(incident),
    });

    // Only reachable if eligibility saw `quiet`: a `quiet`-only condition would exclude
    // "solo" entirely had the engine already counted its own pending reason.
    expect(result.reasons).toEqual([
      { kind: "incident-pending", incidentId: "brawl", performerId: "solo" },
    ]);
    expect(result.kind).toBe("ordinary");
  });

  it("selects alongside an already-produced reason, keeping both", () => {
    const state = makeState(makeCollective([makePerformer("solo")]));

    const result = advance(state, emptyWeeks(4), {
      calendar: calendar(0, ["none", "contest", "none", "none"]),
      incidentInput: soloInput(),
    });

    expect(kindsOf(result.reasons)).toEqual(["contest-ahead", "incident-pending"]);
  });

  it.each([
    {
      boundary: "contest-ahead",
      calendar: calendar(0, ["none", "contest", "none", "none"]),
      reasons: ["contest-ahead", "incident-pending"],
    },
    {
      boundary: "season-ended",
      calendar: calendar(0, ["none"]),
      reasons: ["incident-pending", "season-ended"],
    },
    {
      boundary: "block-ran-out",
      calendar: calendar(0, ["none", "none", "none", "none"]),
      reasons: ["block-ran-out", "incident-pending", "season-ended"],
    },
  ])("includes $boundary in incident base-kind eligibility", ({ calendar, reasons }) => {
    const state = makeState(makeCollective([makePerformer("solo")]));
    const ordinaryOnly = makeIncident("ordinary", {
      conditions: { baseWeekKind: ["ordinary"] },
    });

    const result = advance(state, emptyWeeks(4), {
      calendar,
      incidentInput: soloInput(ordinaryOnly),
    });

    expect(kindsOf(result.reasons)).toEqual(reasons);
  });

  it("draws no incident rng and leaves the incident lifecycle untouched without incident input", () => {
    const state = makeState(makeCollective([makePerformer("solo")]));

    const { state: next } = executeWeek(state, [], { marking: "none" });

    expect(next.incidents).toEqual(state.incidents);
  });

  it("rejects executeWeek outright when an incident is already pending", () => {
    const state = pendingState();
    const before = structuredClone(state);

    expect(() => executeWeek(state, [{ activity: sour }], { marking: "none" })).toThrow(/pending/);
    expect(state).toEqual(before);
  });

  it("rejects advance before plan validation when an incident is already pending", () => {
    const state = pendingState();
    const before = structuredClone(state);

    // A three-week plan would otherwise fail its own "4 to 6 weeks" check; the pending
    // error must win that race, proving the guard runs first.
    expect(() => advanceUnmarked(state, emptyWeeks(3))).toThrow(/pending/);
    expect(state).toEqual(before);
  });

  it("rejects advance before sensitivity validation when an incident is already pending", () => {
    const state = pendingState();

    expect(() =>
      advanceUnmarked(state, emptyWeeks(4), { sensitivity: { masked: ["incident-pending"] } }),
    ).toThrow(/pending/);
  });

  it("stops the block at the week an incident is selected, leaving later weeks unexecuted", () => {
    const state = makeState(makeCollective([makePerformer("solo")]));

    const result = advanceUnmarked(state, emptyWeeks(4), { incidentInput: soloInput() });

    expect(result.weeks).toHaveLength(1);
    expect(result.stoppedAt).toBe(0);
    expect(kindsOf(result.reasons)).toEqual(["incident-pending"]);
  });
});

describe("the plan", () => {
  it("rejects a block of three weeks before any week is advanced", () => {
    const state = makeState(makeCollective(five()));

    expect(() => advanceUnmarked(state, emptyWeeks(3))).toThrow(/4 to 6 weeks/);
  });

  it("accepts a block of six weeks", () => {
    const state = makeState(makeCollective(five()));

    expect(advanceUnmarked(state, emptyWeeks(6)).weeks).toHaveLength(6);
  });

  it("rejects a member activity that names nobody", () => {
    const state = makeState(makeCollective(five()));
    const drill = makeActivity({ id: "drill", target: "member" });
    const plan: WeekPlan = { weeks: [[{ activity: drill }], [], [], []] };

    expect(() => advanceUnmarked(state, plan)).toThrow(/needs a member/);
  });

  it("rejects a mask that suppresses a reason the user may not miss", () => {
    const state = makeState(makeCollective(five()));

    expect(() =>
      advanceUnmarked(state, emptyWeeks(4), { sensitivity: { masked: ["incident-pending"] } }),
    ).toThrow(/cannot be masked/);
  });
});

describe("advancing", () => {
  it("passes quiet weeks in one call and stops at the first week with a reason", () => {
    const state = makeState(makeCollective(five(80, 35)));
    const plan: WeekPlan = { weeks: [[], [], [], [{ activity: sour }], []] };

    const result = advanceUnmarked(state, plan);

    expect(result.weeks).toHaveLength(4);
    expect(result.stoppedAt).toBe(3);
    expect(kindsOf(result.reasons)).toEqual(["morale-threshold"]);
    expect(result.state.week).toBe(4);
  });

  it("stops at the end of a block that produced nothing", () => {
    const result = advanceUnmarked(makeState(makeCollective(five())), emptyWeeks(4));

    expect(result.weeks).toHaveLength(4);
    expect(result.stoppedAt).toBe(3);
    expect(result.reasons).toEqual([{ kind: "block-ran-out" }]);
    expect(result.kinds).toEqual({ quiet: 3, ordinary: 1, contest: 0, series: 0 });
  });

  it("walks past a masked reason and still records it in that week", () => {
    const state = makeState(makeCollective(five(80, 35)));
    const plan: WeekPlan = { weeks: [[], [{ activity: sour }], [], []] };

    const result = advanceUnmarked(state, plan, { sensitivity: { masked: ["morale-threshold"] } });

    expect(result.weeks).toHaveLength(4);
    expect(result.stoppedAt).toBe(3);
    expect(kindsOf(result.weeks[1]?.reasons ?? [])).toEqual(["morale-threshold"]);
  });
});

describe("week kind", () => {
  it("labels a week that spends nothing and produces nothing quiet", () => {
    expect(
      executeWeek(makeState(makeCollective(five())), [], { marking: "none" }).result.kind,
    ).toBe("quiet");
  });

  it("labels a week that spent a slot ordinary", () => {
    const { result } = executeWeek(
      makeState(makeCollective(five())),
      [{ activity: makeActivity({ id: "talk" }) }],
      { marking: "none" },
    );

    expect(result.kind).toBe("ordinary");
  });

  it("labels an identical week the same way whatever came before it", () => {
    const collective = makeCollective(five());
    const early = makeState(collective, makeOrg(), 0);
    const late = makeState(collective, makeOrg(), 2);
    expect(executeWeek(early, [], { marking: "contest" }).result.kind).toBe("contest");
    expect(executeWeek(late, [], { marking: "contest" }).result.kind).toBe("contest");
    expect(executeWeek(early, [], { marking: "none" }).result.kind).toBe(
      executeWeek(late, [], { marking: "none" }).result.kind,
    );
  });

  it("counts the kinds of a run without any rule having read the counts", () => {
    const state = makeState(makeCollective(five()));

    const result = advance(state, emptyWeeks(4), {
      calendar: calendar(0, ["none", "none", "series", "none"]),
    });

    // Week 1 stops the advance: the calendar marks week 2 ahead of it.
    expect(result.weeks.map((week) => week.kind)).toEqual(["quiet", "ordinary"]);
    expect(result.kinds).toEqual({ quiet: 1, ordinary: 1, contest: 0, series: 0 });
  });
});

describe("bounded season calendar", () => {
  it("classifies one-week execution from its explicit current marking", () => {
    const state = makeState(makeCollective(five()));

    expect(executeWeek(state, [], { marking: "series" }).result.kind).toBe("series");
  });

  it("returns control before the next marked calendar entry", () => {
    const state = makeState(makeCollective(five()), makeOrg(), 10);
    const result = advance(state, emptyWeeks(4), {
      calendar: calendar(10, ["none", "contest", "none", "none"]),
    });

    expect(result.weeks).toHaveLength(1);
    expect(result.reasons).toEqual([{ kind: "contest-ahead", marking: "contest" }]);
  });

  it("keeps coincident contest-ahead and incident reasons", () => {
    const state = makeState(makeCollective([makePerformer("solo")]), makeOrg(), 10);
    const result = advance(state, emptyWeeks(4), {
      calendar: calendar(10, ["none", "series", "none", "none"]),
      incidentInput: {
        catalog: [makeIncident("brawl")],
        cadence: 1,
        traitMultipliers: {},
      },
    });

    expect(kindsOf(result.reasons)).toEqual(["contest-ahead", "incident-pending"]);
  });

  it("marks the final calendar week and truncates the remaining plan", () => {
    const state = makeState(makeCollective(five()), makeOrg(), 20);
    const result = advance(state, emptyWeeks(4), {
      calendar: calendar(20, ["series"]),
    });

    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0]?.kind).toBe("series");
    expect(kindsOf(result.reasons)).toEqual(["season-ended"]);
    expect(result.state.week).toBe(21);
  });

  it("keeps every coincident final-week reason", () => {
    const state = makeState(makeCollective([makePerformer("solo")]), makeOrg(), 20);
    const result = advance(state, emptyWeeks(4), {
      calendar: calendar(20, ["contest"]),
      incidentInput: {
        catalog: [makeIncident("brawl")],
        cadence: 1,
        traitMultipliers: {},
      },
    });

    expect(kindsOf(result.reasons)).toEqual(["incident-pending", "season-ended"]);
  });

  it("rejects masking the season boundary", () => {
    const state = makeState(makeCollective(five()));

    expect(() =>
      advance(state, emptyWeeks(4), {
        calendar: calendar(0, ["none", "none", "none", "none"]),
        sensitivity: { masked: ["season-ended"] },
      }),
    ).toThrow(/cannot be masked/);
  });

  it("rejects a raw marking array instead of a bounded calendar", () => {
    const state = makeState(makeCollective(five()));

    expect(() =>
      Reflect.apply(advance, undefined, [state, emptyWeeks(4), { calendar: ["none"] }]),
    ).toThrow(/calendar/);
  });
});
