import type { EncounterField, EncounterState } from "./encounter.ts";
import { validateEngagements } from "./engagement.ts";
import type { RngState } from "./rng.ts";
import { restoreRng } from "./rng.ts";
import type {
  AdvanceOptions,
  AdvanceResult,
  RunState,
  WeekKindCounts,
  WeekMarking,
  WeekPlan,
} from "./week.ts";
import { advance } from "./week.ts";

/** An inclusive range for how many weeks receive one marking. */
export interface SeasonMarkingRange {
  /** Smallest permitted count. */
  readonly min: number;
  /** Largest permitted count. */
  readonly max: number;
}

/** The complete marked-week ranges supported by the calendar generator. */
export interface SeasonMarkingRanges {
  /** Range for single-contest weeks. */
  readonly contest: SeasonMarkingRange;
  /** Range for series weeks. */
  readonly series: SeasonMarkingRange;
}

/** Validated content input that declares a complete season calendar shape. */
export interface SeasonTemplate {
  /** Stable content identifier. */
  readonly id: string;
  /** Positive number of weeks in the season. */
  readonly length: number;
  /** Complete ranges for every supported marked-week kind. */
  readonly markings: SeasonMarkingRanges;
}

/** A stable tagged identifier derived only from season number and relative week. */
export interface SeasonCalendarEntryId {
  /** Nominal tag preventing unrelated structured ids from being substituted. */
  readonly kind: "season-entry";
  /** Season that owns the entry. */
  readonly season: number;
  /** Zero-based position inside that season. */
  readonly relativeWeek: number;
}

/** One materialized week whose identity and marking never change during a season. */
export interface SeasonCalendarEntry {
  /** Stable identity used by factual contest results. */
  readonly id: SeasonCalendarEntryId;
  /** Zero-based position inside the season. */
  readonly relativeWeek: number;
  /** Absolute simulation week. */
  readonly week: number;
  /** The closed calendar marking for this week. */
  readonly marking: WeekMarking;
}

/** A bounded, chronologically ordered calendar consumed by block advancement. */
export interface SeasonCalendar {
  /** Absolute week of the first entry. */
  readonly startWeek: number;
  /** Exactly one entry for every relative week. */
  readonly entries: readonly SeasonCalendarEntry[];
}

/** The initial executable season objective, declared rather than inferred. */
export interface MinimumContestWinsGoal {
  /** Closed discriminant for auditable goal evaluation. */
  readonly kind: "minimum-contest-wins";
  /** Required number of recorded wins. */
  readonly target: number;
}

/** Closed season objective union. */
export type SeasonGoal = MinimumContestWinsGoal;

/** Factual result supplied by the future contest owner. */
export type SeasonContestOutcome = "win" | "loss" | "draw";

/** Exactly one factual result for one marked calendar entry. */
export interface SeasonContestFact {
  /** Marked calendar entry this fact closes. */
  readonly entryId: SeasonCalendarEntryId;
  /** Final outcome; core does not calculate its score. */
  readonly outcome: SeasonContestOutcome;
}

/** Immutable evidence produced when a season reaches its boundary. */
export interface SeasonResult {
  /** Completed season number. */
  readonly number: number;
  /** Template content id used to construct its calendar. */
  readonly templateId: string;
  /** Goal announced at season start. */
  readonly goal: SeasonGoal;
  /** Whether recorded wins met the declared target. */
  readonly achieved: boolean;
  /** Facts ordered by their calendar entries. */
  readonly facts: readonly SeasonContestFact[];
  /** Structural classifications of every advanced week. */
  readonly kinds: WeekKindCounts;
  /** Weeks passed without returning control. */
  readonly uninterruptedWeeks: number;
  /** Total advanced weeks used as the share denominator. */
  readonly totalWeeks: number;
  /** Uninterrupted count divided by total, or zero for an empty total. */
  readonly uninterruptedShare: number;
}

