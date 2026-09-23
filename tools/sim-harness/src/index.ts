#!/usr/bin/env node
/** Headless simulation harness entry point for issue #46. */
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { loadContent } from "./content.ts";
import { POLICY_NAMES, type PolicyName } from "./policy.ts";
import { buildReport, renderReport } from "./report.ts";
import { runPolicy } from "./run.ts";
import { loadScenario, validateScenarioHorizon } from "./scenario.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const defaultScenario = join(repoRoot, "tools/sim-harness/scenarios/act-one.json");

/** The two serializations exposed by the command line. */
type OutputFormat = "json" | "text";

/** Overrides parsed before scenario defaults are applied. */
interface CliOptions {
  /** Scenario path supplied by the user or the shipped act-one path. */
  readonly scenarioPath: string;
  /** Selected policies; empty means every policy. */
  readonly policies: readonly PolicyName[];
  /** Optional seed override. */
  readonly seeds: readonly number[] | undefined;
  /** Optional horizon override. */
  readonly horizon: number | undefined;
  /** Serialization written to stdout. */
  readonly format: OutputFormat;
}

function valueAfter(args: readonly string[], index: number): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${args[index] ?? "option"} requires a value`);
  }
  return value;
}

function parsePolicy(value: string): PolicyName {
  if (value === "money" || value === "development" || value === "balanced") return value;
  throw new Error(`policy "${value}" is not one of ${POLICY_NAMES.join(", ")}`);
}

function parseFormat(value: string): OutputFormat {
  if (value === "json" || value === "text") return value;
  throw new Error(`format "${value}" is not json or text`);
}

function parseSeeds(value: string): readonly number[] {
  const parts = value.split(",");
  const seeds = parts.map((part) => Number(part));
  if (
    parts.some((part) => part.length === 0) ||
    seeds.some((seed) => !Number.isSafeInteger(seed)) ||
    new Set(seeds).size !== seeds.length
  ) {
    throw new Error(`seeds "${value}" must be distinct comma-separated integers`);
  }
  return seeds;
}

function parseWeeks(value: string): number {
  const weeks = Number(value);
  if (!Number.isSafeInteger(weeks) || weeks <= 0) {
    throw new Error(`weeks "${value}" must be a positive integer`);
  }
  return weeks;
}

function parseArgs(args: readonly string[]): CliOptions {
  let scenarioPath = defaultScenario;
  const policies: PolicyName[] = [];
  let seeds: readonly number[] | undefined;
  let horizon: number | undefined;
  let format: OutputFormat = "text";

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    // `pnpm <script> -- <args>` forwards the literal `--` separator itself; it marks no
    // option of its own and must not be rejected as unknown.
    if (option === "--") continue;
    if (option === "--scenario") {
      scenarioPath = resolve(valueAfter(args, index));
      index += 1;
    } else if (option === "--policy") {
      const policy = parsePolicy(valueAfter(args, index));
      if (policies.includes(policy)) throw new Error(`policy "${policy}" was supplied twice`);
      policies.push(policy);
      index += 1;
    } else if (option === "--seeds") {
      seeds = parseSeeds(valueAfter(args, index));
      index += 1;
    } else if (option === "--weeks") {
      horizon = parseWeeks(valueAfter(args, index));
      index += 1;
    } else if (option === "--format") {
      format = parseFormat(valueAfter(args, index));
      index += 1;
    } else {
      throw new Error(`unknown option "${option ?? ""}"`);
    }
  }

  return { scenarioPath, policies, seeds, horizon, format };
}

/** Runs one invocation and returns the exact bytes that belong on stdout. */
export function main(args: readonly string[]): string {
  const options = parseArgs(args);
  const content = loadContent(join(repoRoot, "content"));
  const scenario = loadScenario(options.scenarioPath, content);
  const policies = options.policies.length === 0 ? POLICY_NAMES : options.policies;
  const seeds = options.seeds ?? scenario.seeds;
  const horizon = options.horizon ?? scenario.horizon;
  validateScenarioHorizon(scenario, horizon);

  const startedAt = performance.now();
  const runs = policies.flatMap((policy) =>
    seeds.map((seed) => runPolicy(scenario, content, policy, seed, horizon)),
  );
  const durationMs = performance.now() - startedAt;
  const report = buildReport({
    scenario,
    scenarioPath: options.scenarioPath,
    horizon,
    seeds,
    content,
    runs,
    durationMs,
  });

  return options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report);
}

try {
  process.stdout.write(main(process.argv.slice(2)));
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`sim-harness: ${message}\n`);
  process.exitCode = 1;
}
