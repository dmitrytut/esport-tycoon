/**
 * Performer: stats, hidden fields, floating state, age curve.
 * Spec: `specs/0001-player-model.md`. Names are domain-neutral (`adr/0001`).
 *
 * Numeric discipline: only `+ - * /`, `Math.min/max/floor/round`. Not a single
 * platform-dependent function — otherwise bit-for-bit reproducibility (`adr/0002`) is lost.
 */

export const STAT_KEYS = [
  "mechanical",
  "cognitive",
  "collective",
  "composure",
  "adaptability",
  "presence",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Readonly<Record<StatKey, number>>;

/** Stat scale: 1–20 (decided in `specs/0001`). */
export const STAT_MIN = 1;
export const STAT_MAX = 20;

/** Floating state. Form is a fraction of the stat scale, hence ±3. */
export const ENERGY_MIN = 0;
export const ENERGY_MAX = 100;
export const MORALE_MIN = 0;
export const MORALE_MAX = 100;
export const FORM_MIN = -3;
export const FORM_MAX = 3;

export interface PerformerState {
  readonly energy: number;
  readonly morale: number;
  readonly form: number;
}

export interface Performer {
  /** Stable identifier within a run. */
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly originId: string;
  readonly languages: readonly string[];
  readonly age: number;
  readonly stats: Stats;
  readonly state: PerformerState;
  readonly traits: readonly string[];
  /** Hidden: peak age. Mechanical skill grows before it, falls after. */
  readonly peakAge: number;
  /** Hidden: growth ceiling on the stat scale. */
  readonly potential: number;
  /** Own seed: it drives the observation error, not the moment of the call. */
  readonly seed: number;
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Builds a record for all stats with an explicit literal. A loop over `STAT_KEYS` would
 * require starting from `{} as Record<StatKey, …>` — an unchecked assertion that the record
 * is already complete. Here the compiler checks completeness: a new stat breaks the build (`adr/0010`).
 *
 * Evaluation order is the field order of the literal, matching `STAT_KEYS`. This matters
 * wherever `make` pulls randomness: shifting the order would drift the golden snapshot.
 */
export function statsFrom<T>(make: (key: StatKey) => T): Readonly<Record<StatKey, T>> {
  return {
    mechanical: make("mechanical"),
    cognitive: make("cognitive"),
    collective: make("collective"),
    composure: make("composure"),
    adaptability: make("adaptability"),
    presence: make("presence"),
  };
}

/** Brings stats onto the scale and trims garbage from accumulated fractions. */
export function normalizeStats(stats: Stats): Stats {
  // One tenth is the minimal step: growth over a week is smaller than a whole point,
  // but an infinite tail of fractions breaks snapshot comparison.
  return statsFrom((key) => Math.round(clamp(stats[key], STAT_MIN, STAT_MAX) * 10) / 10);
}

export function normalizeState(state: PerformerState): PerformerState {
  return {
    energy: Math.round(clamp(state.energy, ENERGY_MIN, ENERGY_MAX) * 10) / 10,
    morale: Math.round(clamp(state.morale, MORALE_MIN, MORALE_MAX) * 10) / 10,
    form: Math.round(clamp(state.form, FORM_MIN, FORM_MAX) * 10) / 10,
  };
}

/**
 * The only way to change state (`specs/0001`, item 4): no "natural"
 * regeneration outside of an explicit call.
 */
export function applyStateChange(performer: Performer, delta: Partial<PerformerState>): Performer {
  return {
    ...performer,
    state: normalizeState({
      energy: performer.state.energy + (delta.energy ?? 0),
      morale: performer.state.morale + (delta.morale ?? 0),
      form: performer.state.form + (delta.form ?? 0),
    }),
  };
}

/** Explicit stat change: events, training, penalties. Bounds are always respected. */
export function applyStatChange(performer: Performer, delta: Partial<Stats>): Performer {
  return {
    ...performer,
    stats: normalizeStats(statsFrom((key) => performer.stats[key] + (delta[key] ?? 0))),
  };
}

/**
 * Career year (`specs/0001`, item 1).
 *
 * Mechanical skill grows before the peak, and after it falls faster the further from the peak: over ten
 * years of career the decline must outweigh the early growth, otherwise a veteran is indistinguishable
 * from a rookie and the transition to coaching (`design/player.md`, 5.4) loses its point.
 *
 * Cognitive skill grows through the whole career and does not hard-cap at the ceiling: experience
 * accumulates even for someone close to their max. Hence cognitive growth has a floor.
 */
export function advanceYear(performer: Performer): Performer {
  const { stats, peakAge, potential, age } = performer;
  // 0.55 for the least trainable, 1.5 for the most capable.
  const learnScale = 0.5 + stats.adaptability / STAT_MAX;
  const headroom = (key: StatKey): number =>
    clamp((potential - stats[key]) / (STAT_MAX - STAT_MIN), 0, 1);

  const yearsPastPeak = age - peakAge;
  const mechanicalDelta =
    yearsPastPeak < 0 ? 0.9 * learnScale * headroom("mechanical") : -0.45 - 0.18 * yearsPastPeak;

  const cognitiveDelta = Math.max(0.1, 0.45 * learnScale * headroom("cognitive"));

  return {
    ...performer,
    age: age + 1,
    stats: normalizeStats({
      ...stats,
      mechanical: stats.mechanical + mechanicalDelta,
      cognitive: stats.cognitive + cognitiveDelta,
      collective: stats.collective + 0.3 * learnScale * headroom("collective"),
      composure: stats.composure + 0.25 * learnScale * headroom("composure"),
      // Adaptability and Presence are character traits, they barely move over the years.
      adaptability: stats.adaptability,
      presence: stats.presence + 0.1 * learnScale * headroom("presence"),
    }),
  };
}

/** Snapshot for saving: includes hidden fields, otherwise loading would give a different person. */
export interface PerformerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly originId: string;
  readonly languages: readonly string[];
  readonly age: number;
  readonly stats: Record<StatKey, number>;
  readonly state: PerformerState;
  readonly traits: readonly string[];
  readonly peakAge: number;
  readonly potential: number;
  readonly seed: number;
}

export function serializePerformer(performer: Performer): PerformerSnapshot {
  const stats = statsFrom((key) => performer.stats[key]);
  return {
    id: performer.id,
    name: performer.name,
    handle: performer.handle,
    originId: performer.originId,
    languages: [...performer.languages],
    age: performer.age,
    stats,
    state: performer.state,
    traits: [...performer.traits],
    peakAge: performer.peakAge,
    potential: performer.potential,
    seed: performer.seed,
  };
}

export function deserializePerformer(snapshot: PerformerSnapshot): Performer {
  return {
    ...snapshot,
    languages: [...snapshot.languages],
    traits: [...snapshot.traits],
    stats: normalizeStats(snapshot.stats),
    state: normalizeState(snapshot.state),
  };
}