/** Fields retained by both active and completed season states. */
export interface SeasonEvidence {
  /** Positive ordinal independent of calendar years. */
  readonly number: number;
  /** Absolute week where this season began. */
  readonly startWeek: number;
  /** Number of calendar entries already advanced. */
  readonly position: number;
  /** Stable content id of the template that produced the calendar. */
  readonly templateId: string;
  /** Materialized authoritative calendar. */
  readonly calendar: SeasonCalendar;
  /** Goal announced for this season. */
  readonly goal: SeasonGoal;
  /** Accumulated structural week classifications. */
  readonly kinds: WeekKindCounts;
  /** Weeks passed without returning control. */
  readonly uninterruptedWeeks: number;
  /** Number of advanced weeks observed. */
  readonly totalWeeks: number;
  /** Exactly-once facts accepted so far. */
  readonly facts: readonly SeasonContestFact[];
  /** Season's opponent field, materialized once by `season-contest`; absent until then. */
  readonly field: EncounterField | null;
  /** Encounters keyed by the marked entry they belong to, owned by `season-contest`. */
  readonly encounters: readonly EncounterState[];
  /** Continuation used to construct the next season calendar. */
  readonly calendarRng: RngState;
}

/** A season that may still advance or wait for missing facts at its boundary. */
export interface ActiveSeason extends SeasonEvidence {
  /** Lifecycle discriminant. */
  readonly kind: "active";
}

/** A season whose final result remains available until explicit replacement. */
export interface CompletedSeason extends SeasonEvidence {
  /** Lifecycle discriminant. */
  readonly kind: "completed";
  /** Immutable result derived from retained evidence. */
  readonly result: SeasonResult;
}

/** Authoritative serializable season lifecycle state. */
export type Season = ActiveSeason | CompletedSeason;

/** Explicit inputs needed to materialize the first active season. */
export interface StartSeasonInput {
  /** Positive season ordinal. */
  readonly number: number;
  /** Absolute first week. */
  readonly startWeek: number;
  /** Validated content template. */
  readonly template: SeasonTemplate;
  /** Declared objective. */
  readonly goal: SeasonGoal;
  /** Root seed whose named stream produced the supplied state. */
  readonly seed: number | string;
  /** Serializable season-calendar stream state. */
  readonly rngState: RngState;
}

/** Zeroed observations used only to initialize a fresh season. */
const EMPTY_KINDS: WeekKindCounts = { quiet: 0, ordinary: 0, contest: 0, series: 0 };

/** Rejects malformed content before construction can consume the local RNG continuation. */
function validateMarkingRange(name: string, range: SeasonMarkingRange): void {
  if (!Number.isInteger(range.min) || !Number.isInteger(range.max)) {
    throw new TypeError(`${name} marking range must use integers`);
  }
  if (range.min < 0 || range.max < 0) {
    throw new RangeError(`${name} marking range must not be negative`);
  }
  if (range.min > range.max) {
    throw new RangeError(`${name} marking minimum must not exceed its maximum`);
  }
}

/** Validates every non-random construction invariant before restoring the stream. */
function validateStartInput(input: StartSeasonInput): void {
  if (!Number.isInteger(input.number) || input.number < 1) {
    throw new RangeError("season number must be a positive integer");
  }
  if (!Number.isInteger(input.startWeek) || input.startWeek < 0) {
    throw new RangeError("season start week must be a non-negative integer");
  }
  if (!Number.isInteger(input.template.length) || input.template.length < 1) {
    throw new RangeError("season template length must be a positive integer");
  }
  validateMarkingRange("contest", input.template.markings.contest);
  validateMarkingRange("series", input.template.markings.series);
  const maximumMarked = input.template.markings.contest.max + input.template.markings.series.max;
  if (maximumMarked > input.template.length) {
    throw new RangeError("maximum marked weeks must fit within the season length");
  }
  if (
    !Number.isInteger(input.goal.target) ||
    input.goal.target < 0 ||
    input.goal.target > maximumMarked
  ) {
    throw new RangeError("season goal target must be an integer within scheduled marked weeks");
  }
}

