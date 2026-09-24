/**
 * Season contest: the binding between one marked `SeasonCalendarEntry` and one resolved
 * head-to-head Contest, the opponent behind it, and the participant, reward and season-fact
 * consequences applied exactly once (`proposal.md`, `design.md`).
 *
 * Three explicit pure transitions: `materializeEncounterField` builds the season's opponents
 * once, `openEncounter` draws one of them for a marked entry, and `settleEncounter` resolves
 * the Contest and installs every consequence atomically. Every draw goes through the named
 * `encounter` or `contest` stream carried in `RunState` (`adr/0002`); no series format is
 * supported here (`design.md`, "The unit is one marked entry").
 */
import type { Collective } from "./collective.ts";
import {
  CONTEST_STREAM_NAME,
  type ContestId,
  type ContestInput,
  type ContestOutcome,
  type ContestParticipantInput,
  type ContestResult,
  type ContestRules,
  resolveContest,
} from "./contest.ts";
import type { OriginProfile } from "./generate.ts";
import { generatePerformer } from "./generate.ts";
import { applyOrgChange } from "./org.ts";
import { applyStateChange, type Performer } from "./performer.ts";
import { createRng, restoreRng, type RngState } from "./rng.ts";
import {
  type ActiveSeason,
  recordSeasonContestFact,
  sameEntryId,
  type Season,
  type SeasonCalendarEntryId,
  type SeasonContestOutcome,
} from "./season.ts";
import type { RunState } from "./week.ts";

/** Isolated RNG stream name reserved for field materialization and opponent selection. */
export const ENCOUNTER_STREAM_NAME = "encounter";

/** Generator level range accepted for an opponent, matching the generator's own scale. */
const OPPONENT_LEVEL_MIN = 1;
const OPPONENT_LEVEL_MAX = 5;

/** The opponent a definition generates: origin and level, exactly as `generatePerformer` needs. */
export interface EncounterOpponentDefinition {
  /** Resolved origin the opponent's Performers are generated from. */
  readonly origin: OriginProfile;
  /** 1 — basement amateur, 5 — world top. */
  readonly level: number;
}

/** One money amount for each Contest outcome; `draw` is declared, never derived. */
export interface EncounterReward {
  /** Credited on a `win`. */
  readonly win: number;
  /** Credited on a `loss`. */
  readonly loss: number;
  /** Credited on a `draw`. */
  readonly draw: number;
}

/** One content-declared opponent behind a `contest`-marked entry (`content/encounters/*`). */
export interface EncounterDefinition {
  /** Stable content id, unique within a pool. */
  readonly id: string;
  /** English content label, kept for round-trip only: core never copies it into a result. */
  readonly label: string;
  /** Discipline this definition belongs to; must match the collective's own discipline. */
  readonly disciplineId: string;
  /** Where and how strong the generated opponent is. */
  readonly opponent: EncounterOpponentDefinition;
  /** The three declared reward amounts. */
  readonly reward: EncounterReward;
}

/** One materialized opponent: a frozen Collective generated once for its definition. */
export interface EncounterFieldMember {
  /** Definition this member was generated from. */
  readonly definitionId: string;
  /** Copied from the definition, so settlement never re-reads the pool. */
  readonly disciplineId: string;
  /** Copied from the definition, so settlement never re-reads the pool. */
  readonly reward: EncounterReward;
  /** The generated, frozen opponent; never regenerated or written back to. */
  readonly collective: Collective;
}

/** The season's complete opponent field, in stable definition-id order. */
export type EncounterField = readonly EncounterFieldMember[];

/** An encounter whose opponent exists but whose Contest has not been resolved. */
export interface PendingEncounter {
  /** Lifecycle discriminant. */
  readonly kind: "pending";
  /** Marked calendar entry this encounter belongs to. */
  readonly entryId: SeasonCalendarEntryId;
  /** Field member drawn for this entry. */
  readonly definitionId: string;
}

/** An encounter whose Contest, participant, reward and fact consequences are all applied. */
export interface SettledEncounter {
  /** Lifecycle discriminant. */
  readonly kind: "settled";
  /** Marked calendar entry this encounter belongs to. */
  readonly entryId: SeasonCalendarEntryId;
  /** Field member drawn for this entry. */
  readonly definitionId: string;
  /** Season outcome mapped from the resolved Contest. */
  readonly outcome: SeasonContestOutcome;
  /** Exact amount credited for this outcome. */
  readonly reward: number;
  /** Complete stored evidence from the resolver; replayed, never reconstructed. */
  readonly result: ContestResult;
}

