/**
 * Information fog (`specs/0001`, item 2 and the "Fog" section).
 *
 * The user never sees the exact number: only a range around the truth. The error
 * is derived from the performer's own seed and the stat key, so it is **the same**
 * on every look — otherwise scouting would turn into recomputing until you get the answer you want.
 */
import { clamp, type Performer, STAT_MAX, STAT_MIN, type StatKey, statsFrom } from "./performer.ts";
import { createRng } from "./rng.ts";

/** What the user sees instead of a number: bounds that always contain the true value. */
export interface ObservedRange {
  /** Lower bound, never below the scale minimum. */
  readonly low: number;
  /** Upper bound, never above the scale maximum. */
  readonly high: number;
}

/** The six stats as seen from outside: one range each. */
export type ObservedStats = Readonly<Record<StatKey, ObservedRange>>;

/** Everything one look at a performer yields. */
export interface Observation {
  /** Current stats, each as a range. */
  readonly stats: ObservedStats;
  /** Ceiling estimate: also a range, also with a stable error. */
  readonly potential: ObservedRange;
}

/**
 * `quality` 0 — "watched the broadcast with one eye", 1 — the organization's best scout.
 * Even at 1 the width stays at ±0.5: nobody gives you the truth (`design/player.md`, 5.6).
 */
export function observe(performer: Performer, quality: number): Observation {
  const clarity = clamp(quality, 0, 1);
  const width = 4.5 - 4 * clarity;

  const stats = statsFrom((key) =>
    rangeFor(performer.seed, key, performer.stats[key], width, STAT_MIN, STAT_MAX),
  );

  return {
    stats,
    // The ceiling is seen worse than any current stat: it cannot be measured at all, only guessed.
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
  // Stream from the performer's seed and the field name: two calls in a row give the same result,
  // while neighboring stats err differently.
  const rng = createRng(seed).stream(`observe:${key}`);
  const half = Math.max(0.5, width / 2);
  // The truth is inside the range, but not at the center: the center would give away the exact value.
  const offset = (rng.float() - 0.5) * width;
  const low = clamp(Math.round((truth - half + offset) * 10) / 10, min, max);
  const high = clamp(Math.round((truth + half + offset) * 10) / 10, min, max);
  return {
    low: Math.min(low, clamp(truth, min, max)),
    high: Math.max(high, clamp(truth, min, max)),
  };
}