/** Materializes one deterministic active season and retains the stream continuation. */
export function startSeason(input: StartSeasonInput): ActiveSeason {
  validateStartInput(input);
  const rng = restoreRng(input.seed, input.rngState);
  const seriesCount = rng.int(
    input.template.markings.series.min,
    input.template.markings.series.max,
  );
  const contestCount = rng.int(
    input.template.markings.contest.min,
    input.template.markings.contest.max,
  );
  if (input.goal.target > seriesCount + contestCount) {
    throw new RangeError("season goal target exceeds the materialized marked weeks");
  }
  const shuffled = rng.shuffle(Array.from({ length: input.template.length }, (_, index) => index));
  const seriesWeeks = new Set(shuffled.slice(0, seriesCount));
  const contestWeeks = new Set(shuffled.slice(seriesCount, seriesCount + contestCount));
  const entries = Array.from({ length: input.template.length }, (_, relativeWeek) => {
    let marking: WeekMarking = "none";
    if (seriesWeeks.has(relativeWeek)) marking = "series";
    else if (contestWeeks.has(relativeWeek)) marking = "contest";
    return {
      id: { kind: "season-entry" as const, season: input.number, relativeWeek },
      relativeWeek,
      week: input.startWeek + relativeWeek,
      marking,
    };
  });

  return {
    kind: "active",
    number: input.number,
    startWeek: input.startWeek,
    position: 0,
    templateId: input.template.id,
    calendar: { startWeek: input.startWeek, entries },
    goal: input.goal,
    kinds: EMPTY_KINDS,
    uninterruptedWeeks: 0,
    totalWeeks: 0,
    facts: [],
    field: null,
    encounters: [],
    calendarRng: rng.state(),
  };
}

/** Optional week-loop settings supplied while the season owns the calendar. */
export type AdvanceSeasonOptions = Omit<AdvanceOptions, "calendar">;

/** The run and season state left by one delegated block advancement. */
export interface SeasonAdvanceResult {
  /** Complete week-loop result, including the reasons that returned control. */
  readonly advance: AdvanceResult;
  /** Run state returned by the week loop. */
  readonly runState: RunState;
  /** Folded active state or newly completed state. */
  readonly season: Season;
}

/** Explicit inputs for replacing one completed season with the next active one. */
export interface StartNextSeasonInput {
  /** Run at the boundary; it is carried unchanged. */
  readonly runState: RunState;
  /** Completed season whose calendar continuation is consumed. */
  readonly season: CompletedSeason;
  /** Template declared for the next season. */
  readonly template: SeasonTemplate;
  /** Goal announced for the next season. */
  readonly goal: SeasonGoal;
}

/** Explicit next-season operation returns the untouched run beside fresh season state. */
export interface StartNextSeasonResult {
  /** Exact run state supplied at the boundary. */
  readonly runState: RunState;
  /** Newly materialized active season. */
  readonly season: ActiveSeason;
}

/** Compares stable entry identities after serialization or structural reconstruction. */
export function sameEntryId(first: SeasonCalendarEntryId, second: SeasonCalendarEntryId): boolean {
  return first.season === second.season && first.relativeWeek === second.relativeWeek;
}

/** Adds independent week-kind observations without reclassifying either input. */
function addKinds(first: WeekKindCounts, second: WeekKindCounts): WeekKindCounts {
  return {
    quiet: first.quiet + second.quiet,
    ordinary: first.ordinary + second.ordinary,
    contest: first.contest + second.contest,
    series: first.series + second.series,
  };
}

