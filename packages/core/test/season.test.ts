import { describe, expect, it } from "vitest";

import { createIncidentState } from "../src/incident.ts";
import { createRng } from "../src/rng.ts";
import type { ActiveSeason, Season, SeasonTemplate } from "../src/season.ts";
import {
  advanceSeason,
  recordSeasonContestFact,
  startNextSeason,
  startSeason,
} from "../src/season.ts";
import type { RunState, WeekPlan } from "../src/week.ts";
import { advance } from "../src/week.ts";
import {
  makeActivity,
  makeCollective,
  makeEngagement,
  makeOrg,
  makePerformer,
  makeState,
} from "./fixtures.ts";

const fixedTemplate: SeasonTemplate = {
  id: "fixed",
  length: 8,
  markings: {
    contest: { min: 3, max: 3 },
    series: { min: 2, max: 2 },
  },
};

const variableTemplate: SeasonTemplate = {
  id: "variable",
  length: 24,
  markings: {
    contest: { min: 6, max: 8 },
    series: { min: 2, max: 2 },
  },
};

const emptyPlan: WeekPlan = { weeks: [[], [], [], []] };

const allNoneTemplate: SeasonTemplate = {
  id: "all-none",
  length: 4,
  markings: {
    contest: { min: 0, max: 0 },
    series: { min: 0, max: 0 },
  },
};

const allMarkedTemplate: SeasonTemplate = {
  id: "all-marked",
  length: 4,
  markings: {
    contest: { min: 4, max: 4 },
    series: { min: 0, max: 0 },
  },
};

const activeSeason = (
  run: RunState,
  template: SeasonTemplate = allNoneTemplate,
  target = 0,
): ActiveSeason =>
  startSeason({
    number: 1,
    startWeek: run.week,
    template,
    goal: { kind: "minimum-contest-wins", target },
    seed: run.seed,
    rngState: createRng(run.seed).stream("season-calendar").state(),
  });
const streamState = (seed: string) => createRng(seed).stream("season-calendar").state();

const start = (
  template: SeasonTemplate = fixedTemplate,
  seed = "calendar-seed",
  rngState = streamState(seed),
) =>
  startSeason({
    number: 3,
    startWeek: 40,
    template,
    goal: { kind: "minimum-contest-wins", target: 2 },
    seed,
    rngState,
  });

