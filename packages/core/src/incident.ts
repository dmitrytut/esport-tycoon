/**
 * The incident lifecycle: authored content turned into a deterministic interruption whose
 * target, choice, consequence and cooldown are part of the run rather than a caller's
 * invention (`openspec/changes/incident-engine/design.md`).
 *
 * This module declares the closed executable contract, the serializable lifecycle state,
 * pure target eligibility and cadence-gated weighted selection; resolution is a separate
 * cutover (tasks 2.5+).
 */

import type { Collective } from "./collective.ts";
import type { Performer, StatKey } from "./performer.ts";
import { createRng, restoreRng, type RngState } from "./rng.ts";
import type { WeekKind } from "./week.ts";

/**
 * Opaque incident category id, validated against `content/schema/event.schema.json`'s enum
 * by the content validator. Core stays domain-neutral (`adr/0001`) and treats a category as
 * an opaque key shared between an incident and a trait's `eventWeightBoost`, the same way
 * `Activity.disciplines` treats discipline ids.
 */
export type IncidentCategory = string;

/**
 * Closed AND object narrowing which performer an incident may target. Every present field
 * combines with the others; an absent field or an omitted/empty object imposes no
 * restriction.
 */
export interface IncidentConditions {
  /** Strict threshold: eligible only below this energy value. */
  readonly energyBelow?: number;
  /** Strict threshold: eligible only below this morale value. */
  readonly moraleBelow?: number;
  /** Non-empty allow-list: the target must possess every listed trait id. */
  readonly requiresTrait?: readonly string[];
  /** Non-empty allow-list of region ids the target's origin must belong to. */
  readonly region?: readonly string[];
  /** Non-empty allow-list of the week's base kind, evaluated before incident selection. */
  readonly baseWeekKind?: readonly WeekKind[];
}

/** Moves one named stat of the target on the 1–20 scale. */
export interface IncidentStatEffect {
  /** Discriminator of the effect union. */
  readonly kind: "stat";
  /** Which of the six stats moves; a name outside them fails content validation. */
  readonly stat: StatKey;
  /** Signed change on the stat scale. */
  readonly amount: number;
}

/** Moves the target's energy on the 0–100 scale. */
export interface IncidentEnergyEffect {
  /** Discriminator of the effect union. */
  readonly kind: "energy";
  /** Signed change on the energy scale. */
  readonly amount: number;
}

/** Moves the target's morale on the 0–100 scale. */
export interface IncidentMoraleEffect {
  /** Discriminator of the effect union. */
  readonly kind: "morale";
  /** Signed change on the morale scale. */
  readonly amount: number;
}

/** Moves the target's form. */
export interface IncidentFormEffect {
  /** Discriminator of the effect union. */
  readonly kind: "form";
  /** Signed change of form. */
  readonly amount: number;
}

/** Moves the organization's balance once per execution, not once per participant. Unclamped. */
export interface IncidentMoneyEffect {
  /** Discriminator of the effect union. */
  readonly kind: "money";
  /** Signed, flat change of the balance; negative debits. Incident money never scales. */
  readonly amount: number;
}

/** Moves the organization's audience once; the org clamps the result at zero. */
export interface IncidentAudienceEffect {
  /** Discriminator of the effect union. */
  readonly kind: "audience";
  /** Signed change of the audience. */
  readonly amount: number;
}

/** Moves the organization's reputation once, on the 0–100 scale. */
export interface IncidentReputationEffect {
  /** Discriminator of the effect union. */
  readonly kind: "reputation";
  /** Signed change of reputation. */
  readonly amount: number;
}

/**
 * The closed set of incident effect kinds: performer kinds land on the pending target only,
 * organization kinds land once per execution, not once per participant (spec "Effects move
 * only their declared owner").
 */
export type IncidentEffect =
  | IncidentStatEffect
  | IncidentEnergyEffect
  | IncidentMoraleEffect
  | IncidentFormEffect
  | IncidentMoneyEffect
  | IncidentAudienceEffect
  | IncidentReputationEffect;

/** A choice whose outcome applies immediately, with no random draw. */
export interface IncidentDirectOutcome {
  /** Discriminator of the outcome union. */
  readonly kind: "direct";
  /** Applied once, summed by destination before mutation. */
  readonly effects: readonly IncidentEffect[];
}

