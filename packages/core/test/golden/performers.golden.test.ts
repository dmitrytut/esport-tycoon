import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRng } from "../../src/rng.ts";
import { generatePerformer, type OriginProfile, type TraitOption } from "../../src/generate.ts";
import { serializePerformer, type PerformerSnapshot } from "../../src/performer.ts";

interface GoldenPerformers {
  readonly seed: number;
  readonly performers: Readonly<Record<string, readonly PerformerSnapshot[]>>;
}

const golden = JSON.parse(
  readFileSync(new URL("./performers-seed42.json", import.meta.url), "utf8"),
) as GoldenPerformers;

// Профили совпадают с content/regions/*.json на момент снятия снимка. Снимок ловит
// не только сдвиг генератора, но и молчаливое изменение этих чисел в контенте.
const ORIGINS: Record<string, OriginProfile> = {
  cis: {
    id: "cis",
    language: "ru",
    secondLanguages: [{ language: "en", chance: 0.35 }],
    talentDensity: 1.3,
    givenNames: ["Artem", "Nikita", "Egor", "Danila", "Timur"],
    handles: ["kabanchik", "nol1k", "zvuuk", "tapok", "sok0l"],
  },
  "western-europe": {
    id: "western-europe",
    language: "en",
    secondLanguages: [
      { language: "de", chance: 0.25 },
      { language: "fr", chance: 0.2 },
      { language: "sv", chance: 0.15 },
      { language: "da", chance: 0.1 },
    ],
    talentDensity: 1.0,
    givenNames: ["Oliver", "Mateo", "Lucas", "Finn", "Jonas"],
    handles: ["crumpet", "drizzle", "wiper", "plinth", "pylon"],
  },
};

const TRAIT_POOL: readonly TraitOption[] = [
  { id: "streamer", weight: 3 },
  { id: "captain", weight: 1 },
  { id: "tilter", weight: 2 },
  { id: "night-owl", weight: 2 },
];

describe("golden: сто исполнителей при сиде 42 (specs/0001)", () => {
  for (const originId of Object.keys(ORIGINS)) {
    it(`${originId}: генератор не сдвинулся`, () => {
      const origin = ORIGINS[originId];
      const expected = golden.performers[originId];
      if (!origin || !expected) throw new Error(`нет профиля или снимка для ${originId}`);

      const rng = createRng(golden.seed).stream(originId);
      const actual = expected.map((_, index) =>
        serializePerformer(
          generatePerformer(rng, { origin, level: (index % 5) + 1, traitPool: TRAIT_POOL }),
        ),
      );

      expect(actual).toEqual([...expected]);
    });
  }
});
