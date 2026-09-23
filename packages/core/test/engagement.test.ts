import { describe, expect, it } from "vitest";

import type { Engagement, EngagementValidationInput } from "../src/engagement.ts";
import {
  forecastEngagements,
  quoteWeeklyRate,
  renewEngagement,
  terminateEngagement,
  validateEngagements,
} from "../src/engagement.ts";
import { statsFrom } from "../src/performer.ts";
import { createRng } from "../src/rng.ts";
import { validateWeekPlan } from "../src/week.ts";
import {
  makeActivity,
  makeCollective,
  makeEngagement as makeFixtureEngagement,
  makeOrg,
  makePerformer,
  makeState,
} from "./fixtures.ts";

const collective = makeCollective([makePerformer("a"), makePerformer("b")]);

const makeEngagement = (fields: Partial<Engagement> = {}): Engagement => ({
  id: "engagement-a",
  performerId: "a",
  collectiveId: collective.id,
  weeklyRate: 10,
  startsAtWeek: 3,
  endsBeforeWeek: 7,
  ...fields,
});

const inputAt = (
  week: number,
  engagements: readonly Engagement[] = [
    makeEngagement(),
    makeEngagement({ id: "engagement-b", performerId: "b" }),
  ],
): EngagementValidationInput => ({ collective, engagements, week });

describe("engagement invariants", () => {
  it("covers its inclusive start week", () => {
    expect(() => validateEngagements(inputAt(3))).not.toThrow();
  });

  it("does not cover its exclusive end week", () => {
    expect(() => validateEngagements(inputAt(7))).toThrow(/performer "a".*week 7/);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-finite", Number.POSITIVE_INFINITY],
    ["off-grid", 10.05],
  ])("rejects a %s weekly rate", (_label, weeklyRate) => {
    expect(() => validateEngagements(inputAt(3, [makeEngagement({ weeklyRate })]))).toThrow(
      /weekly rate/,
    );
  });

  it.each([
    ["negative start", -1, 7],
    ["fractional start", 1.5, 7],
    ["empty interval", 3, 3],
    ["reversed interval", 7, 3],
    ["fractional end", 3, 7.5],
  ])("rejects a %s", (_label, startsAtWeek, endsBeforeWeek) => {
    expect(() =>
      validateEngagements(inputAt(3, [makeEngagement({ startsAtWeek, endsBeforeWeek })])),
    ).toThrow(/week boundaries/);
  });

  it("rejects duplicate engagement ids", () => {
    expect(() =>
      validateEngagements(inputAt(3, [makeEngagement(), makeEngagement({ performerId: "b" })])),
    ).toThrow(/id "engagement-a".*more than once/);
  });

  it("rejects a second stored term for one performer", () => {
    expect(() =>
      validateEngagements(
        inputAt(3, [makeEngagement(), makeEngagement({ id: "second", startsAtWeek: 8 })]),
      ),
    ).toThrow(/performer "a".*more than one/);
  });

  it("rejects an engagement for an unknown performer", () => {
    expect(() =>
      validateEngagements(
        inputAt(3, [
          makeEngagement({ performerId: "missing" }),
          makeEngagement({ id: "b", performerId: "b" }),
        ]),
      ),
    ).toThrow(/performer "missing".*not a member/);
  });

  it("rejects an engagement for another collective", () => {
    expect(() =>
      validateEngagements(
        inputAt(3, [
          makeEngagement({ collectiveId: "other" }),
          makeEngagement({ id: "b", performerId: "b" }),
        ]),
      ),
    ).toThrow(/collective "other"/);
  });

  it("rejects a current member without coverage", () => {
    expect(() => validateEngagements(inputAt(3, [makeEngagement()]))).toThrow(
      /performer "b".*week 3/,
    );
  });

  it("leaves all input and RNG continuation unchanged on rejection", () => {
    const invalid = inputAt(7);
    const before = JSON.stringify(invalid);
    const rng = createRng(42);
    const rngBefore = rng.state();

    expect(() => validateEngagements(invalid)).toThrow(/performer "a".*week 7/);
    expect(JSON.stringify(invalid)).toBe(before);
    expect(rng.state()).toEqual(rngBefore);
  });
});

