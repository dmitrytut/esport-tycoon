import type { Collective } from "./collective.ts";
import { applyOrgChange } from "./org.ts";
import { type Performer, STAT_KEYS } from "./performer.ts";
import type { RunState } from "./week.ts";

/** Explicit inputs for quoting one performer's materialized weekly rate. */
export interface RateInputs {
  /** Absolute weekly money magnitude supplied by the discipline. */
  readonly baseWeeklyRate: number;
  /** Relative multiplier supplied by the performer's origin. */
  readonly originRateScale: number;
  /** Relative multiplier supplied by the discipline. */
  readonly disciplineRateScale: number;
}

/** A performer plus every explicit market input needed to quote their weekly rate. */
export interface RateQuoteInput extends RateInputs {
  /** Performer whose current stats determine the profile part of the quote. */
  readonly performer: Performer;
}

/** Current materialized terms linking one performer to one collective. */
export interface Engagement {
  /** Stable identity used by settlement evidence and lifecycle operations. */
  readonly id: string;
  /** Performer governed by these terms. */
  readonly performerId: string;
  /** Collective whose membership these terms cover. */
  readonly collectiveId: string;
  /** Positive rate materialized on the one-tenth money grid. */
  readonly weeklyRate: number;
  /** First absolute week covered by the terms. */
  readonly startsAtWeek: number;
  /** First absolute week not covered by the terms. */
  readonly endsBeforeWeek: number;
}

/** Evidence for the recurring expense one completed or forecast week owns. */
export interface EngagementExpense {
  /** Engagement ids charged in code-point order. */
  readonly engagementIds: readonly string[];
  /** Sum of materialized rates on the one-tenth money grid. */
  readonly total: number;
}

/** Boundary operation that replaces an expired term at the current deterministic quote. */
export interface RenewEngagementInput {
  /** Current run whose engagement is being replaced. */
  readonly state: RunState;
  /** Stable id of the expired engagement. */
  readonly engagementId: string;
  /** Exclusive end week of the replacement term. */
  readonly endsBeforeWeek: number;
  /** Current explicit market inputs used to quote the replacement rate. */
  readonly rateInputs: RateInputs;
}

/** Boundary operation that removes one term and its performer from the collective. */
export interface TerminateEngagementInput {
  /** Current run whose membership is being changed. */
  readonly state: RunState;
  /** Stable id of the current or expired engagement. */
  readonly engagementId: string;
}

/** One forecast week whose membership and expense are fully determined. */
export interface DeterminateForecastWeek {
  /** Discriminator for a week whose closing balance is knowable. */
  readonly kind: "determinate";
  /** Absolute week being forecast. */
  readonly week: number;
  /** Scheduled recurring-expense evidence. */
  readonly expense: EngagementExpense;
  /** Closing balance under zero additional income. */
  readonly projectedClosingBalance: number;
  /** Engagement ids whose last paid week is this week. */
  readonly expiringEngagementIds: readonly string[];
}

/** One forecast week beyond an engagement decision boundary. */
export interface UnavailableForecastWeek {
  /** Discriminator for a suffix that depends on renewal or termination. */
  readonly kind: "unavailable";
  /** Absolute week whose balance is unavailable. */
  readonly week: number;
}

/** One week of the four-to-six-week expense forecast. */
export type EngagementForecastWeek = DeterminateForecastWeek | UnavailableForecastWeek;

/** Pure forecast input over the current run's next planning block. */
export interface ForecastEngagementsInput {
  /** Current run supplying balance, membership, terms and next week. */
  readonly state: RunState;
  /** Planning horizon, constrained to four through six weeks. */
  readonly horizon: number;
}

/** Scheduled obligations and the first determinate week projected to close negative. */
export interface EngagementForecast {
  /** One entry per requested week, including unavailable suffix entries. */
  readonly weeks: readonly EngagementForecastWeek[];
  /** First absolute negative-closing week in the determinate prefix, when one exists. */
  readonly firstNegativeWeek?: number;
}
/** Minimal run boundary required to validate engagement identity and current coverage. */
export interface EngagementValidationInput {
  /** Current collective and its authoritative members. */
  readonly collective: Collective;
  /** Current materialized terms; historical terms are not retained. */
  readonly engagements: readonly Engagement[];
  /** Absolute next week whose coverage must be complete. */
  readonly week: number;
}

