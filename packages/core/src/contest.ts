import {
  clamp,
  ENERGY_MAX,
  ENERGY_MIN,
  FORM_MAX,
  FORM_MIN,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type StatKey,
  type Stats,
} from "./performer.ts";
import { restoreRng, type RngState } from "./rng.ts";

/** Isolated RNG stream name reserved for Contest resolution. */
export const CONTEST_STREAM_NAME = "contest";

/** Nominal brand kept separate so the exported identifier has no anonymous surface shape. */
interface ContestIdBrand {
  /** Compile-time marker; no runtime field enters serialized data. */
  readonly __brand: "ContestId";
}

/** Stable correlation identity with no calendar or career meaning. */
export type ContestId = string & ContestIdBrand;

/** Complete six-stat weight map; zero excludes a stat without a code branch. */
export type ContestStatWeights = Readonly<Record<StatKey, number>>;

/** Integer coefficients that map strength and momentum to bounded basis points. */
export interface ContestSideChanceRules {
  /** Basis points added per one strength deci-point of first-side advantage. */
  readonly strengthBpsPerDeciPoint: number;
  /** Basis points added per signed momentum point. */
  readonly momentumBpsPerPoint: number;
  /** Inclusive basis-point floor preserved for either side. */
  readonly underdogFloorBps: number;
}

/** One ordered Moment position inside every scoring unit. */
export interface ContestSlot {
  /** Stable content id used by Moment types and result evidence. */
  readonly id: string;
  /** Whether the selected side receives exactly one tally point. */
  readonly scoring: boolean;
}

/** One stable participant metric available to content and presentation. */
export interface ContestMetric {
  /** Stable content id stored in numeric result evidence. */
  readonly id: string;
  /** Player-facing English heading; never copied into core results. */
  readonly label: string;
}

/** Data-owned Moment semantics selected within one declared slot. */
export interface ContestMomentType {
  /** Stable content id copied into each selected Moment. */
  readonly id: string;
  /** Existing slot id where this type is reachable. */
  readonly slot: string;
  /** Positive integer selection weight. */
  readonly weight: number;
  /** Positive unsigned shift whose sign comes from the selected side. */
  readonly momentumShift: number;
  /** Signed deltas keyed only by declared metric ids. */
  readonly participantMetricDeltas: Readonly<Record<string, number>>;
}

/** Closed data contract needed to resolve one head-to-head Contest. */
export interface ContestRules {
  /** Only one two-sided resolution kind is currently supported. */
  readonly kind: "head-to-head";
  /** Exact participant count required on each side. */
  readonly participantCount: number;
  /** Integer weights for all six performer stats. */
  readonly statWeights: ContestStatWeights;
  /** Tally target that ends resolution immediately after a complete unit. */
  readonly scoreToWin: number;
  /** Maximum complete units before the higher tally or draw decides the outcome. */
  readonly maxUnits: number;
  /** Nominal post-resolution energy cost for every participant. */
  readonly energyCost: number;
  /** Linear bounded side-selection coefficients. */
  readonly sideChance: ContestSideChanceRules;
  /** Prior momentum retained after each Moment, in basis points. */
  readonly momentumRetentionBps: number;
  /** Semantic unit order; exactly the final slot scores. */
  readonly slots: readonly ContestSlot[];
  /** Stable metric declarations available to Moment types. */
  readonly metrics: readonly ContestMetric[];
  /** Weighted content catalog for all reachable slots. */
  readonly momentTypes: readonly ContestMomentType[];
}

/** Minimal performer state read by Contest resolution. */
export interface ContestParticipantInput {
  /** Globally unique stable Performer id. */
  readonly performerId: string;
  /** Current values for all six stats on the 1–20 scale. */
  readonly stats: Stats;
  /** Current form on the −3…3 one-decimal grid. */
  readonly form: number;
  /** Opening energy on the 0–100 one-decimal grid. */
  readonly energy: number;
}

