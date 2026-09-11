/**
 * Единственный источник случайности во всём проекте (ADR 0002).
 *
 * Свойства, на которые опирается остальной код:
 * 1. Один сид — одна последовательность, бит-в-бит, на любой платформе.
 *    Используются только целочисленные операции над uint32, без плавающей точки
 *    внутри генератора и без платформо-зависимых функций.
 * 2. Потоки независимы: поток выводится из корневого сида и имени, а не из текущего
 *    состояния. Поэтому лишний вызов в одной подсистеме не сдвигает другую.
 * 3. Состояние сериализуемо: сохранение игры воспроизводит продолжение.
 *
 * Алгоритм: sfc32 (счётчик + три слова состояния), инициализация splitmix32.
 */

const UINT32 = 0x100000000;

/** Сериализуемое состояние потока: [a, b, c, counter]. */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Следующее целое в [0, 2^32). */
  nextUint32(): number;
  /** Следующее дробное в [0, 1). */
  float(): number;
  /** Целое в [min, max] включительно, равномерно (без смещения от остатка). */
  int(min: number, max: number): number;
  /** Истина с вероятностью p (0 — никогда, 1 — всегда). */
  chance(p: number): boolean;
  /** Равновероятный элемент непустого списка. */
  pick<T>(items: readonly T[]): T;
  /** Новый перемешанный массив; исходный не меняется. */
  shuffle<T>(items: readonly T[]): T[];
  /** Индекс, выбранный пропорционально весам. Нулевые веса недостижимы. */
  weightedIndex(weights: readonly number[]): number;
  /** Независимый поток: один и тот же для одного корневого сида и имени. */
  stream(name: string): Rng;
  /** Снимок состояния для сохранения игры. */
  state(): RngState;
  /** Корневой сид этого потока — из него выводятся дочерние потоки. */
  readonly seed: number;
}

/** FNV-1a: строковый сид и имя потока превращаются в uint32. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

function makeRng(seed: number, initial: RngState): Rng {
  let [a, b, c, counter] = initial;

  const nextUint32 = (): number => {
    const t = (a + b + counter) >>> 0;
    counter = (counter + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };

  const float = (): number => nextUint32() / UINT32;

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`int() ждёт целые границы, получил ${min}..${max}`);
    }
    if (max < min) throw new RangeError(`int() ждёт min <= max, получил ${min}..${max}`);
    const range = max - min + 1;
    if (range <= 0 || range > UINT32) throw new RangeError(`диапазон ${range} вне uint32`);
    // Отбрасываем хвост, который дал бы перекос в пользу младших значений.
    const limit = UINT32 - (UINT32 % range);
    let draw = nextUint32();
    while (draw >= limit) draw = nextUint32();
    return min + (draw % range);
  };

  return {
    nextUint32,
    float,
    int,
    chance: (p) => {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return float() < p;
    },
    pick: (items) => {
      if (items.length === 0) throw new RangeError("pick() из пустого списка");
      const value = items[int(0, items.length - 1)];
      if (value === undefined) throw new RangeError("pick() наткнулся на пустую ячейку");
      return value;
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const left = out[i] as (typeof out)[number];
        const right = out[j] as (typeof out)[number];
        out[i] = right;
        out[j] = left;
      }
      return out;
    },
    weightedIndex: (weights) => {
      let total = 0;
      for (const weight of weights) {
        if (!(weight >= 0)) throw new RangeError(`вес не может быть ${weight}`);
        total += weight;
      }
      if (total <= 0) throw new RangeError("сумма весов должна быть больше нуля");
      const roll = float() * total;
      let acc = 0;
      for (let i = 0; i < weights.length; i++) {
        acc += weights[i] ?? 0;
        if (roll < acc) return i;
      }
      // Досюда доходит только накопленная погрешность сложения.
      for (let i = weights.length - 1; i >= 0; i--) {
        if ((weights[i] ?? 0) > 0) return i;
      }
      throw new RangeError("сумма весов должна быть больше нуля");
    },
    stream: (name) => createRng(mixSeed(seed, hashString(name))),
    state: () => [a, b, c, counter],
    seed,
  };
}

function mixSeed(seed: number, salt: number): number {
  let z = (seed ^ salt) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/** Новый поток от сида. Строковый сид допустим: он хэшируется устойчиво. */
export function createRng(seed: number | string): Rng {
  const rootSeed = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  const expand = splitmix32(rootSeed);
  // Первые выдачи sfc32 после инициализации слабо перемешаны — прогреваем поток.
  const warmup = makeRng(rootSeed, [expand(), expand(), expand(), 1]);
  for (let i = 0; i < 12; i++) warmup.nextUint32();
  return makeRng(rootSeed, warmup.state());
}

/** Восстановление потока из сохранения: продолжает ту же последовательность. */
export function restoreRng(seed: number | string, state: RngState): Rng {
  return makeRng(typeof seed === "string" ? hashString(seed) : seed >>> 0, state);
}
