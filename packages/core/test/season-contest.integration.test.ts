import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ContestId, ContestRules } from "../src/contest.ts";
import type { EncounterDefinition, SettledEncounter } from "../src/encounter.ts";
import { materializeEncounterField, openEncounter, settleEncounter } from "../src/encounter.ts";
import type { OriginProfile } from "../src/generate.ts";
import { createRng } from "../src/rng.ts";
import type { Season, SeasonTemplate } from "../src/season.ts";
import { advanceSeason, startSeason } from "../src/season.ts";
import type { RunState, WeekPlan } from "../src/week.ts";
import { makeCollective, makePerformer, makeState } from "./fixtures.ts";

interface EncounterContent {
  readonly id: string;
  readonly label: string;
  readonly disciplineId: string;
  readonly opponent: { readonly originId: string; readonly level: number };
  readonly reward: { readonly win: number; readonly loss: number; readonly draw: number };
}

interface DisciplineContent {
  readonly id: string;
  readonly rosterSize: number;
  readonly statWeights: ContestRules["statWeights"];
  readonly contest: Omit<ContestRules, "participantCount" | "statWeights">;
}

const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const template = readFixture("season-no-series.json") as SeasonTemplate;
const pool = readFixture("encounter-pool.json") as readonly EncounterContent[];
const discipline = JSON.parse(
  readFileSync(
    new URL("../../../content/disciplines/tactical-shooter.json", import.meta.url),
    "utf8",
  ),
) as DisciplineContent;

const rules: ContestRules = {
  kind: discipline.contest.kind,
  participantCount: discipline.rosterSize,
  statWeights: discipline.statWeights,
  scoreToWin: discipline.contest.scoreToWin,
  maxUnits: discipline.contest.maxUnits,
  energyCost: discipline.contest.energyCost,
  sideChance: discipline.contest.sideChance,
  momentumRetentionBps: discipline.contest.momentumRetentionBps,
  slots: discipline.contest.slots,
  metrics: discipline.contest.metrics,
  momentTypes: discipline.contest.momentTypes,
};
const emptyPlan: WeekPlan = { weeks: [[], [], [], []] };

const origins: Readonly<Record<string, OriginProfile>> = {
  "western-europe": {
    id: "western-europe",
    language: "en",
    secondLanguages: [],
    talentDensity: 1,
    givenNames: ["Robin", "Morgan"],
    handles: ["comet", "orbit"],
  },
  cis: {
    id: "cis",
    language: "ru",
    secondLanguages: [],
    talentDensity: 1.3,
    givenNames: ["Alex", "Sasha"],
    handles: ["pixel", "signal"],
  },
};

function definitions(content: readonly EncounterContent[]): readonly EncounterDefinition[] {
  return content.map((entry) => {
    const origin = origins[entry.opponent.originId];
    if (origin === undefined) throw new Error(`missing fixture origin ${entry.opponent.originId}`);
    return {
      id: entry.id,
      label: entry.label,
      disciplineId: entry.disciplineId,
      opponent: { origin, level: entry.opponent.level },
      reward: entry.reward,
    };
  });
}

interface SeasonWalk {
  readonly runState: RunState;
  readonly season: Season;
  readonly encounters: readonly SettledEncounter[];
  readonly openingMoney: number;
  readonly initialOpponentEnergy: readonly number[];
  readonly contestAheadCount: number;
}

