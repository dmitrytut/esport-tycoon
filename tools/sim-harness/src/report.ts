import type {
  IncidentEffect,
  RunState,
  SkipCause,
  StatKey,
  StopReasonKind,
  WeekKindCounts,
} from "@et/core";
import { collectiveMorale, STAT_KEYS, statsFrom } from "@et/core";

import type { SimContent } from "./content.ts";
import { resolveRateInputs } from "./content.ts";
import { POLICY_NAMES, type PolicyName } from "./policy.ts";
import type { PolicyRun } from "./run.ts";
import type { Scenario } from "./scenario.ts";

/** Balance, audience and collective condition at one point in a run. */
export interface RunSnapshot {
  /** Organization balance at this point. */
  readonly balance: number;
  /** Organization audience at this point. */
  readonly audience: number;
  /** Collective morale derived by the core. */
  readonly collectiveMorale: number;
  /** Arithmetic mean of member energy, or zero for an empty collective. */
  readonly meanEnergy: number;
  /** Completed weeks ending below zero without an intervening non-negative close. */
  readonly consecutiveNegativeWeeks: number;
}

/** One skipped activity in the weekly series. */
export interface WeeklySkip {
  /** Activity that did not execute. */
  readonly activityId: string;
  /** Core-reported reason it did not execute. */
  readonly cause: SkipCause;
}

/** Figures observed after one week, with no effects re-derived by the harness. */
export interface WeeklyReport extends RunSnapshot {
  /** Absolute zero-based week index. */
  readonly week: number;
  /** Structural classification produced by the core. */
  readonly kind: keyof WeekKindCounts;
  /** Change from the balance immediately before this week. */
  readonly balanceDelta: number;
  /** Recurring engagement expense reported by core for this completed week. */
  readonly engagementExpense: number;
  /** Change from the audience immediately before this week. */
  readonly audienceDelta: number;
  /** Activity ids the core says executed. */
  readonly executed: readonly string[];
  /** Activities the core says it skipped, with their causes. */
  readonly skipped: readonly WeeklySkip[];
  /** Every reason kind the core reported, including masked reasons. */
  readonly reasonKinds: readonly StopReasonKind[];
  /** Reasons in this week that the scenario did not mask. */
  readonly unmaskedReasons: number;
  /** Whether this week returned control under the original planning-block grid. */
  readonly returnedControl: boolean;
}

/** Stat movement over a run, summed across every member. */
export interface StatGrowth {
  /** Total movement across all six stats and every member. */
  readonly total: number;
  /** Movement by stat, still summed across the collective. */
  readonly byStat: Readonly<Record<StatKey, number>>;
}

/**
 * One incident's occurrence and resolution, linked under the absolute week it occurred so a
 * consumer need not join a `WeekResult` and a separate `IncidentResolution` itself. Core's
 * own records stay distinct; this is only the report's presentation of both together.
 */
export interface IncidentReportEntry {
  /** Absolute week the incident occurred in. */
  readonly week: number;
  /** Which incident occurred. */
  readonly incidentId: string;
  /** Which performer it targeted. */
  readonly performerId: string;
  /** The choice id the policy submitted. */
  readonly choiceId: string;
  /** Direct/success/failure outcome core reported. */
  readonly outcome: "direct" | "success" | "failure";
  /** The d20 roll; present only for a checked choice. */
  readonly roll?: number;
  /** Roll plus the target's stat; present only for a checked choice. */
  readonly total?: number;
  /** Effects core reports as applied, in the order the content declared them. */
  readonly effects: readonly IncidentEffect[];
  /** Run snapshot after resolution, so the reported state already includes the choice. */
  readonly postState: RunSnapshot;
}

/** A scenario's incident configuration, or that it declared none. */
export type IncidentConfig =
  | { readonly enabled: false }
  | {
      /** Discriminator: incidents are configured and enabled. */
      readonly enabled: true;
      /** Incident ids enabled, in the scenario's declared order. */
      readonly ids: readonly string[];
      /** Chance in [0, 1] that an eligible week produces one incident. */
      readonly cadence: number;
    };