/** Completes only when the boundary and every marked entry's fact are both present. */
function completeIfReady(season: ActiveSeason): Season {
  if (season.position < season.calendar.entries.length) return season;
  const marked = season.calendar.entries.filter((entry) => entry.marking !== "none");
  if (season.facts.length !== marked.length) return season;
  const facts: SeasonContestFact[] = [];
  for (const entry of marked) {
    const fact = season.facts.find((candidate) => sameEntryId(candidate.entryId, entry.id));
    if (fact === undefined) return season;
    facts.push(fact);
  }
  const wins = facts.filter((fact) => fact.outcome === "win").length;
  const result: SeasonResult = {
    number: season.number,
    templateId: season.templateId,
    goal: season.goal,
    achieved: wins >= season.goal.target,
    facts,
    kinds: season.kinds,
    uninterruptedWeeks: season.uninterruptedWeeks,
    totalWeeks: season.totalWeeks,
    uninterruptedShare: season.totalWeeks === 0 ? 0 : season.uninterruptedWeeks / season.totalWeeks,
  };
  return { ...season, kind: "completed", result };
}

/**
 * Delegates exactly one planning block to the week loop and folds only returned observations.
 * The calendar and every week rule stay owned by `advance`.
 */
export function advanceSeason(
  runState: RunState,
  season: Season,
  plan: WeekPlan,
  options: AdvanceSeasonOptions = {},
): SeasonAdvanceResult {
  if (season.kind !== "active") {
    throw new Error("advanceSeason: a completed season cannot advance");
  }
  const expectedWeek = season.startWeek + season.position;
  if (runState.week !== expectedWeek) {
    throw new Error(
      `advanceSeason: season position expects absolute week ${expectedWeek}, run clock is ${runState.week}`,
    );
  }
  if (season.position >= season.calendar.entries.length) {
    throw new Error("advanceSeason: season boundary is waiting for contest facts");
  }

  const advanced = advance(runState, plan, { ...options, calendar: season.calendar });
  const weeks = advanced.weeks.length;
  const active: ActiveSeason = {
    ...season,
    position: season.position + weeks,
    kinds: addKinds(season.kinds, advanced.kinds),
    uninterruptedWeeks: season.uninterruptedWeeks + Math.max(0, weeks - 1),
    totalWeeks: season.totalWeeks + weeks,
  };
  return { advance: advanced, runState: advanced.state, season: completeIfReady(active) };
}

/**
 * Records one canonical fact for a current or already advanced marked entry. Every rejection
 * happens before a replacement season value is constructed.
 */
export function recordSeasonContestFact(season: Season, fact: SeasonContestFact): Season {
  if (season.kind !== "active") {
    throw new Error("recordSeasonContestFact: a completed season accepts no more facts");
  }
  const entry = season.calendar.entries.find((candidate) =>
    sameEntryId(candidate.id, fact.entryId),
  );
  if (entry === undefined) {
    throw new Error("recordSeasonContestFact: unknown calendar entry");
  }
  if (entry.marking === "none") {
    throw new Error("recordSeasonContestFact: an unmarked week has no contest fact");
  }
  if (entry.relativeWeek > season.position) {
    throw new Error("recordSeasonContestFact: a future calendar entry cannot have a fact");
  }
  if (season.facts.some((candidate) => sameEntryId(candidate.entryId, entry.id))) {
    throw new Error("recordSeasonContestFact: calendar entry already has a fact");
  }
  const active: ActiveSeason = {
    ...season,
    facts: [...season.facts, { entryId: entry.id, outcome: fact.outcome }],
  };
  return completeIfReady(active);
}

/** Starts the next season explicitly while preserving every field owned by the run. */
export function startNextSeason(input: StartNextSeasonInput): StartNextSeasonResult {
  if (input.runState.incidents.pending !== null) {
    throw new Error("startNextSeason: pending incident must be resolved first");
  }
  validateEngagements({
    collective: input.runState.collective,
    engagements: input.runState.engagements,
    week: input.runState.week,
  });
  const expectedWeek = input.season.startWeek + input.season.position;
  if (input.runState.week !== expectedWeek) {
    throw new Error(
      `startNextSeason: season boundary expects absolute week ${expectedWeek}, run clock is ${input.runState.week}`,
    );
  }
  const season = startSeason({
    number: input.season.number + 1,
    startWeek: input.runState.week,
    template: input.template,
    goal: input.goal,
    seed: input.runState.seed,
    rngState: input.season.calendarRng,
  });
  return { runState: input.runState, season };
}
