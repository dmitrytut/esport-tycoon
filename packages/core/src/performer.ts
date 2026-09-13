/**
 * Исполнитель: статы, скрытые поля, плавающее состояние, возрастная кривая.
 * Спека: `specs/0001-player-model.md`. Имена домен-нейтральные (`adr/0001`).
 *
 * Числовая дисциплина: только `+ - * /`, `Math.min/max/floor/round`. Ни одной
 * платформо-зависимой функции — иначе бит-в-бит воспроизводимость (`adr/0002`) теряется.
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

/** Шкала статов: 1–20 (решение в `specs/0001`). */
export const STAT_MIN = 1;
export const STAT_MAX = 20;

/** Плавающее состояние. Форма — доля от шкалы статов, отсюда ±3. */
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
  /** Устойчивый идентификатор внутри прогона. */
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly originId: string;
  readonly languages: readonly string[];
  readonly age: number;
  readonly stats: Stats;
  readonly state: PerformerState;
  readonly traits: readonly string[];
  /** Скрытое: возраст пика. До него механика растёт, после падает. */
  readonly peakAge: number;
  /** Скрытое: потолок роста по шкале статов. */
  readonly potential: number;
  /** Собственный сид: от него зависит ошибка оценки, а не момент вызова. */
  readonly seed: number;
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Собирает запись по всем статам явным литералом. Цикл по `STAT_KEYS` требовал бы
 * начинать с `{} as Record<StatKey, …>` — непроверенного утверждения, что запись уже
 * полная. Здесь полноту проверяет компилятор: новый стат ломает сборку (`adr/0010`).
 *
 * Порядок вычисления — порядок полей литерала, он совпадает с `STAT_KEYS`. Это важно
 * там, где `make` тянет случайность: сдвиг порядка поехал бы в golden-снимке.
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

/** Приводит статы к шкале и режет мусор от накопленных дробей. */
export function normalizeStats(stats: Stats): Stats {
  // Одна десятая — минимальный шаг: рост за неделю мельче, чем целый пункт,
  // но бесконечный хвост дробей ломает сравнение снимков.
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
 * Единственный способ изменить состояние (`specs/0001`, п.4): никакой «естественной»
 * регенерации вне явного вызова.
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

/** Явное изменение статов: события, тренировки, штрафы. Границы соблюдаются всегда. */
export function applyStatChange(performer: Performer, delta: Partial<Stats>): Performer {
  return {
    ...performer,
    stats: normalizeStats(statsFrom((key) => performer.stats[key] + (delta[key] ?? 0))),
  };
}

/**
 * Год карьеры (`specs/0001`, п.1).
 *
 * До пика механика растёт, после — падает тем быстрее, чем дальше от пика: за десять лет
 * карьеры спад обязан перевесить ранний рост, иначе ветеран не отличается от молодого и
 * переход в тренеры (`design/player.md`, 5.4) теряет смысл.
 *
 * Голова растёт всю карьеру и не упирается в потолок насмерть: опыт копится даже у того,
 * кто близок к своему максимуму. Поэтому у когнитивного роста есть минимум.
 */
export function advanceYear(performer: Performer): Performer {
  const { stats, peakAge, potential, age } = performer;
  // 0.55 у самых необучаемых, 1.5 у самых способных.
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
      // Обучаемость и Харизма — свойства характера, годами почти не двигаются.
      adaptability: stats.adaptability,
      presence: stats.presence + 0.1 * learnScale * headroom("presence"),
    }),
  };
}

/** Снимок для сохранения: включает скрытые поля, иначе загрузка даст другого человека. */
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
