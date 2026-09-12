/**
 * Процедурная генерация исполнителей (`specs/0001`) плюс раздача языков
 * (`specs/0006`, п.1). Всё случайное берётся из инжектированного RNG (`adr/0002`).
 *
 * Ядро не читает файлы: профиль происхождения приходит готовым из доменного слоя,
 * который знает про `content/regions/*` (`adr/0001`, `adr/0003`).
 */
import type { Rng } from "./rng.ts";
import {
  normalizeStats,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type Performer,
  type StatKey,
  type Stats,
} from "./performer.ts";

/** Второй язык и вероятность им владеть (`specs/0006`). */
export interface SecondLanguage {
  readonly language: string;
  readonly chance: number;
}

/** Всё, что ядру нужно знать о происхождении. Числа приходят из контента. */
export interface OriginProfile {
  readonly id: string;
  readonly language: string;
  readonly secondLanguages: readonly SecondLanguage[];
  /** Больше единицы — талантов больше и они сильнее. */
  readonly talentDensity: number;
  readonly givenNames: readonly string[];
  readonly handles: readonly string[];
}

/** Черта с весом: редкие выпадают реже. Веса задаются контентом. */
export interface TraitOption {
  readonly id: string;
  readonly weight: number;
}

export interface GenerateParams {
  readonly origin: OriginProfile;
  /** 1 — подвальный любитель, 5 — мировой топ. */
  readonly level: number;
  readonly minAge?: number;
  readonly maxAge?: number;
  readonly traitPool?: readonly TraitOption[];
}

const LEVEL_MIN = 1;
const LEVEL_MAX = 5;

/**
 * Средний стат по уровню: 6.5 на первом, 16.5 на пятом. Плотность талантов региона
 * сдвигает середину, но не ломает шкалу.
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
  // Собственный поток исполнителя: генерация одного не зависит от того, сколько
  // случайности потратили на предыдущих.
  const own = rng.stream(`performer:${seed}`);

  const center = statCenter(level, origin.talentDensity);
  const draft = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    // Сумма трёх бросков даёт колокол вместо равномерного шума: середняков много,
    // крайностей мало.
    const spread = (own.int(-2, 2) + own.int(-2, 2) + own.int(-1, 1)) / 1.6;
    draft[key] = center + spread;
  }
  const stats: Stats = normalizeStats(draft);

  const age = own.int(minAge, maxAge);
  const peakAge = own.int(19, 24);
  // Потолок всегда выше текущего пика статов, иначе новичок «уже готов».
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
