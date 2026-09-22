/**
 * The incident lifecycle: authored content turned into a deterministic interruption whose
 * target, choice, consequence and cooldown are part of the run rather than a caller's
 * invention (`openspec/changes/incident-engine/design.md`).
 *
 * This module declares the closed executable contract, the serializable lifecycle state,
 * pure target eligibility, cadence-gated weighted selection and the one pure resolution
 * transition that applies a choice, installs its cooldown and clears pending.
 */

import type { Collective } from "./collective.ts";
import type { Org, OrgChange } from "./org.ts";
import { applyOrgChange } from "./org.ts";
import type { Performer, PerformerState, StatKey, Stats } from "./performer.ts";
import { applyStatChange, applyStateChange } from "./performer.ts";
import { createRng, restoreRng, type RngState } from "./rng.ts";
import type { RunState, WeekKind } from "./week.ts";

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
 * The incident's eligible targets at the current week, sorted by ascending stable id. Every
 * returned member's post-week state satisfies the conditions unless a global cooldown for
 * this incident id is still active (spec "Eligibility is evaluated for one performer after
 * the week", design "Cooldown belongs to the incident id, not the target"). Pure: consumes
 * no RNG, and neither mutates nor reorders the caller's collective.
 */
export function eligibleTargetIds(input: EligibilityInput): readonly string[] {
  const { incident, collective, baseWeekKind, currentWeek, cooldowns } = input;
  const onCooldown = cooldowns.some(
    (cooldown) => cooldown.incidentId === incident.id && currentWeek < cooldown.eligibleWeek,
  );
  if (onCooldown) return [];
  return collective.members
    .filter((performer) => meetsConditions(performer, incident.conditions, baseWeekKind))
    .map((performer) => performer.id)
    .sort(compareIds);
}

/**
 * Content-declared weight multipliers by trait id (`content/traits/*`'s
 * `eventWeightBoost`). A trait or category absent from the map contributes a multiplier of
 * one; core trusts the content validator's finite, non-negative bound (design "Cadence
 * gates occurrence; weights choose identity").
 */
export type IncidentTraitMultipliers = Readonly<Record<string, IncidentCategoryMultipliers>>;

/**
 * The week loop's explicit incident engine input (`week.ts`'s `AdvanceOptions.incidentInput`):
 * catalog, cadence and trait weighting. Its absence is what lets a caller run the week loop
 * without enabling incidents or drawing from the incident RNG stream at all.
 */
export interface IncidentInput {
  /** Every incident the caller allows this week; never mutated or reordered. */
  readonly catalog: readonly Incident[];
  /** Chance in [0, 1] that an eligible week produces one incident. */
  readonly cadence: number;
  /** Declared trait weight boosts by trait id. */
  readonly traitMultipliers: IncidentTraitMultipliers;
}

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
  /** Eligible target ids in the canonical order used for the mean and weighted draw. */
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

  const sortedTargetIds = chosen.targetIds;
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

/**
 * Input to `resolveIncident`: the whole run, the validated catalog the pending incident's id
 * must appear in, and the stable choice id the caller submitted. Resolution does not advance
 * the week.
 */
export interface ResolveIncidentInput {
  /** The run to resolve against; only its incident lifecycle, collective and org move. */
  readonly state: RunState;
  /** Every incident the caller allows; the pending incident id must be present here. */
  readonly catalog: readonly Incident[];
  /** The stable choice id submitted for the pending incident. */
  readonly choiceId: string;
}

/**
 * What resolving one choice produced: identity, outcome and the effects actually applied. A
 * record distinct from `WeekResult` (design "Occurrence and resolution remain two results");
 * resolution never rewrites a completed week to attach this.
 */
export interface IncidentResolution {
  /** Which incident was resolved. */
  readonly incidentId: string;
  /** Which performer it targeted. */
  readonly performerId: string;
  /** The absolute week the incident occurred in, not the week it resolved in. */
  readonly week: number;
  /** The submitted choice id. */
  readonly choiceId: string;
  /** A direct choice always reports `direct`; a checked choice reports its resolved branch. */
  readonly outcome: "direct" | "success" | "failure";
  /** The chosen branch's effects, in the order the content declared them. */
  readonly effects: readonly IncidentEffect[];
  /** The d20 draw; present only when the choice was a stat check. */
  readonly roll?: number;
  /** Roll plus the target's current stat; present only when the choice was a stat check. */
  readonly total?: number;
}

/** Result of `resolveIncident`: the continued run and what resolving this choice produced. */
export interface ResolveIncidentResult {
  /** The run after resolution: effects applied, cooldown installed, pending cleared. */
  readonly state: RunState;
  /** What resolving this choice produced. */
  readonly resolution: IncidentResolution;
}

/** One resolved branch's effects, summed by destination, ready for one call per helper. */
interface AggregatedEffects {
  /** Performer energy/morale/form deltas; a field left at zero moves nothing. */
  readonly state: Partial<PerformerState>;
  /** Performer stat deltas, keyed by stat; a stat absent from the branch is omitted. */
  readonly stats: Partial<Stats>;
  /** Organization money/audience/reputation deltas; a field left at zero moves nothing. */
  readonly org: OrgChange;
}

/**
 * Sums one resolved branch's effects by destination: performer energy/morale/form, each stat
 * key, and organization money/audience/reputation. Aggregating first means the existing
 * mutation helpers clamp and round each destination exactly once (spec "Effects move only
 * their declared owner").
 */
function aggregateEffects(effects: readonly IncidentEffect[]): AggregatedEffects {
  const state: { energy: number; morale: number; form: number } = {
    energy: 0,
    morale: 0,
    form: 0,
  };
  const stats: Partial<Record<StatKey, number>> = {};
  const org: { money: number; audience: number; reputation: number } = {
    money: 0,
    audience: 0,
    reputation: 0,
  };
  for (const effect of effects) {
    switch (effect.kind) {
      case "energy":
        state.energy += effect.amount;
        break;
      case "morale":
        state.morale += effect.amount;
        break;
      case "form":
        state.form += effect.amount;
        break;
      case "stat":
        stats[effect.stat] = (stats[effect.stat] ?? 0) + effect.amount;
        break;
      case "money":
        org.money += effect.amount;
        break;
      case "audience":
        org.audience += effect.amount;
        break;
      case "reputation":
        org.reputation += effect.amount;
        break;
    }
  }
  return { state, stats, org };
}

/** One transition's continued collective and organization after applying its effects. */
interface AppliedEffects {
  /** The collective with the pending target moved, or the same reference when untouched. */
  readonly collective: Collective;
  /** The organization moved once, or the same reference when untouched. */
  readonly org: Org;
}

/**
 * Applies one aggregated branch: the pending target's energy, morale, form and stats move
 * together through the existing mutation helpers, the organization moves once regardless of
 * roster size, and every other performer keeps its original reference (spec "Effects move
 * only their declared owner").
 */
function applyAggregatedEffects(
  collective: Collective,
  org: Org,
  targetId: string,
  aggregated: AggregatedEffects,
): AppliedEffects {
  const hasStateChange =
    aggregated.state.energy !== 0 || aggregated.state.morale !== 0 || aggregated.state.form !== 0;
  const hasStatsChange = Object.keys(aggregated.stats).length > 0;
  const hasOrgChange =
    aggregated.org.money !== 0 || aggregated.org.audience !== 0 || aggregated.org.reputation !== 0;

  const members =
    hasStateChange || hasStatsChange
      ? collective.members.map((performer) => {
          if (performer.id !== targetId) return performer;
          const afterState = hasStateChange
            ? applyStateChange(performer, aggregated.state)
            : performer;
          return hasStatsChange ? applyStatChange(afterState, aggregated.stats) : afterState;
        })
      : collective.members;

  return {
    collective: members === collective.members ? collective : { ...collective, members },
    org: hasOrgChange ? applyOrgChange(org, aggregated.org) : org,
  };
}

/**
 * Installs or replaces this incident id's cooldown entry, eligible again at `week + N + 1`
 * (spec "Cooldown is global per incident"), and keeps the canonical sorted order.
 */
function installCooldown(
  cooldowns: readonly IncidentCooldown[],
  incidentId: string,
  eligibleWeek: number,
): readonly IncidentCooldown[] {
  return [
    ...cooldowns.filter((cooldown) => cooldown.incidentId !== incidentId),
    { incidentId, eligibleWeek },
  ].sort((a, b) => compareIds(a.incidentId, b.incidentId));
}

/**
 * The one public pure resolution transition (design "Resolution is one pure transition
 * returning `{ state, resolution }`"). Validates, in order, that an incident is pending, that
 * it exists in the catalog, that its target still exists, and that the submitted choice
 * belongs to it — before any draw or mutation, so a rejection changes nothing. A direct
 * choice applies its effects without a draw; a checked choice draws exactly one d20 from the
 * incident stream and applies exactly one branch. Applying effects, installing the cooldown
 * and clearing pending are written as one returned state, so resolving again sees no pending
 * and cannot apply an effect twice or move the RNG.
 */
export function resolveIncident(input: ResolveIncidentInput): ResolveIncidentResult {
  const { state, catalog, choiceId } = input;
  const { pending } = state.incidents;
  if (pending === null) {
    throw new RangeError("resolveIncident: no incident is pending");
  }
  const incident = catalog.find((candidate) => candidate.id === pending.incidentId);
  if (incident === undefined) {
    throw new RangeError(
      `resolveIncident: pending incident ${pending.incidentId} is not in the catalog`,
    );
  }
  const target = state.collective.members.find((performer) => performer.id === pending.performerId);
  if (target === undefined) {
    throw new RangeError(
      `resolveIncident: pending target ${pending.performerId} is not a member of the collective`,
    );
  }
  const choice = incident.choices.find((candidate) => candidate.id === choiceId);
  if (choice === undefined) {
    throw new RangeError(
      `resolveIncident: choice ${choiceId} does not belong to incident ${incident.id}`,
    );
  }

  const incidentsSeed = createRng(state.seed).stream(INCIDENT_STREAM_NAME).seed;
  const rng = restoreRng(incidentsSeed, state.incidents.rng);

  let outcome: IncidentResolution["outcome"];
  let effects: readonly IncidentEffect[];
  let roll: number | undefined;
  let total: number | undefined;
  if (choice.outcome.kind === "direct") {
    outcome = "direct";
    effects = choice.outcome.effects;
  } else {
    const drawnRoll = rng.int(1, 20);
    const drawnTotal = drawnRoll + target.stats[choice.outcome.stat];
    const success = drawnTotal >= choice.outcome.difficulty;
    outcome = success ? "success" : "failure";
    effects = success ? choice.outcome.successEffects : choice.outcome.failureEffects;
    roll = drawnRoll;
    total = drawnTotal;
  }

  const aggregated = aggregateEffects(effects);
  const { collective, org } = applyAggregatedEffects(
    state.collective,
    state.org,
    pending.performerId,
    aggregated,
  );
  const eligibleWeek = pending.week + incident.cooldownWeeks + 1;
  const cooldowns = installCooldown(state.incidents.cooldowns, incident.id, eligibleWeek);

  const resolution: IncidentResolution = {
    incidentId: incident.id,
    performerId: pending.performerId,
    week: pending.week,
    choiceId: choice.id,
    outcome,
    effects,
    ...(roll !== undefined && total !== undefined ? { roll, total } : {}),
  };

  return {
    state: {
      ...state,
      collective,
      org,
      incidents: { rng: rng.state(), pending: null, cooldowns },
    },
    resolution,
  };
}
