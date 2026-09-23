/**
 * The week: the unit of time in a run. A pool of slots is spent on activities, participants
 * pay energy, effects land on people and on the org, and advancing walks week after week
 * until something worth a decision happened.
 *
 * Two properties carry the mechanic. Advancing is a pure function of its inputs — state,
 * plan, mask, calendar, stream — so determinism holds by construction (`adr/0002`). And a
 * threshold reason fires on a downward crossing measured from the week's own start value,
 * never on a level: a level condition would stop the game every week of a crisis, which is
 * the failure mode `design/week.md` §6.3 exists to prevent.
 */

import type { Activity } from "./activity.ts";
import type { Collective } from "./collective.ts";
import { participantsOf } from "./collective.ts";
import {
  byEngagementId,
  type Engagement,
  type EngagementExpense,
  engagementExpenseAt,
  validateEngagements,
} from "./engagement.ts";
import { type IncidentInput, type IncidentState, selectIncident } from "./incident.ts";
import type { Org } from "./org.ts";
import { applyOrgChange, reach } from "./org.ts";
import type { PerformerState, StatKey } from "./performer.ts";
import { applyStatChange, applyStateChange, statsFrom } from "./performer.ts";
import type { RngState } from "./rng.ts";
import { restoreRng } from "./rng.ts";
import type { SeasonCalendar, SeasonCalendarEntry } from "./season.ts";

/** A block covers four to six weeks: shorter is not a plan, longer is not a decision. */
export const WEEK_PLAN_MIN_WEEKS = 4;
export const WEEK_PLAN_MAX_WEEKS = 6;

/**
 * Energy returned to every performer by one advanced week. The only recovery there is: no
 * value moves between two calls (`specs/0001`, item 4). A balance number.
 */
export const WEEKLY_ENERGY_RECOVERY = 15;

/** Thresholds a value has to cross downward to stop the advance. Balance numbers. */
export const DEFAULT_ENERGY_THRESHOLD = 30;
export const DEFAULT_MORALE_THRESHOLD = 30;

/** What the calendar says about a week before it is advanced. An input, not a result. */
export type WeekMarking = "none" | "contest" | "series";

/** What a week turned out to be. A classification, never an input (`proposal.md`). */
export type WeekKind = "quiet" | "ordinary" | "contest" | "series";

/** Why an activity was not executed. Both causes leave the run untouched. */
export type SkipCause = "slots" | "energy";

/** One activity placed in one week of a block. */
export interface PlannedActivity {
  /** The activity as loaded from content. */
  readonly activity: Activity;
  /** Who it is aimed at, required when the activity targets a single member. */
  readonly memberId?: string;
}

/** A block of weeks: one list of activities per week, in the order they are attempted. */
export interface WeekPlan {
  /** Four to six weeks; a plan outside that range is rejected before any week advances. */
  readonly weeks: readonly (readonly PlannedActivity[])[];
}

/** The block is over: the user has nothing planned past this week. Unmaskable. */
export interface BlockRanOutReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "block-ran-out";
}

/** A planned activity did not happen. The user asked for it, so the user hears about it. */
export interface ActivitySkippedReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "activity-skipped";
  /** Which activity was dropped. */
  readonly activityId: string;
  /** Whether the pool or the participants ran out. */
  readonly cause: SkipCause;
}

/** A performer's energy crossed its threshold downward during this week. */
export interface EnergyThresholdReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "energy-threshold";
  /** Who crossed it. */
  readonly performerId: string;
  /** The value at the end of the week, below the threshold. */
  readonly value: number;
}

/** A performer's morale crossed its threshold downward during this week. */
export interface MoraleThresholdReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "morale-threshold";
  /** Who crossed it. */
  readonly performerId: string;
  /** The value at the end of the week, below the threshold. */
  readonly value: number;
}

/** The balance went from zero or better to negative during this week. */
export interface MoneyNegativeReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "money-negative";
  /** The balance at the end of the week. */
  readonly balance: number;
}

/** The calendar marks the next week as contested, so this one is the last to prepare in. */
export interface ContestAheadReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "contest-ahead";
  /** What the next week is marked as. */
  readonly marking: "contest" | "series";
}

