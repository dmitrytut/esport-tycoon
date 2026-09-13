/**
 * Procedural generation of performers (`specs/0001`) plus language distribution
 * (`specs/0006`, item 1). Everything random comes from the injected RNG (`adr/0002`).
 *
 * Core does not read files: the origin profile arrives ready-made from the domain layer,
 * which knows about `content/regions/*` (`adr/0001`, `adr/0003`).
 */
import {
  normalizeStats,
  type Performer,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type Stats,
  statsFrom,
} from "./performer.ts";
import type { Rng } from "./rng.ts";

/** Second language and the chance of speaking it (`specs/0006`). */
export interface SecondLanguage {
  readonly language: string;
  readonly chance: number;
}

/** Everything core needs to know about origin. Numbers come from content. */
export interface OriginProfile {
  readonly id: string;
  readonly language: string;
  readonly secondLanguages: readonly SecondLanguage[];
  /** Above one — more talents, and stronger ones. */
  readonly talentDensity: number;
  readonly givenNames: readonly string[];
  readonly handles: readonly string[];
}

/** A trait with a weight: rare ones come up less often. Weights are set by content. */
export interface TraitOption {
  readonly id: string;
  readonly weight: number;
}

export interface GenerateParams {
  readonly origin: OriginProfile;
  /** 1 — basement amateur, 5 — world top. */
  readonly level: number;
  readonly minAge?: number;
  readonly maxAge?: number;
  readonly traitPool?: readonly TraitOption[];
}

const LEVEL_MIN = 1;
const LEVEL_MAX = 5;

/**
 * Average stat by level: 6.5 at the first, 16.5 at the fifth. The region's talent
 * density shifts the middle, but does not break the scale.
 */
function statCenter(level: number, talentDensity: number): number {
  const base = 4 + 2.5 * (level - LEVEL_MIN);
  return base + 2.5 + (talentDensity - 1) * 2;
}

export function generatePerformer(rng: Rng, params: GenerateParams): Performer {
  const level = Math.round(Math.min(Math.max(params.level, LEVEL_MIN), LEVEL_MAX));
  const { origin } = params;
  const minAge = params.minAge ?? 16;
  const maxAge = params.maxAge ?? 28;

  const seed = rng.nextUint32();
  // The performer's own stream: generating one does not depend on how much
  // randomness was spent on previous ones.
  const own = rng.stream(`performer:${seed}`);

  const center = statCenter(level, origin.talentDensity);
  // Summing three rolls gives a bell curve instead of uniform noise: mediocre values
  // are common, extremes are rare. The order of rolls is set by the field order in `statsFrom`.
  const stats: Stats = normalizeStats(
    statsFrom(() => center + (own.int(-2, 2) + own.int(-2, 2) + own.int(-1, 1)) / 1.6),
  );

  const age = own.int(minAge, maxAge);
  const peakAge = own.int(19, 24);
  // The ceiling is always above the current peak stat, otherwise a rookie would be "already ready".
  let best = STAT_MIN;
  for (const key of STAT_KEYS) if (stats[key] > best) best = stats[key];
  const potential = Math.min(STAT_MAX, Math.round((best + own.int(1, 6)) * 10) / 10);

  const languages = [origin.language];
  for (const second of origin.secondLanguages) {
    if (!languages.includes(second.language) && own.chance(second.chance)) {
      languages.push(second.language);
    }
  }

  const traits: string[] = [];
  const pool = params.traitPool ?? [];
  if (pool.length > 0) {
    const wanted = Math.min(own.int(1, 3), pool.length);
    const remaining = pool.slice();
    while (traits.length < wanted && remaining.length > 0) {
      const index = own.weightedIndex(remaining.map((option) => option.weight));
      const chosen = remaining[index];
      if (chosen) traits.push(chosen.id);
      remaining.splice(index, 1);
    }
  }

  const given = own.pick(origin.givenNames);
  const handle = own.pick(origin.handles);

  return {
    id: `${origin.id}-${seed.toString(36)}`,
    name: given,
    handle,
    originId: origin.id,
    languages,
    age,
    stats,
    state: { energy: own.int(70, 100), morale: own.int(55, 90), form: 0 },
    traits,
    peakAge,
    potential,
    seed,
  };
}