/** The observed figures for one policy and seed. */
export interface SeedReport {
  /** Seed that generated this run. */
  readonly seed: number;
  /** Declared number of weeks in each planning block. */
  readonly blockWeeks: number;
  /** Values before week zero. */
  readonly opening: RunSnapshot;
  /** Values after the horizon. */
  readonly closing: RunSnapshot;
  /** Sum of core-produced recurring expense across the reported horizon. */
  readonly totalEngagementExpense: number;
  /** Lowest balance observed, including the opening state. */
  readonly minimumBalance: number;
  /** First week leaving that balance, or null when the opening value was the minimum. */
  readonly minimumBalanceWeek: number | null;
  /** Collective stat movement between opening and closing. */
  readonly statGrowth: StatGrowth;
  /** Activities executed, counted by id. */
  readonly executed: Readonly<Record<string, number>>;
  /** Activities skipped, counted by id. */
  readonly skippedById: Readonly<Record<string, number>>;
  /** Skips counted by the cause reported by the core. */
  readonly skippedByCause: Readonly<Record<SkipCause, number>>;
  /** Reasons counted by kind. */
  readonly reasons: Readonly<Partial<Record<StopReasonKind, number>>>;
  /** Absolute weeks on which each reason kind occurred. */
  readonly reasonWeeks: Readonly<Partial<Record<StopReasonKind, readonly number[]>>>;
  /** Core week classifications over the horizon. */
  readonly kinds: WeekKindCounts;
  /** Weeks that block advancement passed without returning control to the player. */
  readonly uninterruptedWeeks: number;
  /** Uninterrupted weeks divided by advanced weeks. */
  readonly uninterruptedShare: number;
  /** Week-by-week observations in chronological order. */
  readonly weekly: readonly WeeklyReport[];
  /** Occurrences observed this seed, counted by incident id. */
  readonly incidentOccurrences: Readonly<Record<string, number>>;
  /** Resolved choices this seed, counted by stable choice id. */
  readonly incidentChoices: Readonly<Record<string, number>>;
  /** Resolutions this seed, counted by direct/success/failure outcome. */
  readonly incidentOutcomes: Readonly<Record<"direct" | "success" | "failure", number>>;
  /** Occurrence and resolution linked under the absolute week, in chronological order. */
  readonly incidents: readonly IncidentReportEntry[];
}

/** Numeric week values averaged across seeds; categorical events remain in seed reports. */
export interface MeanWeeklyReport extends RunSnapshot {
  /** Absolute zero-based week index shared by the averaged runs. */
  readonly week: number;
  /** Mean balance movement during the week. */
  readonly balanceDelta: number;
  /** Mean recurring engagement expense reported by core for this week. */
  readonly engagementExpense: number;
  /** Mean audience movement during the week. */
  readonly audienceDelta: number;
  /** Mean number of unmasked reasons in the week. */
  readonly unmaskedReasons: number;
}

/** Mean figures across a policy's declared seed set. */
export interface MeanReport {
  /** Declared number of weeks in each planning block. */
  readonly blockWeeks: number;
  /** Mean opening values. */
  readonly opening: RunSnapshot;
  /** Mean closing values. */
  readonly closing: RunSnapshot;
  /** Mean total core-produced recurring expense across seeds. */
  readonly totalEngagementExpense: number;
  /** Mean of each seed's minimum balance. */
  readonly minimumBalance: number;
  /** Mean collective stat movement. */
  readonly statGrowth: StatGrowth;
  /** Mean executed count by activity id. */
  readonly executed: Readonly<Record<string, number>>;
  /** Mean skipped count by activity id. */
  readonly skippedById: Readonly<Record<string, number>>;
  /** Mean skipped count by cause. */
  readonly skippedByCause: Readonly<Record<SkipCause, number>>;
  /** Mean reason count by kind. */
  readonly reasons: Readonly<Partial<Record<StopReasonKind, number>>>;
  /** Mean count of each core week classification. */
  readonly kinds: WeekKindCounts;
  /** Mean count of uninterrupted weeks. */
  readonly uninterruptedWeeks: number;
  /** Mean uninterrupted share. */
  readonly uninterruptedShare: number;
  /** Mean numeric state after each absolute week. */
  readonly weekly: readonly MeanWeeklyReport[];
  /** Mean occurrence count by incident id. */
  readonly incidentOccurrences: Readonly<Record<string, number>>;
  /** Mean choice count by stable choice id. */
  readonly incidentChoices: Readonly<Record<string, number>>;
  /** Mean count by direct/success/failure outcome. */
  readonly incidentOutcomes: Readonly<Record<"direct" | "success" | "failure", number>>;
}