/** The final entry of the active season was advanced. Unmaskable. */
export interface SeasonEndedReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "season-ended";
}

/** A current engagement reached its exclusive boundary after its last paid week. Unmaskable. */
export interface EngagementExpiredReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "engagement-expired";
  /** The term that ended. */
  readonly engagementId: string;
  /** The performer whose next week is now uncovered. */
  readonly performerId: string;
}

/** An incident awaits a choice. The extension point for the incident system. Unmaskable. */
export interface IncidentPendingReason {
  /** Discriminator of the stop reason union. */
  readonly kind: "incident-pending";
  /** Which incident is waiting. */
  readonly incidentId: string;
  /** Which performer it targets. */
  readonly performerId: string;
}

/**
 * The closed list of reasons advancing may stop for. Closed on purpose: stop on trifles and
 * the Continue button is useless, swallow the important and the user is blindsided.
 */
export type StopReason =
  | BlockRanOutReason
  | ActivitySkippedReason
  | EnergyThresholdReason
  | MoraleThresholdReason
  | MoneyNegativeReason
  | ContestAheadReason
  | SeasonEndedReason
  | EngagementExpiredReason
  | IncidentPendingReason;

/** The tag of a stop reason, which is what a sensitivity mask is written in terms of. */
export type StopReasonKind = StopReason["kind"];

/** Reasons no sensitivity mask may suppress because each returns a required decision boundary. */
export const UNMASKABLE_REASONS: readonly StopReasonKind[] = [
  "block-ran-out",
  "season-ended",
  "engagement-expired",
  "incident-pending",
  "contest-ahead",
];

/** How easily the user wants to be interrupted. */
export interface Sensitivity {
  /** Reason kinds that do not stop the advance. They are still recorded in the week. */
  readonly masked: readonly StopReasonKind[];
}

/** Inputs for exactly one week; its current marking is explicit and no calendar is inspected. */
export interface ExecuteWeekOptions {
  /** Marking of the week being executed. */
  readonly marking: WeekMarking;
  /** Energy threshold; a difficulty setting overrides it without a second mechanism. */
  readonly energyThreshold?: number;
  /** Morale threshold, same. */
  readonly moraleThreshold?: number;
  /**
   * Explicit incident engine input; absent disables selection entirely and draws nothing
   * from the incident RNG stream, so an existing run that never sets it is unaffected.
   */
  readonly incidentInput?: IncidentInput;
}

/** Inputs for block advancement, including its authoritative bounded season calendar. */
export interface AdvanceOptions {
  /** Materialized calendar that owns every week the block may advance. */
  readonly calendar: SeasonCalendar;
  /** Which reasons are suppressed; absent means every reason stops the advance. */
  readonly sensitivity?: Sensitivity;
  /** Energy threshold; a difficulty setting overrides it without a second mechanism. */
  readonly energyThreshold?: number;
  /** Morale threshold, same. */
  readonly moraleThreshold?: number;
  /**
   * Explicit incident engine input; absent disables selection entirely and draws nothing
   * from the incident RNG stream, so an existing run that never sets it is unaffected.
   */
  readonly incidentInput?: IncidentInput;
}

/** The whole run as the week loop sees it. Serializable: a save resumes the same sequence. */
export interface RunState {
  /** Money, reputation and the weekly slot pool. */
  readonly org: Org;
  /** The people a plan is written for. */
  readonly collective: Collective;
  /** Materialized current engagement terms for every collective member. */
  readonly engagements: readonly Engagement[];
  /** Absolute index of the next week to simulate; the first week of a run is 0. */
  readonly week: number;
  /** Consecutive completed weeks whose final balance was negative. */
  readonly consecutiveNegativeWeeks: number;
  /** Root seed of the run's stream. */
  readonly seed: number | string;
  /** Continuation of that stream. */
  readonly rng: RngState;
  /** The mandatory, independently seeded incident lifecycle: pending choice and cooldowns. */
  readonly incidents: IncidentState;
}