/** A choice resolved by one d20 stat check against a declared difficulty. */
export interface IncidentCheckOutcome {
  /** Discriminator of the outcome union. */
  readonly kind: "check";
  /** Which of the target's stats is added to the roll. */
  readonly stat: StatKey;
  /** Total the roll plus stat must reach or exceed; equality succeeds. */
  readonly difficulty: number;
  /** Applied when the total meets or exceeds the difficulty. */
  readonly successEffects: readonly IncidentEffect[];
  /** Applied when the total falls short of the difficulty. */
  readonly failureEffects: readonly IncidentEffect[];
}

/**
 * A choice's outcome: either it applies directly, or it is gated by one stat check. This is
 * intentionally the only check form (design "Choices are direct outcomes or one d20 stat
 * check").
 */
export type IncidentOutcome = IncidentDirectOutcome | IncidentCheckOutcome;

/**
 * One option offered to the player when an incident occurs. Stable ids, not array position
 * or label text, cross the core boundary.
 */
export interface IncidentChoice {
  /** Stable within its incident; unique choice ids are checked by content validation. */
  readonly id: string;
  /** Player-facing button text. */
  readonly label: string;
  /** Player-facing description of the consequence. */
  readonly detail: string;
  /** What resolving this choice does. */
  readonly outcome: IncidentOutcome;
}

/**
 * One incident as loaded from content. Core never reads a file: the caller hands the
 * catalog over.
 */
export interface Incident {
  /** Stable identifier, matching the content file name. */
  readonly id: string;
  /** Which category this incident belongs to for trait weighting. */
  readonly category: IncidentCategory;
  /** Relative base weight among eligible incidents; frequency is the caller's cadence. */
  readonly weight: number;
  /** Weeks every target stays ineligible for this incident id after it resolves. */
  readonly cooldownWeeks: number;
  /** Closed eligibility conditions; omitted means every performer is eligible. */
  readonly conditions?: IncidentConditions;
  /** English text shown to the player; must contain the `{player}` token. */
  readonly text: string;
  /** Two or three choices offered when this incident occurs. */
  readonly choices: readonly IncidentChoice[];
}

/**
 * One trait's declared weight boost per incident category (`content/traits/*`'s
 * `eventWeightBoost`). A category absent from the record contributes a multiplier of one.
 */
export type IncidentCategoryMultipliers = Readonly<Partial<Record<IncidentCategory, number>>>;

/**
 * Identity of the run's single pending incident: what is waiting, for whom, and at which
 * absolute week it occurred. Resolution re-reads the catalog by this identity rather than
 * carrying a copy of its content.
 */
export interface PendingIncident {
  /** Which incident is waiting. */
  readonly incidentId: string;
  /** Which performer it targets. */
  readonly performerId: string;
  /** Absolute week index it occurred in. */
  readonly week: number;
}

/**
 * One entry of the global cooldown ledger: this incident id is ineligible for every target
 * until the recorded week. Stored as a sorted array, not a map, so serialization has a
 * canonical order.
 */
export interface IncidentCooldown {
  /** Which incident this cooldown restricts. */
  readonly incidentId: string;
  /** First absolute week the incident becomes eligible again. */
  readonly eligibleWeek: number;
}

/**
 * The run's serializable incident lifecycle: occurrence, pending choice, resolution and
 * cooldown are one saveable state, mandatory on every `RunState` (design "Incident lifecycle
 * is mandatory run state").
 */
export interface IncidentState {
  /** Continuation of the incident engine's own independent RNG stream. */
  readonly rng: RngState;
  /** The single incident awaiting a choice, or null when none is pending. */
  readonly pending: PendingIncident | null;
  /** Global per-incident cooldowns still in effect, in canonical order. */
  readonly cooldowns: readonly IncidentCooldown[];
}

/**
 * Name of the incident engine's independent RNG stream, derived from the root seed. A named
 * stream keeps an incident draw from shifting generation or a later contest stream
 * (`adr/0002`).
 */
const INCIDENT_STREAM_NAME = "incidents";

/**
 * The one way to build an `IncidentState`: derives the named `incidents` stream from the
 * root seed and starts with no pending incident and no cooldowns. Every `RunState`
 * constructor calls this rather than hand-building the RNG tuple.
 */
export function createIncidentState(seed: number | string): IncidentState {
  return {
    rng: createRng(seed).stream(INCIDENT_STREAM_NAME).state(),
    pending: null,
    cooldowns: [],
  };
}

/**
 * Input to `eligibleTargetIds`: one incident's conditions and cooldown evaluated against a
 * collective already carrying the completed week's activity and recovery effects.
 */