describe("weekly-rate quotation", () => {
  it("multiplies the six-stat mean by the base rate and both relative scales", () => {
    const performer = {
      ...makePerformer("quoted"),
      stats: {
        mechanical: 4,
        cognitive: 6,
        collective: 8,
        composure: 10,
        adaptability: 12,
        presence: 14,
      },
    };

    expect(
      quoteWeeklyRate({
        performer,
        baseWeeklyRate: 2,
        originRateScale: 1.5,
        disciplineRateScale: 0.5,
      }),
    ).toBe(13.5);
  });

  it("rounds the complete quote once to one tenth", () => {
    const performer = { ...makePerformer("rounded"), stats: statsFrom(() => 10.01) };

    expect(
      quoteWeeklyRate({
        performer,
        baseWeeklyRate: 1.23,
        originRateScale: 1,
        disciplineRateScale: 1,
      }),
    ).toBe(12.3);
  });

  it("ignores age, hidden fields, traits and floating state", () => {
    const performer = makePerformer("stable");
    const changed = {
      ...performer,
      age: 38,
      peakAge: 19,
      potential: 20,
      traits: ["expensive-looking"],
      state: { energy: 1, morale: 2, form: -3 },
    };
    const rateInputs = { baseWeeklyRate: 2, originRateScale: 0.7, disciplineRateScale: 1.2 };

    expect(quoteWeeklyRate({ performer, ...rateInputs })).toBe(
      quoteWeeklyRate({ performer: changed, ...rateInputs }),
    );
  });

  it("does not consume or depend on an RNG continuation", () => {
    const rng = createRng(42);
    const before = rng.state();

    quoteWeeklyRate({
      performer: makePerformer("pure"),
      baseWeeklyRate: 1,
      originRateScale: 1,
      disciplineRateScale: 1,
    });

    expect(rng.state()).toEqual(before);
  });

  it("keeps an accepted rate materialized when the performer grows", () => {
    const performer = makePerformer("growing");
    const engagement = makeEngagement({
      weeklyRate: quoteWeeklyRate({
        performer,
        baseWeeklyRate: 1,
        originRateScale: 1,
        disciplineRateScale: 1,
      }),
    });
    const grown = { ...performer, stats: statsFrom(() => 20) };

    expect(engagement.weeklyRate).toBe(10);
    expect(
      quoteWeeklyRate({
        performer: grown,
        baseWeeklyRate: 1,
        originRateScale: 1,
        disciplineRateScale: 1,
      }),
    ).toBe(20);
  });

  it("scales absolute magnitude without changing origin ratios", () => {
    const performer = makePerformer("ratios");
    const quote = (baseWeeklyRate: number, originRateScale: number): number =>
      quoteWeeklyRate({
        performer,
        baseWeeklyRate,
        originRateScale,
        disciplineRateScale: 1,
      });

    expect(quote(2, 1.35) / quote(2, 0.7)).toBeCloseTo(quote(1, 1.35) / quote(1, 0.7));
    expect(quote(2, 1)).toBe(quote(1, 1) * 2);
  });
});

describe("engagement lifecycle", () => {
  const rateInputs = { baseWeeklyRate: 1, originRateScale: 1, disciplineRateScale: 1 };

  it("renews an expired term from the current week at the current quote", () => {
    const performer = makePerformer("a");
    const state = {
      ...makeState(makeCollective([performer]), undefined, 7),
      engagements: [makeFixtureEngagement("a", "first", { weeklyRate: 2, endsBeforeWeek: 7 })],
    };

    const renewed = renewEngagement({
      state,
      engagementId: "engagement-a",
      endsBeforeWeek: 11,
      rateInputs,
    });

    expect(renewed.engagements).toEqual([
      {
        ...state.engagements[0],
        weeklyRate: 10,
        startsAtWeek: 7,
        endsBeforeWeek: 11,
      },
    ]);
  });

  it("renews a stale term from the restored current week", () => {
    const state = {
      ...makeState(makeCollective([makePerformer("a")]), undefined, 9),
      engagements: [makeFixtureEngagement("a", "first", { endsBeforeWeek: 7 })],
    };

    expect(
      renewEngagement({ state, engagementId: "engagement-a", endsBeforeWeek: 12, rateInputs })
        .engagements[0],
    ).toMatchObject({ startsAtWeek: 9, endsBeforeWeek: 12 });
  });

  it("prices growth only when the term renews", () => {
    const performer = { ...makePerformer("a"), stats: statsFrom(() => 20) };
    const state = {
      ...makeState(makeCollective([performer]), undefined, 7),
      engagements: [makeFixtureEngagement("a", "first", { weeklyRate: 10, endsBeforeWeek: 7 })],
    };

    expect(state.engagements[0]?.weeklyRate).toBe(10);
    expect(
      renewEngagement({ state, engagementId: "engagement-a", endsBeforeWeek: 11, rateInputs })
        .engagements[0]?.weeklyRate,
    ).toBe(20);
  });

  it("rejects early renewal without changing state or RNG", () => {
    const state = makeState(makeCollective([makePerformer("a")]), undefined, 7);
    const before = structuredClone(state);

    expect(() =>
      renewEngagement({ state, engagementId: "engagement-a", endsBeforeWeek: 11, rateInputs }),
    ).toThrow(/still covers week 7/);
    expect(state).toEqual(before);
  });

  it("terminates a term and its member atomically without money or RNG movement", () => {
    const state = makeState(makeCollective([makePerformer("a"), makePerformer("b")]), undefined, 7);
    const after = terminateEngagement({ state, engagementId: "engagement-b" });

    expect(after.collective.members.map((member) => member.id)).toEqual(["a"]);
    expect(after.engagements.map((engagement) => engagement.performerId)).toEqual(["a"]);
    expect(after.org).toEqual(state.org);
    expect(after.rng).toEqual(state.rng);
    expect(after.incidents.rng).toEqual(state.incidents.rng);
  });

  it("rejects termination of the final engagement without mutation", () => {
    const state = makeState(makeCollective([makePerformer("a")]));
    const before = structuredClone(state);

    expect(() => terminateEngagement({ state, engagementId: "engagement-a" })).toThrow(
      /last engagement/,
    );
    expect(state).toEqual(before);
  });

  it("makes a remaining plan that names the departed performer invalid", () => {
    const state = makeState(makeCollective([makePerformer("a"), makePerformer("b")]));
    const after = terminateEngagement({ state, engagementId: "engagement-b" });
    const activity = makeActivity({ id: "solo", target: "member" });
    const plan = {
      weeks: [[{ activity, memberId: "b" }], [], [], []],
    };

    expect(() => validateWeekPlan(plan, after.collective)).toThrow(/not in the collective/);
  });

  it("requires incident resolution before renewal or termination", () => {
    const base = {
      ...makeState(makeCollective([makePerformer("a"), makePerformer("b")]), undefined, 7),
      engagements: [
        makeFixtureEngagement("a", "first", { endsBeforeWeek: 7 }),
        makeFixtureEngagement("b"),
      ],
    };
    const state = {
      ...base,
      incidents: {
        ...base.incidents,
        pending: { incidentId: "pending", performerId: "a", week: 6 },
      },
    };
    const before = structuredClone(state);

    expect(() =>
      renewEngagement({ state, engagementId: "engagement-a", endsBeforeWeek: 11, rateInputs }),
    ).toThrow(/incident/);
    expect(() => terminateEngagement({ state, engagementId: "engagement-a" })).toThrow(/incident/);
    expect(state).toEqual(before);
  });
});

