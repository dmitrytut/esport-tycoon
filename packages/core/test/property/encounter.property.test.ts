import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ContestId, ContestRules } from "../../src/contest.ts";
import type { EncounterDefinition } from "../../src/encounter.ts";
import { materializeEncounterField, openEncounter, settleEncounter } from "../../src/encounter.ts";
import type { OriginProfile } from "../../src/generate.ts";
import { createRng } from "../../src/rng.ts";
import { startSeason } from "../../src/season.ts";
import type { RunState } from "../../src/week.ts";
import { makeCollective, makePerformer, makeState } from "../fixtures.ts";
import { seedArb } from "./arbitraries.ts";

interface DisciplineContent {
  readonly id: string;
  readonly rosterSize: number;
  readonly statWeights: ContestRules["statWeights"];
  readonly contest: Omit<ContestRules, "participantCount" | "statWeights">;
}

const discipline = JSON.parse(
  readFileSync(
    new URL("../../../../content/disciplines/tactical-shooter.json", import.meta.url),
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
const origin: OriginProfile = {
  id: "western-europe",
  language: "en",
  secondLanguages: [],
  talentDensity: 1,
  givenNames: ["Robin"],
  handles: ["comet"],
};
const collective = makeCollective(
  Array.from({ length: discipline.rosterSize }, (_, index) => makePerformer(`career-${index}`, 80)),
);
const reward = { win: 12, loss: 2, draw: 5 };
const definitions: readonly EncounterDefinition[] = [
  {
    id: "alpha",
    label: "Alpha Collective",
    disciplineId: discipline.id,
    opponent: { origin, level: 1 },
    reward,
  },
  {
    id: "beta",
    label: "Beta Collective",
    disciplineId: discipline.id,
    opponent: { origin, level: 2 },
    reward,
  },
];

function setup(seed: number | string, pool = definitions) {
  const runState: RunState = {
    ...makeState(collective),
    seed,
    rng: createRng(seed).state(),
    contest: createRng(seed).stream("contest").state(),
    encounter: createRng(seed).stream("encounter").state(),
  };
  const season = startSeason({
    number: 1,
    startWeek: 0,
    template: {
      id: "single-contest",
      length: 1,
      markings: { contest: { min: 1, max: 1 }, series: { min: 0, max: 0 } },
    },
    goal: { kind: "minimum-contest-wins", target: 0 },
    seed,
    rngState: createRng(seed).stream("season-calendar").state(),
  });
  return materializeEncounterField({
    runState,
    season,
    disciplineId: discipline.id,
    rules,
    pool,
  });
}

const copied = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("encounter state properties", () => {
  it("is independent of the caller's pool order for arbitrary seeds", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(setup(seed, definitions)).toEqual(setup(seed, [...definitions].reverse()));
      }),
    );
  });

  it("round-trips field, encounter state and both RNG continuations without changing settlement", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const materialized = setup(seed);
        const entryId = materialized.season.calendar.entries[0]?.id;
        if (entryId === undefined) throw new Error("test season has no marked entry");
        const opened = openEncounter({
          runState: copied(materialized.runState),
          season: copied(materialized.season),
          entryId,
        });
        const settled = settleEncounter({
          runState: copied(opened.runState),
          season: copied(opened.season),
          entryId,
          contestId: "property-contest" as ContestId,
          participantIds: collective.members.map(({ id }) => id),
        });
        expect(copied(materialized.season.field)).toEqual(materialized.season.field);
        expect(copied(opened.encounter)).toEqual(opened.encounter);
        expect(materialized.runState.encounter).not.toEqual(
          createRng(seed).stream("encounter").state(),
        );
        expect(opened.runState.encounter).not.toEqual(materialized.runState.encounter);
        expect(copied(settled)).toEqual(settled);
        expect(opened.runState.contest).toEqual(materialized.runState.contest);
        expect(settled.runState.encounter).toEqual(opened.runState.encounter);
        expect(settled.runState.contest).not.toEqual(opened.runState.contest);
        expect(settled.season.field).toEqual(materialized.season.field);
        expect(
          settleEncounter({
            runState: settled.runState,
            season: settled.season,
            entryId,
            contestId: "property-contest" as ContestId,
            participantIds: collective.members.map(({ id }) => id),
          }),
        ).toEqual(settled);
      }),
    );
  });

  it("rejects invalid entries and duplicate pools without changing run, season or streams", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const materialized = setup(seed);
        const before = copied(materialized);
        expect(() =>
          openEncounter({
            ...materialized,
            entryId: { kind: "season-entry", season: 1, relativeWeek: 99 },
          }),
        ).toThrow(/unknown/);
        expect(materialized).toEqual(before);
        const entryId = materialized.season.calendar.entries[0]?.id;
        if (entryId === undefined) throw new Error("test season has no marked entry");
        expect(() =>
          settleEncounter({
            ...materialized,
            entryId,
            contestId: "property-contest" as ContestId,
            participantIds: collective.members.map(({ id }) => id),
          }),
        ).toThrow(/open/);
        expect(materialized).toEqual(before);
        const duplicate = definitions[0];
        if (duplicate === undefined) throw new Error("test pool has no definition");
        expect(() => setup(seed, [duplicate, duplicate])).toThrow(/duplicate/);
      }),
    );
  });
});