function walkSeason(seed: number, resumeAfterFirstEncounter = false): SeasonWalk {
  const collective = makeCollective(
    Array.from({ length: discipline.rosterSize }, (_, index) =>
      makePerformer(`career-${index}`, 90),
    ),
  );
  let runState: RunState = {
    ...makeState(collective),
    seed,
    rng: createRng(seed).state(),
    contest: createRng(seed).stream("contest").state(),
    encounter: createRng(seed).stream("encounter").state(),
  };
  let season: Season = startSeason({
    number: 1,
    startWeek: runState.week,
    template,
    goal: { kind: "minimum-contest-wins", target: 2 },
    seed,
    rngState: createRng(seed).stream("season-calendar").state(),
  });
  const field = materializeEncounterField({
    runState,
    season,
    disciplineId: discipline.id,
    rules,
    pool: definitions(pool.slice(0, 1)),
  });
  runState = field.runState;
  season = field.season;
  const member = season.field?.members[0];
  if (member === undefined) throw new Error("fixture did not materialize an opponent");
  const openingMoney = runState.org.money;
  const initialOpponentEnergy = member.collective.members.map((person) => person.state.energy);
  const encounters: SettledEncounter[] = [];
  let contestAheadCount = 0;

  for (let step = 0; step < template.length + 10 && season.kind === "active"; step += 1) {
    const current = season.calendar.entries[season.position];
    if (current === undefined) throw new Error("season reached its boundary without a result");
    if (current.marking === "contest") {
      const opened = openEncounter({ runState, season, entryId: current.id });
      const previousMoney = opened.runState.org.money;
      const settled = settleEncounter({
        runState: opened.runState,
        season: opened.season,
        entryId: current.id,
        contestId: `encounter-${current.relativeWeek}` as ContestId,
        participantIds: collective.members.map((person) => person.id),
      });
      runState = settled.runState;
      season = settled.season;
      encounters.push(settled.encounter);
      if (resumeAfterFirstEncounter && encounters.length === 1) {
        runState = JSON.parse(JSON.stringify(runState)) as RunState;
        season = JSON.parse(JSON.stringify(season)) as Season;
      }
      expect(runState.week).toBe(current.week);
      expect(runState.org.money).toBeCloseTo(previousMoney + settled.encounter.reward, 8);
      expect(settled.encounter.result.second.collectiveId).toBe(member.collective.id);
      expect(
        settled.encounter.result.participantResults
          .filter((person) => person.collectiveId === member.collective.id)
          .map((person) => ({ id: person.performerId, energy: person.energyBefore })),
      ).toEqual(
        member.collective.members.map((person, index) => ({
          id: person.id,
          energy: initialOpponentEnergy[index],
        })),
      );
    }
    const advanced = advanceSeason(runState, season, emptyPlan);
    runState = advanced.runState;
    season = advanced.season;
    if (advanced.advance.reasons.some((reason) => reason.kind === "contest-ahead")) {
      contestAheadCount += 1;
      expect(season.calendar.entries[season.position]?.marking).toBe("contest");
    }
  }
  return { runState, season, encounters, openingMoney, initialOpponentEnergy, contestAheadCount };
}

describe("headless season contest", () => {
  it("completes a real season with a frozen repeated opponent, single rewards and evaluated goal", () => {
    const walk = walkSeason(42);
    expect(walk.season.kind).toBe("completed");
    if (walk.season.kind !== "completed") throw new Error("the season did not complete");
    expect(walk.encounters.length).toBeGreaterThanOrEqual(6);
    expect(walk.encounters.length).toBeLessThanOrEqual(8);
    expect(walk.contestAheadCount).toBe(
      walk.encounters.length - Number(walk.season.calendar.entries[0]?.marking === "contest"),
    );
    expect(walk.season.facts).toEqual(
      walk.encounters.map(({ entryId, outcome }) => ({ entryId, outcome })),
    );
    expect(walk.season.result.achieved).toBe(
      walk.encounters.filter(({ outcome }) => outcome === "win").length >= 2,
    );
    expect(walk.runState.org.money).toBeCloseTo(
      walk.openingMoney + walk.encounters.reduce((sum, { reward }) => sum + reward, 0) - 24 * 5,
      8,
    );
    const fieldMember = walk.season.field?.members[0];
    if (fieldMember === undefined) throw new Error("completed season lost its opponent field");
    expect(fieldMember.collective.members.map((person) => person.state.energy)).toEqual(
      walk.initialOpponentEnergy,
    );
    expect(walk.encounters.map(({ definitionId }) => definitionId)).toEqual(
      Array(walk.encounters.length).fill(fieldMember.definitionId),
    );
  });

  it("resumes a JSON save after the first encounter with identical remaining results", () => {
    const uninterrupted = walkSeason(314159);
    const resumed = walkSeason(314159, true);
    expect(resumed).toEqual(uninterrupted);
  });
});
