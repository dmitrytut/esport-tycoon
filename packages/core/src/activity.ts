/**
 * An activity: what one slot of a week can be spent on.
 *
 * The balance of an activity lives in `content/activities/*` (`adr/0003`); this module only
 * names the shape that content is loaded into. Effects are a closed union rather than a
 * script field: what a kind means is decided here, content chooses the kind and the amount.
 */

import type { StatKey } from "./performer.ts";

/** Who an activity applies to: everyone, or the single member named when it is planned. */
export type ActivityTarget = "collective" | "member";

/** Moves one stat of every participant. The only effect that names what it moves. */
export interface StatEffect {
  /** Discriminator of the effect union. */
  readonly kind: "stat";
  /** Which of the six stats moves; a name outside them fails content validation. */
  readonly stat: StatKey;
  /** Signed change on the 1–20 stat scale. */
  readonly amount: number;
}

/** Moves the energy of every participant, on top of the activity's own energy cost. */
export interface EnergyEffect {
  /** Discriminator of the effect union. */
  readonly kind: "energy";
  /** Signed change on the 0–100 energy scale. */
  readonly amount: number;
}

/** Moves the morale of every participant. Collective morale follows, it is not stored. */
export interface MoraleEffect {
  /** Discriminator of the effect union. */
  readonly kind: "morale";
  /** Signed change on the 0–100 morale scale. */
  readonly amount: number;
}

/** Moves the org's balance once per execution, not once per participant. */
export interface MoneyEffect {
  /** Discriminator of the effect union. */
  readonly kind: "money";
  /** Signed change of the balance; negative debits it. */
  readonly amount: number;
  /** How income is resolved. Absent means the declared amount is flat. */
  readonly scale?: "flat" | "audience";
}

/** Moves the org's audience once per execution, not once per participant. */
export interface AudienceEffect {
  /** Discriminator of the effect union. */
  readonly kind: "audience";
  /** Signed change of the audience; the org clamps the result at zero. */
  readonly amount: number;
}

/** Moves the org's reputation once per execution, not once per participant. */
export interface ReputationEffect {
  /** Discriminator of the effect union. */
  readonly kind: "reputation";
  /** Signed change on the 0–100 reputation scale. */
  readonly amount: number;
}

/**
 * The closed set of effect kinds. Each kind is a change of its own (`adr/0003`): an
 * expression field would turn `content/` into code the validator cannot judge.
 */
export type ActivityEffect =
  StatEffect | EnergyEffect | MoraleEffect | MoneyEffect | AudienceEffect | ReputationEffect;

/** One activity as loaded from content. Core never reads a file: the caller hands it over. */
export interface Activity {
  /** Stable identifier, matching the content file name. */
  readonly id: string;
  /** Name shown to the user. */
  readonly name: string;
  /** Slots of the week's pool it costs. At least one: attention is never free. */
  readonly slots: number;
  /** Energy charged to each participant. A performer below it does not take part. */
  readonly energy: number;
  /** Whether the whole collective takes part or a single named member does. */
  readonly target: ActivityTarget;
  /** Applied in order once the activity is executed; never empty. */
  readonly effects: readonly ActivityEffect[];
  /** Discipline ids the activity is restricted to. Absent means it fits every one. */
  readonly disciplines?: readonly string[];
}