/** Every encounter is one of exactly two tagged states. */
export type EncounterState = PendingEncounter | SettledEncounter;

/** Structural check for a JSON-shaped RNG continuation, narrowing an otherwise unknown value. */
function isRngState(value: unknown): value is RngState {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffffffff)
  );
}

/** Rejects a malformed continuation before it is restored into a stream. */
function requireRngState(state: unknown, path: string): RngState {
  if (!isRngState(state)) {
    throw new TypeError(`${path} must be a 4-word RNG state`);
  }
  return state;
}

/**
 * Prefix that keeps every generated opponent identity outside the career id space, and a
 * valid stable id itself: dash-joined, matching the `[a-z0-9][a-z0-9-]*` a Contest requires.
 */
function encounterNamespace(seasonNumber: number, definitionId: string): string {
  return `season-contest-s${seasonNumber}-${definitionId}`;
}

/** Rejects an entry that is unknown, not `contest`-marked, or later than the current one. */
function requireSettleableEntry(season: Season, entryId: SeasonCalendarEntryId): void {
  const entry = season.calendar.entries.find((candidate) => sameEntryId(candidate.id, entryId));
  if (entry === undefined) {
    throw new Error("season-contest: unknown calendar entry");
  }
  if (entry.marking === "series") {
    throw new Error("season-contest: a series-marked entry is not settled by this capability");
  }
  if (entry.marking === "none") {
    throw new Error("season-contest: an unmarked entry has no encounter");
  }
  if (entry.relativeWeek > season.position) {
    throw new Error("season-contest: a future calendar entry cannot be opened or settled");
  }
}

/** Finds the stored encounter for one entry, if any exists yet. */
function findEncounter(season: Season, entryId: SeasonCalendarEntryId): EncounterState | undefined {
  return season.encounters.find((candidate) => sameEntryId(candidate.entryId, entryId));
}

/** Replaces or appends one encounter, keyed by its entry identity, in the season's list. */
function withEncounter(season: Season, encounter: EncounterState): Season {
  return {
    ...season,
    encounters: [
      ...season.encounters.filter(
        (candidate) => !sameEntryId(candidate.entryId, encounter.entryId),
      ),
      encounter,
    ],
  };
}

/** Everything `materializeEncounterField` needs, beyond the run and the season. */
export interface MaterializeEncounterFieldInput {
  /** Run whose `encounter` stream is drawn from. */
  readonly runState: RunState;
  /** Season the field is materialized for; it must not already have one. */
  readonly season: ActiveSeason;
  /** Discipline the collective plays; every definition must declare it. */
  readonly disciplineId: string;
  /** Discipline's Contest rules; their participant count sizes every generated opponent. */
  readonly rules: ContestRules;
  /** Validated content pool; visited in stable id order regardless of array order. */
  readonly pool: readonly EncounterDefinition[];
}

/** What `materializeEncounterField` returns. */
export interface MaterializeEncounterFieldResult {
  /** Run with its `encounter` continuation moved. */
  readonly runState: RunState;
  /** Season with its opponent field installed. */
  readonly season: ActiveSeason;
}

/**
 * Materializes the season's complete opponent field exactly once: one generated opponent per
 * pool definition, in stable id order, drawn only from the `encounter` stream.
 */
