/** Deterministic Contest measurements and their JSON/text report forms. */
import {
  CONTEST_STREAM_NAME,
  type ContestCollectiveInput,
  type ContestId,
  type ContestRules,
  createRng,
  resolveContest,
} from "@et/core";

import type {
  ContestComparison,
  ContestOrientation,
  ContestProfile,
  ContestScenario,
  ContestSeedRange,
  ContestThresholds,
} from "./contest-scenario.ts";

/** Public outcome counts for one profile placement. */
export interface ContestOutcomeCounts {
  /** Contests won by the declared stronger profile. */
  readonly strongerWins: number;
  /** Contests won by the declared weaker profile. */
  readonly weakerWins: number;
  /** Contests ending level at the unit cap. */
  readonly draws: number;
}

/** Integer rates over the complete seed population, including draws in the denominator. */
export interface ContestOutcomeRates {
  /** Stronger-profile wins in basis points. */
  readonly strongerWins: number;
  /** Weaker-profile wins in basis points. */
  readonly weakerWins: number;
  /** Draws in basis points. */
  readonly draws: number;
}

/** Raw aggregate measurement for one orientation. */
export interface ContestOrientationMeasurement {
  /** Which profile occupies the first semantic side. */
  readonly orientation: ContestOrientation;
  /** First-side profile id. */
  readonly firstProfileId: string;
  /** Second-side profile id. */
  readonly secondProfileId: string;
  /** Outcome counts derived only from public Contest outcomes. */
  readonly counts: ContestOutcomeCounts;
}

/** Raw aggregate measurements for one declared comparison. */
export interface ContestComparisonMeasurement {
  /** Stable comparison id. */
  readonly id: string;
  /** Both placements in scenario order. */
  readonly orientations: readonly ContestOrientationMeasurement[];
}

/** Reported orientation with both counts and integer rates. */
export interface ContestOrientationReport extends ContestOrientationMeasurement {
  /** Outcome rates whose denominator is every declared seed. */
  readonly ratesBps: ContestOutcomeRates;
}

/** One comparison's declared inputs and measured outcomes. */
export interface ContestComparisonReport {
  /** Stable comparison id. */
  readonly id: string;
  /** Complete stronger profile. */
  readonly stronger: ContestProfile;
  /** Complete weaker profile. */
  readonly weaker: ContestProfile;
  /** Predeclared acceptance bounds, not inferred from outcomes. */
  readonly thresholds: ContestThresholds;
  /** Both measured placements. */
  readonly orientations: readonly ContestOrientationReport[];
}

/** Complete contest-only report with no week-walk concepts. */
export interface ContestReport {
  /** Run-kind discriminator. */
  readonly kind: "contest-only";
  /** Stable scenario id. */
  readonly scenario: string;
  /** Scenario file used by the invocation. */
  readonly scenarioPath: string;
  /** Discipline provenance. */
  readonly disciplineId: string;
  /** Content id that supplied rules. */
  readonly rulesId: string;
  /** Complete rules and Moment catalog handed to core. */
  readonly rules: ContestRules;
  /** Inclusive root-seed range. */
  readonly seedRange: ContestSeedRange;
  /** Number of Contests in each orientation. */
  readonly seedCount: number;
  /** Declared profiles, thresholds and aggregate public outcomes. */
  readonly comparisons: readonly ContestComparisonReport[];
  /** Wall-clock measurement excluded from deterministic comparisons. */
  readonly durationMs: number;
}

/** Inputs that separate deterministic measurements from report timing. */
export interface BuildContestReportOptions {
  /** Loaded scenario that declared all measurement inputs. */
  readonly scenario: ContestScenario;
  /** Scenario file used by the invocation. */
  readonly scenarioPath: string;
  /** Aggregate outcome measurements from core. */
  readonly measurements: readonly ContestComparisonMeasurement[];
  /** Observed wall-clock duration. */
  readonly durationMs: number;
}

/** Expand a homogeneous profile without invoking performer generation or another RNG stream. */
function collectiveOf(profile: ContestProfile): ContestCollectiveInput {
  return {
    collectiveId: profile.collectiveId,
    participants: Array.from({ length: profile.participantCount }, (_, index) => ({
      performerId: `${profile.id}-${index + 1}`,
      stats: profile.stats,
      form: profile.form,
      energy: profile.energy,
    })),
  };
}

/** Map a declared orientation to the semantic first and second inputs. */
function orientationProfiles(
  comparison: ContestComparison,
  orientation: ContestOrientation,
): readonly [ContestProfile, ContestProfile] {
  return orientation === "stronger-first"
    ? [comparison.stronger, comparison.weaker]
    : [comparison.weaker, comparison.stronger];
}

