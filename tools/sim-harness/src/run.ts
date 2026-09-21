/**
 * The horizon walk: a run of N weeks driven by a policy instead of a user (issue #46).
 *
 * The walk advances one week at a time with `executeWeek` because a balance tool has to
 * read the run after every week, and `advance` returns the state once, after its last
 * simulated week. Nothing of the week loop is reproduced here: the only judgement the
 * harness adds is when a user would have been handed control back, and `run.test.ts` pins
 * the walk to what `advance` produces over the same plan.
 */
import {
  createIncidentState,
  createRng,
  executeWeek,
  generatePerformer,
  type PlannedActivity,
  type RunState,
  type StopReasonKind,
  validateWeekPlan,
  type WeekPlan,
  type WeekResult,
} from "@et/core";

import type { SimContent } from "./content.ts";
import { planWeek, type PolicyName } from "./policy.ts";
import type { Scenario } from "./scenario.ts";

/** One advanced week: what it produced, what it left behind, and whether it interrupted. */
export interface WalkedWeek {
  /** What the week loop reported for this week. */
  readonly result: WeekResult;
  /** The run as it stands after the week; the source of every per-week figure. */
  readonly state: RunState;
  /** Whether a user would have been handed control back at the end of this week. */
  readonly returnedControl: boolean;
  /** What the block planned for this week, kept for the weeks after a returned control. */
  readonly planned: readonly PlannedActivity[];
}

/** One policy walked over one seed to the horizon. */
export interface PolicyRun {
  /** Which policy drove it. */
  readonly policy: PolicyName;
  /** The seed the collective and the week stream came from. */
  readonly seed: number;
  /** The run before its first week, for opening-to-closing comparisons. */
  readonly opening: RunState;
  /** Every advanced week, in order. */
  readonly weeks: readonly WalkedWeek[];
  /** The run after the last advanced week. */
  readonly state: RunState;
}

/**
 * Builds the run a scenario opens with: a collective generated from the seed, and the
 * stream left exactly where generation finished, so the weeks continue it.
 */
export function openingState(scenario: Scenario, content: SimContent, seed: number): RunState {
  const origin = content.origins.get(scenario.collective.originId);
  if (origin === undefined) {
    throw new Error(`origin "${scenario.collective.originId}" is not in the loaded content`);
  }

  const rng = createRng(seed);
  const members = [];
  for (let index = 0; index < scenario.collective.size; index += 1) {
    const performer = generatePerformer(rng, {
      origin,
      level: scenario.collective.level,
      minAge: scenario.collective.minAge,
      maxAge: scenario.collective.maxAge,
    });
    // Two performers drawn from the same parameters may share an id, and the week loop
    // addresses members by id.
    members.push({ ...performer, id: `p${index}` });
  }

  return {
    org: scenario.org,
    collective: { id: "first", name: "First", members },
    week: 0,
    seed,
    rng: rng.state(),
    incidents: createIncidentState(seed),
  };
}

/** Plans a whole block from one state, which is the cadence `week-loop` accepts. */
export function planBlock(scenario: Scenario, policy: PolicyName, state: RunState): WeekPlan {
  const weeks: (readonly PlannedActivity[])[] = [];
  for (let offset = 0; offset < scenario.blockWeeks; offset += 1) {
    weeks.push(
      planWeek(policy, state.week + offset, scenario.activities, state.collective, state.org.slots),
    );
  }
  return { weeks };
}

/**
 * Advances the weeks of one block, at most `limit` of them, recording where control would
 * have returned. A returned control does not end the walk: the weeks the block already
 * planned are advanced with the activities and members they were planned with.
 */
export function walkBlock(
  state: RunState,
  plan: WeekPlan,
  masked: readonly StopReasonKind[],
  limit: number,
): readonly WalkedWeek[] {
  validateWeekPlan(plan, state.collective);

  const walked: WalkedWeek[] = [];
  let current = state;
  for (const planned of plan.weeks) {
    if (walked.length >= limit) break;
    const outcome = executeWeek(current, planned);
    current = outcome.state;
    walked.push({
      result: outcome.result,
      state: current,
      returnedControl: outcome.result.reasons.some((reason) => !masked.includes(reason.kind)),
      planned,
    });
  }
  return walked;
}

/** Walks one policy on one seed to the horizon, block by block. */
export function runPolicy(
  scenario: Scenario,
  content: SimContent,
  policy: PolicyName,
  seed: number,
  horizon: number,
): PolicyRun {
  const opening = openingState(scenario, content, seed);

  const weeks: WalkedWeek[] = [];
  let current = opening;
  while (weeks.length < horizon) {
    const block = walkBlock(
      current,
      planBlock(scenario, policy, current),
      scenario.masked,
      horizon - weeks.length,
    );
    if (block.length === 0) throw new Error("a block advanced no week, which would never end");
    weeks.push(...block);
    const last = block[block.length - 1];
    if (last !== undefined) current = last.state;
  }

  return { policy, seed, opening, weeks, state: current };
}
