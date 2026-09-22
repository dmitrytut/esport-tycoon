import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { collectiveMorale, executeWeek, STAT_KEYS, validateWeekPlan } from "@et/core";
import { describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import { buildReport, renderReport } from "../src/report.ts";
import type { PolicyRun, WalkedWeek } from "../src/run.ts";
import { openingState, planBlock, runPolicy } from "../src/run.ts";
import type { Scenario } from "../src/scenario.ts";
import { loadScenario } from "../src/scenario.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const content = loadContent(join(repoRoot, "content"));
const scenarioPath = join(repoRoot, "tools/sim-harness/scenarios/act-one.json");
const scenario = loadScenario(scenarioPath, content);
const smokeScenarioPath = join(repoRoot, "tools/sim-harness/scenarios/incidents-smoke.json");
const smokeScenario = loadScenario(smokeScenarioPath, content);

/** A report over the three policies on one seed, at the given horizon. */
function reportOf(from: Scenario, horizon: number, seeds: readonly number[] = [1]) {
  const runs = seeds.flatMap((seed) =>
    (["money", "development", "balanced"] as const).map((policy) =>
      runPolicy(from, content, policy, seed, horizon),
    ),
  );
  return buildReport({
    scenario: from,
    scenarioPath,
    horizon,
    seeds,
    content,
    runs,
    durationMs: 12,
  });
}

describe("the report", () => {
  it("states what produced it", () => {
    const text = renderReport(reportOf(scenario, 8));

    expect(text).toContain("act-one");
    expect(text).toContain("horizon");
    expect(text).toContain("seeds");
    expect(text).toContain("mask");
    expect(text).toContain("activities 11");
    for (const policy of ["money", "development", "balanced"]) expect(text).toContain(policy);
  });

  it("keeps the quiet weeks and the uninterrupted weeks apart", () => {
    const report = reportOf(scenario, 8);
    const text = renderReport(report);
    const run = report.policies[0]?.seeds[0];
    if (run === undefined) throw new Error("the report is empty");

    expect(run.kinds.quiet).not.toBe(undefined);
    expect(run.uninterruptedWeeks).not.toBe(undefined);
    expect(text).toContain("quiet");
    expect(text).toContain("uninterrupted");
  });

  it("counts an uninterrupted week from the week's own reasons", () => {
    const report = reportOf(scenario, 12);

    for (const policy of report.policies) {
      for (const seed of policy.seeds) {
        const byReasons = seed.weekly.filter((week) => week.unmaskedReasons === 0).length;

        expect(seed.uninterruptedWeeks).toBe(byReasons);
        expect(seed.uninterruptedShare).toBeCloseTo(byReasons / seed.weekly.length, 10);
      }
    }
  });

  it("never counts a block running out as an interruption", () => {
    const report = reportOf(scenario, 12);
    const reasons = report.policies.flatMap((policy) =>
      policy.seeds.flatMap((seed) => Object.keys(seed.reasons)),
    );

    expect(reasons).not.toContain("block-ran-out");
  });

  it("does not score the same horizon by the block length alone", () => {
    const short = reportOf(scenario, 12).policies[0]?.seeds[0];
    const long = reportOf({ ...scenario, blockWeeks: 6 }, 12).policies[0]?.seeds[0];
    if (short === undefined || long === undefined) throw new Error("the report is empty");

    const counted = (seed: typeof short): number =>
      seed.weekly.filter((week) => week.unmaskedReasons === 0).length;

    expect(short.uninterruptedWeeks).toBe(counted(short));
    expect(long.uninterruptedWeeks).toBe(counted(long));
  });

  it("records a masked reason and leaves the week uninterrupted", () => {
    const masked = { ...scenario, masked: ["energy-threshold"] as const };
    const report = reportOf(masked, 24);
    const seed = report.policies.find((policy) => policy.policy === "development")?.seeds[0];
    if (seed === undefined) throw new Error("the report is empty");

    expect(seed.reasons["energy-threshold"]).toBeGreaterThan(0);
    for (const week of seed.weekly) {
      if (week.unmaskedReasons === 0) continue;
      expect(week.reasonKinds).not.toEqual(["energy-threshold"]);
    }
  });

  it("reports the balance per week and splits no money between activities", () => {
    const report = reportOf(scenario, 8);
    const seed = report.policies.find((policy) => policy.policy === "money")?.seeds[0];
    if (seed === undefined) throw new Error("the report is empty");

    expect(seed.weekly.every((week) => typeof week.balance === "number")).toBe(true);
    expect(seed.weekly.every((week) => Array.isArray(week.executed))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/moneyBy|perActivityMoney|incomeBy/);
  });

  it("matches figures observed in a direct core walk", () => {
    const seed = reportOf(scenario, 4).policies.find((policy) => policy.policy === "balanced")
      ?.seeds[0];
    if (seed === undefined) throw new Error("the report is empty");

    const opening = openingState(scenario, content, 1);
    const plan = planBlock(scenario, "balanced", opening);
    validateWeekPlan(plan, opening.collective);
    let state = opening;
    for (let index = 0; index < 4; index += 1) {
      const planned = plan.weeks[index];
      if (planned === undefined) throw new Error(`the direct plan has no week ${index}`);
      state = executeWeek(state, planned).state;
      const observed = seed.weekly[index];
      if (observed === undefined) throw new Error(`the report has no week ${index}`);
      const meanEnergy =
        state.collective.members.reduce((sum, member) => sum + member.state.energy, 0) /
        state.collective.members.length;

      expect(observed.balance).toBe(state.org.money);
      expect(observed.audience).toBe(state.org.audience);
      expect(observed.meanEnergy).toBe(meanEnergy);
      expect(observed.collectiveMorale).toBe(collectiveMorale(state.collective));
    }

    for (const key of STAT_KEYS) {
      let expected = 0;
      for (let index = 0; index < state.collective.members.length; index += 1) {
        const before = opening.collective.members[index];
        const after = state.collective.members[index];
        if (before === undefined || after === undefined) throw new Error("collective changed size");
        expected += after.stats[key] - before.stats[key];
      }
      expect(seed.statGrowth.byStat[key]).toBeCloseTo(expected, 12);
    }
  });

  it("carries no metric for a mechanic that does not exist", () => {
    const report = reportOf(scenario, 8);
    const text = JSON.stringify(report).toLowerCase();

    // `contest` and `series` are week kinds the core classifies, not figures invented here.
    for (const absent of ["salary", "prize", "bankrupt", "placement"]) {
      expect(text).not.toContain(absent);
    }
  });

  it("declares no policy the winner", () => {
    const text = renderReport(reportOf(scenario, 8)).toLowerCase();

    for (const verdict of ["winner", "best", "recommended"]) expect(text).not.toContain(verdict);
  });
});

describe("incident configuration and occurrence in the report", () => {
  it("declares incidents disabled when the scenario omits configuration", () => {
    const report = reportOf(scenario, 4);

    expect(report.incidents).toEqual({ enabled: false });
  });

  it("declares the configured incident ids and cadence, and reports the loaded catalog size", () => {
    const report = reportOf(smokeScenario, smokeScenario.horizon, smokeScenario.seeds);

    expect(report.incidents).toEqual({
      enabled: true,
      ids: ["press-conference-own-goal", "sponsor-audit-surprise", "gear-malfunction-mid-scrim"],
      cadence: 1,
    });
    expect(report.content.incidents).toBe(3);
  });

  it("reports an occurrence and resolution for every declared smoke seed", () => {
    const report = reportOf(smokeScenario, smokeScenario.horizon, smokeScenario.seeds);

    for (const policy of report.policies) {
      for (const seed of policy.seeds) {
        expect(seed.incidents.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps direct choices free of check fields and check choices carrying roll and total", () => {
    const opening = openingState(scenario, content, 1);
    const baseWeek: Pick<WalkedWeek, "result" | "state" | "returnedControl" | "planned"> = {
      result: {
        week: 0,
        kind: "ordinary",
        slotsSpent: 0,
        executed: [],
        skipped: [],
        reasons: [],
      },
      state: opening,
      returnedControl: true,
      planned: [],
    };
    const directWeek: WalkedWeek = {
      ...baseWeek,
      result: {
        ...baseWeek.result,
        reasons: [
          { kind: "incident-pending", incidentId: "gear-malfunction-mid-scrim", performerId: "p0" },
        ],
      },
      resolution: {
        incidentId: "gear-malfunction-mid-scrim",
        performerId: "p0",
        week: 0,
        choiceId: "borrow-a-spare",
        outcome: "direct",
        effects: [
          { kind: "energy", amount: -4 },
          { kind: "form", amount: -3 },
        ],
      },
    };
    const checkWeek: WalkedWeek = {
      ...baseWeek,
      result: {
        ...baseWeek.result,
        week: 1,
        reasons: [
          { kind: "incident-pending", incidentId: "press-conference-own-goal", performerId: "p0" },
        ],
      },
      resolution: {
        incidentId: "press-conference-own-goal",
        performerId: "p0",
        week: 1,
        choiceId: "answer-live",
        outcome: "success",
        effects: [{ kind: "reputation", amount: 3 }],
        roll: 15,
        total: 27,
      },
    };
    const run: PolicyRun = {
      policy: "money",
      seed: 1,
      opening,
      weeks: [directWeek, checkWeek],
      state: opening,
    };

    const report = buildReport({
      scenario,
      scenarioPath,
      horizon: 2,
      seeds: [1],
      content,
      runs: [run],
      durationMs: 1,
    });
    const seed = report.policies[0]?.seeds[0];
    if (seed === undefined) throw new Error("the report is empty");

    expect(seed.incidentOccurrences).toEqual({
      "gear-malfunction-mid-scrim": 1,
      "press-conference-own-goal": 1,
    });
    expect(seed.incidentChoices).toEqual({ "borrow-a-spare": 1, "answer-live": 1 });
    expect(seed.incidentOutcomes).toEqual({ direct: 1, success: 1, failure: 0 });
    expect(seed.incidents).toHaveLength(2);

    const [direct, checked] = seed.incidents;
    expect(direct?.roll).toBeUndefined();
    expect(direct?.total).toBeUndefined();
    expect(JSON.stringify(direct)).not.toMatch(/"roll"|"total"/);
    expect(checked?.roll).toBe(15);
    expect(checked?.total).toBe(27);
    expect(checked?.postState.balance).toBe(opening.org.money);

    const text = renderReport(report);
    expect(text).toContain("gear-malfunction-mid-scrim");
    expect(text).toContain("borrow-a-spare");
    expect(text).toContain("answer-live");
    expect(text).toContain("success");
  });
});
