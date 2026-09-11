import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng.ts";
import {
  advanceYear,
  applyStateChange,
  applyStatChange,
  deserializePerformer,
  serializePerformer,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
} from "../src/performer.ts";
import { generatePerformer, type GenerateParams, type OriginProfile } from "../src/generate.ts";

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

describe("генерация (specs/0001)", () => {
  it("один сид и одни параметры дают идентичного исполнителя", () => {
    const first = generatePerformer(createRng(42), params);
    const second = generatePerformer(createRng(42), params);
    expect(serializePerformer(first)).toEqual(serializePerformer(second));
  });

  it("разные сиды дают разных", () => {
    const first = generatePerformer(createRng(42), params);
    const second = generatePerformer(createRng(43), params);
    expect(serializePerformer(first)).not.toEqual(serializePerformer(second));
  });

  it("статы и состояние всегда в границах", () => {
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

  it("уровень поднимает средний стат", () => {
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

  it("черт от одной до трёх и без повторов", () => {
    const rng = createRng(5);
    for (let i = 0; i < 300; i++) {
      const { traits } = generatePerformer(rng, params);
      expect(traits.length).toBeGreaterThanOrEqual(1);
      expect(traits.length).toBeLessThanOrEqual(3);
      expect(new Set(traits).size).toBe(traits.length);
    }
  });

  it("потенциал не ниже текущего лучшего стата", () => {
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) {
      const performer = generatePerformer(rng, params);
      const best = Math.max(...STAT_KEYS.map((key) => performer.stats[key]));
      expect(performer.potential).toBeGreaterThanOrEqual(Math.min(best, STAT_MAX));
    }
  });

  it("язык региона есть всегда, второй выпадает примерно по шансу (specs/0006)", () => {
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

describe("возрастная кривая (specs/0001, п.1)", () => {
  it("за 10 лет механика ветерана падает, голова растёт", () => {
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

  it("до пика механика растёт", () => {
    const rng = createRng(31);
    const rookie = generatePerformer(rng, { ...params, minAge: 16, maxAge: 16, level: 2 });
    const nextYear = advanceYear(rookie);
    expect(nextYear.stats.mechanical).toBeGreaterThan(rookie.stats.mechanical);
  });

  it("годы не выводят статы за шкалу", () => {
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

  it("обучаемость не двигается сама по себе", () => {
    const performer = generatePerformer(createRng(9), params);
    expect(advanceYear(performer).stats.adaptability).toBe(performer.stats.adaptability);
  });
});

describe("состояние меняется только явно (specs/0001, п.4)", () => {
  it("applyStateChange держит границы", () => {
    const performer = generatePerformer(createRng(13), params);
    const drained = applyStateChange(performer, { energy: -500, morale: -500, form: -50 });
    expect(drained.state).toEqual({ energy: 0, morale: 0, form: -3 });

    const overfed = applyStateChange(performer, { energy: 500, morale: 500, form: 50 });
    expect(overfed.state).toEqual({ energy: 100, morale: 100, form: 3 });
  });

  it("пустое изменение не двигает состояние", () => {
    const performer = generatePerformer(createRng(17), params);
    expect(applyStateChange(performer, {}).state).toEqual(performer.state);
  });

  it("исходный исполнитель не мутируется", () => {
    const performer = generatePerformer(createRng(19), params);
    const before = serializePerformer(performer);
    applyStateChange(performer, { energy: -30 });
    applyStatChange(performer, { mechanical: 5 });
    advanceYear(performer);
    expect(serializePerformer(performer)).toEqual(before);
  });

  it("applyStatChange не выпускает статы за шкалу", () => {
    const performer = generatePerformer(createRng(23), params);
    const buffed = applyStatChange(performer, { mechanical: 99 });
    const nerfed = applyStatChange(performer, { mechanical: -99 });
    expect(buffed.stats.mechanical).toBe(STAT_MAX);
    expect(nerfed.stats.mechanical).toBe(STAT_MIN);
  });
});

describe("сериализация", () => {
  it("скрытые поля переживают круг сохранения", () => {
    const performer = generatePerformer(createRng(77), params);
    const restored = deserializePerformer(serializePerformer(performer));
    expect(restored).toEqual(performer);
    expect(restored.peakAge).toBe(performer.peakAge);
    expect(restored.potential).toBe(performer.potential);
    expect(restored.seed).toBe(performer.seed);
  });

  it("снимок переживает JSON без потери точности", () => {
    const performer = generatePerformer(createRng(79), params);
    const snapshot = serializePerformer(performer);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("восстановленный исполнитель стареет так же, как исходный", () => {
    const performer = generatePerformer(createRng(83), params);
    const restored = deserializePerformer(serializePerformer(performer));
    expect(serializePerformer(advanceYear(restored))).toEqual(
      serializePerformer(advanceYear(performer)),
    );
  });
});
