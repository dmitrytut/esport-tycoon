import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createRng } from "../../src/rng.ts";
import type { CompletedSeason, Season, SeasonTemplate } from "../../src/season.ts";
import {
  advanceSeason,
  recordSeasonContestFact,
  startNextSeason,
  startSeason,
} from "../../src/season.ts";
import type { RunState, WeekPlan } from "../../src/week.ts";
import { makeCollective, makePerformer, makeState } from "../fixtures.ts";
import { seasonTemplateArb, seedArb } from "./arbitraries.ts";

const emptyPlan: WeekPlan = { weeks: [[], [], [], []] };

interface FinishedSeason {
  readonly runState: RunState;
  readonly season: CompletedSeason;
  readonly positions: readonly number[];
}

function finishSeason(runState: RunState, initial: Season): FinishedSeason {
  let run = runState;
  let season = initial;
  const positions: number[] = [season.position];
  for (let step = 0; step < 100 && season.kind === "active"; step += 1) {
    const current = season.calendar.entries[season.position];
    if (current !== undefined && current.marking !== "none") {
      season = recordSeasonContestFact(season, {
        entryId: current.id,
        outcome: current.relativeWeek % 2 === 0 ? "win" : "loss",
      });
    }
    if (season.kind === "completed") break;
    const advanced = advanceSeason(run, season, emptyPlan);
    run = advanced.runState;
    season = advanced.season;
    positions.push(season.position);
  }
  if (season.kind !== "completed") throw new Error("property season did not complete");
  return { runState: run, season, positions };
}

function generatedSeason(run: RunState, template: SeasonTemplate): Season {
  return startSeason({
    number: 1,
    startWeek: run.week,
    template,
    goal: { kind: "minimum-contest-wins", target: 0 },
    seed: run.seed,
    rngState: createRng(run.seed).stream("season-calendar").state(),
  });
}

describe("season calendar properties", () => {
  it("replays the same materialized calendar and continuation", () => {
    fc.assert(
      fc.property(seedArb, seasonTemplateArb, (seed, template) => {
        const input = {
          number: 2,
          startWeek: 7,
          template,
          goal: { kind: "minimum-contest-wins" as const, target: 0 },
          seed,
          rngState: createRng(seed).stream("season-calendar").state(),
        };

        expect(startSeason(input)).toEqual(startSeason(input));
      }),
    );
  });

  it("keeps counts in range and entries unique, complete and ordered", () => {
    fc.assert(
      fc.property(seedArb, seasonTemplateArb, (seed, template) => {
        const season = startSeason({
          number: 1,
          startWeek: 11,
          template,
          goal: { kind: "minimum-contest-wins", target: 0 },
          seed,
          rngState: createRng(seed).stream("season-calendar").state(),
        });
        const entries = season.calendar.entries;
        const contest = entries.filter((entry) => entry.marking === "contest").length;
        const series = entries.filter((entry) => entry.marking === "series").length;

        expect(entries).toHaveLength(template.length);
        expect(contest).toBeGreaterThanOrEqual(template.markings.contest.min);
        expect(contest).toBeLessThanOrEqual(template.markings.contest.max);
        expect(series).toBeGreaterThanOrEqual(template.markings.series.min);
        expect(series).toBeLessThanOrEqual(template.markings.series.max);
        expect(entries.map((entry) => entry.relativeWeek)).toEqual(
          Array.from({ length: template.length }, (_, index) => index),
        );
        expect(entries.map((entry) => entry.week)).toEqual(
          Array.from({ length: template.length }, (_, index) => 11 + index),
        );
        expect(new Set(entries.map((entry) => JSON.stringify(entry.id))).size).toBe(entries.length);
      }),
    );
  });

  it("does not move the supplied state or the root stream", () => {
    fc.assert(
      fc.property(seedArb, seasonTemplateArb, (seed, template) => {
        const root = createRng(seed);
        const rootBefore = root.state();
        const calendarState = root.stream("season-calendar").state();
        const calendarBefore = [...calendarState];

        startSeason({
          number: 1,
          startWeek: 0,
          template,
          goal: { kind: "minimum-contest-wins", target: 0 },
          seed,
          rngState: calendarState,
        });

        expect(root.state()).toEqual(rootBefore);
        expect(calendarState).toEqual(calendarBefore);
      }),
    );
  });
});

describe("season lifecycle properties", () => {
  it("resumes JSON-compatible copies with an identical final result", () => {
    fc.assert(
      fc.property(seedArb, seasonTemplateArb, (seed, template) => {
        const originalRun = {
          ...makeState(makeCollective([makePerformer("solo")])),
          seed,
          rng: createRng(seed).state(),
        };
        const originalSeason = generatedSeason(originalRun, template);
        const copiedRun: RunState = JSON.parse(JSON.stringify(originalRun));
        const copiedSeason: Season = JSON.parse(JSON.stringify(originalSeason));

        expect(finishSeason(copiedRun, copiedSeason)).toEqual(
          finishSeason(originalRun, originalSeason),
        );
      }),
    );
  });

  it("moves monotonically across multiple calls and reproduces the final evidence", () => {
    fc.assert(
      fc.property(seedArb, seasonTemplateArb, (seed, template) => {
        const run = {
          ...makeState(makeCollective([makePerformer("solo")])),
          seed,
          rng: createRng(seed).state(),
        };
        const season = generatedSeason(run, template);
        const first = finishSeason(run, season);
        const replay = finishSeason(run, season);

        for (let index = 1; index < first.positions.length; index += 1) {
          expect(first.positions[index]).toBeGreaterThan(first.positions[index - 1] ?? -1);
        }
        expect(first.season.result).toEqual(replay.season.result);
      }),
    );
  });

  it("starts the next season without moving age or non-season RNG streams", () => {
    fc.assert(
      fc.property(seedArb, seasonTemplateArb, (seed, template) => {
        const run = {
          ...makeState(makeCollective([makePerformer("solo")])),
          seed,
          rng: createRng(seed).state(),
        };
        const completed = finishSeason(run, generatedSeason(run, template));
        const beforeAge = completed.runState.collective.members[0]?.age;
        const beforeRootRng = completed.runState.rng;
        const beforeIncidentRng = completed.runState.incidents.rng;

        const next = startNextSeason({
          runState: completed.runState,
          season: completed.season,
          template,
          goal: { kind: "minimum-contest-wins", target: 0 },
        });

        expect(next.runState.collective.members[0]?.age).toBe(beforeAge);
        expect(next.runState.rng).toEqual(beforeRootRng);
        expect(next.runState.incidents.rng).toEqual(beforeIncidentRng);
      }),
    );
  });
});