/** An activity that happened, and who it happened to. */
export interface ExecutedActivity {
  /** Which activity. */
  readonly activityId: string;
  /** Who took part and paid the energy. */
  readonly participantIds: readonly string[];
  /** Who was aimed at but could not afford it, and so was left untouched. */
  readonly excludedIds: readonly string[];
}

/** An activity that did not happen, and why. */
export interface SkippedActivity {
  /** Which activity. */
  readonly activityId: string;
  /** Whether the pool or the participants ran out. */
  readonly cause: SkipCause;
}

/** Everything one advanced week produced. */
export interface WeekResult {
  /** Absolute index of the week this describes. */
  readonly week: number;
  /** What the week turned out to be. */
  readonly kind: WeekKind;
  /** Slots actually spent; never more than the org's pool. */
  readonly slotsSpent: number;
  /** Activities that happened, in the order they were planned. */
  readonly executed: readonly ExecutedActivity[];
  /** Activities that were dropped, in the order they were planned. */
  readonly skipped: readonly SkippedActivity[];
  /** Canonical evidence for the recurring engagement debit applied this week. */
  readonly engagementExpense: EngagementExpense;
  /** Every reason this week produced, masked ones included: nothing is lost. */
  readonly reasons: readonly StopReason[];
}

/** One advanced week: the state it left behind and what it produced. */
export interface WeekOutcome {
  /** The run after the week, with the week index moved on. */
  readonly state: RunState;
  /** What that week produced. */
  readonly result: WeekResult;
}

/** How many weeks of each kind a run produced. An observation, never a target. */
export interface WeekKindCounts {
  /** Weeks that spent nothing and produced nothing. */
  readonly quiet: number;
  /** Weeks that spent a slot or produced a reason. */
  readonly ordinary: number;
  /** Weeks the calendar marked as a single contest. */
  readonly contest: number;
  /** Weeks the calendar marked as a series of contests. */
  readonly series: number;
}

/** What advancing a block returns. */
export interface AdvanceResult {
  /** The run after the last simulated week. */
  readonly state: RunState;
  /** Every week that was simulated, in order. Weeks past the stop are absent. */
  readonly weeks: readonly WeekResult[];
  /** Absolute index of the week it stopped at. */
  readonly stoppedAt: number;
  /** Every reason that week produced, masked ones included. */
  readonly reasons: readonly StopReason[];
  /** The kinds of the simulated weeks, counted. */
  readonly kinds: WeekKindCounts;
}

/** The block-ran-out reason carries nothing beyond its tag, so one value serves every run. */
const BLOCK_RAN_OUT: BlockRanOutReason = { kind: "block-ran-out" };

/**
 * Rejects a plan before any week is advanced: the wrong number of weeks, or an activity
 * that needs a member and either names none or names somebody outside the collective.
 */
export function validateWeekPlan(plan: WeekPlan, collective: Collective): void {
  const length = plan.weeks.length;
  if (length < WEEK_PLAN_MIN_WEEKS || length > WEEK_PLAN_MAX_WEEKS) {
    throw new RangeError(
      `a plan covers ${WEEK_PLAN_MIN_WEEKS} to ${WEEK_PLAN_MAX_WEEKS} weeks, this one covers ${length}`,
    );
  }
  for (const week of plan.weeks) {
    for (const entry of week) {
      if (entry.activity.target !== "member") continue;
      if (entry.memberId === undefined) {
        throw new Error(`activity "${entry.activity.id}" needs a member and the plan names none`);
      }
      if (!collective.members.some((member) => member.id === entry.memberId)) {
        throw new Error(
          `activity "${entry.activity.id}" names "${entry.memberId}", who is not in the collective`,
        );
      }
    }
  }
}

/**
 * Rejects a mask that hides a reason listed in `UNMASKABLE_REASONS`.
 * Checked before the first week, like the plan: a mistuned mask must not cost a run.
 */
function validateSensitivity(sensitivity: Sensitivity): void {
  for (const kind of sensitivity.masked) {
    if (UNMASKABLE_REASONS.includes(kind)) {
      throw new Error(`stop reason "${kind}" cannot be masked`);
    }
  }
}

