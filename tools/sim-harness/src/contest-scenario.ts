/** Contest-only scenario loading and preflight validation. */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { type ContestRules, STAT_KEYS, type Stats } from "@et/core";

import type { SimContent } from "./content.ts";

/** The two declared placements used to expose positional bias. */
export type ContestOrientation = "stronger-first" | "weaker-first";

/** One fully specified homogeneous Collective profile. */
export interface ContestProfile {
  /** Stable report identity. */
  readonly id: string;
  /** Stable Collective id supplied to core. */
  readonly collectiveId: string;
  /** Number of generated participant records. */
  readonly participantCount: number;
  /** Complete six-stat values shared by the profile's participants. */
  readonly stats: Stats;
  /** Shared form on the −3…3 one-decimal grid. */
  readonly form: number;
  /** Shared opening energy on the 0…100 one-decimal grid. */
  readonly energy: number;
}

/** Predeclared aggregate bounds checked without storing per-seed outcomes. */
export interface ContestThresholds {
  /** Optional stronger-profile win-rate floor. */
  readonly minimumStrongerWinBps?: number;
  /** Optional stronger-minus-weaker win-rate floor. */
  readonly minimumAdvantageBps?: number;
  /** Optional weaker-profile win-rate floor. */
  readonly minimumWeakerWinBps?: number;
  /** Optional maximum profile rate difference between the two orientations. */
  readonly maximumOrientationGapBps?: number;
}

/** One stronger/weaker comparison over the same rules and seed population. */
export interface ContestComparison {
  /** Stable comparison id printed in reports. */
  readonly id: string;
  /** Declared stronger profile. */
  readonly stronger: ContestProfile;
  /** Declared weaker profile. */
  readonly weaker: ContestProfile;
  /** Bounds committed with the scenario before measurements. */
  readonly thresholds: ContestThresholds;
}

/** Inclusive deterministic seed population. */
export interface ContestSeedRange {
  /** First root seed. */
  readonly first: number;
  /** Last root seed. */
  readonly last: number;
}

/** Loaded contest-only scenario ready for direct core measurement. */
export interface ContestScenario {
  /** Stable scenario id matching the file name. */
  readonly id: string;
  /** Run-kind discriminator. */
  readonly kind: "contest-only";
  /** Discipline provenance printed in reports. */
  readonly disciplineId: string;
  /** Content id from which complete rules were resolved. */
  readonly rulesId: string;
  /** Complete validated rules handed to core without defaults. */
  readonly rules: ContestRules;
  /** Fixed inclusive root-seed population. */
  readonly seedRange: ContestSeedRange;
  /** Both declared placements in report order. */
  readonly orientations: readonly ContestOrientation[];
  /** Predeclared profile comparisons. */
  readonly comparisons: readonly ContestComparison[];
}

/** External file shape before references and numeric invariants are checked. */
interface ContestScenarioFile {
  /** Stable scenario id. */
  readonly id: string;
  /** Untrusted run-kind discriminator checked before use. */
  readonly kind: unknown;
  /** Discipline provenance. */
  readonly disciplineId: string;
  /** Content rules reference. */
  readonly rulesId: string;
  /** Inclusive root-seed population. */
  readonly seedRange: ContestSeedRange;
  /** Declared placements. */
  readonly orientations: readonly ContestOrientation[];
  /** Declared comparisons. */
  readonly comparisons: readonly ContestComparison[];
}

/** Distinguishes the opt-in contest scenario while preserving legacy week files without a kind. */
export function scenarioKind(path: string): "week-walk" | "contest-only" {
  const value = JSON.parse(readFileSync(path, "utf8")) as { readonly kind?: unknown };
  if (value.kind === undefined) return "week-walk";
  if (value.kind === "contest-only") return value.kind;
  throw new Error(`scenario "${basename(path, ".json")}": unknown kind "${String(value.kind)}"`);
}

function oneDecimal(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value * 10);
}

