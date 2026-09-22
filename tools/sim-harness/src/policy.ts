/**
 * Policies: the three stand-ins for a user this harness compares (issue #46). A policy
 * chooses what to plan, who takes part and, for a pending incident, which choice id to
 * submit. It reads nothing but the activities content declared and the state the core
 * returned. It computes no payout and applies no effect — what a week costs and pays, and
 * what an incident choice resolves to, is the core's answer.
 */
import type { Activity, Collective, IncidentChoice, PlannedActivity } from "@et/core";

/** The three policies a run may be asked for. */
export type PolicyName = "money" | "development" | "balanced";

/** Every policy, in the order a report lists them. */
export const POLICY_NAMES: readonly PolicyName[] = ["money", "development", "balanced"];

/**
 * The one neutral, total ordering every policy submits for a pending incident: the first
 * choice id in ascending code-point order. It does not inspect effects, predict a check or
 * draw RNG (design "Harness policy is neutral and total").
 */
export function chooseIncidentChoice(choices: readonly IncidentChoice[]): string {
  let chosen: string | undefined;
  for (const choice of choices) {
    if (chosen === undefined || choice.id < chosen) chosen = choice.id;
  }
  if (chosen === undefined) throw new Error("an incident with no choices cannot be resolved");
  return chosen;
}

/** Sum of what an activity's money effects declare; a base counts as declared, not as paid. */
function declaredMoney(activity: Activity): number {
  let total = 0;
  for (const effect of activity.effects) if (effect.kind === "money") total += effect.amount;
  return total;
}

/** Sum of what an activity's stat effects declare across the six stats. */
function declaredStats(activity: Activity): number {
  let total = 0;
  for (const effect of activity.effects) if (effect.kind === "stat") total += effect.amount;
  return total;
}

/**
 * Orders candidates for one key: activities that move the key first, by the amount they
 * declare, descending; then the cheaper in energy; then the activity id, which is unique
 * and stable, so no ordering can depend on the order a directory was read in.
 */
function ranked(activities: readonly Activity[], key: (activity: Activity) => number): Activity[] {
  return [...activities].sort((left, right) => {
    const leftKey = key(left);
    const rightKey = key(right);
    if (leftKey > 0 !== rightKey > 0) return leftKey > 0 ? -1 : 1;
    if (leftKey !== rightKey) return rightKey - leftKey;
    if (left.energy !== right.energy) return left.energy - right.energy;
    return left.id < right.id ? -1 : 1;
  });
}

/**
 * The order a policy prefers in a given week. The balanced policy alternates on the
 * absolute week index of the run, so changing the length of a planning block cannot change
 * what it does.
 */
function preference(policy: PolicyName, week: number): (activity: Activity) => number {
  if (policy === "money") return declaredMoney;
  if (policy === "development") return declaredStats;
  return week % 2 === 0 ? declaredStats : declaredMoney;
}

/**
 * Plans one week: takes the highest-ranked activity that still fits the remaining pool,
 * never the same activity twice, until nothing fits. Every member-aimed activity goes to
 * the highest-energy member; member id is the stable tie-breaker.
 */
export function planWeek(
  policy: PolicyName,
  week: number,
  activities: readonly Activity[],
  collective: Collective,
  slots: number,
): readonly PlannedActivity[] {
  let freshest = collective.members[0];
  for (const member of collective.members) {
    if (
      freshest === undefined ||
      member.state.energy > freshest.state.energy ||
      (member.state.energy === freshest.state.energy && member.id < freshest.id)
    ) {
      freshest = member;
    }
  }

  const planned: PlannedActivity[] = [];
  let left = slots;
  for (const activity of ranked(activities, preference(policy, week))) {
    if (activity.slots > left) continue;
    left -= activity.slots;
    if (activity.target === "member") {
      // A collective with nobody in it still produces a plan, and the plan is what fails:
      // an activity aimed at nobody is rejected by the week loop's own validation.
      planned.push(freshest === undefined ? { activity } : { activity, memberId: freshest.id });
    } else {
      planned.push({ activity });
    }
    if (left === 0) break;
  }
  return planned;
}
