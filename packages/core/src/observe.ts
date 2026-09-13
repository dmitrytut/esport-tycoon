/**
 * Туман информации (`specs/0001`, п.2 и раздел «Туман»).
 *
 * Пользователь никогда не видит точное число: только диапазон вокруг истины. Ошибка
 * выводится из собственного сида исполнителя и ключа стата, поэтому она **одна и та же**
 * при каждом взгляде — иначе разведка превращается в пересчёт до нужного ответа.
 */
import { clamp, type Performer, STAT_KEYS, STAT_MAX, STAT_MIN, type StatKey } from "./performer.ts";
import { createRng } from "./rng.ts";

export interface ObservedRange {
  readonly low: number;
  readonly high: number;
}

export type ObservedStats = Readonly<Record<StatKey, ObservedRange>>;

export interface Observation {
  readonly stats: ObservedStats;
  /** Оценка потолка: тоже диапазон, тоже с устойчивой ошибкой. */
  readonly potential: ObservedRange;
}

/**
 * `quality` 0 — «посмотрел трансляцию одним глазом», 1 — лучший скаут организации.
 * Даже при 1 остаётся ширина ±0.5: правды не даёт никто (`design/player.md`, 5.6).
 */
export function observe(performer: Performer, quality: number): Observation {
  const clarity = clamp(quality, 0, 1);
  const width = 4.5 - 4 * clarity;

  const stats = {} as Record<StatKey, ObservedRange>;
  for (const key of STAT_KEYS) {
    stats[key] = rangeFor(performer.seed, key, performer.stats[key], width, STAT_MIN, STAT_MAX);
  }

  return {
    stats,
    // Потолок виден хуже любого текущего стата: его вообще нельзя измерить, только угадать.
    potential: rangeFor(
      performer.seed,
      "potential",
      performer.potential,
      width + 2,
      STAT_MIN,
      STAT_MAX,
    ),
  };
}

function rangeFor(
  seed: number,
  key: string,
  truth: number,
  width: number,
  min: number,
  max: number,
): ObservedRange {
  // Поток от сида исполнителя и имени поля: два вызова подряд дают одно и то же,
  // а соседние статы ошибаются по-разному.
  const rng = createRng(seed).stream(`observe:${key}`);
  const half = Math.max(0.5, width / 2);
  // Истина внутри диапазона, но не в центре: центр выдавал бы точное значение.
  const offset = (rng.float() - 0.5) * width;
  const low = clamp(Math.round((truth - half + offset) * 10) / 10, min, max);
  const high = clamp(Math.round((truth + half + offset) * 10) / 10, min, max);
  return {
    low: Math.min(low, clamp(truth, min, max)),
    high: Math.max(high, clamp(truth, min, max)),
  };
}