export interface EligibilityInput {
  /** The incident whose conditions and global cooldown are being evaluated. */
  readonly incident: Incident;
  /** The collective in its post-week state; never mutated or reordered by this function. */
  readonly collective: Collective;
  /**
   * The week's preliminary classification, computed before incident selection adds its own
   * reason.
   */
  readonly baseWeekKind: WeekKind;
  /** Absolute week index eligibility is evaluated for. */
  readonly currentWeek: number;
  /**
   * The run's global per-incident cooldown ledger; only entries matching this incident's id
   * apply.
   */
  readonly cooldowns: readonly IncidentCooldown[];
}

/**
 * A performer meets one incident's conditions: every present field of a closed AND object.
 * An omitted `conditions` object or `undefined` imposes no restriction.
 */
function meetsConditions(
  performer: Performer,
  conditions: IncidentConditions | undefined,
  baseWeekKind: WeekKind,
): boolean {
  if (conditions === undefined) return true;
  if (conditions.energyBelow !== undefined && !(performer.state.energy < conditions.energyBelow)) {
    return false;
  }
  if (conditions.moraleBelow !== undefined && !(performer.state.morale < conditions.moraleBelow)) {
    return false;
  }
  if (
    conditions.requiresTrait !== undefined &&
    !conditions.requiresTrait.every((trait) => performer.traits.includes(trait))
  ) {
    return false;
  }
  if (conditions.region !== undefined && !conditions.region.includes(performer.originId)) {
    return false;
  }
  if (conditions.baseWeekKind !== undefined && !conditions.baseWeekKind.includes(baseWeekKind)) {
    return false;
  }
  return true;
}

/**
 * The incident's eligible targets in the collective at the current week: every member whose
 * post-week state satisfies its conditions, unless a global cooldown for this incident id is
 * still active (spec "Eligibility is evaluated for one performer after the week", design
 * "Cooldown belongs to the incident id, not the target"). Pure: consumes no RNG, and neither
 * mutates nor reorders the caller's collective. Weighting and selection are separate cutovers.
 */
export function eligibleTargetIds(input: EligibilityInput): readonly string[] {
  const { incident, collective, baseWeekKind, currentWeek, cooldowns } = input;
  const onCooldown = cooldowns.some(
    (cooldown) => cooldown.incidentId === incident.id && currentWeek < cooldown.eligibleWeek,
  );
  if (onCooldown) return [];
  return collective.members
    .filter((performer) => meetsConditions(performer, incident.conditions, baseWeekKind))
    .map((performer) => performer.id);
}

/**
 * Content-declared weight multipliers by trait id (`content/traits/*`'s
 * `eventWeightBoost`). A trait or category absent from the map contributes a multiplier of
 * one; core trusts the content validator's finite, non-negative bound (design "Cadence
 * gates occurrence; weights choose identity").
 */
export type IncidentTraitMultipliers = Readonly<Record<string, IncidentCategoryMultipliers>>;

/**
 * Input to `selectIncident`: everything needed to gate occurrence and, on success, choose
 * one incident and one of its eligible performers on the incident engine's own RNG stream.
 */
export interface SelectIncidentInput {
  /** The run's root seed; the named `incidents` stream is re-derived from it every call. */
  readonly seed: number | string;
  /** The incident lifecycle to continue from; an existing pending rejects inertly. */
  readonly state: IncidentState;
  /** Absolute week index this selection runs for; stored on a new pending incident. */
  readonly currentWeek: number;
  /** The week's preliminary classification, evaluated before incident selection. */
  readonly baseWeekKind: WeekKind;
  /** The collective in its post-week state; never mutated or reordered by this function. */
  readonly collective: Collective;
  /** Every incident the caller allows this week; never mutated or reordered. */
  readonly catalog: readonly Incident[];
  /** Chance in [0, 1] that an eligible week produces one incident. */
  readonly cadence: number;
  /** Declared trait weight boosts by trait id. */
  readonly traitMultipliers: IncidentTraitMultipliers;
}

/**
 * Result of `selectIncident`: the continued incident state, and, only on success, the
 * identity that was also written into that state's `pending`.
 */
export interface SelectIncidentResult {
  /** Continuation of the incident lifecycle; the same reference as the input when nothing moved. */
  readonly state: IncidentState;
  /** The incident and target chosen this call, or null when none was selected. */
  readonly selected: PendingIncident | null;
}

/** One incident that survived eligibility and effective-weight filtering, before sorting. */
interface IncidentCandidate {
  /** The candidate incident itself. */
  readonly incident: Incident;
  /** Its eligible target ids, in collective order; sorted only right before a draw. */
  readonly targetIds: readonly string[];
  /** Each eligible target's category multiplier, keyed by performer id. */
  readonly multipliers: Readonly<Record<string, number>>;
  /** Base weight times the arithmetic mean of `multipliers`; always positive. */
  readonly effectiveWeight: number;
}

