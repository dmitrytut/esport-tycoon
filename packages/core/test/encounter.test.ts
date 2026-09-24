import { describe, expect, it } from "vitest";

import { CONTEST_STREAM_NAME, type ContestId, type ContestRules } from "../src/contest.ts";
import {
  ENCOUNTER_STREAM_NAME,
  type EncounterDefinition,
  materializeEncounterField,
  openEncounter,
  settleEncounter,
} from "../src/encounter.ts";
import type { OriginProfile } from "../src/generate.ts";
import { createRng } from "../src/rng.ts";
import {
  type ActiveSeason,
  advanceSeason,
  recordSeasonContestFact,
  type Season,
  type SeasonTemplate,
  startNextSeason,
  startSeason,
} from "../src/season.ts";
import type { RunState } from "../src/week.ts";
import { makeCollective, makeOrg, makePerformer, makeState } from "./fixtures.ts";

/** Every entry of this template's four weeks is marked `contest`, none `series`. */
const allContestTemplate: SeasonTemplate = {
  id: "all-contest",
  length: 4,
  markings: {
    contest: { min: 4, max: 4 },
    series: { min: 0, max: 0 },
  },
};

/** Every entry of this template's four weeks is marked `series`, none `contest`. */
const allSeriesTemplate: SeasonTemplate = {
  id: "all-series",
  length: 4,
  markings: {
    contest: { min: 0, max: 0 },
    series: { min: 4, max: 4 },
  },
};