describe("season calendar construction", () => {
  it("materializes every week once with exact fixed marking counts", () => {
    const season = start();
    const entries = season.calendar.entries;

    expect(entries).toHaveLength(8);
    expect(entries.map((entry) => entry.relativeWeek)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(entries.map((entry) => entry.week)).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
    expect(entries.filter((entry) => entry.marking === "contest")).toHaveLength(3);
    expect(entries.filter((entry) => entry.marking === "series")).toHaveLength(2);
    expect(entries.filter((entry) => entry.marking === "none")).toHaveLength(3);
    expect(new Set(entries.map((entry) => JSON.stringify(entry.id))).size).toBe(entries.length);
  });

  it("derives stable entry identities from season number and relative week", () => {
    expect(start().calendar.entries.map((entry) => entry.id)).toEqual(
      Array.from({ length: 8 }, (_, relativeWeek) => ({
        kind: "season-entry",
        season: 3,
        relativeWeek,
      })),
    );
  });

  it("replays the same calendar and continuation from the same inputs", () => {
    expect(start(variableTemplate)).toEqual(start(variableTemplate));
  });

  it("is reproducible from another stream state and returns its continuation", () => {
    const rng = createRng("calendar-seed").stream("season-calendar");
    rng.nextUint32();
    const laterState = rng.state();
    const first = start(variableTemplate, "calendar-seed", laterState);
    const replay = start(variableTemplate, "calendar-seed", laterState);

    expect(first).toEqual(replay);
    expect(first.calendarRng).not.toEqual(laterState);
  });

  it.each([
    ["non-positive length", { ...fixedTemplate, length: 0 }],
    [
      "reversed range",
      {
        ...fixedTemplate,
        markings: { ...fixedTemplate.markings, contest: { min: 4, max: 3 } },
      },
    ],
    [
      "non-integer range",
      {
        ...fixedTemplate,
        markings: { ...fixedTemplate.markings, series: { min: 1.5, max: 2 } },
      },
    ],
    [
      "maximums beyond length",
      {
        ...fixedTemplate,
        markings: { contest: { min: 3, max: 7 }, series: { min: 2, max: 2 } },
      },
    ],
  ])("rejects an invalid template (%s) without changing the supplied state", (_label, template) => {
    const rngState = streamState("invalid-template");
    const before = [...rngState];

    expect(() => start(template, "invalid-template", rngState)).toThrow();
    expect(rngState).toEqual(before);
  });

  it("rejects a goal beyond all marked entries without changing the supplied state", () => {
    const rngState = streamState("invalid-goal");
    const before = [...rngState];

    expect(() =>
      startSeason({
        number: 1,
        startWeek: 0,
        template: fixedTemplate,
        goal: { kind: "minimum-contest-wins", target: 6 },
        seed: "invalid-goal",
        rngState,
      }),
    ).toThrow();
    expect(rngState).toEqual(before);
  });

  it("rejects a negative or fractional goal before drawing", () => {
    const rngState = streamState("invalid-goal-shape");

    expect(() =>
      startSeason({
        number: 1,
        startWeek: 0,
        template: fixedTemplate,
        goal: { kind: "minimum-contest-wins", target: -1 },
        seed: "invalid-goal-shape",
        rngState,
      }),
    ).toThrow();
    expect(() =>
      startSeason({
        number: 1,
        startWeek: 0,
        template: fixedTemplate,
        goal: { kind: "minimum-contest-wins", target: 1.5 },
        seed: "invalid-goal-shape",
        rngState,
      }),
    ).toThrow();
  });
});

describe("season lifecycle", () => {
  it("delegates one block to advance and folds only its returned observations", () => {
    const run = makeState(makeCollective([makePerformer("solo", 10)]));
    const season = activeSeason(run);
    const direct = advance(run, emptyPlan, { calendar: season.calendar });

    const outcome = advanceSeason(run, season, emptyPlan);

    expect(outcome.runState).toEqual(direct.state);
    expect(outcome.season.position).toBe(direct.weeks.length);
    expect(outcome.season.kinds).toEqual(direct.kinds);
    expect(outcome.season.totalWeeks).toBe(4);
    expect(outcome.season.uninterruptedWeeks).toBe(3);
    expect(outcome.advance).toEqual(direct);
  });

  it("counts an ordinary planned week as uninterrupted when control does not return", () => {
    const run = makeState(makeCollective([makePerformer("solo", 10)]));
    const season = activeSeason(run);
    const plan: WeekPlan = {
      weeks: [[{ activity: makeActivity({ id: "routine" }) }], [], [], []],
    };

    const outcome = advanceSeason(run, season, plan);

    expect(outcome.season.kinds).toEqual({ quiet: 2, ordinary: 2, contest: 0, series: 0 });
    expect(outcome.season.uninterruptedWeeks).toBe(3);
  });

  it("rejects a relative and absolute clock mismatch without changing either input", () => {
    const run = makeState(makeCollective([makePerformer("solo")]), makeOrg(), 1);
    const season = activeSeason({ ...run, week: 0 });
    const beforeRun = structuredClone(run);
    const beforeSeason = structuredClone(season);

    expect(() => advanceSeason(run, season, emptyPlan)).toThrow(/position|clock/);
    expect(run).toEqual(beforeRun);
    expect(season).toEqual(beforeSeason);
  });

  it("accepts current and past marked facts and rejects future, unmarked and duplicate facts", () => {
    const run = makeState(makeCollective([makePerformer("solo")]));
    const season = activeSeason(run, allMarkedTemplate, 1);
    const [first, second] = season.calendar.entries;
    if (first === undefined || second === undefined) throw new Error("test calendar is incomplete");
    const snapshot = structuredClone(season);

    expect(() => recordSeasonContestFact(season, { entryId: second.id, outcome: "win" })).toThrow(
      /future/,
    );
    expect(season).toEqual(snapshot);

    const current = recordSeasonContestFact(season, { entryId: first.id, outcome: "win" });
    expect(current.facts).toEqual([{ entryId: first.id, outcome: "win" }]);
    expect(() => recordSeasonContestFact(current, { entryId: first.id, outcome: "loss" })).toThrow(
      /already/,
    );

    const advanced = advanceSeason(run, season, emptyPlan);
    const past = recordSeasonContestFact(advanced.season, {
      entryId: first.id,
      outcome: "draw",
    });
    expect(past.facts).toEqual([{ entryId: first.id, outcome: "draw" }]);

    const unmarked = activeSeason(run);
    const unmarkedEntry = unmarked.calendar.entries[0];
    if (unmarkedEntry === undefined) throw new Error("test calendar is incomplete");
    expect(() =>
      recordSeasonContestFact(unmarked, { entryId: unmarkedEntry.id, outcome: "win" }),
    ).toThrow(/unmarked/);
  });

  it("evaluates the declared win goal from facts accepted on either side of execution", () => {
    let run = makeState(makeCollective([makePerformer("solo")]));
    let season: Season = activeSeason(run, allMarkedTemplate, 2);
    const outcomes = ["win", "loss", "win", "draw"] as const;

    for (let index = 0; index < outcomes.length; index += 1) {
      if (season.kind !== "active") throw new Error("season completed before its final week");
      const entry = season.calendar.entries[index];
      const outcome = outcomes[index];
      if (entry === undefined || outcome === undefined) throw new Error("test data is incomplete");
      if (index % 2 === 0) {
        season = recordSeasonContestFact(season, { entryId: entry.id, outcome });
      }
      const advanced = advanceSeason(run, season, emptyPlan);
      run = advanced.runState;
      season = advanced.season;
      if (index % 2 === 1) {
        season = recordSeasonContestFact(season, { entryId: entry.id, outcome });
      }
    }

    expect(season.kind).toBe("completed");
    if (season.kind !== "completed") throw new Error("season must be complete");
    expect(season.result.achieved).toBe(true);
    expect(season.result.facts.map((fact) => fact.outcome)).toEqual(outcomes);
  });

  it("holds the final boundary until every marked fact exists", () => {
    let run = makeState(makeCollective([makePerformer("solo")]));
    let season: Season = activeSeason(run, allMarkedTemplate, 0);

    while (season.kind === "active" && season.position < season.calendar.entries.length) {
      const advanced = advanceSeason(run, season, emptyPlan);
      run = advanced.runState;
      season = advanced.season;
    }

    expect(season.kind).toBe("active");
    expect(season.position).toBe(4);
    if (season.kind !== "active") throw new Error("facts should hold completion");
    expect(() => advanceSeason(run, season, emptyPlan)).toThrow(/facts|boundary/);

    for (const entry of season.calendar.entries) {
      season = recordSeasonContestFact(season, { entryId: entry.id, outcome: "loss" });
    }
    expect(season.kind).toBe("completed");
  });

  it("produces reconciled counts and immutable repeated reads", () => {
    const run = makeState(makeCollective([makePerformer("solo")]));
    const completed = advanceSeason(run, activeSeason(run), emptyPlan).season;

    expect(completed.kind).toBe("completed");
    if (completed.kind !== "completed") throw new Error("season must be complete");
    const firstRead = structuredClone(completed.result);
    const secondRead = structuredClone(completed.result);
    const kinds = completed.result.kinds;
    expect(kinds.quiet + kinds.ordinary + kinds.contest + kinds.series).toBe(4);
    expect(completed.result.uninterruptedWeeks).toBe(3);
    expect(completed.result.totalWeeks).toBe(4);
    expect(completed.result.uninterruptedShare).toBe(0.75);
    expect(firstRead).toEqual(secondRead);
  });

  it("preserves the run and resets only season-owned fields at an explicit next season", () => {
    const initial = makeState(
      makeCollective([makePerformer("solo", 37, 42)]),
      makeOrg(-100, 5, 678),
    );
    const run = { ...initial, consecutiveNegativeWeeks: 2 };
    const completed = advanceSeason(run, activeSeason(run), emptyPlan);
    if (completed.season.kind !== "completed") throw new Error("season must be complete");
    const completedSeason = completed.season;
    const pendingRun: RunState = {
      ...completed.runState,
      incidents: {
        ...createIncidentState(completed.runState.seed),
        pending: { incidentId: "pending", performerId: "solo", week: 3 },
      },
    };

    expect(() =>
      startNextSeason({
        runState: pendingRun,
        season: completedSeason,
        template: allNoneTemplate,
        goal: { kind: "minimum-contest-wins", target: 0 },
      }),
    ).toThrow(/pending/);

    expect(() =>
      startNextSeason({
        runState: { ...completed.runState, week: completed.runState.week + 1 },
        season: completedSeason,
        template: allNoneTemplate,
        goal: { kind: "minimum-contest-wins", target: 0 },
      }),
    ).toThrow(/clock|week/);

    const next = startNextSeason({
      runState: completed.runState,
      season: completedSeason,
      template: allNoneTemplate,
      goal: { kind: "minimum-contest-wins", target: 0 },
    });

    expect(next.runState).toEqual(completed.runState);
    expect(next.season.kind).toBe("active");
    expect(next.season.number).toBe(2);
    expect(next.season.startWeek).toBe(completed.runState.week);
    expect(next.season.position).toBe(0);
    expect(next.season.kinds).toEqual({ quiet: 0, ordinary: 0, contest: 0, series: 0 });
    expect(next.season.facts).toEqual([]);
    expect(next.runState.collective.members[0]?.age).toBe(run.collective.members[0]?.age);
    expect(next.runState.rng).toEqual(completed.runState.rng);
    expect(next.runState.engagements).toEqual(completed.runState.engagements);
    expect(next.runState.consecutiveNegativeWeeks).toBe(
      completed.runState.consecutiveNegativeWeeks,
    );
  });

  it("holds the boundary for a final-week expiration with incident-first rejection", () => {
    const initial = makeState(makeCollective([makePerformer("solo")]));
    const run: RunState = {
      ...initial,
      engagements: [
        makeEngagement("solo", initial.collective.id, {
          id: "term-solo",
          startsAtWeek: 0,
          endsBeforeWeek: 4,
          weeklyRate: 10,
        }),
      ],
    };
    const completed = advanceSeason(run, activeSeason(run), emptyPlan);
    if (completed.season.kind !== "completed") throw new Error("season must be complete");
    const beforeRun = structuredClone(completed.runState);
    const beforeSeason = structuredClone(completed.season);
    const input = {
      runState: completed.runState,
      season: completed.season,
      template: allNoneTemplate,
      goal: { kind: "minimum-contest-wins" as const, target: 0 },
    };

    expect(() =>
      startNextSeason({
        ...input,
        runState: {
          ...completed.runState,
          incidents: {
            ...completed.runState.incidents,
            pending: { incidentId: "pending", performerId: "solo", week: 3 },
          },
        },
      }),
    ).toThrow(/pending/);
    expect(() => startNextSeason(input)).toThrow(/cover.*week 4/i);
    expect(completed.runState).toEqual(beforeRun);
    expect(completed.season).toEqual(beforeSeason);
  });
});