/** All seed runs and their means for one policy. */
export interface PolicyReport {
  /** Policy that drove these runs. */
  readonly policy: PolicyName;
  /** Individual runs, in the invocation's seed order. */
  readonly seeds: readonly SeedReport[];
  /** Means across those individual runs. */
  readonly mean: MeanReport;
}

/** Provenance for the content tree handed to the core. */
export interface ContentProvenance {
  /** Number of activity definitions available while loading the scenario. */
  readonly activities: number;
  /** Number of origin definitions available while generating the collective. */
  readonly regions: number;
  /** Number of incident definitions available for a scenario to enable. */
  readonly incidents: number;
}

/** Scenario economy inputs that produced every opening engagement. */
export interface OpeningProvenance {
  /** Region selected for generation and its rate scale. */
  readonly originId: string;
  readonly originRateScale: number;
  /** Discipline selected for quotation and its absolute and relative rate inputs. */
  readonly disciplineId: string;
  readonly baseWeeklyRate: number;
  readonly disciplineRateScale: number;
  /** Exclusive week boundary shared by opening terms. */
  readonly engagementDuration: number;
}

/** One complete, serializable simulation report. */
export interface SimReport {
  /** Scenario id declared by the input file. */
  readonly scenario: string;
  /** Scenario file used by this invocation. */
  readonly scenarioPath: string;
  /** Number of weeks advanced per run. */
  readonly horizon: number;
  /** Declared number of weeks in each planning block. */
  readonly blockWeeks: number;
  /** Seeds run under every selected policy. */
  readonly seeds: readonly number[];
  /** Reason kinds ignored only when counting interruptions. */
  readonly mask: readonly StopReasonKind[];
  /** Region, discipline and term inputs used to materialize opening engagements. */
  readonly opening: OpeningProvenance;
  /** Size of the loaded content set. */
  readonly content: ContentProvenance;
  /** Policy results and cross-seed means. */
  readonly policies: readonly PolicyReport[];
  /** Wall-clock cost of building all policy runs, excluded from game comparisons. */
  readonly durationMs: number;
  /** Configured incident ids and cadence, or that the scenario disabled incidents. */
  readonly incidents: IncidentConfig;
}

