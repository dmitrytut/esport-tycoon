import {
  CONTEST_STREAM_NAME,
  type ContestId,
  type ContestInput,
  type ContestResult,
  type ContestRules,
} from "../src/index.ts";

const contestId = "contest-1" as ContestId;
const rules: ContestRules = {
  kind: "head-to-head",
  participantCount: 1,
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
  energyCost: 20,
  sideChance: {
    strengthBpsPerDeciPoint: 30,
    momentumBpsPerPoint: 10,
    underdogFloorBps: 4000,
  },
  momentumRetentionBps: 7500,
  slots: [{ id: "resolution", scoring: true }],
  metrics: [{ id: "contribution", label: "Contribution" }],
  momentTypes: [
    {
      id: "conversion",
      slot: "resolution",
      weight: 1,
      momentumShift: 10,
      participantMetricDeltas: { contribution: 1 },
    },
  ],
};
const participant = {
  performerId: "performer-1",
  stats: {
    mechanical: 10,
    cognitive: 10,
    collective: 10,
    composure: 10,
    adaptability: 10,
    presence: 10,
  },
  form: 0,
  energy: 100,
};
const input: ContestInput = {
  contestId,
  disciplineId: "discipline-1",
  rules,
  first: { collectiveId: "collective-1", participants: [participant] },
  second: {
    collectiveId: "collective-2",
    participants: [{ ...participant, performerId: "performer-2" }],
  },
  rng: { seed: 42, state: [1, 2, 3, 4] },
};
const result: ContestResult = {
  contestId,
  disciplineId: "discipline-1",
  first: { collectiveId: "collective-1", strengthDeciPoints: 100 },
  second: { collectiveId: "collective-2", strengthDeciPoints: 100 },
  unitsResolved: 2,
  tally: { first: 2, second: 0 },
  outcome: {
    kind: "first-win",
    winnerId: "collective-1",
    loserId: "collective-2",
  },
  moments: [
    {
      index: 0,
      unit: 1,
      slotId: "resolution",
      typeId: "conversion",
      collectiveId: "collective-1",
      performerId: "performer-1",
      momentumBefore: 0,
      momentumRetained: 0,
      momentumShift: 10,
      momentumAfter: 10,
      scoreDelta: 1,
      tallyAfter: { first: 1, second: 0 },
      participantMetricDeltas: { contribution: 1 },
    },
  ],
  participantResults: [
    {
      collectiveId: "collective-1",
      performerId: "performer-1",
      strengthDeciPoints: 100,
      energyBefore: 100,
      nominalEnergyCost: 20,
      energyDelta: -20,
      energyAfter: 80,
      metricTotals: { contribution: 1 },
    },
  ],
  rngContinuation: { seed: 42, state: [5, 6, 7, 8] },
};

void CONTEST_STREAM_NAME;
void input;
void result;
