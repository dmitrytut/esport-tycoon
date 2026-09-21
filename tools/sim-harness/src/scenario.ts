/**
 * A scenario: the starting conditions of a run, declared as a file rather than compiled
 * into the runner, so tuning one is a content-shaped change (issue #46). Everything a walk
 * would otherwise discover halfway through is rejected here, naming the scenario.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import type { Activity, Org, StopReasonKind } from "@et/core";
import { UNMASKABLE_REASONS, WEEK_PLAN_MAX_WEEKS, WEEK_PLAN_MIN_WEEKS } from "@et/core";

import type { SimContent } from "./content.ts";

/** How the collective of a run is generated; the origin comes from `content/regions`. */
export interface CollectiveSpec {
  /** Region id every member is generated from. */
  readonly originId: string;
  /** How many performers the run starts with. */
  readonly size: number;
  /** Generation level, 1 for a basement amateur. */
  readonly level: number;
  /** Age bounds handed to the generator. */
  readonly minAge: number;
  readonly maxAge: number;
}

/** A loaded scenario: values resolved against content, ready for a run. */
export interface Scenario {
  /** Scenario id, matching the file name; printed in the report's provenance. */
  readonly id: string;
  /** Opening values of the org, without the identity fields a run supplies. */
  readonly org: Org;
  /** What the collective is generated from. */
  readonly collective: CollectiveSpec;
  /** The activities a policy may plan, in the order the scenario declared them. */
  readonly activities: readonly Activity[];
  /** Weeks in one planning block; inside the range the week loop accepts. */
  readonly blockWeeks: number;
  /** Reasons that do not count as a return of control. */
  readonly masked: readonly StopReasonKind[];
  /** Default seed set, overridable by the command line. */
  readonly seeds: readonly number[];
  /** Default week horizon, overridable by the command line. */
  readonly horizon: number;
}

/** The scenario file as written, before its references are resolved. */
interface ScenarioFile {
  /** Scenario id; must match the file name. */
  readonly id: string;
  /** Opening money, audience, reputation and slot pool. */
  readonly org: Pick<Org, "money" | "audience" | "reputation" | "slots">;
  /** Generation parameters of the collective. */
  readonly collective: CollectiveSpec;
  /** Activity ids in play. */
  readonly activities: readonly string[];
  /** Weeks in one planning block. */
  readonly blockWeeks: number;
  /** Reason kinds the run does not count as a return of control. */
  readonly masked: readonly StopReasonKind[];
  /** Default seed set for a no-argument run. */
  readonly seeds: readonly number[];
  /** Default week horizon for a no-argument run. */
  readonly horizon: number;
}

/**
 * Reads a scenario and checks everything a run depends on: the file name, the activities,
 * the origin, the block length the week loop accepts and the reasons it allows masking.
 * A bad scenario fails here rather than as an exception from inside the walk.
 */
export function loadScenario(path: string, content: SimContent): Scenario {
  const file = JSON.parse(readFileSync(path, "utf8")) as ScenarioFile;
  const name = basename(path, ".json");
  const fail = (message: string): never => {
    throw new Error(`scenario "${name}": ${message}`);
  };

  if (file.id !== name) fail(`declares id "${file.id}", which does not match the file name`);

  if (file.blockWeeks < WEEK_PLAN_MIN_WEEKS || file.blockWeeks > WEEK_PLAN_MAX_WEEKS) {
    fail(
      `declares a block of ${file.blockWeeks} weeks; the week loop accepts ${WEEK_PLAN_MIN_WEEKS} to ${WEEK_PLAN_MAX_WEEKS}`,
    );
  }

  if (!content.origins.has(file.collective.originId)) {
    fail(`generates from origin "${file.collective.originId}", which no region defines`);
  }

  const activities: Activity[] = [];
  const activityIds = new Set<string>();
  for (const id of file.activities) {
    if (activityIds.has(id)) fail(`names activity "${id}" more than once`);
    activityIds.add(id);
    const activity = content.activities.get(id);
    if (activity === undefined) fail(`names activity "${id}", which content does not define`);
    else activities.push(activity);
  }
  if (activities.length === 0) fail("names no activity, so a policy would have nothing to plan");

  for (const kind of file.masked) {
    if (UNMASKABLE_REASONS.includes(kind)) fail(`masks "${kind}", which may never be masked`);
  }

  if (!Number.isSafeInteger(file.horizon) || file.horizon <= 0) {
    fail(`declares horizon "${String(file.horizon)}"; expected a positive integer`);
  }
  if (
    file.seeds.length === 0 ||
    file.seeds.some((seed) => !Number.isSafeInteger(seed)) ||
    new Set(file.seeds).size !== file.seeds.length
  ) {
    fail(`declares seeds "${file.seeds.join(",")}"; expected distinct integers`);
  }

  return {
    id: file.id,
    org: { id: "house", name: "House", ...file.org },
    collective: file.collective,
    activities,
    blockWeeks: file.blockWeeks,
    masked: file.masked,
    seeds: file.seeds,
    horizon: file.horizon,
  };
}