const activeSeason = (
  run: RunState,
  template: SeasonTemplate = allContestTemplate,
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

/** A minimal valid origin, overridable field by field. */
function origin(id: string, fields: Partial<OriginProfile> = {}): OriginProfile {
  return {
    id,
    language: "en",
    secondLanguages: [],
    talentDensity: 1,
    givenNames: ["Ari", "Bo", "Cy"],
    handles: ["Nova", "Blitz", "Echo"],
    ...fields,
  };
}

/** A minimal valid encounter definition, overridable field by field. */
function definition(id: string, fields: Partial<EncounterDefinition> = {}): EncounterDefinition {
  return {
    id,
    label: `Definition ${id}`,
    disciplineId: "tactical-shooter",
    opponent: { origin: origin(`origin-${id}`), level: 2 },
    reward: { win: 100, loss: 10, draw: 40 },
    ...fields,
  };
}

/** Minimal valid Contest rules for a given participant count and energy cost. */
function rules(participantCount: number, energyCost = 20): ContestRules {
  return {
    kind: "head-to-head",
    participantCount,
    statWeights: {
      mechanical: 3,
      cognitive: 1,
      collective: 2,
      composure: 3,
      adaptability: 0,
      presence: 0,
    },
    scoreToWin: 2,
    maxUnits: 2,
    energyCost,
    sideChance: {
      strengthBpsPerDeciPoint: 30,
      momentumBpsPerPoint: 10,
      underdogFloorBps: 4000,
    },
    momentumRetentionBps: 7500,
    slots: [
      { id: "setup", scoring: false },
      { id: "resolution", scoring: true },
    ],
    metrics: [
      { id: "contribution", label: "Contribution" },
      { id: "cost", label: "Cost" },
    ],
    momentTypes: [
      {
        id: "opening",
        slot: "setup",
        weight: 1,
        momentumShift: 5,
        participantMetricDeltas: { contribution: 1 },
      },
      {
        id: "conversion",
        slot: "resolution",
        weight: 1,
        momentumShift: 10,
        participantMetricDeltas: { contribution: 2, cost: -1 },
      },
    ],
  };
}

/** Settles the first calendar entry with a one-participant career side. */
function settleFirstEntry(
  run: RunState,
  season: Season,
  participantIds: readonly string[] = ["a"],
  contestRules: ContestRules = rules(participantIds.length),
) {
  const [entry] = season.calendar.entries;
  if (entry === undefined) throw new Error("test calendar is empty");
  return settleEncounter({
    runState: run,
    season,
    entryId: entry.id,
    contestId: "contest-1" as ContestId,
    rules: contestRules,
    participantIds,
  });
}

describe("season opponent field", () => {
  it("rejects an empty pool before any draw", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const beforeRun = structuredClone(run);
    const beforeSeason = structuredClone(season);

    expect(() =>
      materializeEncounterField({
        runState: run,
        season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool: [],
      }),
    ).toThrow(/pool/);
    expect(run).toEqual(beforeRun);
    expect(season).toEqual(beforeSeason);
  });

  it("rejects a duplicate definition id", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);

    expect(() =>
      materializeEncounterField({
        runState: run,
        season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool: [definition("dup"), definition("dup")],
      }),
    ).toThrow(/duplicate/);
  });

  it("rejects a definition naming another discipline", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);

    expect(() =>
      materializeEncounterField({
        runState: run,
        season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool: [definition("wrong-discipline", { disciplineId: "strategy-arena" })],
      }),
    ).toThrow(/discipline/);
  });

  it("rejects an opponent level outside 1-5", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);

    expect(() =>
      materializeEncounterField({
        runState: run,
        season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool: [definition("too-strong", { opponent: { origin: origin("x"), level: 6 } })],
      }),
    ).toThrow(/level/);
  });

  it("uses the discipline's Contest rules to size opponents for settlement", () => {
    const contestRules = rules(2);
    const run = makeState(makeCollective([makePerformer("a"), makePerformer("b")]));
    const field = materializeEncounterField({
      runState: run,
      season: activeSeason(run),
      disciplineId: "tactical-shooter",
      rules: contestRules,
      pool: [definition("pair")],
    });
    const [entry] = field.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");

    expect(field.season.field?.[0]?.collective.members).toHaveLength(2);
    const opened = openEncounter({
      runState: field.runState,
      season: field.season,
      entryId: entry.id,
    });
    const settled = settleFirstEntry(opened.runState, opened.season, ["a", "b"], contestRules);
    expect(settled.encounter.kind).toBe("settled");
    expect(settled.encounter.result.participantResults).toHaveLength(4);
  });

  it("rejects a second materialization for a season that already has a field", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const first = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });

    expect(() =>
      materializeEncounterField({
        runState: first.runState,
        season: first.season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool: [definition("solo")],
      }),
    ).toThrow(/already/);
  });

  it("rejects opening an encounter before any field exists", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const [entry] = season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");

    expect(() => openEncounter({ runState: run, season, entryId: entry.id })).toThrow(
      /materialized field/,
    );
  });

  it("materializes definitions in stable id order regardless of pool array order", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const pool = [definition("zeta"), definition("alpha")];

    const result = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool,
    });

    expect(result.season.field?.map((member) => member.definitionId)).toEqual(["alpha", "zeta"]);
  });

  it("produces an identical field and continuation regardless of pool array order", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);

    const forward = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("alpha"), definition("zeta")],
    });
    const reversed = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("zeta"), definition("alpha")],
    });

    expect(reversed.season.field).toEqual(forward.season.field);
    expect(reversed.runState.encounter).toEqual(forward.runState.encounter);
  });

  it("generates the discipline's declared participant count per definition", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);

    const result = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(3),
      pool: [definition("solo")],
    });

    const [member] = result.season.field ?? [];
    if (member === undefined) throw new Error("field is empty");
    expect(member.collective.members).toHaveLength(3);
    const ids = new Set(member.collective.members.map((performer) => performer.id));
    expect(ids.size).toBe(3);
  });

  it("moves only the encounter continuation, never contest", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);

    const result = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });

    expect(result.runState.encounter).not.toEqual(run.encounter);
    expect(result.runState.contest).toEqual(run.contest);
  });

  it("stores no content label anywhere in the materialized field", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);

    const withLabelA = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo", { label: "Label A" })],
    });
    const withLabelB = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo", { label: "Label B" })],
    });

    expect(withLabelA.season.field).toEqual(withLabelB.season.field);
    const [member] = withLabelA.season.field ?? [];
    if (member === undefined) throw new Error("field is empty");
    expect(member.collective.name).not.toContain("Label");
    expect(JSON.stringify(withLabelA.season.field)).not.toContain("Label A");
  });

  it("namespaces opponent identities outside the career id space and rejects a collision", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const pool = [definition("solo")];

    const probe = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool,
    });
    const [member] = probe.season.field ?? [];
    const generatedId = member?.collective.members[0]?.id;
    if (member === undefined || generatedId === undefined) throw new Error("field is empty");
    expect(generatedId).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(member.collective.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);

    const collidingRun: RunState = {
      ...run,
      collective: makeCollective([{ ...makePerformer("a"), id: generatedId }]),
    };
    expect(() =>
      materializeEncounterField({
        runState: collidingRun,
        season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool,
      }),
    ).toThrow(/collides/);
  });
  it("rejects a generated collective identity already held by the career collective", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const pool = [definition("solo")];
    const collidingRun: RunState = {
      ...run,
      collective: { ...run.collective, id: "season-contest-s1-solo" },
    };
    const beforeRun = structuredClone(collidingRun);
    const beforeSeason = structuredClone(season);

    expect(() =>
      materializeEncounterField({
        runState: collidingRun,
        season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool,
      }),
    ).toThrow(/collides/);
    expect(collidingRun).toEqual(beforeRun);
    expect(season).toEqual(beforeSeason);
  });
});

