import type {
  RunState,
  Season,
  SeasonAdvanceResult,
  StopReason,
  WeekPlan,
  WeekResult,
} from "@et/core";
import {
  advanceSeason,
  validateEngagements,
  validateWeekPlan,
  WEEK_PLAN_MAX_WEEKS,
  WEEK_PLAN_MIN_WEEKS,
} from "@et/core";

import type { ContentCatalog } from "./content.ts";
import type { OpeningRun } from "./run.ts";

/** A content id and optional selected person, before a core plan is materialized. */
export interface DraftEntry {
  /** Catalog identity and the selected person, if the activity needs one. */
  readonly activityId: string;
  readonly memberId?: string;
}

/** One editable absolute week; earlier weeks live only in core evidence. */
export interface DraftWeek {
  /** Absolute clock coordinate and its ordered, still-editable assignments. */
  readonly week: number;
  readonly entries: readonly DraftEntry[];
}

/** A planning block beginning exactly where the committed run will advance. */
export interface DraftBlock {
  /** Every row starts at the committed run's next week and has no executed prefix. */
  readonly startWeek: number;
  readonly weeks: readonly DraftWeek[];
}

/** A pending session before validated content and a committed run exist. */
type LoadingMode = { readonly kind: "loading" };
/** An editable plan; a successful return changes this tag to stopped or blocked. */
type EditingMode = { readonly kind: "editing" };
/** Command dispatch holds an invocation token while core is running. */
type AdvancingMode = { readonly kind: "advancing"; readonly token: number };
/** A resolved block keeps the exact stop and every reason from core. */
type StoppedMode = {
  /** The exact stop position and all reasons returned by core. */
  readonly kind: "stopped";
  readonly stoppedAt: number;
  readonly reasons: readonly StopReason[];
};
/** A missing real decision prevents the next core command. */
type BlockedMode = {
  /** The unresolved decision and preserved reasons behind a disabled Continue. */
  readonly kind: "blocked";
  readonly detail: string;
  readonly reasons: readonly StopReason[];
};
/** Malformed core output or an unexpected tag fails closed. */
type ErrorMode = { readonly kind: "error"; readonly detail: string };

/** Command modes keep missing or unresolved core decisions distinct from a normal stop. */
export type SessionMode =
  LoadingMode | EditingMode | AdvancingMode | StoppedMode | BlockedMode | ErrorMode;

/** Read-only screen input: core values always come from the committed run, not the draft. */
export interface SessionView {
  /** Committed state, draft, status and render token; consumers must not project numbers. */
  readonly mode: SessionMode;
  readonly sheet: "collapsed" | "expanded";
  readonly revision: number;
  readonly runState: RunState;
  readonly season: Season;
  readonly draft: DraftBlock;
  readonly history: readonly WeekResult[];
  readonly last: SeasonAdvanceResult | null;
  readonly error: string | null;
}

function emptyBlock(startWeek: number, length: number): DraftBlock {
  return {
    startWeek,
    weeks: Array.from({ length }, (_, index) => ({ week: startWeek + index, entries: [] })),
  };
}

