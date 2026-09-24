import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import { loadContestScenario, scenarioKind } from "../src/contest-scenario.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const content = loadContent(join(repoRoot, "content"));
const scenarioPath = join(repoRoot, "tools/sim-harness/scenarios/contest-strength.json");
const created: string[] = [];

function changedScenario(change: (value: Record<string, unknown>) => void): string {
  const root = mkdtempSync(join(tmpdir(), "et-contest-scenario-"));
  created.push(root);
  const value: Record<string, unknown> = JSON.parse(readFileSync(scenarioPath, "utf8"));
  change(value);
  const path = join(root, basename(scenarioPath));
  writeFileSync(path, JSON.stringify(value));
  return path;
}

afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("contest-only scenario loading", () => {
  it("declares the complete seed population, orientations and comparison profiles", () => {
    const scenario = loadContestScenario(scenarioPath, content);

    expect(scenarioKind(scenarioPath)).toBe("contest-only");
    expect(scenario.id).toBe("contest-strength");
    expect(scenario.disciplineId).toBe("tactical-shooter");
    expect(scenario.rulesId).toBe("tactical-shooter");
    expect(scenario.seedRange).toEqual({ first: 0, last: 4095 });
    expect(scenario.orientations).toEqual(["stronger-first", "weaker-first"]);
    expect(scenario.comparisons.map((entry) => entry.id)).toEqual([
      "mechanical-edge",
      "maximum-gap",
    ]);
    expect(scenario.comparisons[0]?.thresholds).toEqual({
      minimumStrongerWinBps: 5500,
      minimumAdvantageBps: 1000,
      minimumWeakerWinBps: 2000,
    });
    expect(scenario.comparisons[1]?.thresholds).toEqual({
      minimumWeakerWinBps: 500,
      maximumOrientationGapBps: 300,
    });
    expect(scenario.comparisons.every((entry) => entry.stronger.participantCount === 5)).toBe(true);
    expect(scenario.comparisons.every((entry) => entry.weaker.participantCount === 5)).toBe(true);
    expect(scenario.rules.participantCount).toBe(5);
    expect(scenario.rules.scoreToWin).toBe(13);
    expect(scenario.rules.maxUnits).toBe(24);
  });
  it.each([
    [
      "root",
      "seedRanges",
      (value: Record<string, unknown>) => {
        value["seedRanges"] = { first: 0, last: 4095 };
      },
    ],
    [
      "comparison",
      "threshold",
      (value: Record<string, unknown>) => {
        const comparisons = value["comparisons"] as Record<string, unknown>[];
        const comparison = comparisons[0];
        if (comparison === undefined) throw new Error("mechanical comparison missing");
        comparison["threshold"] = {};
      },
    ],
    [
      "profile",
      "rosterSize",
      (value: Record<string, unknown>) => {
        const comparisons = value["comparisons"] as {
          stronger: Record<string, unknown>;
        }[];
        const comparison = comparisons[0];
        if (comparison === undefined) throw new Error("mechanical comparison missing");
        comparison.stronger["rosterSize"] = 5;
      },
    ],
    [
      "threshold",
      "minimumStrongerWinsBps",
      (value: Record<string, unknown>) => {
        const comparisons = value["comparisons"] as {
          thresholds: Record<string, unknown>;
        }[];
        const comparison = comparisons[0];
        if (comparison === undefined) throw new Error("mechanical comparison missing");
        comparison.thresholds["minimumStrongerWinsBps"] = 5500;
      },
    ],
  ])("rejects an unknown %s field", (_location, key, change) => {
    const path = changedScenario(change);

    expect(() => loadContestScenario(path, content)).toThrow(
      new RegExp(`${key}.*not supported`, "i"),
    );
  });

  it("rejects a selected seed subset before resolving a Contest", () => {
    const path = changedScenario((value) => {
      value["seedRange"] = { first: 1, last: 4095 };
    });

    expect(() => loadContestScenario(path, content)).toThrow(/contest-strength.*0 through 4095/i);
  });

  it("rejects missing or reordered orientation declarations", () => {
    const path = changedScenario((value) => {
      value["orientations"] = ["weaker-first"];
    });

    expect(() => loadContestScenario(path, content)).toThrow(
      /orientations.*stronger-first.*weaker-first/i,
    );
  });

  it("rejects a profile that does not fit the discipline participant count", () => {
    const path = changedScenario((value) => {
      const comparisons = value["comparisons"] as { stronger: { participantCount: number } }[];
      const comparison = comparisons[0];
      if (comparison === undefined) throw new Error("mechanical comparison missing");
      comparison.stronger.participantCount = 4;
    });

    expect(() => loadContestScenario(path, content)).toThrow(
      /mechanical-14.*participantCount 4.*5/i,
    );
  });

  it("rejects a rules id absent from loaded content", () => {
    const path = changedScenario((value) => {
      value["disciplineId"] = "unknown-rules";
      value["rulesId"] = "unknown-rules";
    });

    expect(() => loadContestScenario(path, content)).toThrow(/unknown-rules.*content/i);
  });
});