/** Quotes one weekly rate from current stats and explicit, deterministic market inputs. */
export function quoteWeeklyRate(input: RateQuoteInput): number {
  const factors = [
    ["base weekly rate", input.baseWeeklyRate],
    ["origin rate scale", input.originRateScale],
    ["discipline rate scale", input.disciplineRateScale],
  ] as const;
  for (const [label, value] of factors) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must be finite and positive`);
    }
  }
  let statTotal = 0;
  for (const key of STAT_KEYS) statTotal += input.performer.stats[key];
  const profile = statTotal / STAT_KEYS.length;
  const rounded =
    Math.round(
      input.baseWeeklyRate * profile * input.originRateScale * input.disciplineRateScale * 10,
    ) / 10;
  // A rate that rounds away to nothing is a broken input, not a free performer: the engagement
  // invariant needs a positive rate, so say so here instead of quietly quoting the grid's floor.
  if (rounded <= 0) {
    throw new Error("weekly rate rounds to zero: the base rate or a scale is too small to price");
  }
  return rounded;
}

/** Stable code-point order over engagement ids; every charged or expiring list is built with it. */
export const byEngagementId = (left: Engagement, right: Engagement): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

const rejectPendingIncident = (state: RunState, operation: string): void => {
  if (state.incidents.pending !== null) {
    throw new Error(`${operation}: resolve the pending incident before changing engagements`);
  }
};

/** Replaces one expired term from the current week at the performer's current quote. */
export function renewEngagement(input: RenewEngagementInput): RunState {
  rejectPendingIncident(input.state, "renewEngagement");
  const current = input.state.engagements.find(
    (engagement) => engagement.id === input.engagementId,
  );
  if (current === undefined) {
    throw new Error(`renewEngagement: engagement "${input.engagementId}" is not stored`);
  }
  if (current.endsBeforeWeek > input.state.week) {
    throw new Error(
      `renewEngagement: engagement "${current.id}" still covers week ${input.state.week}`,
    );
  }
  if (!Number.isInteger(input.endsBeforeWeek) || input.endsBeforeWeek <= input.state.week) {
    throw new Error(
      `renewEngagement: end week must be an integer later than week ${input.state.week}`,
    );
  }
  const performer = input.state.collective.members.find(
    (member) => member.id === current.performerId,
  );
  if (performer === undefined) {
    throw new Error(`renewEngagement: performer "${current.performerId}" is not in the collective`);
  }
  const weeklyRate = quoteWeeklyRate({ performer, ...input.rateInputs });
  return {
    ...input.state,
    engagements: input.state.engagements.map((engagement) =>
      engagement.id === current.id
        ? {
            ...engagement,
            weeklyRate,
            startsAtWeek: input.state.week,
            endsBeforeWeek: input.endsBeforeWeek,
          }
        : engagement,
    ),
  };
}

/** Removes one term and its member atomically while preserving all unrelated run state. */
export function terminateEngagement(input: TerminateEngagementInput): RunState {
  rejectPendingIncident(input.state, "terminateEngagement");
  const current = input.state.engagements.find(
    (engagement) => engagement.id === input.engagementId,
  );
  if (current === undefined) {
    throw new Error(`terminateEngagement: engagement "${input.engagementId}" is not stored`);
  }
  if (!input.state.collective.members.some((member) => member.id === current.performerId)) {
    throw new Error(
      `terminateEngagement: performer "${current.performerId}" is not in the collective`,
    );
  }
  if (input.state.collective.members.length <= 1) {
    throw new Error("terminateEngagement: the collective's last engagement cannot be terminated");
  }
  return {
    ...input.state,
    collective: {
      ...input.state.collective,
      members: input.state.collective.members.filter((member) => member.id !== current.performerId),
    },
    engagements: input.state.engagements.filter((engagement) => engagement.id !== current.id),
  };
}

/** Validates current coverage and returns canonical recurring-expense evidence for one week. */
export function engagementExpenseAt(input: EngagementValidationInput): EngagementExpense {
  validateEngagements(input);
  const active = input.engagements
    .filter(
      (engagement) =>
        engagement.startsAtWeek <= input.week && input.week < engagement.endsBeforeWeek,
    )
    .toSorted(byEngagementId);
  let totalTenths = 0;
  for (const engagement of active) totalTenths += Math.round(engagement.weeklyRate * 10);
  return {
    engagementIds: active.map((engagement) => engagement.id),
    total: totalTenths / 10,
  };
}

/** Forecasts the next planning block's determined recurring expense under zero income. */
export function forecastEngagements(input: ForecastEngagementsInput): EngagementForecast {
  if (!Number.isInteger(input.horizon) || input.horizon < 4 || input.horizon > 6) {
    throw new RangeError(
      `an engagement forecast covers four to six weeks, this one covers ${input.horizon}`,
    );
  }
  const weeks: EngagementForecastWeek[] = [];
  let projectedBalance = input.state.org.money;
  let firstNegativeWeek: number | undefined;
  let unavailable = false;

  for (let offset = 0; offset < input.horizon; offset += 1) {
    const week = input.state.week + offset;
    if (unavailable) {
      weeks.push({ kind: "unavailable", week });
      continue;
    }
    const expense = engagementExpenseAt({
      collective: input.state.collective,
      engagements: input.state.engagements,
      week,
    });
    projectedBalance = applyOrgChange(
      { ...input.state.org, money: projectedBalance },
      { money: -expense.total },
    ).money;
    const expiringEngagementIds = input.state.engagements
      .filter((engagement) => engagement.endsBeforeWeek === week + 1)
      .map((engagement) => engagement.id)
      .toSorted();
    weeks.push({
      kind: "determinate",
      week,
      expense,
      projectedClosingBalance: projectedBalance,
      expiringEngagementIds,
    });
    if (firstNegativeWeek === undefined && projectedBalance < 0) firstNegativeWeek = week;
    unavailable = expiringEngagementIds.length > 0;
  }

  return firstNegativeWeek === undefined ? { weeks } : { weeks, firstNegativeWeek };
}

const isTenths = (value: number): boolean => Number.isInteger(value * 10);

/**
 * Validates every stored term and proves each current member is covered for the next week.
 * Runs before plan validation so a rejection cannot consume randomness or mutate run state.
 */
export function validateEngagements(input: EngagementValidationInput): void {
  const ids = new Set<string>();
  const performerIds = new Set<string>();
  const memberIds = new Set(input.collective.members.map((member) => member.id));

  for (const engagement of input.engagements) {
    if (ids.has(engagement.id)) {
      throw new Error(`engagement id "${engagement.id}" is stored more than once`);
    }
    ids.add(engagement.id);
    if (performerIds.has(engagement.performerId)) {
      throw new Error(`performer "${engagement.performerId}" has more than one engagement`);
    }
    performerIds.add(engagement.performerId);
    if (
      !Number.isFinite(engagement.weeklyRate) ||
      engagement.weeklyRate <= 0 ||
      !isTenths(engagement.weeklyRate)
    ) {
      throw new Error(
        `engagement "${engagement.id}" weekly rate must be finite, positive and on the one-tenth grid`,
      );
    }
    if (
      !Number.isInteger(engagement.startsAtWeek) ||
      engagement.startsAtWeek < 0 ||
      !Number.isInteger(engagement.endsBeforeWeek) ||
      engagement.endsBeforeWeek <= engagement.startsAtWeek
    ) {
      throw new Error(
        `engagement "${engagement.id}" week boundaries must be non-negative integers with a later exclusive end`,
      );
    }
    if (engagement.collectiveId !== input.collective.id) {
      throw new Error(
        `engagement "${engagement.id}" names collective "${engagement.collectiveId}" instead of "${input.collective.id}"`,
      );
    }
    if (!memberIds.has(engagement.performerId)) {
      throw new Error(
        `engagement "${engagement.id}" performer "${engagement.performerId}" is not a member of collective "${input.collective.id}"`,
      );
    }
  }

  for (const member of input.collective.members) {
    const engagement = input.engagements.find((candidate) => candidate.performerId === member.id);
    if (
      engagement === undefined ||
      engagement.startsAtWeek > input.week ||
      engagement.endsBeforeWeek <= input.week
    ) {
      throw new Error(`performer "${member.id}" has no engagement covering week ${input.week}`);
    }
  }
}