/** Aggregate public outcomes for one placement without retaining per-seed results. */
function measureOrientation(
  scenario: ContestScenario,
  comparison: ContestComparison,
  orientation: ContestOrientation,
): ContestOrientationMeasurement {
  const [firstProfile, secondProfile] = orientationProfiles(comparison, orientation);
  const first = collectiveOf(firstProfile);
  const second = collectiveOf(secondProfile);
  let strongerWins = 0;
  let weakerWins = 0;
  let draws = 0;

  for (let seed = scenario.seedRange.first; seed <= scenario.seedRange.last; seed += 1) {
    const continuation = createRng(seed).stream(CONTEST_STREAM_NAME);
    const result = resolveContest({
      contestId: `${scenario.id}-${comparison.id}-${orientation}-${seed}` as ContestId,
      disciplineId: scenario.disciplineId,
      rules: scenario.rules,
      first,
      second,
      rng: { seed: continuation.seed, state: continuation.state() },
    });
    if (result.outcome.kind === "draw") draws += 1;
    else if (result.outcome.winnerId === comparison.stronger.collectiveId) strongerWins += 1;
    else weakerWins += 1;
  }

  return {
    orientation,
    firstProfileId: firstProfile.id,
    secondProfileId: secondProfile.id,
    counts: { strongerWins, weakerWins, draws },
  };
}

/** Resolves every declared seed and orientation directly through the public core engine. */
export function measureContestScenario(
  scenario: ContestScenario,
): readonly ContestComparisonMeasurement[] {
  return scenario.comparisons.map((comparison) => ({
    id: comparison.id,
    orientations: scenario.orientations.map((orientation) =>
      measureOrientation(scenario, comparison, orientation),
    ),
  }));
}

/** Convert one count to half-up integer basis points over the complete population. */
function rate(count: number, denominator: number): number {
  return Math.round((count * 10_000) / denominator);
}

/** Join one declared comparison to the measurement carrying the same stable id. */
function reportedComparison(
  comparison: ContestComparison,
  measurement: ContestComparisonMeasurement,
  seedCount: number,
): ContestComparisonReport {
  return {
    id: comparison.id,
    stronger: comparison.stronger,
    weaker: comparison.weaker,
    thresholds: comparison.thresholds,
    orientations: measurement.orientations.map((orientation) => ({
      ...orientation,
      ratesBps: {
        strongerWins: rate(orientation.counts.strongerWins, seedCount),
        weakerWins: rate(orientation.counts.weakerWins, seedCount),
        draws: rate(orientation.counts.draws, seedCount),
      },
    })),
  };
}

/** Builds the sole serializable object consumed by JSON and text output. */
export function buildContestReport(options: BuildContestReportOptions): ContestReport {
  const seedCount = options.scenario.seedRange.last - options.scenario.seedRange.first + 1;
  const measurements = new Map(options.measurements.map((entry) => [entry.id, entry]));
  const comparisons = options.scenario.comparisons.map((comparison) => {
    const measurement = measurements.get(comparison.id);
    if (measurement === undefined) {
      throw new Error(`contest measurement for comparison "${comparison.id}" is missing`);
    }
    return reportedComparison(comparison, measurement, seedCount);
  });

  return {
    kind: "contest-only",
    scenario: options.scenario.id,
    scenarioPath: options.scenarioPath,
    disciplineId: options.scenario.disciplineId,
    rulesId: options.scenario.rulesId,
    rules: options.scenario.rules,
    seedRange: options.scenario.seedRange,
    seedCount,
    comparisons,
    durationMs: options.durationMs,
  };
}

/** Renders the Contest report without calculating a second set of metrics. */
export function renderContestReport(report: ContestReport): string {
  const lines = [
    `Contest measurement: ${report.scenario} (${report.scenarioPath})`,
    `discipline ${report.disciplineId} · rules ${report.rulesId} · seeds ${report.seedRange.first}..${report.seedRange.last} (${report.seedCount})`,
    `target ${report.rules.scoreToWin} · cap ${report.rules.maxUnits} · energy ${report.rules.energyCost} · moments ${report.rules.momentTypes.length}`,
  ];
  for (const comparison of report.comparisons) {
    lines.push(
      "",
      `${comparison.id}: ${comparison.stronger.id} vs ${comparison.weaker.id}`,
      `thresholds ${JSON.stringify(comparison.thresholds)}`,
    );
    for (const orientation of comparison.orientations) {
      lines.push(
        `${orientation.orientation}: stronger ${orientation.counts.strongerWins} (${orientation.ratesBps.strongerWins} bps) · weaker ${orientation.counts.weakerWins} (${orientation.ratesBps.weakerWins} bps) · draws ${orientation.counts.draws} (${orientation.ratesBps.draws} bps)`,
      );
    }
  }
  lines.push("", `measured in ${report.durationMs.toFixed(2)} ms`);
  return `${lines.join("\n")}\n`;
}
