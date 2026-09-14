/**
 * A collective: the group of performers a week's activities are planned for.
 *
 * Morale is stored on people and derived here (`design.md`): one furious member has to be
 * visible in the group number without the group reading as "the unhappiest person".
 */

import type { Activity } from "./activity.ts";
import type { Performer } from "./performer.ts";
import { MORALE_MAX } from "./performer.ts";

/** A named group of performers. Membership changes between weeks, never inside one. */
export interface Collective {
  /** Stable identifier within a run. */
  readonly id: string;
  /** Name shown to the user. */
  readonly name: string;
  /** Everyone who can be sent to an activity this week. May be empty between signings. */
  readonly members: readonly Performer[];
}

/**
 * Weights of the derived morale. Balance numbers: 0.4 on the worst member moves the group
 * by roughly eight points on a hundred-point scale when one star collapses, and leaves the
 * other four mattering. The balance track owns them (`design.md`).
 */
export const MORALE_MEAN_WEIGHT = 0.6;
export const MORALE_WORST_WEIGHT = 0.4;

/**
 * Morale of the collective: the mean tempered towards the lowest member. Never stored — a
 * second copy of a value can disagree with the people it describes.
 *
 * An empty collective has no morale to average, and 0 is the only honest answer: there is
 * nobody to be happy.
 */
export function collectiveMorale(collective: Collective): number {
  const members = collective.members;
  if (members.length === 0) return 0;
  let sum = 0;
  let worst = MORALE_MAX;
  for (const member of members) {
    sum += member.state.morale;
    if (member.state.morale < worst) worst = member.state.morale;
  }
  return Math.round(MORALE_MEAN_WEIGHT * (sum / members.length) + MORALE_WORST_WEIGHT * worst);
}

/**
 * Who an activity is aimed at, before anyone is checked for energy: everyone, or the single
 * member named in the plan. A named member who has left the collective yields nobody, which
 * is why a plan is validated against the collective before a week is advanced.
 */
export function participantsOf(
  collective: Collective,
  activity: Activity,
  memberId?: string,
): readonly Performer[] {
  if (activity.target === "collective") return collective.members;
  return collective.members.filter((member) => member.id === memberId);
}
