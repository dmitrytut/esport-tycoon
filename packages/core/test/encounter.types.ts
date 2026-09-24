import {
  type ActiveSeason,
  type ContestId,
  type ContestResult,
  type ContestRules,
  type EncounterDefinition,
  type EncounterField,
  type EncounterState,
  materializeEncounterField,
  type MaterializeEncounterFieldResult,
  openEncounter,
  type OpenEncounterResult,
  type PendingEncounter,
  type RunState,
  type Season,
  type SettledEncounter,
  settleEncounter,
  type SettleEncounterResult,
} from "../src/index.ts";

declare const runState: RunState;
declare const activeSeason: ActiveSeason;
declare const result: ContestResult;
declare const contestId: ContestId;
declare const rules: ContestRules;

const definition: EncounterDefinition = {
  id: "opponent",
  label: "Fictional opponent",
  disciplineId: "tactical-shooter",
  opponent: {
    origin: {
      id: "western-europe",
      language: "en",
      secondLanguages: [],
      talentDensity: 1,
      givenNames: ["Robin"],
      handles: ["comet"],
    },
    level: 2,
  },
  reward: { win: 12, loss: 2, draw: 5 },
};
const entryId = { kind: "season-entry" as const, season: 1, relativeWeek: 0 };
const field: EncounterField = [
  {
    definitionId: definition.id,
    disciplineId: definition.disciplineId,
    reward: definition.reward,
    collective: runState.collective,
  },
];
const pending: PendingEncounter = { kind: "pending", entryId, definitionId: definition.id };
const settled: SettledEncounter = {
  ...pending,
  kind: "settled",
  outcome: "draw",
  reward: definition.reward.draw,
  result,
};
const encounter: EncounterState = settled;
const season: Season = { ...activeSeason, field, encounters: [pending] };
const continuations: readonly [RunState["contest"], RunState["encounter"]] = [
  runState.contest,
  runState.encounter,
];
const materialized: MaterializeEncounterFieldResult = materializeEncounterField({
  runState,
  season: activeSeason,
  disciplineId: definition.disciplineId,
  rules,
  pool: [definition],
});
const opened: OpenEncounterResult = openEncounter({ runState, season, entryId });
const settledTransition: SettleEncounterResult = settleEncounter({
  runState,
  season,
  entryId,
  contestId,
  rules,
  participantIds: runState.collective.members.map(({ id }) => id),
});

void encounter;
void continuations;
void materialized;
void opened;
void settledTransition;