/** Inputs needed to turn completed runs into one report. */
export interface BuildReportOptions {
  /** Scenario shared by every run. */
  readonly scenario: Scenario;
  /** Path from which the scenario was loaded. */
  readonly scenarioPath: string;
  /** Requested horizon. */
  readonly horizon: number;
  /** Seed order declared by the invocation. */
  readonly seeds: readonly number[];
  /** Content set supplied to the scenario and runs. */
  readonly content: SimContent;
  /** Completed runs to summarize. */
  readonly runs: readonly PolicyRun[];
  /** Measured wall-clock duration for the invocation. */
  readonly durationMs: number;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function snapshot(state: RunState): RunSnapshot {
  let energy = 0;
  for (const member of state.collective.members) energy += member.state.energy;
  return {
    balance: state.org.money,
    audience: state.org.audience,
    collectiveMorale: collectiveMorale(state.collective),
    meanEnergy:
      state.collective.members.length === 0 ? 0 : energy / state.collective.members.length,
    consecutiveNegativeWeeks: state.consecutiveNegativeWeeks,
  };
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function sortedRecord(record: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key] ?? 0;
  return sorted;
}

function collectiveStats(state: RunState): Readonly<Record<StatKey, number>> {
  return statsFrom((key) => {
    let total = 0;
    for (const member of state.collective.members) total += member.stats[key];
    return total;
  });
}

function summarize(
  run: PolicyRun,
  masked: readonly StopReasonKind[],
  blockWeeks: number,
): SeedReport {
  const opening = snapshot(run.opening);
  const closing = snapshot(run.state);
  const openingStats = collectiveStats(run.opening);
  const closingStats = collectiveStats(run.state);
  const byStat = statsFrom((key) => closingStats[key] - openingStats[key]);
  let statTotal = 0;
  for (const key of STAT_KEYS) statTotal += byStat[key];

  const executed: Record<string, number> = {};
  const skippedById: Record<string, number> = {};
  const skippedByCause: Record<SkipCause, number> = { slots: 0, energy: 0 };
  const reasons: Partial<Record<StopReasonKind, number>> = {};
  const reasonWeeks: Partial<Record<StopReasonKind, number[]>> = {};
  const kinds: Record<keyof WeekKindCounts, number> = {
    quiet: 0,
    ordinary: 0,
    contest: 0,
    series: 0,
  };
  const weekly: WeeklyReport[] = [];
  const incidentOccurrences: Record<string, number> = {};
  const incidentChoices: Record<string, number> = {};
  const incidentOutcomes: Record<"direct" | "success" | "failure", number> = {
    direct: 0,
    success: 0,
    failure: 0,
  };
  const incidents: IncidentReportEntry[] = [];
  let previous = opening;
  let minimumBalance = opening.balance;
  let minimumBalanceWeek: number | null = null;
  let totalEngagementExpenseTenths = 0;

  for (const walked of run.weeks) {
    const current = snapshot(walked.state);
    const result = walked.result;
    totalEngagementExpenseTenths += Math.round(result.engagementExpense.total * 10);
    const unmaskedReasons = result.reasons.filter((reason) => !masked.includes(reason.kind)).length;
    for (const activity of result.executed) increment(executed, activity.activityId);
    for (const skipped of result.skipped) {
      increment(skippedById, skipped.activityId);
      skippedByCause[skipped.cause] += 1;
    }
    for (const reason of result.reasons) {
      reasons[reason.kind] = (reasons[reason.kind] ?? 0) + 1;
      const weeks = reasonWeeks[reason.kind] ?? [];
      weeks.push(result.week);
      reasonWeeks[reason.kind] = weeks;
      if (reason.kind === "incident-pending") increment(incidentOccurrences, reason.incidentId);
    }
    kinds[result.kind] += 1;
    if (current.balance < minimumBalance) {
      minimumBalance = current.balance;
      minimumBalanceWeek = result.week;
    }
    weekly.push({
      week: result.week,
      kind: result.kind,
      balance: current.balance,
      engagementExpense: result.engagementExpense.total,
      balanceDelta: current.balance - previous.balance,
      audience: current.audience,
      audienceDelta: current.audience - previous.audience,
      collectiveMorale: current.collectiveMorale,
      meanEnergy: current.meanEnergy,
      consecutiveNegativeWeeks: current.consecutiveNegativeWeeks,
      executed: result.executed.map((activity) => activity.activityId),
      skipped: result.skipped.map((skipped) => ({
        activityId: skipped.activityId,
        cause: skipped.cause,
      })),
      reasonKinds: result.reasons.map((reason) => reason.kind),
      unmaskedReasons,
      returnedControl: walked.returnedControl,
    });
    previous = current;
    if (walked.resolution !== undefined) {
      const resolution = walked.resolution;
      increment(incidentChoices, resolution.choiceId);
      incidentOutcomes[resolution.outcome] += 1;
      incidents.push({
        week: resolution.week,
        incidentId: resolution.incidentId,
        performerId: resolution.performerId,
        choiceId: resolution.choiceId,
        outcome: resolution.outcome,
        effects: resolution.effects,
        postState: current,
        ...(resolution.roll === undefined ? {} : { roll: resolution.roll }),
        ...(resolution.total === undefined ? {} : { total: resolution.total }),
      });
    }
  }

  const uninterruptedWeeks = weekly.filter((week) => !week.returnedControl).length;
  return {
    seed: run.seed,
    blockWeeks,
    opening,
    closing,
    totalEngagementExpense: totalEngagementExpenseTenths / 10,
    minimumBalance,
    minimumBalanceWeek,
    statGrowth: { total: statTotal, byStat },
    executed: sortedRecord(executed),
    skippedById: sortedRecord(skippedById),
    skippedByCause,
    reasons,
    reasonWeeks,
    kinds,
    uninterruptedWeeks,
    uninterruptedShare: weekly.length === 0 ? 0 : uninterruptedWeeks / weekly.length,
    weekly,
    incidentOccurrences: sortedRecord(incidentOccurrences),
    incidentChoices: sortedRecord(incidentChoices),
    incidentOutcomes,
    incidents,
  };
}

function meanSnapshot(snapshots: readonly RunSnapshot[]): RunSnapshot {
  return {
    balance: mean(snapshots.map((value) => value.balance)),
    audience: mean(snapshots.map((value) => value.audience)),
    collectiveMorale: mean(snapshots.map((value) => value.collectiveMorale)),
    meanEnergy: mean(snapshots.map((value) => value.meanEnergy)),
    consecutiveNegativeWeeks: mean(snapshots.map((value) => value.consecutiveNegativeWeeks)),
  };
}

function meanRecords(
  records: readonly Readonly<Record<string, number>>[],
): Readonly<Record<string, number>> {
  const keys = new Set<string>();
  for (const record of records) for (const key of Object.keys(record)) keys.add(key);
  const result: Record<string, number> = {};
  for (const key of [...keys].sort()) result[key] = mean(records.map((record) => record[key] ?? 0));
  return result;
}

function meanWeekly(seeds: readonly SeedReport[]): readonly MeanWeeklyReport[] {
  const horizon = seeds[0]?.weekly.length ?? 0;
  const weekly: MeanWeeklyReport[] = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    const values = seeds.map((seed) => seed.weekly[offset]).filter((value) => value !== undefined);
    const first = values[0];
    if (first === undefined) continue;
    weekly.push({
      week: first.week,
      balance: mean(values.map((value) => value.balance)),
      balanceDelta: mean(values.map((value) => value.balanceDelta)),
      engagementExpense: mean(values.map((value) => value.engagementExpense)),
      audience: mean(values.map((value) => value.audience)),
      audienceDelta: mean(values.map((value) => value.audienceDelta)),
      collectiveMorale: mean(values.map((value) => value.collectiveMorale)),
      meanEnergy: mean(values.map((value) => value.meanEnergy)),
      consecutiveNegativeWeeks: mean(values.map((value) => value.consecutiveNegativeWeeks)),
      unmaskedReasons: mean(values.map((value) => value.unmaskedReasons)),
    });
  }
  return weekly;
}

