import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import {
  buildContestReport,
  type ContestReport,
  measureContestScenario,
  renderContestReport,
} from "../src/contest-report.ts";
import { loadContestScenario } from "../src/contest-scenario.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const scenarioPath = join(repoRoot, "tools/sim-harness/scenarios/contest-strength.json");
const content = loadContent(join(repoRoot, "content"));
const scenario = loadContestScenario(scenarioPath, content);

function reportOf(durationMs = 12): ContestReport {
  return buildContestReport({
    scenario,
    scenarioPath,
    measurements: measureContestScenario(scenario),
    durationMs,
  });
}

function withoutDuration(report: ContestReport): string {
  return JSON.stringify(report, (key, value: unknown) =>
    key === "durationMs" ? undefined : value,
  );
}

describe("contest-only reports", () => {
  it("states rules, profiles, seeds and orientation-specific public outcomes", () => {
    const report = reportOf();

    expect(report.kind).toBe("contest-only");
    expect(report.scenario).toBe("contest-strength");
    expect(report.disciplineId).toBe("tactical-shooter");
    expect(report.rulesId).toBe("tactical-shooter");
    expect(report.seedRange).toEqual({ first: 0, last: 4095 });
    expect(report.seedCount).toBe(4096);
    expect(report.rules.scoreToWin).toBe(13);
    expect(report.rules.momentTypes).toHaveLength(6);
    expect(report.comparisons).toHaveLength(2);

    for (const comparison of report.comparisons) {
      expect(comparison.orientations.map((entry) => entry.orientation)).toEqual([
        "stronger-first",
        "weaker-first",
      ]);
      for (const orientation of comparison.orientations) {
        const { counts, ratesBps } = orientation;
        expect(counts.strongerWins + counts.weakerWins + counts.draws).toBe(4096);
        expect(ratesBps.strongerWins).toBe(Math.round((counts.strongerWins * 10_000) / 4096));
        expect(ratesBps.weakerWins).toBe(Math.round((counts.weakerWins * 10_000) / 4096));
        expect(ratesBps.draws).toBe(Math.round((counts.draws * 10_000) / 4096));
      }
    }

    expect(Object.hasOwn(report, "horizon")).toBe(false);
    expect(Object.hasOwn(report, "policies")).toBe(false);
    expect(Object.hasOwn(report, "incidents")).toBe(false);
  });

  it("produces byte-identical game metrics on repeated measurements", () => {
    expect(withoutDuration(reportOf(1))).toBe(withoutDuration(reportOf(2)));
  });

  it("renders text from the same report data", () => {
    const text = renderContestReport(reportOf());

    expect(text).toContain("Contest measurement: contest-strength");
    expect(text).toContain("seeds 0..4095 (4096)");
    expect(text).toContain("mechanical-edge");
    expect(text).toContain("maximum-gap");
    expect(text).toContain("stronger-first");
    expect(text).toContain("weaker-first");
  });

  it("meets every predeclared outcome-distribution threshold", () => {
    const report = reportOf();
    const mechanical = report.comparisons.find((entry) => entry.id === "mechanical-edge");
    const maximumGap = report.comparisons.find((entry) => entry.id === "maximum-gap");
    if (mechanical === undefined || maximumGap === undefined) throw new Error("comparison missing");

    for (const orientation of mechanical.orientations) {
      expect(orientation.ratesBps.strongerWins).toBeGreaterThanOrEqual(5500);
      expect(
        orientation.ratesBps.strongerWins - orientation.ratesBps.weakerWins,
      ).toBeGreaterThanOrEqual(1000);
      expect(orientation.ratesBps.weakerWins).toBeGreaterThanOrEqual(2000);
    }

    for (const orientation of maximumGap.orientations) {
      expect(orientation.ratesBps.weakerWins).toBeGreaterThanOrEqual(500);
    }
    const [strongerFirst, weakerFirst] = maximumGap.orientations;
    if (strongerFirst === undefined || weakerFirst === undefined)
      throw new Error("orientation missing");
    expect(
      Math.abs(strongerFirst.ratesBps.strongerWins - weakerFirst.ratesBps.strongerWins),
    ).toBeLessThanOrEqual(300);
    expect(
      Math.abs(strongerFirst.ratesBps.weakerWins - weakerFirst.ratesBps.weakerWins),
    ).toBeLessThanOrEqual(300);
  });
});
