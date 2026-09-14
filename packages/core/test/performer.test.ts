import { describe, expect, it } from "vitest";

import { type GenerateParams, generatePerformer, type OriginProfile } from "../src/generate.ts";
import {
  advanceYear,
  applyStatChange,
  applyStateChange,
  deserializePerformer,
  serializePerformer,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type StatKey,
  statsFrom,
} from "../src/performer.ts";
import { createRng } from "../src/rng.ts";

const origin: OriginProfile = {
  id: "cis",
  language: "ru",
  secondLanguages: [{ language: "en", chance: 0.35 }],
  talentDensity: 1.3,
  givenNames: ["Artem", "Nikita", "Egor", "Timur"],
  handles: ["kabanchik", "nol1k", "zvuuk", "tapok"],
};

const params: GenerateParams = {
  origin,
  level: 3,
  traitPool: [
    { id: "streamer", weight: 3 },
    { id: "captain", weight: 1 },
    { id: "tilter", weight: 2 },
  ],
};

describe("statsFrom (ADR 0010)", () => {
  // The ban on type assertions replaced a `for (const key of STAT_KEYS)` loop with an
  // explicit object literal. Field order in that literal is now load-bearing:
  // generatePerformer draws RNG inside `make`, so a reordering silently shuffles which
  // roll lands on which stat. `Record<StatKey, T>` checks the *set* of keys, never the
  // order, so nothing else in the type system pins this down.
  it("evaluates fields in STAT_KEYS order", () => {
    const seen: StatKey[] = [];
    const built = statsFrom((key) => {
      seen.push(key);
      return key;
    });

    expect(seen).toEqual([...STAT_KEYS]);
    expect(Object.keys(built)).toEqual([...STAT_KEYS]);
  });
});

describe("generation (specs/0001)", () => {
  it("one seed and the same params give an identical performer", () => {
    const first = generatePerformer(createRng(42), params);
    const second = generatePerformer(createRng(42), params);
    expect(serializePerformer(first)).toEqual(serializePerformer(second));
  });

  it("different seeds give different performers", () => {
    const first = generatePerformer(createRng(42), params);
    const second = generatePerformer(createRng(43), params);
    expect(serializePerformer(first)).not.toEqual(serializePerformer(second));
  });

  it("stats and state are always within bounds", () => {
    const rng = createRng(7);
    for (let level = 1; level <= 5; level++) {
      for (let i = 0; i < 200; i++) {
        const performer = generatePerformer(rng, { ...params, level });
        for (const key of STAT_KEYS) {
          expect(performer.stats[key]).toBeGreaterThanOrEqual(STAT_MIN);
          expect(performer.stats[key]).toBeLessThanOrEqual(STAT_MAX);
        }
        expect(performer.state.energy).toBeGreaterThanOrEqual(0);
        expect(performer.state.energy).toBeLessThanOrEqual(100);
        expect(performer.state.morale).toBeLessThanOrEqual(100);
        expect(performer.potential).toBeLessThanOrEqual(STAT_MAX);
      }
    }
  });

  it("level raises the average stat", () => {
    const meanFor = (level: number): number => {
      const rng = createRng(11);
      let total = 0;
      const count = 300;
      for (let i = 0; i < count; i++) {
        const performer = generatePerformer(rng, { ...params, level });
        for (const key of STAT_KEYS) total += performer.stats[key];
      }
      return total / (count * STAT_KEYS.length);
    };
    expect(meanFor(5)).toBeGreaterThan(meanFor(3));
    expect(meanFor(3)).toBeGreaterThan(meanFor(1));
  });

  it("one to three traits, no duplicates", () => {
    const rng = createRng(5);
    for (let i = 0; i < 300; i++) {
      const { traits } = generatePerformer(rng, params);
      expect(traits.length).toBeGreaterThanOrEqual(1);
      expect(traits.length).toBeLessThanOrEqual(3);
      expect(new Set(traits).size).toBe(traits.length);
    }
  });

  it("potential is never below the current best stat", () => {
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) {
      const performer = generatePerformer(rng, params);
      const best = Math.max(...STAT_KEYS.map((key) => performer.stats[key]));
      expect(performer.potential).toBeGreaterThanOrEqual(Math.min(best, STAT_MAX));
    }
  });

  it("the region's language is always present, the second one comes up roughly at its chance (specs/0006)", () => {
    const rng = createRng(42);
    let withEnglish = 0;
    const count = 1000;
    for (let i = 0; i < count; i++) {
      const { languages } = generatePerformer(rng, params);
      expect(languages).toContain("ru");
      if (languages.includes("en")) withEnglish++;
    }
    expect(Math.abs(withEnglish / count - 0.35)).toBeLessThan(0.05);
  });
});

