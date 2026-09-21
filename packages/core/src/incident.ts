/**
 * The incident lifecycle: authored content turned into a deterministic interruption whose
 * target, choice, consequence and cooldown are part of the run rather than a caller's
 * invention (`openspec/changes/incident-engine/design.md`).
 *
 * This module only declares the closed executable contract and the serializable lifecycle
 * state; eligibility, selection and resolution are separate cutovers (tasks 2.2–2.5+).
 */

import type { StatKey } from "./performer.ts";
import { createRng, type RngState } from "./rng.ts";
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

/** Moves the organization's balance once, independent of roster size. Unclamped. */
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
 * organization kinds land once regardless of roster size (spec "Effects move only their
 * declared owner").
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