/** Rejects malformed or drifting calendars before the first week mutates the run. */
function validateCalendar(calendar: SeasonCalendar): void {
  if (
    Array.isArray(calendar) ||
    !Number.isInteger(calendar.startWeek) ||
    calendar.startWeek < 0 ||
    !Array.isArray(calendar.entries) ||
    calendar.entries.length === 0
  ) {
    throw new Error("advance: calendar must be a non-empty bounded season calendar");
  }
  for (let relativeWeek = 0; relativeWeek < calendar.entries.length; relativeWeek += 1) {
    const entry = calendar.entries[relativeWeek];
    if (
      entry === undefined ||
      entry.relativeWeek !== relativeWeek ||
      entry.week !== calendar.startWeek + relativeWeek
    ) {
      throw new Error("advance: calendar entries must be complete and chronologically ordered");
    }
  }
}

/** Resolves a current week inside the validated calendar; lookahead uses direct indexing. */
function calendarEntryAt(calendar: SeasonCalendar, week: number): SeasonCalendarEntry {
  const entry = calendar.entries[week - calendar.startWeek];
  if (entry === undefined) {
    throw new RangeError(`advance: week ${week} is outside the active season calendar`);
  }
  return entry;
}

/**
 * The kind of a week, from that week's own marking, spending and reasons. Reads nothing
 * about earlier weeks and nothing about the distribution so far: the 40/35/20/5 split of
 * `design/week.md` §6.3 is measured afterwards, never steered towards.
 */
export function classifyWeek(
  marking: WeekMarking,
  slotsSpent: number,
  reasons: readonly StopReason[],
): WeekKind {
  if (marking === "series") return "series";
  if (marking === "contest") return "contest";
  if (reasons.length > 0 || slotsSpent > 0) return "ordinary";
  return "quiet";
}

/**
 * Advances exactly one week: activities in planned order, then recovery, then the reasons
 * the week produced. Work is paid for with the energy the performer arrived with, so
 * recovery lands after the activities and not before them.
 *
 * Boundary reasons are supplied only by block advancement; a public one-week call has no
 * block or season lookahead of its own.
 */