function aggregate(seeds: readonly SeedReport[]): MeanReport {
  const byStat = statsFrom((key) => mean(seeds.map((seed) => seed.statGrowth.byStat[key])));
  return {
    blockWeeks: seeds[0]?.blockWeeks ?? 0,
    opening: meanSnapshot(seeds.map((seed) => seed.opening)),
    closing: meanSnapshot(seeds.map((seed) => seed.closing)),
    totalEngagementExpense: mean(seeds.map((seed) => seed.totalEngagementExpense)),
    minimumBalance: mean(seeds.map((seed) => seed.minimumBalance)),
    statGrowth: { total: mean(seeds.map((seed) => seed.statGrowth.total)), byStat },
    executed: meanRecords(seeds.map((seed) => seed.executed)),
    skippedById: meanRecords(seeds.map((seed) => seed.skippedById)),
    skippedByCause: {
      slots: mean(seeds.map((seed) => seed.skippedByCause.slots)),
      energy: mean(seeds.map((seed) => seed.skippedByCause.energy)),
    },
    reasons: meanRecords(seeds.map((seed) => seed.reasons)),
    kinds: {
      quiet: mean(seeds.map((seed) => seed.kinds.quiet)),
      ordinary: mean(seeds.map((seed) => seed.kinds.ordinary)),
      contest: mean(seeds.map((seed) => seed.kinds.contest)),
      series: mean(seeds.map((seed) => seed.kinds.series)),
    },
    uninterruptedWeeks: mean(seeds.map((seed) => seed.uninterruptedWeeks)),
    uninterruptedShare: mean(seeds.map((seed) => seed.uninterruptedShare)),
    weekly: meanWeekly(seeds),
    incidentOccurrences: meanRecords(seeds.map((seed) => seed.incidentOccurrences)),
    incidentChoices: meanRecords(seeds.map((seed) => seed.incidentChoices)),
    incidentOutcomes: {
      direct: mean(seeds.map((seed) => seed.incidentOutcomes.direct)),
      success: mean(seeds.map((seed) => seed.incidentOutcomes.success)),
      failure: mean(seeds.map((seed) => seed.incidentOutcomes.failure)),
    },
  };
}

