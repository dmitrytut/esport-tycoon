import type { Activity } from "../src/activity.ts";
import type { Collective } from "../src/collective.ts";
import type { Engagement } from "../src/engagement.ts";
import type { Incident } from "../src/incident.ts";
import { createIncidentState } from "../src/incident.ts";
import type { Org } from "../src/org.ts";
import { ACT_ONE_SLOTS } from "../src/org.ts";
import type { Performer } from "../src/performer.ts";
import { statsFrom } from "../src/performer.ts";
import { createRng } from "../src/rng.ts";
import type { RunState } from "../src/week.ts";

/**
 * A performer built field by field rather than generated: the week loop is tested against
 * exact energy and morale values, and the generator cannot be asked for them.
 */
export function makePerformer(id: string, energy = 80, morale = 70): Performer {
  return {
    id,
    name: id,
    handle: id,
    originId: "nordics",
    languages: ["sv"],
    age: 20,
    stats: statsFrom(() => 10),
    state: { energy, morale, form: 0 },
    traits: [],
    peakAge: 24,
    potential: 15,
    seed: 1,
  };
}

/** Five members at the same values unless a test says otherwise. */
export function makeCollective(members: readonly Performer[]): Collective {
  return { id: "first", name: "First", members };
}

/**
 * A minimal valid incident, overridable field by field; eligibility tests only need
 * `conditions`.
 */
export function makeIncident(id: string, fields: Partial<Incident> = {}): Incident {
  return {
    id,
    category: "general",
    weight: 1,
    cooldownWeeks: 0,
    text: "{player} has a moment.",
    choices: [],
    ...fields,
  };
}

/** Current terms for one test performer, valid for every ordinary fixture week. */
export function makeEngagement(
  performerId: string,
  collectiveId = "first",
  fields: Partial<Engagement> = {},
): Engagement {
  return {
    id: `engagement-${performerId}`,
    performerId,
    collectiveId,
    weeklyRate: 1,
    startsAtWeek: 0,
    endsBeforeWeek: 1_000,
    ...fields,
  };
}

/** Valid current terms for every member of a test collective. */
export function makeEngagements(collective: Collective): readonly Engagement[] {
  return collective.members.map((member) => makeEngagement(member.id, collective.id));
}

/** An org with money to lose, no audience and the act-one slot pool. */
export function makeOrg(money = 10_000, slots: number = ACT_ONE_SLOTS, audience = 0): Org {
  return { id: "house", name: "House", money, audience, reputation: 50, slots };
}

/** A run parked at a given week, with a stream that nothing has drawn from yet. */
export function makeState(collective: Collective, org: Org = makeOrg(), week = 0): RunState {
  return {
    org,
    collective,
    engagements: makeEngagements(collective),
    week,
    consecutiveNegativeWeeks: 0,
    seed: 42,
    rng: createRng(42).state(),
    incidents: createIncidentState(42),
  };
}

/** An activity with harmless defaults; a test overrides only what it is about. */
export function makeActivity(fields: Partial<Activity> & Pick<Activity, "id">): Activity {
  return {
    name: fields.id,
    slots: 1,
    energy: 0,
    target: "collective",
    effects: [],
    ...fields,
  };
}
