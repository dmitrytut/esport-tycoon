import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CONTEST_STREAM_NAME,
  type ContestInput,
  type ContestMoment,
  type ContestParticipantInput,
  type ContestRules,
  resolveContest,
} from "../../src/contest.ts";
import { createRng } from "../../src/rng.ts";

const statsArb = fc.record({
  mechanical: fc.integer({ min: 1, max: 20 }),
  cognitive: fc.integer({ min: 1, max: 20 }),
  collective: fc.integer({ min: 1, max: 20 }),
  composure: fc.integer({ min: 1, max: 20 }),
  adaptability: fc.integer({ min: 1, max: 20 }),
  presence: fc.integer({ min: 1, max: 20 }),
});

interface GeneratedParticipantState {
  readonly stats: ContestParticipantInput["stats"];
  readonly formTenths: number;
  readonly energyTenths: number;
}

const participantStateArb: fc.Arbitrary<GeneratedParticipantState> = fc.record({
  stats: statsArb,
  formTenths: fc.integer({ min: -30, max: 30 }),
  energyTenths: fc.integer({ min: 0, max: 1000 }),
});

const rulesArb: fc.Arbitrary<ContestRules> = fc.integer({ min: 2, max: 8 }).chain((scoreToWin) =>
  fc
    .record({
      maxUnits: fc.integer({ min: scoreToWin, max: 2 * (scoreToWin - 1) }),
      energyCost: fc.integer({ min: 1, max: 100 }),
      strengthBpsPerDeciPoint: fc.integer({ min: 0, max: 100 }),
      momentumBpsPerPoint: fc.integer({ min: 0, max: 40 }),
      underdogFloorBps: fc.integer({ min: 2500, max: 4999 }),
      momentumRetentionBps: fc.integer({ min: 0, max: 10_000 }),
      statWeights: fc.record({
        mechanical: fc.integer({ min: 1, max: 5 }),
        cognitive: fc.integer({ min: 0, max: 5 }),
        collective: fc.integer({ min: 0, max: 5 }),
        composure: fc.integer({ min: 0, max: 5 }),
        adaptability: fc.integer({ min: 0, max: 5 }),
        presence: fc.integer({ min: 0, max: 5 }),
      }),
      typeWeights: fc.tuple(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
      ),
      shifts: fc.tuple(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
      ),
    })
    .map(
      ({
        maxUnits,
        energyCost,
        strengthBpsPerDeciPoint,
        momentumBpsPerPoint,
        underdogFloorBps,
        momentumRetentionBps,
        statWeights,
        typeWeights,
        shifts,
      }): ContestRules => ({
        kind: "head-to-head",
        participantCount: 1,
        statWeights,
        scoreToWin,
        maxUnits,
        energyCost,
        sideChance: {
          strengthBpsPerDeciPoint,
          momentumBpsPerPoint,
          underdogFloorBps,
        },
        momentumRetentionBps,
        slots: [
          { id: "setup", scoring: false },
          { id: "resolution", scoring: true },
        ],
        metrics: [
          { id: "alpha", label: "Alpha" },
          { id: "beta", label: "Beta" },
        ],
        momentTypes: [
          {
            id: "setup-a",
            slot: "setup",
            weight: typeWeights[0],
            momentumShift: shifts[0],
            participantMetricDeltas: { alpha: 1 },
          },
          {
            id: "setup-b",
            slot: "setup",
            weight: typeWeights[1],
            momentumShift: shifts[1],
            participantMetricDeltas: { beta: -1 },
          },
          {
            id: "resolution-a",
            slot: "resolution",
            weight: typeWeights[2],
            momentumShift: shifts[2],
            participantMetricDeltas: { alpha: 2, beta: 1 },
          },
          {
            id: "resolution-b",
            slot: "resolution",
            weight: typeWeights[3],
            momentumShift: shifts[3],
            participantMetricDeltas: { alpha: -1, beta: 2 },
          },
        ],
      }),
    ),
);

function participants(
  prefix: string,
  states: readonly GeneratedParticipantState[],
): readonly ContestParticipantInput[] {
  return states.map((state, index) => ({
    performerId: `${prefix}-${index}`,
    stats: state.stats,
    form: state.formTenths / 10,
    energy: state.energyTenths / 10,
  }));
}

const contestInputArb: fc.Arbitrary<ContestInput> = fc
  .integer({ min: 1, max: 4 })
  .chain((participantCount) =>
    fc
      .record({
        rules: rulesArb,
        seed: fc.integer({ min: 0, max: 0xffffffff }),
        firstStates: fc.array(participantStateArb, {
          minLength: participantCount,
          maxLength: participantCount,
        }),
        secondStates: fc.array(participantStateArb, {
          minLength: participantCount,
          maxLength: participantCount,
        }),
      })
      .map(({ rules, seed, firstStates, secondStates }): ContestInput => {
        const stream = createRng(seed).stream(CONTEST_STREAM_NAME);
        return {
          contestId: `property-${seed}` as ContestInput["contestId"],
          disciplineId: "generated-discipline",
          rules: { ...rules, participantCount },
          first: { collectiveId: "first", participants: participants("first", firstStates) },
          second: { collectiveId: "second", participants: participants("second", secondStates) },
          rng: { seed: stream.seed, state: stream.state() },
        };
      }),
  );