/** Ascending code-point order of stable ids: the one order every weighted draw sorts by. */
function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** A performer's category multiplier: the product of its trait multipliers, one when absent. */
function categoryMultiplier(
  performer: Performer,
  category: IncidentCategory,
  traitMultipliers: IncidentTraitMultipliers,
): number {
  return performer.traits.reduce(
    (product, traitId) => product * (traitMultipliers[traitId]?.[category] ?? 1),
    1,
  );
}

/**
 * Every incident with at least one eligible target and a positive effective weight: base
 * weight times the arithmetic mean of eligible-performer multipliers (spec "Cadence and
 * weighted selection are separate inputs"). Eligible-performer count alone never changes
 * the result. Order follows the catalog; callers sort before drawing.
 */
function positiveCandidates(
  catalog: readonly Incident[],
  collective: Collective,
  baseWeekKind: WeekKind,
  currentWeek: number,
  cooldowns: readonly IncidentCooldown[],
  traitMultipliers: IncidentTraitMultipliers,
): readonly IncidentCandidate[] {
  const performerById: Record<string, Performer> = {};
  for (const performer of collective.members) performerById[performer.id] = performer;
  const candidates: IncidentCandidate[] = [];
  for (const incident of catalog) {
    const targetIds = eligibleTargetIds({
      incident,
      collective,
      baseWeekKind,
      currentWeek,
      cooldowns,
    });
    if (targetIds.length === 0) continue;
    const multipliers: Record<string, number> = {};
    for (const id of targetIds) {
      const performer = performerById[id];
      if (performer === undefined) {
        throw new RangeError(`eligible target ${id} is not a member of the collective`);
      }
      multipliers[id] = categoryMultiplier(performer, incident.category, traitMultipliers);
    }
    const mean = targetIds.reduce((sum, id) => sum + (multipliers[id] ?? 0), 0) / targetIds.length;
    const effectiveWeight = incident.weight * mean;
    if (effectiveWeight <= 0) continue;
    candidates.push({ incident, targetIds, multipliers, effectiveWeight });
  }
  return candidates;
}

/**
 * The engine's cadence gate and weighted selection (design "Cadence gates occurrence;
 * weights choose identity"). Pure aside from the returned RNG continuation: never mutates
 * the caller's collective, catalog or cooldowns. An existing pending incident rejects
 * inertly, before any RNG movement. A catalog with no positive candidate consumes no RNG
 * either; only an actual cadence draw or a successful selection advances the stream.
 */
export function selectIncident(input: SelectIncidentInput): SelectIncidentResult {
  const { seed, state, currentWeek, baseWeekKind, collective, catalog, cadence, traitMultipliers } =
    input;
  if (state.pending !== null) return { state, selected: null };

  const candidates = positiveCandidates(
    catalog,
    collective,
    baseWeekKind,
    currentWeek,
    state.cooldowns,
    traitMultipliers,
  );
  if (candidates.length === 0) return { state, selected: null };

  const incidentsSeed = createRng(seed).stream(INCIDENT_STREAM_NAME).seed;
  const rng = restoreRng(incidentsSeed, state.rng);

  if (!rng.chance(cadence)) {
    return {
      state: { rng: rng.state(), pending: null, cooldowns: state.cooldowns },
      selected: null,
    };
  }

  const sortedIncidents = candidates
    .slice()
    .sort((a, b) => compareIds(a.incident.id, b.incident.id));
  const incidentIndex = rng.weightedIndex(
    sortedIncidents.map((candidate) => candidate.effectiveWeight),
  );
  const chosen = sortedIncidents[incidentIndex];
  if (chosen === undefined) {
    throw new RangeError("weightedIndex returned an out-of-range incident index");
  }

  const sortedTargetIds = chosen.targetIds.slice().sort(compareIds);
  const targetIndex = rng.weightedIndex(sortedTargetIds.map((id) => chosen.multipliers[id] ?? 0));
  const performerId = sortedTargetIds[targetIndex];
  if (performerId === undefined) {
    throw new RangeError("weightedIndex returned an out-of-range target index");
  }

  const selected: PendingIncident = {
    incidentId: chosen.incident.id,
    performerId,
    week: currentWeek,
  };
  return {
    state: { rng: rng.state(), pending: selected, cooldowns: state.cooldowns },
    selected,
  };
}