export function materializeEncounterField(
  input: MaterializeEncounterFieldInput,
): MaterializeEncounterFieldResult {
  const { runState, season, disciplineId, rules, pool } = input;
  const participantCount = rules.participantCount;
  if (season.field !== null) {
    throw new Error("materializeEncounterField: this season already has a materialized field");
  }
  if (pool.length === 0) {
    throw new RangeError("materializeEncounterField: pool must declare at least one definition");
  }
  if (!Number.isInteger(participantCount) || participantCount < 1) {
    throw new RangeError("materializeEncounterField: participantCount must be a positive integer");
  }
  const seenIds = new Set<string>();
  for (const definition of pool) {
    if (seenIds.has(definition.id)) {
      throw new RangeError(`materializeEncounterField: duplicate definition id "${definition.id}"`);
    }
    seenIds.add(definition.id);
    if (definition.disciplineId !== disciplineId) {
      throw new RangeError(
        `materializeEncounterField: definition "${definition.id}" names discipline ` +
          `"${definition.disciplineId}", the collective plays "${disciplineId}"`,
      );
    }
    if (definition.opponent.origin.id.length === 0) {
      throw new TypeError(`materializeEncounterField: definition "${definition.id}" has no origin`);
    }
    if (
      !Number.isInteger(definition.opponent.level) ||
      definition.opponent.level < OPPONENT_LEVEL_MIN ||
      definition.opponent.level > OPPONENT_LEVEL_MAX
    ) {
      throw new RangeError(
        `materializeEncounterField: definition "${definition.id}" level must be ` +
          `${OPPONENT_LEVEL_MIN}-${OPPONENT_LEVEL_MAX}`,
      );
    }
  }

  const ordered = pool.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const encounterSeed = createRng(runState.seed).stream(ENCOUNTER_STREAM_NAME).seed;
  const rng = restoreRng(encounterSeed, requireRngState(runState.encounter, "runState.encounter"));
  const careerIds = new Set(runState.collective.members.map((member) => member.id));

  const members: EncounterFieldMember[] = ordered.map((definition) => {
    const namespace = encounterNamespace(season.number, definition.id);
    if (namespace === runState.collective.id) {
      throw new RangeError(
        `materializeEncounterField: opponent collective "${namespace}" collides with the career collective`,
      );
    }
    const generatedMembers: Performer[] = [];
    for (let index = 0; index < participantCount; index += 1) {
      const generated = generatePerformer(rng, {
        origin: definition.opponent.origin,
        level: definition.opponent.level,
      });
      const identity = `${namespace}-p${index}-${generated.id}`;
      if (careerIds.has(identity)) {
        throw new RangeError(
          `materializeEncounterField: generated identity "${identity}" collides with a career performer`,
        );
      }
      generatedMembers.push({ ...generated, id: identity });
    }
    return {
      definitionId: definition.id,
      disciplineId: definition.disciplineId,
      reward: definition.reward,
      // `name` is a technical id, never the content label: labels stay content-only and
      // never enter a core result or settlement branch.
      collective: { id: namespace, name: definition.id, members: generatedMembers },
    };
  });

  return {
    runState: { ...runState, encounter: rng.state() },
    season: { ...season, field: members },
  };
}

/** Everything `openEncounter` needs, beyond the run and the season. */
export interface OpenEncounterInput {
  /** Run whose `encounter` stream is drawn from. */
  readonly runState: RunState;
  /** Season the entry belongs to. */
  readonly season: Season;
  /** Marked entry being opened. */
  readonly entryId: SeasonCalendarEntryId;
}

/** What `openEncounter` returns. */
export interface OpenEncounterResult {
  /** Run, with its `encounter` continuation moved only on a fresh draw. */
  readonly runState: RunState;
  /** Season, with the new or unchanged encounter stored. */
  readonly season: Season;
  /** The encounter for this entry, freshly drawn or already stored. */
  readonly encounter: EncounterState;
}

/**
 * Opens one marked entry: draws exactly one field member on the first call, and returns the
 * stored encounter unchanged, moving no stream, on every call after that.
 */
export function openEncounter(input: OpenEncounterInput): OpenEncounterResult {
  const { runState, season, entryId } = input;
  requireSettleableEntry(season, entryId);
  const existing = findEncounter(season, entryId);
  if (existing !== undefined) {
    return { runState, season, encounter: existing };
  }
  if (season.field === null) {
    throw new Error("openEncounter: season has no materialized field");
  }
  const encounterSeed = createRng(runState.seed).stream(ENCOUNTER_STREAM_NAME).seed;
  const rng = restoreRng(encounterSeed, requireRngState(runState.encounter, "runState.encounter"));
  const index = rng.int(0, season.field.length - 1);
  const member = season.field[index];
  if (member === undefined) {
    throw new Error("openEncounter: field selection drew an out-of-range index");
  }
  const pending: PendingEncounter = { kind: "pending", entryId, definitionId: member.definitionId };
  return {
    runState: { ...runState, encounter: rng.state() },
    season: withEncounter(season, pending),
    encounter: pending,
  };
}

/** Maps a resolved Contest outcome to the season outcome, the career side always `first`. */
function toSeasonOutcome(outcome: ContestOutcome): SeasonContestOutcome {
  switch (outcome.kind) {
    case "first-win":
      return "win";
    case "second-win":
      return "loss";
    case "draw":
      return "draw";
  }
}

/** Selects the declared reward amount for one season outcome. */
function rewardFor(reward: EncounterReward, outcome: SeasonContestOutcome): number {
  switch (outcome) {
    case "win":
      return reward.win;
    case "loss":
      return reward.loss;
    case "draw":
      return reward.draw;
  }
}