describe("opening an encounter", () => {
  function materializedSeason(participantCount = 1, poolIds: readonly string[] = ["solo"]) {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    return materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(participantCount),
      pool: poolIds.map((id) => definition(id)),
    });
  }

  it("draws exactly one field member, consuming a draw even for a field of one", () => {
    const materialized = materializedSeason();
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");

    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });

    expect(opened.encounter.kind).toBe("pending");
    expect(opened.runState.encounter).not.toEqual(materialized.runState.encounter);
  });

  it("reopening returns the identical opponent and moves no stream", () => {
    const materialized = materializedSeason();
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");

    const first = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });
    const second = openEncounter({
      runState: first.runState,
      season: first.season,
      entryId: entry.id,
    });

    expect(second.encounter).toEqual(first.encounter);
    expect(second.runState.encounter).toEqual(first.runState.encounter);
  });

  it("the same field member drawn for two entries is the same frozen Collective and Performers", () => {
    const materialized = materializedSeason();
    const [entryA, entryB] = materialized.season.calendar.entries;
    if (entryA === undefined || entryB === undefined) throw new Error("test calendar is short");

    const openedA = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entryA.id,
    });
    // `contest-ahead` stops the block after exactly one week, moving the season's position
    // from entryA's to entryB's so entryB becomes the current, openable entry.
    const advanced = advanceSeason(openedA.runState, openedA.season, { weeks: [[], [], [], []] });
    const openedB = openEncounter({
      runState: advanced.runState,
      season: advanced.season,
      entryId: entryB.id,
    });

    expect(openedB.encounter.definitionId).toBe(openedA.encounter.definitionId);
    expect(openedB.season.field).toEqual(materialized.season.field);
  });

  it("draws in stable field order and can meet the same member again among several", () => {
    const materialized = materializedSeason(1, ["zeta", "alpha", "beta"]);
    const [first, second, third] = materialized.season.calendar.entries;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("test calendar is short");
    }

    const openedFirst = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: first.id,
    });
    const afterFirst = advanceSeason(openedFirst.runState, openedFirst.season, {
      weeks: [[], [], [], []],
    });
    const openedSecond = openEncounter({
      runState: afterFirst.runState,
      season: afterFirst.season,
      entryId: second.id,
    });
    const afterSecond = advanceSeason(openedSecond.runState, openedSecond.season, {
      weeks: [[], [], [], []],
    });
    const openedThird = openEncounter({
      runState: afterSecond.runState,
      season: afterSecond.season,
      entryId: third.id,
    });

    expect(materialized.season.field?.map((member) => member.definitionId)).toEqual([
      "alpha",
      "beta",
      "zeta",
    ]);
    expect([
      openedFirst.encounter.definitionId,
      openedSecond.encounter.definitionId,
      openedThird.encounter.definitionId,
    ]).toEqual(["alpha", "zeta", "alpha"]);
    expect(openedThird.season.field).toEqual(materialized.season.field);
  });

  it("rejects opening a series-marked entry before any draw", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const seriesSeason = activeSeason(run, allSeriesTemplate);
    const materialized = materializeEncounterField({
      runState: run,
      season: seriesSeason,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");

    expect(() =>
      openEncounter({
        runState: materialized.runState,
        season: materialized.season,
        entryId: entry.id,
      }),
    ).toThrow(/series/);
  });

  it("rejects opening an unknown entry", () => {
    const materialized = materializedSeason();

    expect(() =>
      openEncounter({
        runState: materialized.runState,
        season: materialized.season,
        entryId: { kind: "season-entry", season: 999, relativeWeek: 0 },
      }),
    ).toThrow(/unknown/);
  });

  it("rejects opening a future entry before any draw", () => {
    const materialized = materializedSeason();
    const futureEntry = materialized.season.calendar.entries[1];
    if (futureEntry === undefined) throw new Error("test calendar is short");

    expect(() =>
      openEncounter({
        runState: materialized.runState,
        season: materialized.season,
        entryId: futureEntry.id,
      }),
    ).toThrow(/future/);
  });
});