function executeWeekWith(
  state: RunState,
  planned: readonly PlannedActivity[],
  marking: WeekMarking,
  options: ExecuteWeekOptions | AdvanceOptions,
  boundaryReasons: readonly StopReason[] = [],
): WeekOutcome {
  if (state.incidents.pending !== null) {
    throw new Error(
      "executeWeek: an incident is already pending and must be resolved before another week runs",
    );
  }
  const engagementExpense = engagementExpenseAt({
    collective: state.collective,
    engagements: state.engagements,
    week: state.week,
  });
  const energyThreshold = options.energyThreshold ?? DEFAULT_ENERGY_THRESHOLD;
  const moraleThreshold = options.moraleThreshold ?? DEFAULT_MORALE_THRESHOLD;
  // The root stream draws nothing here: activity effects are declared numbers and incidents
  // draw only from their own stream. Restore and save this continuation for future rules,
  // such as contests, that may use the root stream (`design.md`).
  const rng = restoreRng(state.seed, state.rng);

  const opening = new Map<string, PerformerState>();
  for (const member of state.collective.members) opening.set(member.id, member.state);
  const openingMoney = state.org.money;

  let collective = state.collective;
  let org = state.org;
  let slotsLeft = state.org.slots;
  const executed: ExecutedActivity[] = [];
  const skipped: SkippedActivity[] = [];

  for (const entry of planned) {
    const activity = entry.activity;
    if (activity.slots > slotsLeft) {
      skipped.push({ activityId: activity.id, cause: "slots" });
      continue;
    }

    const targeted = participantsOf(collective, activity, entry.memberId);
    const participantIds = new Set<string>();
    const excludedIds: string[] = [];
    for (const member of targeted) {
      if (member.state.energy >= activity.energy) participantIds.add(member.id);
      else excludedIds.push(member.id);
    }
    if (participantIds.size === 0) {
      skipped.push({ activityId: activity.id, cause: "energy" });
      continue;
    }

    slotsLeft -= activity.slots;

    // Effects of one activity are summed once and applied once: two `+morale` lines are one
    // change to each participant, not two rounds through the 0.1 normalization.
    const statDeltas = new Map<StatKey, number>();
    let energyDelta = -activity.energy;
    let moraleDelta = 0;
    let moneyDelta = 0;
    let audienceDelta = 0;
    let reputationDelta = 0;
    for (const effect of activity.effects) {
      switch (effect.kind) {
        case "stat":
          statDeltas.set(effect.stat, (statDeltas.get(effect.stat) ?? 0) + effect.amount);
          break;
        case "energy":
          energyDelta += effect.amount;
          break;
        case "morale":
          moraleDelta += effect.amount;
          break;
        case "money": {
          if (effect.scale !== "audience") {
            moneyDelta += effect.amount;
            break;
          }
          const scaled = Math.round(effect.amount * reach(org) * 10) / 10;
          // The money grid may round finite reach to the base, so cap positive payouts at
          // the highest tenth that remains strictly below it.
          const belowBase = Math.ceil(effect.amount * 10) / 10 - 0.1;
          moneyDelta += effect.amount > 0 ? Math.min(scaled, belowBase) : scaled;
          break;
        }
        case "audience":
          audienceDelta += effect.amount;
          break;
        case "reputation":
          reputationDelta += effect.amount;
          break;
      }
    }

    const statChange =
      statDeltas.size > 0 ? statsFrom((key) => statDeltas.get(key) ?? 0) : undefined;
    if (statChange !== undefined || energyDelta !== 0 || moraleDelta !== 0) {
      collective = {
        ...collective,
        members: collective.members.map((member) => {
          if (!participantIds.has(member.id)) return member;
          const moved = applyStateChange(member, { energy: energyDelta, morale: moraleDelta });
          return statChange === undefined ? moved : applyStatChange(moved, statChange);
        }),
      };
    }
    // Money, audience and reputation belong to the org, so they land once per execution and
    // are not multiplied by however many people took part.
    if (moneyDelta !== 0 || audienceDelta !== 0 || reputationDelta !== 0) {
      org = applyOrgChange(org, {
        money: moneyDelta,
        audience: audienceDelta,
        reputation: reputationDelta,
      });
    }

    executed.push({ activityId: activity.id, participantIds: [...participantIds], excludedIds });
  }

  collective = {
    ...collective,
    members: collective.members.map((member) =>
      applyStateChange(member, { energy: WEEKLY_ENERGY_RECOVERY }),
    ),
  };

  org = applyOrgChange(org, { money: -engagementExpense.total });
  const consecutiveNegativeWeeks = org.money < 0 ? state.consecutiveNegativeWeeks + 1 : 0;

  const reasons: StopReason[] = [];
  for (const dropped of skipped) {
    reasons.push({
      kind: "activity-skipped",
      activityId: dropped.activityId,
      cause: dropped.cause,
    });
  }
  for (const member of collective.members) {
    const start = opening.get(member.id);
    if (start === undefined) continue;
    if (start.energy >= energyThreshold && member.state.energy < energyThreshold) {
      reasons.push({
        kind: "energy-threshold",
        performerId: member.id,
        value: member.state.energy,
      });
    }
    if (start.morale >= moraleThreshold && member.state.morale < moraleThreshold) {
      reasons.push({
        kind: "morale-threshold",
        performerId: member.id,
        value: member.state.morale,
      });
    }
  }
  if (openingMoney >= 0 && org.money < 0) {
    reasons.push({ kind: "money-negative", balance: org.money });
  }
  const expiringEngagements = state.engagements
    .filter((engagement) => engagement.endsBeforeWeek === state.week + 1)
    .toSorted(byEngagementId);
  for (const engagement of expiringEngagements) {
    reasons.push({
      kind: "engagement-expired",
      engagementId: engagement.id,
      performerId: engagement.performerId,
    });
  }
  reasons.push(...boundaryReasons);

  const slotsSpent = state.org.slots - slotsLeft;
  // The current marking is explicit; one-week execution never reads a season calendar.
  // The base kind reads every reason produced so far but not the incident itself, so a
  // selected incident's own conditions see the week as it stood before selection
  // (`design.md` "Selection happens after activities, recovery and non-incident reasons").
  const baseWeekKind = classifyWeek(marking, slotsSpent, reasons);

  // Absent input means no incident RNG is drawn at all, not merely that none is selected.
  let incidents = state.incidents;
  if (options.incidentInput !== undefined) {
    const { catalog, cadence, traitMultipliers } = options.incidentInput;
    const selection = selectIncident({
      seed: state.seed,
      state: state.incidents,
      currentWeek: state.week,
      baseWeekKind,
      collective,
      catalog,
      cadence,
      traitMultipliers,
    });
    incidents = selection.state;
    if (selection.selected !== null) {
      reasons.push({
        kind: "incident-pending",
        incidentId: selection.selected.incidentId,
        performerId: selection.selected.performerId,
      });
    }
  }

  return {
    state: {
      ...state,
      engagements: state.engagements.toSorted(byEngagementId),
      org,
      collective,
      week: state.week + 1,
      consecutiveNegativeWeeks,
      rng: rng.state(),
      incidents,
    },
    result: {
      week: state.week,
      // Reclassified with the incident reason included, so a base-quiet week that selected
      // one returns `ordinary` even though its conditions were evaluated against `quiet`.
      kind: classifyWeek(marking, slotsSpent, reasons),
      slotsSpent,
      executed,
      skipped,
      reasons,
      engagementExpense,
    },
  };
}