/** Narrows a career Performer to the minimal shape a Contest reads. */
function toParticipantInput(performer: Performer): ContestParticipantInput {
  return {
    performerId: performer.id,
    stats: performer.stats,
    form: performer.state.form,
    energy: performer.state.energy,
  };
}

/** Everything `settleEncounter` needs, beyond the run and the season. */
export interface SettleEncounterInput {
  /** Run whose `contest` stream is drawn from and whose collective and org are updated. */
  readonly runState: RunState;
  /** Season the entry belongs to; a completed season is accepted only for an already-settled entry. */
  readonly season: Season;
  /** Marked entry being settled; it must already be opened. */
  readonly entryId: SeasonCalendarEntryId;
  /** Stable correlation identity for the resolved Contest. */
  readonly contestId: ContestId;
  /** Fully materialized discipline rules the Contest is resolved under. */
  readonly rules: ContestRules;
  /** Career collective member ids fielded for this Contest, exactly `rules.participantCount` long. */
  readonly participantIds: readonly string[];
}

/** What `settleEncounter` returns. */
export interface SettleEncounterResult {
  /** Run with its collective, org and `contest` continuation updated, or unchanged if idempotent. */
  readonly runState: RunState;
  /** Season with the settled encounter and its recorded fact. */
  readonly season: Season;
  /** The settled encounter, freshly resolved or already stored. */
  readonly encounter: SettledEncounter;
}

/**
 * Settles one already-opened marked entry: resolves its Contest, installs participant energy
 * by replacement, credits the declared reward and records the season fact, all in one atomic
 * transition. A second call returns the stored encounter unchanged and moves no stream, no
 * energy, no balance and no fact.
 */
export function settleEncounter(input: SettleEncounterInput): SettleEncounterResult {
  const { runState, season, entryId } = input;
  requireSettleableEntry(season, entryId);
  const existing = findEncounter(season, entryId);
  if (existing !== undefined && existing.kind === "settled") {
    return { runState, season, encounter: existing };
  }
  if (existing === undefined) {
    throw new Error("settleEncounter: open the encounter before settling it");
  }
  if (season.field === null) {
    throw new Error("settleEncounter: season has no materialized field");
  }
  const fieldMember = season.field.find((member) => member.definitionId === existing.definitionId);
  if (fieldMember === undefined) {
    throw new Error(`settleEncounter: field member "${existing.definitionId}" no longer exists`);
  }

  const careerParticipants = input.participantIds.map((id) => {
    const performer = runState.collective.members.find((member) => member.id === id);
    if (performer === undefined) {
      throw new Error(`settleEncounter: "${id}" is not a current collective member`);
    }
    return performer;
  });

  const contestSeed = createRng(runState.seed).stream(CONTEST_STREAM_NAME).seed;
  const contestInput: ContestInput = {
    contestId: input.contestId,
    disciplineId: fieldMember.disciplineId,
    rules: input.rules,
    first: {
      collectiveId: runState.collective.id,
      participants: careerParticipants.map(toParticipantInput),
    },
    second: {
      collectiveId: fieldMember.collective.id,
      participants: fieldMember.collective.members.map(toParticipantInput),
    },
    rng: { seed: contestSeed, state: requireRngState(runState.contest, "runState.contest") },
  };

  // No state is touched above this call: `resolveContest` validates its whole input before
  // moving any RNG, so a thrown rejection here has changed nothing yet.
  const result = resolveContest(contestInput);
  const outcome = toSeasonOutcome(result.outcome);
  const rewardAmount = rewardFor(fieldMember.reward, outcome);

  const members = runState.collective.members.map((member) => {
    const participantResult = result.participantResults.find(
      (candidate) =>
        candidate.collectiveId === runState.collective.id && candidate.performerId === member.id,
    );
    if (participantResult === undefined) return member;
    return applyStateChange(member, {
      energy: participantResult.energyAfter - member.state.energy,
    });
  });

  const nextRunState: RunState = {
    ...runState,
    collective: { ...runState.collective, members },
    org: applyOrgChange(runState.org, { money: rewardAmount }),
    contest: result.rngContinuation.state,
  };

  const settledEncounter: SettledEncounter = {
    kind: "settled",
    entryId,
    definitionId: existing.definitionId,
    outcome,
    reward: rewardAmount,
    result,
  };

  const seasonWithFact = recordSeasonContestFact(season, { entryId, outcome });
  const nextSeason = withEncounter(seasonWithFact, settledEncounter);

  return { runState: nextRunState, season: nextSeason, encounter: settledEncounter };
}
