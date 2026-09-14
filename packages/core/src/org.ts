/**
 * The org: the money, the reputation and the weekly pool of attention everything is spent
 * from. Kept apart from the collective — people and the ledger fail in different ways.
 */

import { clamp } from "./performer.ts";

/** Reputation scale, 0–100, the same shape as the performer's floating state. */
export const REPUTATION_MIN = 0;
export const REPUTATION_MAX = 100;

/** Slots a week holds in act one (`design/week.md` §6.1); later acts raise the pool. */
export const ACT_ONE_SLOTS = 5;

/** What the run owns. Money is a balance, not a resource: it is allowed to go negative. */
export interface Org {
  /** Stable identifier within a run. */
  readonly id: string;
  /** Name shown to the user. */
  readonly name: string;
  /** Balance. Negative means debt, which is a state of the run and not an error. */
  readonly money: number;
  /** Standing with the outside world, 0–100. */
  readonly reputation: number;
  /** Slots one week may spend. Shared by every department once there is more than one. */
  readonly slots: number;
}

/** A signed move of the org's values; an absent field does not move. */
export interface OrgChange {
  /** Added to the balance. Negative debits. */
  readonly money?: number;
  /** Added to reputation, which stays inside its scale. */
  readonly reputation?: number;
}

/**
 * The only way to move the org (the counterpart of `applyStateChange` for people): money
 * changes by exactly the declared amount and is never clamped, reputation stays on its
 * scale. Both are trimmed to one tenth so accumulated fractions cannot drift a snapshot.
 */
export function applyOrgChange(org: Org, delta: OrgChange): Org {
  return {
    ...org,
    money: Math.round((org.money + (delta.money ?? 0)) * 10) / 10,
    reputation:
      Math.round(
        clamp(org.reputation + (delta.reputation ?? 0), REPUTATION_MIN, REPUTATION_MAX) * 10,
      ) / 10,
  };
}