describe("age curve (specs/0001, item 1)", () => {
  it("over 10 years a veteran's mechanical skill falls, cognitive skill grows", () => {
    const rng = createRng(21);
    let checked = 0;
    for (let i = 0; i < 50; i++) {
      const young = generatePerformer(rng, { ...params, minAge: 18, maxAge: 20 });
      let aged = young;
      for (let year = 0; year < 10; year++) aged = advanceYear(aged);

      expect(aged.age).toBe(young.age + 10);
      expect(aged.stats.mechanical).toBeLessThan(young.stats.mechanical);
      expect(aged.stats.cognitive).toBeGreaterThan(young.stats.cognitive);
      checked++;
    }
    expect(checked).toBe(50);
  });

  it("mechanical skill grows before the peak", () => {
    const rng = createRng(31);
    const rookie = generatePerformer(rng, { ...params, minAge: 16, maxAge: 16, level: 2 });
    const nextYear = advanceYear(rookie);
    expect(nextYear.stats.mechanical).toBeGreaterThan(rookie.stats.mechanical);
  });

  it("years never push stats off the scale", () => {
    const rng = createRng(41);
    let performer = generatePerformer(rng, { ...params, level: 5 });
    for (let year = 0; year < 30; year++) {
      performer = advanceYear(performer);
      for (const key of STAT_KEYS) {
        expect(performer.stats[key]).toBeGreaterThanOrEqual(STAT_MIN);
        expect(performer.stats[key]).toBeLessThanOrEqual(STAT_MAX);
      }
    }
  });

  it("adaptability does not move on its own", () => {
    const performer = generatePerformer(createRng(9), params);
    expect(advanceYear(performer).stats.adaptability).toBe(performer.stats.adaptability);
  });
});

describe("state changes only explicitly (specs/0001, item 4)", () => {
  it("applyStateChange keeps within bounds", () => {
    const performer = generatePerformer(createRng(13), params);
    const drained = applyStateChange(performer, { energy: -500, morale: -500, form: -50 });
    expect(drained.state).toEqual({ energy: 0, morale: 0, form: -3 });

    const overfed = applyStateChange(performer, { energy: 500, morale: 500, form: 50 });
    expect(overfed.state).toEqual({ energy: 100, morale: 100, form: 3 });
  });

  it("an empty change does not move the state", () => {
    const performer = generatePerformer(createRng(17), params);
    expect(applyStateChange(performer, {}).state).toEqual(performer.state);
  });

  it("the original performer is not mutated", () => {
    const performer = generatePerformer(createRng(19), params);
    const before = serializePerformer(performer);
    applyStateChange(performer, { energy: -30 });
    applyStatChange(performer, { mechanical: 5 });
    advanceYear(performer);
    expect(serializePerformer(performer)).toEqual(before);
  });

  it("applyStatChange does not let stats off the scale", () => {
    const performer = generatePerformer(createRng(23), params);
    const buffed = applyStatChange(performer, { mechanical: 99 });
    const nerfed = applyStatChange(performer, { mechanical: -99 });
    expect(buffed.stats.mechanical).toBe(STAT_MAX);
    expect(nerfed.stats.mechanical).toBe(STAT_MIN);
  });
});

describe("serialization", () => {
  it("hidden fields survive a save round trip", () => {
    const performer = generatePerformer(createRng(77), params);
    const restored = deserializePerformer(serializePerformer(performer));
    expect(restored).toEqual(performer);
    expect(restored.peakAge).toBe(performer.peakAge);
    expect(restored.potential).toBe(performer.potential);
    expect(restored.seed).toBe(performer.seed);
  });

  it("a snapshot survives JSON without loss of precision", () => {
    const performer = generatePerformer(createRng(79), params);
    const snapshot = serializePerformer(performer);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("a restored performer ages the same way as the original", () => {
    const performer = generatePerformer(createRng(83), params);
    const restored = deserializePerformer(serializePerformer(performer));
    expect(serializePerformer(advanceYear(restored))).toEqual(
      serializePerformer(advanceYear(performer)),
    );
  });
});
