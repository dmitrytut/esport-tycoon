import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  CONTEST_STREAM_NAME,
  type ContestInput,
  type ContestMomentType,
  type ContestRules,
  type ContestSlot,
  type ContestStatWeights,
  resolveContest,
} from "../src/contest.ts";
import { createRng } from "../src/rng.ts";

interface DisciplineContestFixture {
  readonly kind: "head-to-head";
  readonly scoreToWin: number;
  readonly maxUnits: number;
  readonly energyCost: number;
  readonly sideChance: ContestRules["sideChance"];
  readonly momentumRetentionBps: number;
  readonly slots: readonly ContestSlot[];
  readonly metrics: ContestRules["metrics"];
  readonly momentTypes: readonly ContestMomentType[];
}

interface DisciplineFixture {
  readonly id: string;
  readonly rosterSize: number;
  readonly statWeights: ContestStatWeights;
  readonly contest: DisciplineContestFixture;
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = join(repoRoot, "packages/core/test/fixtures/second-discipline.json");
const validatorPath = join(repoRoot, "tools/validate-content/src/index.ts");
const temporaryRoots: string[] = [];

function loadFixture(): DisciplineFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as DisciplineFixture;
}

function validateFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "et-portable-discipline-"));
  temporaryRoots.push(root);
  cpSync(join(repoRoot, "content/schema"), join(root, "schema"), { recursive: true });
  for (const directory of [
    "disciplines",
    "traits",
    "events",
    "regions",
    "names",
    "activities",
    "seasons",
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  cpSync(fixturePath, join(root, "disciplines/strategy-arena.json"));

  return execFileSync(process.execPath, [validatorPath, root], { encoding: "utf8" });
}

function participant(performerId: string, stat: number) {
  return {
    performerId,
    stats: {
      mechanical: stat,
      cognitive: stat,
      collective: stat,
      composure: stat,
      adaptability: stat,
      presence: stat,
    },
    form: 0,
    energy: 100,
  };
}

function inputFromFixture(fixture: DisciplineFixture): ContestInput {
  const rules: ContestRules = {
    kind: fixture.contest.kind,
    participantCount: fixture.rosterSize,
    statWeights: fixture.statWeights,
    scoreToWin: fixture.contest.scoreToWin,
    maxUnits: fixture.contest.maxUnits,
    energyCost: fixture.contest.energyCost,
    sideChance: fixture.contest.sideChance,
    momentumRetentionBps: fixture.contest.momentumRetentionBps,
    slots: fixture.contest.slots,
    metrics: fixture.contest.metrics,
    momentTypes: fixture.contest.momentTypes,
  };

  return {
    contestId: "portable-1" as ContestInput["contestId"],
    disciplineId: fixture.id,
    rules,
    first: {
      collectiveId: "first",
      participants: [
        participant("first-a", 12),
        participant("first-b", 12),
        participant("first-c", 12),
      ],
    },
    second: {
      collectiveId: "second",
      participants: [
        participant("second-a", 12),
        participant("second-b", 12),
        participant("second-c", 12),
      ],
    },
    rng: {
      seed: 1,
      state: createRng(1).stream(CONTEST_STREAM_NAME).state(),
    },
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Contest discipline portability", () => {
  it("accepts the non-shipped fixture through the production content validator", () => {
    expect(validateFixture()).toContain("Content is valid. disciplines: 1");
  });

  it("resolves different slots, types and metrics without a discipline-specific branch", () => {
    const fixture = loadFixture();
    const result = resolveContest(inputFromFixture(fixture));

    expect(result.disciplineId).toBe("strategy-arena");
    expect(result.unitsResolved).toBe(5);
    expect(result.outcome.kind).not.toBe("draw");
    expect(Math.max(result.tally.first, result.tally.second)).toBeLessThan(5);
    expect(new Set(result.moments.map((moment) => moment.slotId))).toEqual(
      new Set(["draft", "maneuver", "capture"]),
    );
    expect(result.moments.map((moment) => moment.typeId)).toEqual(
      result.moments.map(
        (moment) =>
          ({
            draft: "counter-pick",
            maneuver: "split-pressure",
            capture: "zone-capture",
          })[moment.slotId],
      ),
    );
    expect(
      result.participantResults.some((entry) => Object.hasOwn(entry.metricTotals, "objectives")),
    ).toBe(true);
  });
});
