import type { StatKey, Stats } from "./performer.ts";
import type { RngState } from "./rng.ts";

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