describe("settlement", () => {
  function openedSeason(energy = 73, energyCost = 20) {
    const run = makeState(makeCollective([makePerformer("a", energy), makePerformer("b")]));
    const season = activeSeason(run);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");
    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });
    return { runState: opened.runState, season: opened.season, entryId: entry.id, energyCost };
  }
  /**
   * A run whose root seed is fully re-derived (root, `contest` and `encounter` streams
   * alike), so a fixed seed reproduces one specific Contest outcome through the real
   * `resolveContest` path: seed 0 resolves to `draw`, seed 1 to `first-win`, seed 2 to
   * `second-win`, all discovered empirically against this exact scenario and pinned here.
   */
  function seededOpenedSeason(seed: number, energy = 73) {
    const run = {
      ...makeState(makeCollective([makePerformer("a", energy)]), makeOrg(1_000)),
      seed,
      contest: createRng(seed).stream(CONTEST_STREAM_NAME).state(),
      encounter: createRng(seed).stream(ENCOUNTER_STREAM_NAME).state(),
    };
    const season = activeSeason(run);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");
    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });
    return { runState: opened.runState, season: opened.season, entryId: entry.id };
  }

  it("rejects settling an entry that has not been opened", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const beforeRun = structuredClone(materialized.runState);
    const beforeSeason = structuredClone(materialized.season);

    expect(() => settleFirstEntry(materialized.runState, materialized.season)).toThrow(/open/);
    expect(materialized.runState).toEqual(beforeRun);
    expect(materialized.season).toEqual(beforeSeason);
  });

  it("rejects settling a series-marked entry before any draw", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run, allSeriesTemplate);

    expect(() => settleFirstEntry(run, season)).toThrow(/series/);
  });

  it("rejects settling a future entry before any draw", () => {
    const { runState, season } = openedSeason();
    const futureEntry = season.calendar.entries[1];
    if (futureEntry === undefined) throw new Error("test calendar is short");

    expect(() =>
      settleEncounter({
        runState,
        season,
        entryId: futureEntry.id,
        contestId: "contest-1" as ContestId,
        rules: rules(1),
        participantIds: ["a"],
      }),
    ).toThrow(/future/);
  });

  it.each([
    [0, "draw", 40, "draw"] as const,
    [1, "win", 100, "first-win"] as const,
    [2, "loss", 10, "second-win"] as const,
  ])(
    "resolves seed %i through the real resolver to a deterministic %s",
    (seed, outcome, reward, resultKind) => {
      const { runState, season } = seededOpenedSeason(seed);

      const settled = settleFirstEntry(runState, season, ["a"], rules(1));

      // The career Collective is always the `first` ordered position, so this pins the
      // fixed orientation mapping end to end through the public `resolveContest` path,
      // not a reconstruction of it.
      expect(settled.encounter.result.first.collectiveId).toBe(runState.collective.id);
      expect(settled.encounter.result.outcome.kind).toBe(resultKind);
      expect(settled.encounter.outcome).toBe(outcome);
      expect(settled.encounter.reward).toBe(reward);
      expect(settled.season.facts).toEqual([{ entryId: settled.encounter.entryId, outcome }]);
    },
  );

  it("installs energy by exact replacement, never a second subtraction", () => {
    const { runState, season, energyCost } = openedSeason(73, 20);

    const settled = settleFirstEntry(runState, season, ["a"], rules(1, energyCost));

    const participant = settled.runState.collective.members.find((member) => member.id === "a");
    if (participant === undefined) throw new Error("participant is missing");
    expect(participant.state.energy).toBe(53);
    expect(participant.state.energy).not.toBe(73 - energyCost - energyCost);
  });

  it("clamps installed energy at zero rather than going negative when cost exceeds opening energy", () => {
    const { runState, season } = seededOpenedSeason(1, 5);

    const settled = settleFirstEntry(runState, season, ["a"], rules(1, 20));

    const participant = settled.runState.collective.members.find((member) => member.id === "a");
    if (participant === undefined) throw new Error("participant is missing");
    expect(participant.state.energy).toBe(0);
  });

  it("leaves non-participants and every other field untouched", () => {
    const { runState, season } = openedSeason();
    const before = runState.collective.members.find((member) => member.id === "b");
    if (before === undefined) throw new Error("non-participant is missing");

    const settled = settleFirstEntry(runState, season, ["a"]);

    const after = settled.runState.collective.members.find((member) => member.id === "b");
    expect(after).toEqual(before);
    const participant = settled.runState.collective.members.find((member) => member.id === "a");
    const original = runState.collective.members.find((member) => member.id === "a");
    if (participant === undefined || original === undefined) throw new Error("participant missing");
    expect(participant.state.morale).toBe(original.state.morale);
    expect(participant.state.form).toBe(original.state.form);
    expect(participant.stats).toEqual(original.stats);
    expect(participant.age).toBe(original.age);
    expect(participant.traits).toEqual(original.traits);
  });

  it("credits exactly the declared amount once, and a declared zero moves nothing", () => {
    const { runState, season } = openedSeason();

    const settled = settleFirstEntry(runState, season);

    const rewardAmount =
      settled.encounter.outcome === "win" ? 100 : settled.encounter.outcome === "loss" ? 10 : 40;
    expect(settled.encounter.reward).toBe(rewardAmount);
    expect(settled.runState.org.money).toBe(runState.org.money + rewardAmount);
    expect(settled.runState.org.audience).toBe(runState.org.audience);
    expect(settled.runState.org.reputation).toBe(runState.org.reputation);

    const run = makeState(makeCollective([makePerformer("a")]), makeOrg(1_000));
    const zeroSeason = activeSeason(run);
    const materialized = materializeEncounterField({
      runState: run,
      season: zeroSeason,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("free", { reward: { win: 0, loss: 0, draw: 0 } })],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");
    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });
    const zeroSettled = settleFirstEntry(opened.runState, opened.season);
    expect(zeroSettled.runState.org.money).toBe(run.org.money);
  });

  it("records exactly one SeasonContestFact naming the entry and mapped outcome", () => {
    const { runState, season } = openedSeason();

    const settled = settleFirstEntry(runState, season);

    expect(settled.season.facts).toEqual([
      { entryId: settled.encounter.entryId, outcome: settled.encounter.outcome },
    ]);
  });

  it("is idempotent: a second settlement returns the stored encounter and moves no stream", () => {
    const { runState, season } = openedSeason();

    const first = settleFirstEntry(runState, season);
    const second = settleFirstEntry(first.runState, first.season);

    expect(second.encounter).toEqual(first.encounter);
    expect(second.runState).toEqual(first.runState);
    expect(second.season).toEqual(first.season);
  });

  it("stays idempotent after the season completes around the settled entry", () => {
    let run = makeState(makeCollective([makePerformer("a")]));
    let season: Season = activeSeason(run, allContestTemplate, 0);
    const [firstEntry] = season.calendar.entries;
    if (firstEntry === undefined) throw new Error("test calendar is empty");
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    run = materialized.runState;
    season = materialized.season;
    const opened = openEncounter({ runState: run, season, entryId: firstEntry.id });
    run = opened.runState;
    season = opened.season;
    const settled = settleFirstEntry(run, season);
    run = settled.runState;
    season = settled.season;

    // Walk the remaining marked entries to a completed season without opening or settling
    // them: each entry's fact is recorded only once `advanceSeason` has made it current, so
    // the calendar boundary is reached while only the first entry ever had an encounter.
    for (const entry of season.calendar.entries.slice(1)) {
      const advancedToEntry = advanceSeason(run, season, { weeks: [[], [], [], []] });
      run = advancedToEntry.runState;
      season = advancedToEntry.season;
      if (season.kind !== "active") break;
      season = recordSeasonContestFact(season, { entryId: entry.id, outcome: "loss" });
    }
    const advanced = advanceSeason(run, season, { weeks: [[], [], [], []] });
    run = advanced.runState;
    season = advanced.season;
    expect(season.kind).toBe("completed");

    const replay = settleEncounter({
      runState: run,
      season,
      entryId: firstEntry.id,
      contestId: "contest-1" as ContestId,
      rules: rules(1),
      participantIds: ["a"],
    });

    expect(replay.encounter).toEqual(settled.encounter);
    expect(replay.season).toEqual(season);
  });
});