/** One semantic side with exactly the rules-declared participant count. */
export interface ContestCollectiveInput {
  /** Stable Collective id distinct from the opposing side. */
  readonly collectiveId: string;
  /** Participants whose ids are unique across both sides. */
  readonly participants: readonly ContestParticipantInput[];
}

/** Serializable seed and four-word state for the isolated Contest stream. */
export interface ContestRngContinuation {
  /** Unsigned 32-bit numeric stream seed. */
  readonly seed: number;
  /** Exact continuation consumed and returned by resolution. */
  readonly state: RngState;
}

/** Complete JSON-compatible input for one pure Contest transition. */
export interface ContestInput {
  /** Stable correlation identity copied unchanged into the result. */
  readonly contestId: ContestId;
  /** Stable content id copied unchanged into evidence. */
  readonly disciplineId: string;
  /** Fully materialized closed rules; core supplies no defaults. */
  readonly rules: ContestRules;
  /** First semantic side, independent of strength. */
  readonly first: ContestCollectiveInput;
  /** Second semantic side, independent of strength. */
  readonly second: ContestCollectiveInput;
  /** Injected Contest-stream continuation consumed only after validation. */
  readonly rng: ContestRngContinuation;
}

/** Discrete score state independent from momentum. */
export interface ContestTally {
  /** Points awarded to the first semantic side. */
  readonly first: number;
  /** Points awarded to the second semantic side. */
  readonly second: number;
}

/** Strength evidence for one ordered Collective. */
export interface ContestCollectiveResult {
  /** Stable id of the measured Collective. */
  readonly collectiveId: string;
  /** Half-up mean strength in integer deci-points from 10 through 200. */
  readonly strengthDeciPoints: number;
}

/** One auditable generated event with momentum, tally and attribution evidence. */
export interface ContestMoment {
  /** Zero-based position in the complete feed. */
  readonly index: number;
  /** One-based scoring-unit position. */
  readonly unit: number;
  /** Declared slot id visited in content order. */
  readonly slotId: string;
  /** Canonically selected Moment type id. */
  readonly typeId: string;
  /** Collective selected by this Moment's side draw. */
  readonly collectiveId: string;
  /** Performer selected only from the chosen Collective. */
  readonly performerId: string;
  /** Signed momentum used by this Moment's side threshold. */
  readonly momentumBefore: number;
  /** Prior momentum after declared retention, rounded towards zero. */
  readonly momentumRetained: number;
  /** Selected type shift signed towards the chosen Collective. */
  readonly momentumShift: number;
  /** Signed momentum after shift and −100…100 clamping. */
  readonly momentumAfter: number;
  /** Zero for non-scoring slots and one for the single scoring slot. */
  readonly scoreDelta: 0 | 1;
  /** Independent discrete tally immediately after this Moment. */
  readonly tallyAfter: ContestTally;
  /** Selected participant deltas keyed by stable metric id. */
  readonly participantMetricDeltas: Readonly<Record<string, number>>;
}

/** Winning outcome when the first semantic side finishes ahead. */
export interface ContestFirstWinOutcome {
  /** Tagged outcome discriminant. */
  readonly kind: "first-win";
  /** First Collective id. */
  readonly winnerId: string;
  /** Second Collective id. */
  readonly loserId: string;
}

/** Winning outcome when the second semantic side finishes ahead. */
export interface ContestSecondWinOutcome {
  /** Tagged outcome discriminant. */
  readonly kind: "second-win";
  /** Second Collective id. */
  readonly winnerId: string;
  /** First Collective id. */
  readonly loserId: string;
}

/** Regulation draw with no invented winner or loser. */
export interface ContestDrawOutcome {
  /** Tagged outcome discriminant. */
  readonly kind: "draw";
}

/** Closed outcome union for a resolved head-to-head Contest. */
export type ContestOutcome = ContestFirstWinOutcome | ContestSecondWinOutcome | ContestDrawOutcome;

