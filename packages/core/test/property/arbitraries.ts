import fc from "fast-check";

import type { Activity, ActivityEffect } from "../../src/activity.ts";
import type { Collective } from "../../src/collective.ts";
import type { GenerateParams, OriginProfile } from "../../src/generate.ts";
import { generatePerformer } from "../../src/generate.ts";
import type { Org } from "../../src/org.ts";
import type { Performer } from "../../src/performer.ts";
import { normalizeState, STAT_KEYS } from "../../src/performer.ts";
import { createRng } from "../../src/rng.ts";
import type { PlannedActivity, RunState, WeekPlan } from "../../src/week.ts";
import { WEEK_PLAN_MAX_WEEKS, WEEK_PLAN_MIN_WEEKS } from "../../src/week.ts";

/** Seeds accepted by `createRng`: both forms must behave the same way. */
export const seedArb = fc.oneof(fc.integer({ min: 0, max: 0xffffffff }), fc.string());

export const originArb: fc.Arbitrary<OriginProfile> = fc.record({
  id: fc.stringMatching(/^[a-z]{2,8}$/),
  language: fc.stringMatching(/^[a-z]{2}$/),
  secondLanguages: fc.array(
    fc.record({
      language: fc.stringMatching(/^[a-z]{2}$/),
      chance: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    { maxLength: 3 },
  ),
  talentDensity: fc.double({ min: 0.5, max: 1.5, noNaN: true }),
  givenNames: fc.array(fc.stringMatching(/^[A-Z][a-z]{2,8}$/), { minLength: 1, maxLength: 6 }),
  handles: fc.array(fc.stringMatching(/^[a-z]{3,9}$/), { minLength: 1, maxLength: 6 }),
});

export const paramsArb: fc.Arbitrary<GenerateParams> = fc
  .tuple(
    originArb,
    fc.integer({ min: 1, max: 5 }),
    fc.integer({ min: 16, max: 24 }),
    fc.integer({ min: 0, max: 14 }),
    fc.array(
      fc.record({
        id: fc.stringMatching(/^[a-z-]{3,10}$/),
        weight: fc.double({ min: 0.1, max: 10, noNaN: true }),
      }),
      { maxLength: 5 },
    ),
  )
  .map(([origin, level, minAge, span, traitPool]) => ({
    origin,
    level,
    minAge,
    maxAge: minAge + span,
    traitPool,
  }));

/**
 * A performer as the game actually makes them. Building one field by field would let
 * fast-check invent people the generator can never produce, and the invariants under test
 * are properties of generated performers, not of arbitrary records.
 */
export const performerArb: fc.Arbitrary<Performer> = fc
  .tuple(seedArb, paramsArb)
  .map(([seed, params]) => generatePerformer(createRng(seed), params));

/**
 * A collective of generated people whose energy and morale are drawn across the whole
 * scale: the invariants under test are about the edges, and a generated person starts
 * comfortably inside them. Identifiers are rewritten because two performers drawn from the
 * same parameters may share one, and the week loop addresses members by id.
 */
export const collectiveArb: fc.Arbitrary<Collective> = fc
  .array(
    fc.tuple(
      performerArb,
      fc.double({ min: 0, max: 100, noNaN: true }),
      fc.double({ min: 0, max: 100, noNaN: true }),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((entries) => ({
    id: "first",
    name: "First",
    members: entries.map(([performer, energy, morale], index) => ({
      ...performer,
      id: `m${index}`,
      state: normalizeState({ energy, morale, form: performer.state.form }),
    })),
  }));

/** Every kind of effect, with amounts large enough to push a value past its bound. */
export const activityEffectArb: fc.Arbitrary<ActivityEffect> = fc.oneof(
  fc.record({
    kind: fc.constant("stat" as const),
    stat: fc.constantFrom(...STAT_KEYS),
    amount: fc.double({ min: -30, max: 30, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant("energy" as const),
    amount: fc.double({ min: -200, max: 200, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant("morale" as const),
    amount: fc.double({ min: -200, max: 200, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant("money" as const),
    amount: fc.double({ min: -20_000, max: 20_000, noNaN: true }),
    scale: fc.constantFrom("flat" as const, "audience" as const),
  }),
  fc.record({
    kind: fc.constant("audience" as const),
    amount: fc.double({ min: -100_000, max: 100_000, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant("reputation" as const),
    amount: fc.double({ min: -200, max: 200, noNaN: true }),
  }),
);

/** An activity that content could plausibly declare: at least one slot, at least one effect. */
export const activityArb: fc.Arbitrary<Activity> = fc.record({
  id: fc.stringMatching(/^[a-z-]{3,10}$/),
  name: fc.stringMatching(/^[A-Z][a-z]{2,10}$/),
  slots: fc.integer({ min: 1, max: 6 }),
  energy: fc.double({ min: 0, max: 100, noNaN: true }),
  target: fc.constantFrom("collective" as const, "member" as const),
  effects: fc.array(activityEffectArb, { minLength: 1, maxLength: 3 }),
});

/** The org the week spends from; the pool is drawn small enough that activities miss it. */
export const orgArb: fc.Arbitrary<Org> = fc.record({
  id: fc.constant("house"),
  name: fc.constant("House"),
  money: fc.double({ min: -10_000, max: 100_000, noNaN: true }),
  audience: fc.double({ min: 0, max: 1_000_000, noNaN: true }),
  reputation: fc.double({ min: 0, max: 100, noNaN: true }),
  slots: fc.integer({ min: 1, max: 8 }),
});

/**
 * A plan valid for the given members: a block of the accepted length whose member-targeted
 * activities name somebody who is actually in the collective.
 */
export const planArb = (memberIds: readonly string[]): fc.Arbitrary<WeekPlan> =>
  fc
    .array(
      fc.array(
        fc
          .tuple(activityArb, fc.constantFrom(...memberIds))
          .map(([activity, memberId]): PlannedActivity =>
            activity.target === "member" ? { activity, memberId } : { activity },
          ),
        { maxLength: 4 },
      ),
      { minLength: WEEK_PLAN_MIN_WEEKS, maxLength: WEEK_PLAN_MAX_WEEKS },
    )
    .map((weeks) => ({ weeks }));

/** A run parked at week zero, with a stream restored from the drawn seed. */
export const runStateArb: fc.Arbitrary<RunState> = fc
  .tuple(collectiveArb, orgArb, seedArb)
  .map(([collective, org, seed]) => ({
    org,
    collective,
    week: 0,
    seed,
    rng: createRng(seed).state(),
  }));