describe("week and season boundaries", () => {
  it("does not touch week or the negative-week streak", () => {
    const { runState, season } = (() => {
      const run = makeState(makeCollective([makePerformer("a")]), makeOrg(-50), 0);
      const withStreak: RunState = { ...run, consecutiveNegativeWeeks: 3 };
      const active = activeSeason(withStreak);
      const materialized = materializeEncounterField({
        runState: withStreak,
        season: active,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool: [definition("solo")],
      });
      const [entry] = materialized.season.calendar.entries;
      if (entry === undefined) throw new Error("test calendar is empty");
      const opened = openEncounter({
        runState: materialized.runState,
        season: materialized.season,
        entryId: entry.id,
      });
      return { runState: opened.runState, season: opened.season };
    })();

    const settled = settleFirstEntry(runState, season);

    expect(settled.runState.week).toBe(runState.week);
    expect(settled.runState.consecutiveNegativeWeeks).toBe(3);
  });

  it("lets the settled week advance once, classified contest, with no repeated energy or reward", () => {
    const run = makeState(makeCollective([makePerformer("a", 73)]));
    const season = activeSeason(run);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");
    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });
    const settled = settleFirstEntry(opened.runState, opened.season);

    const advanced = advanceSeason(settled.runState, settled.season, {
      weeks: [[], [], [], []],
    });

    expect(advanced.advance.weeks[0]?.kind).toBe("contest");
    const participant = advanced.runState.collective.members.find((member) => member.id === "a");
    const settledParticipant = settled.runState.collective.members.find(
      (member) => member.id === "a",
    );
    // Week recovery (+15) applies once on top of the installed post-Contest energy; nothing
    // re-subtracts the Contest's own energy cost a second time.
    expect(participant?.state.energy).toBe((settledParticipant?.state.energy ?? 0) + 15);
    // The weekly recurring engagement debit is the only other change that week makes to the
    // balance; nothing installs a second reward on top of the one settlement already paid.
    const weeklyExpense = advanced.advance.weeks[0]?.engagementExpense.total ?? 0;
    expect(advanced.runState.org.money).toBe(settled.runState.org.money - weeklyExpense);
  });

  it("applies every consequence exactly once for a late settlement after the week advanced", () => {
    const run = makeState(makeCollective([makePerformer("a", 73)]));
    const season = activeSeason(run);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");
    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });

    const advanced = advanceSeason(opened.runState, opened.season, { weeks: [[], [], [], []] });
    const settled = settleFirstEntry(advanced.runState, advanced.season);

    expect(settled.season.facts).toHaveLength(1);
    const participant = settled.runState.collective.members.find((member) => member.id === "a");
    // The week already recovered +15 (73 -> 88) before settlement read the current energy and
    // installed the Contest's own authoritative value (88 - 20 = 68): recovery and the Contest
    // cost each land exactly once, in that order, never twice.
    expect(participant?.state.energy).toBe(68);
  });

  it("lets the final marked entry's settlement reach the season result on that week's advancement", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run, allContestTemplate, 0);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    let currentRun = materialized.runState;
    let currentSeason: Season = materialized.season;

    for (const entry of materialized.season.calendar.entries) {
      const opened = openEncounter({
        runState: currentRun,
        season: currentSeason,
        entryId: entry.id,
      });
      const settled = settleEncounter({
        runState: opened.runState,
        season: opened.season,
        entryId: entry.id,
        contestId: `contest-${entry.relativeWeek}` as ContestId,
        rules: rules(1),
        participantIds: ["a"],
      });
      currentRun = settled.runState;
      currentSeason = settled.season;
      if (entry.relativeWeek < materialized.season.calendar.entries.length - 1) {
        // Settlement itself must not advance a week, complete the season or start the next one.
        expect(currentSeason.kind).toBe("active");
        const advanced = advanceSeason(currentRun, currentSeason, { weeks: [[], [], [], []] });
        currentRun = advanced.runState;
        currentSeason = advanced.season;
      }
    }

    expect(currentSeason.kind).toBe("active");
    const advanced = advanceSeason(currentRun, currentSeason, { weeks: [[], [], [], []] });
    expect(advanced.season.kind).toBe("completed");
    if (advanced.season.kind !== "completed") throw new Error("season must be complete");
    expect(advanced.season.result.facts).toHaveLength(4);
  });
});