/** Authoritative post-Contest evidence for one participant. */
export interface ContestParticipantResult {
  /** Collective that owned this participant during resolution. */
  readonly collectiveId: string;
  /** Stable Performer id from the input participants. */
  readonly performerId: string;
  /** Calculated opening strength in integer deci-points. */
  readonly strengthDeciPoints: number;
  /** Opening energy used by strength calculation. */
  readonly energyBefore: number;
  /** Rules-declared nominal cost; consumers must not subtract it again. */
  readonly nominalEnergyCost: number;
  /** Actual bounded change from opening to final energy. */
  readonly energyDelta: number;
  /** Authoritative value for a future career owner to install exactly once. */
  readonly energyAfter: number;
  /** Contest-only totals in ascending metric-id order. */
  readonly metricTotals: Readonly<Record<string, number>>;
}

/** Complete JSON-compatible evidence and continuation from one successful resolution. */
export interface ContestResult {
  /** Stable correlation identity copied from input. */
  readonly contestId: ContestId;
  /** Stable discipline content id copied from input. */
  readonly disciplineId: string;
  /** First side and its calculated strength. */
  readonly first: ContestCollectiveResult;
  /** Second side and its calculated strength. */
  readonly second: ContestCollectiveResult;
  /** Number of complete scoring units resolved. */
  readonly unitsResolved: number;
  /** Final discrete tally. */
  readonly tally: ContestTally;
  /** Tagged final result with identities only on wins. */
  readonly outcome: ContestOutcome;
  /** Ordered structured feed, bounded by slots times units. */
  readonly moments: readonly ContestMoment[];
  /** Exactly one consequence record per input participant. */
  readonly participantResults: readonly ContestParticipantResult[];
  /** Contest stream immediately after the final participant draw. */
  readonly rngContinuation: ContestRngContinuation;
}

const UINT32_MAX = 0xffffffff;
const CORE_STAT_NAMES: readonly string[] = STAT_KEYS;

/** Narrow unknown JSON-shaped input without accepting arrays or class-only state. */
function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

/** Keep every runtime object as closed as the exported compile-time contract. */
function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`${path}.${key} is not supported`);
  }
}

/** Validate one stable JSON identifier and return it for duplicate checks. */
function requireStableId(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new TypeError(`${path} must be a non-empty lowercase id; got ${String(value)}`);
  }
  return value;
}

/** Validate an integer bound without normalizing caller input. */
function requireInteger(value: unknown, min: number, max: number, path: string): number {
  if (!Number.isInteger(value))
    throw new TypeError(`${path} must be an integer; got ${String(value)}`);
  if (typeof value !== "number" || value < min || value > max) {
    throw new RangeError(`${path} must be from ${min} through ${max}; got ${String(value)}`);
  }
  return value;
}

