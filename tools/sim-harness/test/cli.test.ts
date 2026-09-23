import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { SimReport } from "../src/report.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const entry = join(repoRoot, "tools/sim-harness/src/index.ts");
const smokeScenario = join(repoRoot, "tools/sim-harness/scenarios/incidents-smoke.json");

/** Captured process result from invoking the public command line. */
interface CliResult {
  /** Exit status returned by Node. */
  readonly status: number | null;
  /** Standard output produced by the command. */
  readonly stdout: string;
  /** Standard error produced by the command. */
  readonly stderr: string;
}

/** Runs the real entry point from the repository root. */
function run(args: readonly string[]): CliResult {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Parses a successful JSON invocation. */
function jsonRun(args: readonly string[]): SimReport {
  const result = run([...args, "--format", "json"]);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("the simulation command line", () => {
  it("runs the scenario defaults and all policies without input", () => {
    const result = run([]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("horizon 24");
    expect(result.stdout).toContain("seeds 1,2,3,4,5");
    for (const policy of ["money", "development", "balanced"]) {
      expect(result.stdout).toContain(policy);
    }
  });

  it("overrides only policies, seeds, weeks and output format", () => {
    const report = jsonRun([
      "--policy",
      "money",
      "--policy",
      "balanced",
      "--seeds",
      "7,9",
      "--weeks",
      "3",
    ]);

    expect(report.horizon).toBe(3);
    expect(report.seeds).toEqual([7, 9]);
    expect(report.policies.map((policy) => policy.policy)).toEqual(["money", "balanced"]);
    expect(report.mask).toEqual([]);
    expect(report.policies.every((policy) => policy.seeds.length === 2)).toBe(true);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports a bad input and exits non-zero", () => {
    const result = run(["--policy", "omniscient"]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/policy.*omniscient/i);
  });

  it("rejects an effective horizon beyond the declared opening terms", () => {
    const result = run(["--weeks", "25"]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/horizon 25.*duration 24/i);
  });

  it("produces identical game data on identical invocations", () => {
    const args = ["--policy", "balanced", "--seeds", "17,19", "--weeks", "8"];
    const first = jsonRun(args);
    const second = jsonRun(args);
    const deterministicJson = (report: SimReport): string =>
      JSON.stringify(report, (key, value: unknown) => (key === "durationMs" ? undefined : value));

    expect(deterministicJson(first)).toBe(deterministicJson(second));
  });

  it("tolerates the leading -- separator pnpm run forwards from `pnpm sim -- ...`", () => {
    const result = run(["--", "--seeds", "1", "--weeks", "3", "--format", "json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const report: SimReport = JSON.parse(result.stdout);
    expect(report.horizon).toBe(3);
    expect(report.seeds).toEqual([1]);
  });

  it("produces byte-identical incident data on identical invocations of the smoke scenario", () => {
    const args = ["--scenario", smokeScenario, "--seeds", "1,2,3", "--weeks", "4"];
    const first = jsonRun(args);
    const second = jsonRun(args);
    const deterministicJson = (report: SimReport): string =>
      JSON.stringify(report, (key, value: unknown) => (key === "durationMs" ? undefined : value));

    expect(deterministicJson(first)).toBe(deterministicJson(second));
    expect(first.incidents).toEqual({
      enabled: true,
      ids: ["press-conference-own-goal", "sponsor-audit-surprise", "gear-malfunction-mid-scrim"],
      cadence: 1,
    });
    for (const policy of first.policies) {
      for (const seed of policy.seeds) expect(seed.incidents.length).toBeGreaterThan(0);
    }
  });
});
