/**
 * The single source of randomness in the whole project (ADR 0002).
 *
 * Properties the rest of the code relies on:
 * 1. One seed — one sequence, bit-for-bit, on any platform.
 *    Only integer operations over uint32 are used, no floating point
 *    inside the generator and no platform-dependent functions.
 * 2. Streams are independent: a stream is derived from the root seed and a name, not from
 *    the current state. So an extra call in one subsystem does not shift another.
 * 3. State is serializable: saving the game reproduces the continuation.
 *
 * Algorithm: sfc32 (counter plus three state words), initialization via splitmix32.
 */

const UINT32 = 0x100000000;

/** Serializable stream state: [a, b, c, counter]. */
export type RngState = readonly [number, number, number, number];

/** One deterministic stream. The whole simulation draws randomness only through this (`adr/0002`). */
export interface Rng {
  /** Next integer in [0, 2^32). */
  nextUint32(): number;
  /** Next fraction in [0, 1). */
  float(): number;
  /** Integer in [min, max] inclusive, uniform (no modulo-remainder bias). */
  int(min: number, max: number): number;
  /** True with probability p (0 — never, 1 — always). */
  chance(p: number): boolean;
  /** Equiprobable element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** New shuffled array; the original is unchanged. */
  shuffle<T>(items: readonly T[]): T[];
  /** Index chosen proportionally to weights. Zero weights are unreachable. */
  weightedIndex(weights: readonly number[]): number;
  /** Independent stream: the same for a given root seed and name. */
  stream(name: string): Rng;
  /** State snapshot for saving the game. */
  state(): RngState;
  /** Root seed of this stream — child streams are derived from it. */
  readonly seed: number;
}

/** FNV-1a: the string seed and stream name are turned into a uint32. */
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
      throw new RangeError(`int() expects integer bounds, got ${min}..${max}`);
    }
    if (max < min) throw new RangeError(`int() expects min <= max, got ${min}..${max}`);
    const range = max - min + 1;
    if (range <= 0 || range > UINT32) throw new RangeError(`range ${range} is outside uint32`);
    // Discard the tail that would skew toward lower values.
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
      if (items.length === 0) throw new RangeError("pick() on an empty list");
      const value = items[int(0, items.length - 1)];
      if (value === undefined) throw new RangeError("pick() hit an empty cell");
      return value;
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        // The two sanctioned type assertions in core (ADR 0010). Both indices are provably
        // inside the array — `i` runs from length-1, `j` comes from int(0, i) — but under
        // noUncheckedIndexedAccess the compiler cannot infer that. An undefined check here
        // would mean a new exception path in the generic API: `shuffle<T | undefined>` would
        // start failing on a legal value. The invariant is pinned by a test in rng.test.ts.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const left = out[i] as (typeof out)[number];
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const right = out[j] as (typeof out)[number];
        out[i] = right;
        out[j] = left;
      }
      return out;
    },
    weightedIndex: (weights) => {
      let total = 0;
      for (const weight of weights) {
        if (!(weight >= 0)) throw new RangeError(`weight cannot be ${weight}`);
        total += weight;
      }
      if (total <= 0) throw new RangeError("sum of weights must be greater than zero");
      const roll = float() * total;
      let acc = 0;
      for (let i = 0; i < weights.length; i++) {
        acc += weights[i] ?? 0;
        if (roll < acc) return i;
      }
      // Only accumulated addition error can reach this point.
      for (let i = weights.length - 1; i >= 0; i--) {
        if ((weights[i] ?? 0) > 0) return i;
      }
      throw new RangeError("sum of weights must be greater than zero");
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

/** New stream from a seed. A string seed is allowed: it is hashed deterministically. */
export function createRng(seed: number | string): Rng {
  const rootSeed = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  const expand = splitmix32(rootSeed);
  // The first draws of sfc32 right after initialization are weakly mixed — warm up the stream.
  const warmup = makeRng(rootSeed, [expand(), expand(), expand(), 1]);
  for (let i = 0; i < 12; i++) warmup.nextUint32();
  return makeRng(rootSeed, warmup.state());
}

/** Restoring a stream from a save: continues the same sequence. */
export function restoreRng(seed: number | string, state: RngState): Rng {
  return makeRng(typeof seed === "string" ? hashString(seed) : seed >>> 0, state);
}