/** Validate an existing one-decimal numeric grid without rounding caller input. */
function requireGridNumber(value: unknown, min: number, max: number, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be finite; got ${String(value)}`);
  }
  if (value < min || value > max) {
    throw new RangeError(`${path} must be from ${min} through ${max}; got ${value}`);
  }
  if (!Number.isInteger(value * 10)) {
    throw new RangeError(`${path} must use the one-decimal grid; got ${value}`);
  }
}

/** Validate the complete six-key integer weight map and its positive total. */
function validateStatWeights(value: unknown): void {
  const weights = requireRecord(value, "rules.statWeights");
  rejectUnknownKeys(weights, CORE_STAT_NAMES, "rules.statWeights");
  let total = 0;
  for (const stat of STAT_KEYS) {
    const weight = requireInteger(weights[stat], 0, 100, `rules.statWeights.${stat}`);
    total += weight;
  }
  if (total <= 0) throw new RangeError("rules.statWeights must have a positive total; got 0");
}

/** Validate one participant and reserve its globally unique identity. */
function validateParticipant(value: unknown, path: string, performerIds: Set<string>): void {
  const participant = requireRecord(value, path);
  rejectUnknownKeys(participant, ["performerId", "stats", "form", "energy"], path);
  const performerId = requireStableId(participant["performerId"], `${path}.performerId`);
  if (performerIds.has(performerId)) {
    throw new RangeError(`${path}.performerId "${performerId}" is duplicated or overlapping`);
  }
  performerIds.add(performerId);

  const stats = requireRecord(participant["stats"], `${path}.stats`);
  rejectUnknownKeys(stats, CORE_STAT_NAMES, `${path}.stats`);
  for (const stat of STAT_KEYS) {
    requireGridNumber(stats[stat], STAT_MIN, STAT_MAX, `${path}.stats.${stat}`);
  }
  requireGridNumber(participant["form"], FORM_MIN, FORM_MAX, `${path}.form`);
  requireGridNumber(participant["energy"], ENERGY_MIN, ENERGY_MAX, `${path}.energy`);
}

/** Validate one side and its exact participant count. */
function validateCollective(
  value: unknown,
  participantCount: number,
  path: string,
  performerIds: Set<string>,
): string {
  const collective = requireRecord(value, path);
  rejectUnknownKeys(collective, ["collectiveId", "participants"], path);
  const collectiveId = requireStableId(collective["collectiveId"], `${path}.collectiveId`);
  const participants = collective["participants"];
  if (!Array.isArray(participants)) throw new TypeError(`${path}.participants must be an array`);
  if (participants.length !== participantCount) {
    throw new RangeError(
      `${path}.participants must equal rules.participantCount ${participantCount}; got ${participants.length}`,
    );
  }
  participants.forEach((participant, index) =>
    validateParticipant(participant, `${path}.participants[${index}]`, performerIds),
  );
  return collectiveId;
}

/** Validate slots, metrics and Moment references that TypeScript cannot protect at runtime. */
function validateMomentRules(rules: Record<string, unknown>): void {
  const slots = rules["slots"];
  if (!Array.isArray(slots)) throw new TypeError("rules.slots must be an array");
  if (slots.length < 1 || slots.length > 4) {
    throw new RangeError(`rules.slots must contain 1 through 4 entries; got ${slots.length}`);
  }
  const slotIds = new Set<string>();
  let scoringCount = 0;
  let scoringIndex = -1;
  slots.forEach((slotValue, index) => {
    const path = `rules.slots[${index}]`;
    const slot = requireRecord(slotValue, path);
    rejectUnknownKeys(slot, ["id", "scoring"], path);
    const id = requireStableId(slot["id"], `${path}.id`);
    if (slotIds.has(id)) throw new RangeError(`rules slot id "${id}" is duplicated`);
    slotIds.add(id);
    if (typeof slot["scoring"] !== "boolean") {
      throw new TypeError(`${path}.scoring must be boolean; got ${String(slot["scoring"])}`);
    }
    if (slot["scoring"]) {
      scoringCount += 1;
      scoringIndex = index;
    }
  });
  if (scoringCount !== 1) {
    throw new RangeError(`rules.slots must contain exactly one scoring slot; got ${scoringCount}`);
  }
  if (scoringIndex !== slots.length - 1) {
    throw new RangeError(`rules.slots[${scoringIndex}] scoring slot must be last`);
  }

  const metrics = rules["metrics"];
  if (!Array.isArray(metrics)) throw new TypeError("rules.metrics must be an array");
  if (metrics.length < 1 || metrics.length > 16) {
    throw new RangeError(`rules.metrics must contain 1 through 16 entries; got ${metrics.length}`);
  }
  const metricIds = new Set<string>();
  metrics.forEach((metricValue, index) => {
    const path = `rules.metrics[${index}]`;
    const metric = requireRecord(metricValue, path);
    rejectUnknownKeys(metric, ["id", "label"], path);
    const id = requireStableId(metric["id"], `${path}.id`);
    if (metricIds.has(id)) throw new RangeError(`rules metric id "${id}" is duplicated`);
    metricIds.add(id);
    if (typeof metric["label"] !== "string" || metric["label"].length === 0) {
      throw new TypeError(`${path}.label must be a non-empty string`);
    }
  });

  const momentTypes = rules["momentTypes"];
  if (!Array.isArray(momentTypes)) throw new TypeError("rules.momentTypes must be an array");
  if (momentTypes.length < 1 || momentTypes.length > 64) {
    throw new RangeError(
      `rules.momentTypes must contain 1 through 64 entries; got ${momentTypes.length}`,
    );
  }
  const typeIds = new Set<string>();
  const reachableSlots = new Set<string>();
  momentTypes.forEach((typeValue, index) => {
    const path = `rules.momentTypes[${index}]`;
    const type = requireRecord(typeValue, path);
    rejectUnknownKeys(
      type,
      ["id", "slot", "weight", "momentumShift", "participantMetricDeltas"],
      path,
    );
    const id = requireStableId(type["id"], `${path}.id`);
    if (typeIds.has(id)) throw new RangeError(`rules Moment type id "${id}" is duplicated`);
    typeIds.add(id);

    const slot = requireStableId(type["slot"], `${path}.slot`);
    if (!slotIds.has(slot)) throw new RangeError(`${path}.slot refers to unknown slot "${slot}"`);
    reachableSlots.add(slot);
    requireInteger(type["weight"], 1, 1000, `${path}.weight`);
    requireInteger(type["momentumShift"], 1, 100, `${path}.momentumShift`);

    const deltas = requireRecord(
      type["participantMetricDeltas"],
      `${path}.participantMetricDeltas`,
    );
    for (const [metric, delta] of Object.entries(deltas)) {
      if (!metricIds.has(metric)) {
        throw new RangeError(
          `${path}.participantMetricDeltas refers to unknown metric "${metric}"`,
        );
      }
      requireInteger(delta, -100, 100, `${path}.participantMetricDeltas.${metric}`);
    }
  });
  for (const slot of slotIds) {
    if (!reachableSlots.has(slot)) throw new RangeError(`rules slot "${slot}" has no Moment type`);
  }
}

/** Validate all rules before RNG construction or consequence calculation. */
function validateRules(value: unknown): number {
  const rules = requireRecord(value, "rules");
  rejectUnknownKeys(
    rules,
    [
      "kind",
      "participantCount",
      "statWeights",
      "scoreToWin",
      "maxUnits",
      "energyCost",
      "sideChance",
      "momentumRetentionBps",
      "slots",
      "metrics",
      "momentTypes",
    ],
    "rules",
  );
  if (rules["kind"] !== "head-to-head") {
    throw new TypeError(`rules.kind supports only "head-to-head"; got ${String(rules["kind"])}`);
  }
  const participantCount = requireInteger(
    rules["participantCount"],
    1,
    6,
    "rules.participantCount",
  );
  validateStatWeights(rules["statWeights"]);
  const scoreToWin = requireInteger(rules["scoreToWin"], 2, 100, "rules.scoreToWin");
  const maxUnits = requireInteger(rules["maxUnits"], 1, 198, "rules.maxUnits");
  if (maxUnits < scoreToWin || maxUnits > 2 * (scoreToWin - 1)) {
    throw new RangeError(
      `rules.maxUnits must be from scoreToWin ${scoreToWin} through ${2 * (scoreToWin - 1)}; got ${maxUnits}`,
    );
  }
  requireInteger(rules["energyCost"], 1, ENERGY_MAX, "rules.energyCost");

  const sideChance = requireRecord(rules["sideChance"], "rules.sideChance");
  rejectUnknownKeys(
    sideChance,
    ["strengthBpsPerDeciPoint", "momentumBpsPerPoint", "underdogFloorBps"],
    "rules.sideChance",
  );
  requireInteger(
    sideChance["strengthBpsPerDeciPoint"],
    0,
    1000,
    "rules.sideChance.strengthBpsPerDeciPoint",
  );
  requireInteger(
    sideChance["momentumBpsPerPoint"],
    0,
    1000,
    "rules.sideChance.momentumBpsPerPoint",
  );
  requireInteger(sideChance["underdogFloorBps"], 1, 4999, "rules.sideChance.underdogFloorBps");
  requireInteger(rules["momentumRetentionBps"], 0, 10000, "rules.momentumRetentionBps");
  validateMomentRules(rules);
  return participantCount;
}

/** Validate the serialized Contest stream without constructing or restoring it. */
function validateRng(value: unknown): void {
  const rng = requireRecord(value, "rng");
  rejectUnknownKeys(rng, ["seed", "state"], "rng");
  requireInteger(rng["seed"], 0, UINT32_MAX, "rng.seed");
  const state = rng["state"];
  if (!Array.isArray(state)) throw new TypeError("rng.state must be an array");
  if (state.length !== 4)
    throw new RangeError(`rng.state must contain 4 words; got ${state.length}`);
  state.forEach((word, index) => requireInteger(word, 0, UINT32_MAX, `rng.state[${index}]`));
}

/** Complete draw-free preflight for arbitrary plain data supplied through the public boundary. */
function validateContestInput(input: ContestInput): void {
  const root = requireRecord(input, "input");
  rejectUnknownKeys(
    root,
    ["contestId", "disciplineId", "rules", "first", "second", "rng"],
    "input",
  );
  requireStableId(root["contestId"], "contestId");
  requireStableId(root["disciplineId"], "disciplineId");
  const participantCount = validateRules(root["rules"]);
  const performerIds = new Set<string>();
  const firstId = validateCollective(root["first"], participantCount, "first", performerIds);
  const secondId = validateCollective(root["second"], participantCount, "second", performerIds);
  if (firstId === secondId) {
    throw new RangeError(`first.collectiveId and second.collectiveId are duplicated: "${firstId}"`);
  }
  validateRng(root["rng"]);
}

/** One validated participant paired with the strength used by both weighted choices. */
interface CalculatedParticipant {
  /** Original immutable input carrying opening state. */
  readonly input: ContestParticipantInput;
  /** Collective that owns this participant for the entire Contest. */
  readonly collectiveId: string;
  /** Half-up weighted strength in integer deci-points. */
  readonly strengthDeciPoints: number;
}

/** One ordered side after participant and Collective strength calculation. */
interface CalculatedCollective {
  /** Stable Collective identity copied into result evidence. */
  readonly collectiveId: string;
  /** Canonically id-sorted participants used for weighted attribution. */
  readonly participants: readonly CalculatedParticipant[];
  /** Half-up mean of participant strengths in integer deci-points. */
  readonly strengthDeciPoints: number;
}

/** Precomputed canonical choices for one slot; each selection still consumes one draw. */
interface MomentChoices {
  /** Moment types sorted by stable id. */
  readonly types: readonly ContestMomentType[];
  /** Positive weights aligned with `types`. */
  readonly weights: readonly number[];
}

/** Half-up integer division for the non-negative strength calculations. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Apply form and fatigue to all six stat deci-points, then take the declared weighted mean.
 * Input validation makes every conversion exact on the one-decimal grid.
 */
function calculateParticipantStrength(
  participant: ContestParticipantInput,
  weights: ContestStatWeights,
): number {
  const energyDeci = Math.round(participant.energy * 10);
  const formDeci = Math.round(participant.form * 10);
  const fatiguePenaltyDeci = Math.floor((1000 - energyDeci) / 20);
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const stat of STAT_KEYS) {
    const statDeci = Math.round(participant.stats[stat] * 10);
    const effectiveStatDeci = clamp(statDeci + formDeci - fatiguePenaltyDeci, 10, 200);
    weightedTotal += effectiveStatDeci * weights[stat];
    weightTotal += weights[stat];
  }
  return roundHalfUp(weightedTotal, weightTotal);
}

/** Calculate one side once and canonicalize participant order before any draw. */
function calculateCollective(
  collective: ContestCollectiveInput,
  weights: ContestStatWeights,
): CalculatedCollective {
  const participants = collective.participants
    .map((input) => ({
      input,
      collectiveId: collective.collectiveId,
      strengthDeciPoints: calculateParticipantStrength(input, weights),
    }))
    .sort((left, right) =>
      left.input.performerId < right.input.performerId
        ? -1
        : left.input.performerId > right.input.performerId
          ? 1
          : 0,
    );
  const total = participants.reduce((sum, participant) => sum + participant.strengthDeciPoints, 0);
  return {
    collectiveId: collective.collectiveId,
    participants,
    strengthDeciPoints: roundHalfUp(total, participants.length),
  };
}

/** Emit metric records in ascending id order so JSON output is byte-stable. */
function orderedMetricRecord(values: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

/** Resolve the closed tagged outcome from the final tally. */
function contestOutcome(tally: ContestTally, firstId: string, secondId: string): ContestOutcome {
  if (tally.first > tally.second) {
    return { kind: "first-win", winnerId: firstId, loserId: secondId };
  }
  if (tally.second > tally.first) {
    return { kind: "second-win", winnerId: secondId, loserId: firstId };
  }
  return { kind: "draw" };
}

/** Build canonical weighted type choices once rather than filtering inside the hot loop. */
function momentChoicesBySlot(rules: ContestRules): Map<string, MomentChoices> {
  const choices = new Map<string, MomentChoices>();
  for (const slot of rules.slots) {
    const types = rules.momentTypes
      .filter((type) => type.slot === slot.id)
      .slice()
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    choices.set(slot.id, { types, weights: types.map((type) => type.weight) });
  }
  return choices;
}

/** Select one array entry while defending the validated indexing invariant. */
function selectedAt<T>(values: readonly T[], index: number, kind: string): T {
  const selected = values[index];
  if (selected === undefined) throw new RangeError(`${kind} selection returned no value`);
  return selected;
}

/** Add one Moment's sparse deltas to that participant's Contest-only totals. */
function addMetricDeltas(
  totalsByPerformer: Map<string, Record<string, number>>,
  performerId: string,
  deltas: Readonly<Record<string, number>>,
): void {
  const totals = totalsByPerformer.get(performerId);
  if (totals === undefined) throw new RangeError(`missing metric totals for "${performerId}"`);
  for (const [metric, delta] of Object.entries(deltas)) {
    totals[metric] = (totals[metric] ?? 0) + delta;
  }
}

/** Convert calculated participants into authoritative consequences after resolution. */
function participantResults(
  participants: readonly CalculatedParticipant[],
  energyCost: number,
  totalsByPerformer: Map<string, Record<string, number>>,
): readonly ContestParticipantResult[] {
  return participants.map((participant) => {
    const energyAfter = Math.max(ENERGY_MIN, participant.input.energy - energyCost);
    const totals = totalsByPerformer.get(participant.input.performerId);
    if (totals === undefined) {
      throw new RangeError(`missing metric totals for "${participant.input.performerId}"`);
    }
    return {
      collectiveId: participant.collectiveId,
      performerId: participant.input.performerId,
      strengthDeciPoints: participant.strengthDeciPoints,
      energyBefore: participant.input.energy,
      nominalEnergyCost: energyCost,
      energyDelta: energyAfter - participant.input.energy,
      energyAfter,
      metricTotals: orderedMetricRecord(totals),
    };
  });
}

/** Resolve every ordered Moment and return complete evidence plus the exact stream continuation. */
function resolveValidatedContest(input: ContestInput): ContestResult {
  const first = calculateCollective(input.first, input.rules.statWeights);
  const second = calculateCollective(input.second, input.rules.statWeights);
  const choicesBySlot = momentChoicesBySlot(input.rules);
  const totalsByPerformer = new Map<string, Record<string, number>>();
  const allParticipants = [...first.participants, ...second.participants];
  for (const participant of allParticipants) {
    totalsByPerformer.set(participant.input.performerId, {});
  }

  const rng = restoreRng(input.rng.seed, input.rng.state);
  const moments: ContestMoment[] = [];
  let firstTally = 0;
  let secondTally = 0;
  let momentum = 0;
  let unitsResolved = 0;

  for (let unit = 1; unit <= input.rules.maxUnits; unit += 1) {
    for (const slot of input.rules.slots) {
      const choices = choicesBySlot.get(slot.id);
      if (choices === undefined) throw new RangeError(`missing Moment choices for "${slot.id}"`);
      const selectedType = selectedAt(
        choices.types,
        rng.weightedIndex(choices.weights),
        "Moment type",
      );

      const firstBps = clamp(
        5000 +
          (first.strengthDeciPoints - second.strengthDeciPoints) *
            input.rules.sideChance.strengthBpsPerDeciPoint +
          momentum * input.rules.sideChance.momentumBpsPerPoint,
        input.rules.sideChance.underdogFloorBps,
        10000 - input.rules.sideChance.underdogFloorBps,
      );
      const firstThreshold = Math.floor((firstBps * 0x100000000) / 10000);
      const selectedCollective = rng.nextUint32() < firstThreshold ? first : second;
      const selectedParticipant = selectedAt(
        selectedCollective.participants,
        rng.weightedIndex(
          selectedCollective.participants.map((participant) => participant.strengthDeciPoints),
        ),
        "participant",
      );

      const retainedMomentum = Math.trunc((momentum * input.rules.momentumRetentionBps) / 10000);
      const momentumRetained = retainedMomentum === 0 ? 0 : retainedMomentum;
      const momentumShift =
        selectedCollective === first ? selectedType.momentumShift : -selectedType.momentumShift;
      const momentumAfter = clamp(momentumRetained + momentumShift, -100, 100);
      const scoreDelta: 0 | 1 = slot.scoring ? 1 : 0;
      if (scoreDelta === 1) {
        if (selectedCollective === first) firstTally += 1;
        else secondTally += 1;
      }

      const deltas = orderedMetricRecord(selectedType.participantMetricDeltas);
      addMetricDeltas(totalsByPerformer, selectedParticipant.input.performerId, deltas);
      moments.push({
        index: moments.length,
        unit,
        slotId: slot.id,
        typeId: selectedType.id,
        collectiveId: selectedCollective.collectiveId,
        performerId: selectedParticipant.input.performerId,
        momentumBefore: momentum,
        momentumRetained,
        momentumShift,
        momentumAfter,
        scoreDelta,
        tallyAfter: { first: firstTally, second: secondTally },
        participantMetricDeltas: deltas,
      });
      momentum = momentumAfter;
    }

    unitsResolved = unit;
    if (firstTally >= input.rules.scoreToWin || secondTally >= input.rules.scoreToWin) {
      break;
    }
  }

  const tally = { first: firstTally, second: secondTally };
  return {
    contestId: input.contestId,
    disciplineId: input.disciplineId,
    first: {
      collectiveId: first.collectiveId,
      strengthDeciPoints: first.strengthDeciPoints,
    },
    second: {
      collectiveId: second.collectiveId,
      strengthDeciPoints: second.strengthDeciPoints,
    },
    unitsResolved,
    tally,
    outcome: contestOutcome(tally, first.collectiveId, second.collectiveId),
    moments,
    participantResults: participantResults(
      allParticipants,
      input.rules.energyCost,
      totalsByPerformer,
    ),
    rngContinuation: { seed: input.rng.seed, state: rng.state() },
  };
}

/**
 * Resolve one complete Contest without mutating caller state.
 *
 * Validation is deliberately first: invalid input cannot construct or advance the injected
 * stream. Every successful choice then follows type → side → participant draw order.
 */
export function resolveContest(input: ContestInput): ContestResult {
  validateContestInput(input);
  return resolveValidatedContest(input);
}