/** Advances exactly one week from an explicit marking without owning a season calendar. */
export function executeWeek(
  state: RunState,
  planned: readonly PlannedActivity[],
  options: ExecuteWeekOptions,
): WeekOutcome {
  return executeWeekWith(state, planned, options.marking, options);
}

/**
 * Walks the block week after week without the user and stops at the end of the first week
 * that produced an unmasked reason. A masked reason stays in that week's result: it simply
 * does not stop the advance. The last week of a block always produces `block-ran-out`, so
 * the walk terminates whatever the mask says.
 */
export function advance(state: RunState, plan: WeekPlan, options: AdvanceOptions): AdvanceResult {
  if (state.incidents.pending !== null) {
    throw new Error(
      "advance: an incident is already pending and must be resolved before advancing",
    );
  }
  validateEngagements({
    collective: state.collective,
    engagements: state.engagements,
    week: state.week,
  });
  validateCalendar(options.calendar);
  calendarEntryAt(options.calendar, state.week);
  validateWeekPlan(plan, state.collective);
  if (options.sensitivity !== undefined) validateSensitivity(options.sensitivity);
  const masked = new Set<StopReasonKind>(options.sensitivity?.masked ?? []);

  const weeks: WeekResult[] = [];
  let current = state;
  let stoppedAt = state.week;
  let reasons: readonly StopReason[] = [];

  for (let index = 0; index < plan.weeks.length; index += 1) {
    const entry = calendarEntryAt(options.calendar, current.week);
    const relativeWeek = entry.relativeWeek;
    const next = options.calendar.entries[relativeWeek + 1];
    const boundaryReasons: StopReason[] = [];
    if (next !== undefined && next.marking !== "none") {
      boundaryReasons.push({ kind: "contest-ahead", marking: next.marking });
    }
    if (relativeWeek === options.calendar.entries.length - 1) {
      boundaryReasons.push({ kind: "season-ended" });
    }
    if (index === plan.weeks.length - 1) boundaryReasons.push(BLOCK_RAN_OUT);
    const outcome = executeWeekWith(
      current,
      plan.weeks[index] ?? [],
      entry.marking,
      options,
      boundaryReasons,
    );
    current = outcome.state;
    const result = outcome.result;
    weeks.push(result);
    if (result.reasons.some((reason) => !masked.has(reason.kind))) {
      stoppedAt = result.week;
      reasons = result.reasons;
      break;
    }
  }

  let quiet = 0;
  let ordinary = 0;
  let contest = 0;
  let series = 0;
  for (const week of weeks) {
    switch (week.kind) {
      case "quiet":
        quiet += 1;
        break;
      case "ordinary":
        ordinary += 1;
        break;
      case "contest":
        contest += 1;
        break;
      case "series":
        series += 1;
        break;
    }
  }

  return { state: current, weeks, stoppedAt, reasons, kinds: { quiet, ordinary, contest, series } };
}