describe("the season boundary resets the field and encounters, continuations carry forward", () => {
  it("starts the next season with no field or encounters while streams continue", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run, allContestTemplate, 0);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");
    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });
    const settled = settleFirstEntry(opened.runState, opened.season);

    let currentRun = settled.runState;
    let currentSeason: Season = settled.season;
    for (const remaining of currentSeason.calendar.entries.slice(1)) {
      const advancedToEntry = advanceSeason(currentRun, currentSeason, { weeks: [[], [], [], []] });
      currentRun = advancedToEntry.runState;
      currentSeason = advancedToEntry.season;
      if (currentSeason.kind !== "active") break;
      currentSeason = recordSeasonContestFact(currentSeason, {
        entryId: remaining.id,
        outcome: "loss",
      });
    }
    const advanced = advanceSeason(currentRun, currentSeason, { weeks: [[], [], [], []] });
    currentRun = advanced.runState;
    currentSeason = advanced.season;
    expect(currentSeason.kind).toBe("completed");
    if (currentSeason.kind !== "completed") throw new Error("season must be complete");

    const beforeEncounter = currentRun.encounter;
    const beforeContest = currentRun.contest;
    const next = startNextSeason({
      runState: currentRun,
      season: currentSeason,
      template: allContestTemplate,
      goal: { kind: "minimum-contest-wins", target: 0 },
    });

    expect(next.season.field).toBeNull();
    expect(next.season.encounters).toEqual([]);
    expect(next.runState.encounter).toEqual(beforeEncounter);
    expect(next.runState.contest).toEqual(beforeContest);
  });
});