/** Builds the sole data object used by both JSON and text output. */
export function buildReport(options: BuildReportOptions): SimReport {
  const policies: PolicyReport[] = [];
  for (const policy of POLICY_NAMES) {
    const policyRuns = options.runs.filter((run) => run.policy === policy);
    if (policyRuns.length === 0) continue;
    const seeds = options.seeds.map((seed) => {
      const matches = policyRuns.filter((run) => run.seed === seed);
      if (matches.length !== 1) {
        throw new Error(
          `policy "${policy}" has ${matches.length} runs for seed ${seed}; expected one`,
        );
      }
      const run = matches[0];
      if (run === undefined) throw new Error(`policy "${policy}" is missing seed ${seed}`);
      return summarize(run, options.scenario.masked, options.scenario.blockWeeks);
    });
    policies.push({ policy, seeds, mean: aggregate(seeds) });
  }

  const incidentConfig: IncidentConfig =
    options.scenario.incidents === undefined
      ? { enabled: false }
      : {
          enabled: true,
          ids: options.scenario.incidents.catalog.map((incident) => incident.id),
          cadence: options.scenario.incidents.cadence,
        };

  const rateInputs = resolveRateInputs(
    options.content,
    options.scenario.collective.originId,
    options.scenario.disciplineId,
  );
  return {
    scenario: options.scenario.id,
    scenarioPath: options.scenarioPath,
    horizon: options.horizon,
    blockWeeks: options.scenario.blockWeeks,
    seeds: [...options.seeds],
    mask: [...options.scenario.masked],
    opening: {
      originId: options.scenario.collective.originId,
      disciplineId: options.scenario.disciplineId,
      engagementDuration: options.scenario.engagementDuration,
      ...rateInputs,
    },
    content: {
      activities: options.content.activities.size,
      regions: options.content.origins.size,
      incidents: options.content.incidents.size,
    },
    policies,
    durationMs: options.durationMs,
    incidents: incidentConfig,
  };
}

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/** Renders the report as a compact human-readable table without adding a second data source. */
export function renderReport(report: SimReport): string {
  const lines = [
    `Simulation: ${report.scenario} (${report.scenarioPath})`,
    `horizon ${report.horizon} · block ${report.blockWeeks} · seeds ${report.seeds.join(",")} · mask ${report.mask.join(",") || "none"}`,
    `content: activities ${report.content.activities} · regions ${report.content.regions} · incidents ${report.content.incidents}`,
    `opening: region ${report.opening.originId} · discipline ${report.opening.disciplineId} · base rate ${formatNumber(report.opening.baseWeeklyRate)} · origin scale ${formatNumber(report.opening.originRateScale)} · discipline scale ${formatNumber(report.opening.disciplineRateScale)} · term ${report.opening.engagementDuration} weeks`,
    report.incidents.enabled
      ? `incidents: ${report.incidents.ids.join(",")} · cadence ${formatNumber(report.incidents.cadence)}`
      : "incidents: disabled",
    "",
    `policy       seed  balance(open→close|min)  expense  negative  audience  energy  morale  stats  quiet  uninterrupted(block ${report.blockWeeks})`,
  ];
  for (const policy of report.policies) {
    for (const seed of policy.seeds) {
      lines.push(
        `${policy.policy.padEnd(12)} ${String(seed.seed).padStart(4)}  ` +
          `${formatNumber(seed.opening.balance)}→${formatNumber(seed.closing.balance)}|${formatNumber(seed.minimumBalance)}  ` +
          `${formatNumber(seed.totalEngagementExpense).padStart(7)}  ` +
          `${String(seed.closing.consecutiveNegativeWeeks).padStart(8)}  ` +
          `${formatNumber(seed.closing.audience).padStart(8)}  ` +
          `${formatNumber(seed.closing.meanEnergy).padStart(6)}  ` +
          `${formatNumber(seed.closing.collectiveMorale).padStart(6)}  ` +
          `${formatNumber(seed.statGrowth.total).padStart(5)}  ` +
          `${String(seed.kinds.quiet).padStart(5)}  ` +
          `${seed.uninterruptedWeeks}/${seed.weekly.length}`,
      );
      // Every per-week value core exposes, so the human form carries the same series as the
      // machine form instead of a partial one a reader would have to open the JSON to finish.
      for (const week of seed.weekly) {
        lines.push(
          `    week ${week.week} expense ${formatNumber(week.engagementExpense)} · negative weeks ${formatNumber(week.consecutiveNegativeWeeks)}` +
            ` · balance ${formatNumber(week.balance)} · audience ${formatNumber(week.audience)}` +
            ` · energy ${formatNumber(week.meanEnergy)} · morale ${formatNumber(week.collectiveMorale)}`,
        );
      }
      for (const entry of seed.incidents) {
        const check =
          entry.roll !== undefined && entry.total !== undefined
            ? ` roll ${entry.roll}/total ${entry.total}`
            : "";
        lines.push(
          `    incident wk${entry.week} ${entry.incidentId} -> ${entry.choiceId} (${entry.outcome}${check})`,
        );
      }
    }
  }
  lines.push(
    "",
    "quiet is the core's structural week kind; uninterrupted means the week passed without returning control.",
    `duration ${formatNumber(report.durationMs)} ms (measurement only)`,
  );
  return `${lines.join("\n")}\n`;
}