describe("engagement expense forecast", () => {
  const stateWithRates = (money: number, endsBeforeWeek = 10) => ({
    ...makeState(makeCollective([makePerformer("a"), makePerformer("b")]), makeOrg(money)),
    engagements: [
      makeFixtureEngagement("b", "first", {
        id: "z-engagement",
        weeklyRate: 20.2,
        endsBeforeWeek,
      }),
      makeFixtureEngagement("a", "first", {
        id: "a-engagement",
        weeklyRate: 10.1,
        endsBeforeWeek,
      }),
    ],
  });

  it.each([4, 6])("forecasts a %i-week covered horizon exactly", (horizon) => {
    const forecast = forecastEngagements({ state: stateWithRates(200), horizon });

    expect(forecast.weeks).toHaveLength(horizon);
    expect(forecast.weeks[0]).toEqual({
      kind: "determinate",
      week: 0,
      expense: { engagementIds: ["a-engagement", "z-engagement"], total: 30.3 },
      projectedClosingBalance: 169.7,
      expiringEngagementIds: [],
    });
  });

  it("identifies the first projected negative week under zero income", () => {
    const forecast = forecastEngagements({ state: stateWithRates(50), horizon: 4 });

    expect(forecast.firstNegativeWeek).toBe(1);
    expect(forecast.weeks.slice(0, 2)).toMatchObject([
      { projectedClosingBalance: 19.7 },
      { projectedClosingBalance: -10.6 },
    ]);
  });

  it("shows the last paid expiration and marks the later suffix unavailable", () => {
    const forecast = forecastEngagements({ state: stateWithRates(200, 2), horizon: 4 });

    expect(forecast.weeks).toEqual([
      {
        kind: "determinate",
        week: 0,
        expense: { engagementIds: ["a-engagement", "z-engagement"], total: 30.3 },
        projectedClosingBalance: 169.7,
        expiringEngagementIds: [],
      },
      {
        kind: "determinate",
        week: 1,
        expense: { engagementIds: ["a-engagement", "z-engagement"], total: 30.3 },
        projectedClosingBalance: 139.4,
        expiringEngagementIds: ["a-engagement", "z-engagement"],
      },
      { kind: "unavailable", week: 2 },
      { kind: "unavailable", week: 3 },
    ]);
  });

  it("does not mutate run state or RNG continuations", () => {
    const state = stateWithRates(200);
    const before = structuredClone(state);

    forecastEngagements({ state, horizon: 4 });

    expect(state).toEqual(before);
  });

  it.each([3, 7])("rejects a horizon of %i weeks", (horizon) => {
    expect(() => forecastEngagements({ state: stateWithRates(200), horizon })).toThrow(
      new RegExp(`four to six.*${horizon}`),
    );
  });
});