function validateProfile(
  scenarioName: string,
  comparisonId: string,
  profile: ContestProfile,
  rules: ContestRules,
): void {
  const fail = (message: string): never => {
    throw new Error(`scenario "${scenarioName}": comparison "${comparisonId}" ${message}`);
  };
  if (profile.id.length === 0) fail("has a profile with an empty id");
  if (profile.collectiveId.length === 0) fail(`profile "${profile.id}" has an empty collectiveId`);
  if (profile.participantCount !== rules.participantCount) {
    fail(
      `profile "${profile.id}" declares participantCount ${profile.participantCount}; rules require ${rules.participantCount}`,
    );
  }
  for (const stat of STAT_KEYS) {
    const value = profile.stats[stat];
    if (!Number.isInteger(value) || value < 1 || value > 20) {
      fail(
        `profile "${profile.id}" stat "${stat}" is ${String(value)}; expected an integer from 1 through 20`,
      );
    }
  }
  if (!oneDecimal(profile.form) || profile.form < -3 || profile.form > 3) {
    fail(
      `profile "${profile.id}" form is ${String(profile.form)}; expected −3…3 on the one-decimal grid`,
    );
  }
  if (!oneDecimal(profile.energy) || profile.energy < 0 || profile.energy > 100) {
    fail(
      `profile "${profile.id}" energy is ${String(profile.energy)}; expected 0…100 on the one-decimal grid`,
    );
  }
}

function validateThresholds(
  scenarioName: string,
  comparisonId: string,
  thresholds: ContestThresholds,
): void {
  for (const [name, value] of Object.entries(thresholds)) {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      throw new Error(
        `scenario "${scenarioName}": comparison "${comparisonId}" threshold "${name}" is ${String(value)}; expected integer basis points from 0 through 10000`,
      );
    }
  }
}

/** Loads one fixed-population Contest measurement and resolves its rules from content. */
export function loadContestScenario(path: string, content: SimContent): ContestScenario {
  const file = JSON.parse(readFileSync(path, "utf8")) as ContestScenarioFile;
  const name = basename(path, ".json");
  const fail = (message: string): never => {
    throw new Error(`scenario "${name}": ${message}`);
  };

  if (file.id !== name) fail(`declares id "${file.id}", which does not match the file name`);
  if (file.kind !== "contest-only") fail(`kind is "${String(file.kind)}", expected "contest-only"`);
  if (file.disciplineId !== file.rulesId) {
    fail(
      `discipline "${file.disciplineId}" and rules "${file.rulesId}" must be the same content id`,
    );
  }
  const rules =
    content.contestRules.get(file.rulesId) ??
    fail(`rules "${file.rulesId}" are not defined by content`);
  if (file.seedRange.first !== 0 || file.seedRange.last !== 4095) {
    fail(
      `declares seeds ${String(file.seedRange.first)} through ${String(file.seedRange.last)}; expected exactly 0 through 4095`,
    );
  }
  if (
    file.orientations.length !== 2 ||
    file.orientations[0] !== "stronger-first" ||
    file.orientations[1] !== "weaker-first"
  ) {
    fail('orientations must be exactly "stronger-first", "weaker-first" in that order');
  }
  if (file.comparisons.length === 0) fail("declares no comparison");

  const comparisonIds = new Set<string>();
  for (const comparison of file.comparisons) {
    if (comparisonIds.has(comparison.id)) fail(`comparison id "${comparison.id}" is duplicated`);
    comparisonIds.add(comparison.id);
    if (comparison.stronger.collectiveId === comparison.weaker.collectiveId) {
      fail(
        `comparison "${comparison.id}" uses collectiveId "${comparison.stronger.collectiveId}" twice`,
      );
    }
    validateProfile(name, comparison.id, comparison.stronger, rules);
    validateProfile(name, comparison.id, comparison.weaker, rules);
    validateThresholds(name, comparison.id, comparison.thresholds);
  }

  return {
    id: file.id,
    kind: "contest-only",
    disciplineId: file.disciplineId,
    rulesId: file.rulesId,
    rules,
    seedRange: file.seedRange,
    orientations: file.orientations,
    comparisons: file.comparisons,
  };
}