function blockedReason(run: RunState, season: Season): string | null {
  if (season.kind === "completed")
    return "The season is complete. A new season needs its own decision.";
  if (run.incidents.pending !== null) return "An incident needs a choice before another week.";
  try {
    validateEngagements({
      collective: run.collective,
      engagements: run.engagements,
      week: run.week,
    });
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  const entry = season.calendar.entries[season.position];
  if (entry === undefined) return "Season boundary: marked entries still need factual results.";
  if (entry.marking === "series")
    return `Week ${run.week} is a series. This screen cannot settle series.`;
  if (entry.marking === "contest")
    return `Week ${run.week} is a contest. Settle it before advancing.`;
  const marking: string = entry.marking;
  if (marking !== "none") return `Unknown week marking: ${marking}`;
  return null;
}

function retainFuture(draft: DraftBlock, nextWeek: number): DraftBlock {
  const weeks = draft.weeks.filter((week) => week.week >= nextWeek);
  const count = Math.max(WEEK_PLAN_MIN_WEEKS, weeks.length);
  return {
    startWeek: nextWeek,
    weeks: Array.from(
      { length: count },
      (_, index) => weeks[index] ?? { week: nextWeek + index, entries: [] },
    ),
  };
}

/** The only shell owner of committed core state and the only caller of advanceSeason. */
export class WeekSession {
  private readonly catalog: ContentCatalog;
  private runState: RunState;
  private season: Season;
  private draft: DraftBlock;
  private history: WeekResult[] = [];
  private last: SeasonAdvanceResult | null = null;
  private mode: SessionMode;
  private sheet: "collapsed" | "expanded" = "collapsed";
  private revision = 0;
  private error: string | null = null;
  private inFlight = false;

  constructor(catalog: ContentCatalog, opening: OpeningRun) {
    this.catalog = catalog;
    this.runState = opening.runState;
    this.season = opening.season;
    this.draft = emptyBlock(opening.runState.week, WEEK_PLAN_MIN_WEEKS);
    const detail = blockedReason(this.runState, this.season);
    this.mode = detail ? { kind: "blocked", detail, reasons: [] } : { kind: "editing" };
  }

  /** A snapshot for DOM and geometry; never returns draft projections as committed values. */
  get view(): SessionView {
    return {
      mode: this.mode,
      sheet: this.sheet,
      revision: this.revision,
      runState: this.runState,
      season: this.season,
      draft: this.draft,
      history: this.history,
      last: this.last,
      error: this.error,
    };
  }

  /** Changes presentation only; opening a stopped result explicitly returns to editing. */
  toggleSheet(): void {
    this.sheet = this.sheet === "collapsed" ? "expanded" : "collapsed";
    if (this.sheet === "expanded" && this.mode.kind === "stopped") this.mode = { kind: "editing" };
    this.revision += 1;
  }

  /** Adjusts only future rows, rejecting an out-of-contract block before core sees it. */
  setWeeks(count: number): void {
    if (!Number.isInteger(count) || count < WEEK_PLAN_MIN_WEEKS || count > WEEK_PLAN_MAX_WEEKS) {
      throw new RangeError(`A plan needs ${WEEK_PLAN_MIN_WEEKS} to ${WEEK_PLAN_MAX_WEEKS} weeks.`);
    }
    this.draft = {
      ...this.draft,
      weeks: Array.from(
        { length: count },
        (_, index) =>
          this.draft.weeks[index] ?? { week: this.draft.startWeek + index, entries: [] },
      ),
    };
    this.revision += 1;
  }

  private edit(
    week: number,
    update: (entries: readonly DraftEntry[]) => readonly DraftEntry[],
  ): void {
    if (week < this.runState.week) throw new Error(`Week ${week} was already executed.`);
    const index = week - this.draft.startWeek;
    const row = this.draft.weeks[index];
    if (row === undefined || this.season.kind !== "active")
      throw new Error(`Week ${week} is outside the editable block.`);
    const calendarEntry = this.season.calendar.entries[week - this.season.startWeek];
    if (calendarEntry === undefined) throw new Error(`Week ${week} is beyond the season boundary.`);
    this.draft = {
      ...this.draft,
      weeks: this.draft.weeks.map((item, position) =>
        position === index ? { ...row, entries: update(row.entries) } : item,
      ),
    };
    this.error = null;
    this.revision += 1;
  }

  /** Appends a validated content choice; single-member targets may wait for a person selection. */
  add(week: number, activityId: string, memberId?: string): void {
    const activity = this.catalog.activities.find((candidate) => candidate.id === activityId);
    if (!activity) throw new Error(`Unknown activity ${activityId}`);
    if (memberId && !this.runState.collective.members.some((member) => member.id === memberId)) {
      throw new Error(`Unknown member ${memberId}`);
    }
    this.edit(week, (entries) => [
      ...entries,
      memberId ? { activityId, memberId } : { activityId },
    ]);
  }

  /** Replaces or clears one member choice without editing a completed week. */
  setMember(week: number, position: number, memberId: string | null): void {
    if (
      memberId !== null &&
      !this.runState.collective.members.some((member) => member.id === memberId)
    ) {
      throw new Error(`Unknown member ${memberId}`);
    }
    this.edit(week, (entries) =>
      entries.map((entry, index) =>
        index === position
          ? memberId === null
            ? { activityId: entry.activityId }
            : { ...entry, memberId }
          : entry,
      ),
    );
  }

  /** Removes only an unexecuted assignment. */
  remove(week: number, position: number): void {
    this.edit(week, (entries) => entries.filter((_, index) => index !== position));
  }

  /** Reorders the actual submission order rather than a cosmetic list. */
  move(week: number, position: number, offset: -1 | 1): void {
    this.edit(week, (entries) => {
      const moved = entries.slice();
      const target = position + offset;
      const item = moved[position];
      if (item === undefined || target < 0 || target >= moved.length) return entries;
      moved.splice(position, 1);
      moved.splice(target, 0, item);
      return moved;
    });
  }

  private plan(): WeekPlan {
    const weeks = this.draft.weeks.map((row) =>
      row.entries.map((entry) => {
        const activity = this.catalog.activities.find(
          (candidate) => candidate.id === entry.activityId,
        );
        if (!activity) throw new Error(`Week ${row.week}: unknown activity ${entry.activityId}`);
        return entry.memberId ? { activity, memberId: entry.memberId } : { activity };
      }),
    );
    const plan = { weeks };
    validateWeekPlan(plan, this.runState.collective);
    return plan;
  }

  /** Guarded command: a stale render or second activation cannot charge the same week twice. */
  continue(revision: number): boolean {
    if (this.inFlight || revision !== this.revision || this.mode.kind !== "editing") return false;
    let plan: WeekPlan;
    try {
      plan = this.plan();
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
      this.sheet = "expanded";
      this.revision += 1;
      return false;
    }
    this.inFlight = true;
    this.mode = { kind: "advancing", token: this.revision + 1 };
    this.revision += 1;
    try {
      const result = advanceSeason(this.runState, this.season, plan);
      const weeks = result.advance.weeks;
      const seasonKind: string = result.season.kind;
      const valid =
        (seasonKind === "active" || seasonKind === "completed") &&
        result.advance.state === result.runState &&
        weeks.length > 0 &&
        weeks.every((week, index) => week.week === this.runState.week + index) &&
        result.runState.week === this.runState.week + weeks.length &&
        result.advance.stoppedAt === weeks[weeks.length - 1]?.week &&
        Array.isArray(result.advance.reasons) &&
        result.advance.reasons.every((reason) =>
          [
            "block-ran-out",
            "activity-skipped",
            "energy-threshold",
            "morale-threshold",
            "money-negative",
            "contest-ahead",
            "season-ended",
            "engagement-expired",
            "incident-pending",
          ].includes(reason.kind),
        );
      if (!valid)
        throw new Error(
          "Core returned an unexpected week result; the previous run remains committed.",
        );
      const next = retainFuture(this.draft, result.runState.week);
      this.runState = result.runState;
      this.season = result.season;
      this.last = result;
      this.history.push(...weeks.map((week) => Object.freeze(week)));
      this.draft = next;
      this.error = null;
      this.sheet = "collapsed";
      const detail = blockedReason(this.runState, this.season);
      this.mode = detail
        ? { kind: "blocked", detail, reasons: result.advance.reasons }
        : { kind: "stopped", stoppedAt: result.advance.stoppedAt, reasons: result.advance.reasons };
      this.revision += 1;
      return true;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.error = detail;
      if (detail.startsWith("Core returned an unexpected")) this.mode = { kind: "error", detail };
      else {
        this.mode = { kind: "editing" };
        this.sheet = "expanded";
      }
      this.revision += 1;
      return false;
    } finally {
      this.inFlight = false;
    }
  }
}
