import type { RunState, Season } from "@et/core";
import {
  ACT_ONE_SLOTS,
  CONTEST_STREAM_NAME,
  createIncidentState,
  createRng,
  ENCOUNTER_STREAM_NAME,
  generatePerformer,
  quoteWeeklyRate,
  startSeason,
} from "@et/core";

import type { ContentCatalog } from "./content.ts";

/** Fixed demo seed: the opening calendar has ordinary weeks before a real marked boundary. */
export const DEFAULT_RUN_SEED = "week-shell-38-5";

/** A new unsaved session; reconstruction from its seed never reads a clock or browser RNG. */
export interface OpeningRun {
  /** The run clock, named stream continuations and recurring engagement terms. */
  readonly runState: RunState;
  readonly season: Season;
}

/** Constructs the act-one demo entirely with the public core entry and validated content. */
export function createRun(seed: string, catalog: ContentCatalog): OpeningRun {
  const root = createRng(seed);
  const members = Array.from({ length: catalog.discipline.rosterSize }, () =>
    generatePerformer(root, { origin: catalog.origin, level: 1 }),
  );
  const collective = { id: "first", name: "The Basement", members };
  const engagements = members.map((performer) => ({
    id: `engagement-${performer.id}`,
    performerId: performer.id,
    collectiveId: collective.id,
    weeklyRate: quoteWeeklyRate({
      performer,
      baseWeeklyRate: catalog.discipline.economy.baseWeeklyRate,
      originRateScale: catalog.origin.salaryScale,
      disciplineRateScale: catalog.discipline.economy.salaryScale,
    }),
    startsAtWeek: 0,
    endsBeforeWeek: catalog.template.length,
  }));
  const runState: RunState = {
    org: {
      id: "house",
      name: "Backroom HQ",
      money: 10_000,
      audience: 0,
      reputation: 50,
      slots: ACT_ONE_SLOTS,
    },
    collective,
    engagements,
    week: 0,
    consecutiveNegativeWeeks: 0,
    seed,
    rng: root.state(),
    contest: createRng(seed).stream(CONTEST_STREAM_NAME).state(),
    encounter: createRng(seed).stream(ENCOUNTER_STREAM_NAME).state(),
    incidents: createIncidentState(seed),
  };
  const season = startSeason({
    number: 1,
    startWeek: runState.week,
    template: catalog.template,
    goal: { kind: "minimum-contest-wins", target: 2 },
    seed,
    rngState: createRng(seed).stream("season-calendar").state(),
  });
  return { runState, season };
}