function aggregateMetrics(input: ContestInput, moments: readonly ContestMoment[]) {
  const totals = new Map<string, Record<string, number>>();
  for (const side of [input.first, input.second]) {
    for (const entry of side.participants) totals.set(entry.performerId, {});
  }
  for (const moment of moments) {
    const participantTotals = totals.get(moment.performerId);
    if (participantTotals === undefined) throw new Error("selected participant must exist");
    for (const [metricId, delta] of Object.entries(moment.participantMetricDeltas)) {
      participantTotals[metricId] = (participantTotals[metricId] ?? 0) + delta;
    }
  }
  return totals;
}

describe("Contest resolution properties", () => {
  it("replays identically, stays pure and resumes from JSON continuation", () => {
    fc.assert(
      fc.property(contestInputArb, (input) => {
        const before = structuredClone(input);
        const first = resolveContest(input);
        const replay = resolveContest(structuredClone(input));

        expect(first).toEqual(replay);
        expect(input).toEqual(before);
        expect(JSON.parse(JSON.stringify(first))).toEqual(first);

        const resumedInput = JSON.parse(
          JSON.stringify({
            ...input,
            rng: first.rngContinuation,
          }),
        ) as ContestInput;
        expect(resolveContest(resumedInput)).toEqual(resolveContest(structuredClone(resumedInput)));
      }),
    );
  });

  it("preserves state bounds, conservation, membership and metric reconciliation", () => {
    fc.assert(
      fc.property(contestInputArb, (input) => {
        const result = resolveContest(input);
        const memberIds = new Map([
          [
            input.first.collectiveId,
            new Set(input.first.participants.map((entry) => entry.performerId)),
          ],
          [
            input.second.collectiveId,
            new Set(input.second.participants.map((entry) => entry.performerId)),
          ],
        ]);
        const expectedMetrics = aggregateMetrics(input, result.moments);

        expect(result.unitsResolved).toBeGreaterThanOrEqual(1);
        expect(result.unitsResolved).toBeLessThanOrEqual(input.rules.maxUnits);
        expect(result.tally.first + result.tally.second).toBe(result.unitsResolved);

        for (let unit = 1; unit <= result.unitsResolved; unit += 1) {
          const unitMoments = result.moments.filter((moment) => moment.unit === unit);
          expect(unitMoments.map((moment) => moment.slotId)).toEqual(["setup", "resolution"]);
          expect(unitMoments.reduce((total, moment) => total + moment.scoreDelta, 0)).toBe(1);
        }

        for (const moment of result.moments) {
          expect(moment.momentumBefore).toBeGreaterThanOrEqual(-100);
          expect(moment.momentumBefore).toBeLessThanOrEqual(100);
          expect(moment.momentumAfter).toBeGreaterThanOrEqual(-100);
          expect(moment.momentumAfter).toBeLessThanOrEqual(100);
          expect(moment.tallyAfter.first).toBeGreaterThanOrEqual(0);
          expect(moment.tallyAfter.second).toBeGreaterThanOrEqual(0);
          expect(memberIds.get(moment.collectiveId)?.has(moment.performerId)).toBe(true);
        }

        for (const participantResult of result.participantResults) {
          expect(participantResult.energyAfter).toBeGreaterThanOrEqual(0);
          expect(participantResult.energyAfter).toBeLessThanOrEqual(100);
          expect(participantResult.energyDelta).toBeLessThanOrEqual(0);
          expect(participantResult.metricTotals).toEqual(
            expectedMetrics.get(participantResult.performerId),
          );
        }
      }),
    );
  });

  it("ignores participant and Moment-type insertion order", () => {
    fc.assert(
      fc.property(contestInputArb, (input) => {
        const reordered: ContestInput = {
          ...input,
          rules: { ...input.rules, momentTypes: [...input.rules.momentTypes].reverse() },
          first: { ...input.first, participants: [...input.first.participants].reverse() },
          second: { ...input.second, participants: [...input.second.participants].reverse() },
        };

        expect(resolveContest(reordered)).toEqual(resolveContest(input));
      }),
    );
  });

  it("rejects without changing invalid input or its continuation", () => {
    fc.assert(
      fc.property(contestInputArb, (input) => {
        const invalid = structuredClone(input) as unknown as {
          first: { collectiveId: string };
          second: { collectiveId: string };
        };
        invalid.second.collectiveId = invalid.first.collectiveId;
        const before = structuredClone(invalid);

        expect(() => resolveContest(invalid as unknown as ContestInput)).toThrow(/collectiveId/);
        expect(invalid).toEqual(before);
      }),
    );
  });
});