describe("named stream isolation", () => {
  it("rejects a malformed encounter continuation before restoring it", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const malformedRun: RunState = {
      ...run,
      encounter: [1, 2, 3, 4, 5] as unknown as RunState["encounter"],
    };
    const season = activeSeason(run);

    expect(() =>
      materializeEncounterField({
        runState: malformedRun,
        season,
        disciplineId: "tactical-shooter",
        rules: rules(1),
        pool: [definition("solo")],
      }),
    ).toThrow(/RNG state/);
  });

  it("rejects a malformed contest continuation before restoring it", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    const season = activeSeason(run);
    const materialized = materializeEncounterField({
      runState: run,
      season,
      disciplineId: "tactical-shooter",
      rules: rules(1),
      pool: [definition("solo")],
    });
    const [entry] = materialized.season.calendar.entries;
    if (entry === undefined) throw new Error("test calendar is empty");
    const opened = openEncounter({
      runState: materialized.runState,
      season: materialized.season,
      entryId: entry.id,
    });
    const malformedRun: RunState = {
      ...opened.runState,
      contest: ["not", "numbers"] as unknown as RunState["contest"],
    };

    expect(() => settleFirstEntry(malformedRun, opened.season)).toThrow(/RNG state/);
  });

  it("confirms both streams derive independently by seeding from the same root as the contest engine", () => {
    const run = makeState(makeCollective([makePerformer("a")]));
    expect(run.encounter).toEqual(createRng(run.seed).stream(ENCOUNTER_STREAM_NAME).state());
    expect(run.contest).toEqual(createRng(run.seed).stream(CONTEST_STREAM_NAME).state());
  });
});
