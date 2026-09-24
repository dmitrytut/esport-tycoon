## Context

See `proposal.md` for motivation. Core currently exposes `Performer`, `Collective`, the
serializable `RngState`, and pure state transitions, but it has no Contest type or resolver.
Performer stats and floating state are normalized to one decimal: stats are 1–20, form is
-3–3 and energy is 0–100. The discipline schema declares only four stat weights and a
presentation-shaped `contest` object whose `bo3` value describes a series rather than one
resolvable Contest.

The current live boundaries are deliberate. `season-calendar` records only one factual
`win | loss | draw` for a marked calendar entry; it does not resolve a Contest or series.
`week-loop` owns activities, recovery, recurring engagement expense and time advancement.
`incident-engine` owns only incidents. Issue #45 will choose the concrete opponent, bind a
result to `SeasonCalendarEntryId`, install consequences in career state and apply rewards.
This change must therefore return complete evidence without touching any of those owners.

The intent sources fix three principles but leave the arithmetic open: discipline weights
matter; momentum is continuous and separate from discrete score; and Moment semantics are
data. `specs/0004-match-engine.md` repeats those principles but supplies no executable rule.
The author selected two Moments per tactical scoring unit: a setup Moment followed by a
resolution Moment.

## Goals / Non-Goals

**Goals:**

- A pure one-call resolver for one two-sided Contest, with complete serializable input and
  result contracts.
- Integer arithmetic whose units, rounding, random draw order and continuation are explicit.
- A data contract that lets a second head-to-head discipline fixture change weights, slots,
  Moment types, metrics and balance numbers without changing the algorithm.
- Observable evidence sufficient for a future presentation layer and for #45 to apply energy
  once without reconstructing any Contest calculation.
- Deterministic unit, property and fixed-seed statistical verification without a golden or
  balance baseline.

**Non-Goals:**

- Calendar identity, opponent discovery, career-state mutation, week/season advancement,
  rewards, recovery, recurring expense, incidents or persistence I/O.
- Series orchestration, overtime, multi-Collective standings, points tables, placement,
  intervention windows or presentation strings.
- Morale, trait, language, relationship, economy or long-term stat consequences.
- A public tuning promise for every future discipline. The first numbers are explicit and
  testable, but later balance changes still require their own accepted change.

## Decisions

### One pure transition owns one Contest

The public operation is conceptually `resolveContest(input) -> ContestResult`. It follows the
existing core convention and throws a descriptive `TypeError` or `RangeError` for invalid
input. It validates the complete input before restoring or drawing from RNG and never mutates
an input object. A successful call calculates the whole Contest synchronously and returns a
new result.

The public input is JSON-compatible and contains exactly:

- `contestId`: stable `ContestId` for correlation, with no calendar meaning;
- `disciplineId`: stable content id copied into evidence;
- `rules`: the already loaded and validated `ContestRules` described below;
- `first` and `second`: ordered `ContestCollectiveInput` values, each containing a stable
  `collectiveId` and exactly `rosterSize` participants;
- each participant: `performerId`, all six normalized stats, form and energy; names, handles,
  traits, morale, hidden growth fields and other career data are absent because resolution
  does not read them;
- `rng`: the numeric seed and current four-word `RngState` of the named `contest` stream that
  the caller derived from the run root seed.

`first` and `second` are semantic positions, not strength order. IDs within each Collective
are canonicalized by ascending code-point order before weighted selection. The two Collective
ids must differ; participant ids must be unique globally, so one Performer cannot appear for
both sides.

The result is also JSON-compatible and contains exactly:

- `contestId` and `disciplineId`;
- the two ordered Collective ids and their integer `strengthDeciPoints`;
- `unitsResolved` and final `{ first, second }` tally;
- `outcome`, tagged as `first-win`, `second-win` or `draw`, with winner/loser ids only on a
  winning variant;
- the ordered array of structured `moments`;
- ordered `participantResults` for every input participant;
- `rngContinuation`, carrying the same contest-stream seed and final four-word RNG state.

Every `Moment` contains its zero-based Moment index, one-based unit index, slot id, Moment type
id, selected Collective id and Performer id, momentum before retention, retained momentum,
signed applied shift and momentum after clamping, score delta (`0` or `1`), tally after the
Moment, and the selected participant's metric deltas keyed by stable metric id. It contains no
label, sentence, timestamp or other presentation string.

Every participant result contains Collective id, Performer id, calculated strength, energy
before, nominal energy cost, actual signed energy delta, energy after, and metric totals in
ascending metric-id order. This is authoritative consequence evidence: #45 replaces career
energy with `energyAfter` once. It must not subtract the nominal cost again. Metric totals are
Contest evidence for presentation, not career-state effects.

Alternative rejected: accept full `Collective` and return a modified `Collective`. That would
couple resolution to names, morale, traits and future fields it does not own, obscure which
fields changed, and make double application harder to detect.

### Discipline content becomes an executable closed contract

The discipline's `statWeights` must declare all six core keys as integer weights from 0 through
100, with a positive sum. Tactical content declares `3, 1, 2, 3, 0, 0` for Mechanical,
Cognitive, Collective, Composure, Adaptability and Presence. Explicit zeros preserve the
intent that the last two live outside this Contest while keeping core free of key-specific
branches.

`contest` becomes a strict head-to-head contract with these required fields and bounds:

- `kind: "head-to-head"` and `rosterSize` inherited from the discipline;
- integer `scoreToWin` from 2 through 100 and positive integer `maxUnits`, with
  `scoreToWin <= maxUnits <= 2 * (scoreToWin - 1)`;
- integer `energyCost` from 1 through the performer energy maximum of 100;
- `sideChance`: integer `strengthBpsPerDeciPoint` and `momentumBpsPerPoint` from 0 through
  1,000, plus integer `underdogFloorBps` from 1 through 4,999;
- integer `momentumRetentionBps` from 0 through 10,000;
- an ordered array of one through four unique stable slot ids, with exactly one scoring slot;
  the scoring slot must be last so a unit always finishes before termination is checked;
- an ordered array of one through sixteen metric declarations, each with a stable id and
  English player-facing label;
- one through sixty-four Moment types in total.

A Moment type requires a unique stable id, an existing slot id, an integer selection weight
from 1 through 1,000, an integer momentum shift from 1 through 100, and a complete or sparse
object of signed integer participant metric deltas from -100 through 100 whose keys are
declared metrics. Every slot must have at least one reachable type. Moment type ids and metric
ids use lowercase kebab-case. Content validation rejects unknown fields rather than treating
them as zero.

Tactical content declares target 13, maximum 24 units, slots `setup` then `resolution`, the
second slot scoring, nominal energy cost 20, a 4,000-basis-point underdog floor, the strength
and momentum coefficients below, and 7,500-basis-point momentum retention. Its metrics are
`eliminations` (“Eliminations”), `deaths` (“Deaths”), `assists` (“Assists”) and `resources`
(“Resources”). Its exact Moment catalog is:

| id | slot | weight | momentum shift | metric deltas |
|---|---|---:|---:|---|
| `early-advantage` | `setup` | 4 | 12 | `eliminations: 1` |
| `coordinated-pressure` | `setup` | 3 | 10 | `assists: 1` |
| `resource-control` | `setup` | 2 | 8 | `resources: 2` |
| `clean-conversion` | `resolution` | 4 | 18 | `eliminations: 2`, `assists: 1`, `resources: 1` |
| `traded-conversion` | `resolution` | 3 | 14 | `eliminations: 2`, `deaths: 1`, `assists: 1` |
| `resource-conversion` | `resolution` | 2 | 12 | `eliminations: 1`, `assists: 2`, `resources: 2` |

The legacy `contest.format`, `unit`, `tally` and `participants` fields are removed.
`momentumMeans` remains required player-facing content. The `columns` strings move to the
stable metric declarations as labels; labels never enter core results or resolution branches.

The existing `format: "bo3"` is removed because it conflates one Contest with series
orchestration. Runtime resolution accepts only `head-to-head`. A caller or unvalidated object
that supplies `series`, `bo3`, `bo5`, `points-table` or another kind is rejected before RNG
moves. A season `series` marking is therefore never silently translated into one call.

A second fixture under `packages/core/test/fixtures/` declares another id and different valid
numbers, slots, types and metrics against the same schema. It is validated with the same schema
and referential checks used by `pnpm validate:content`, and the public resolver produces a valid
result without an id check or algorithm change. The fixture is not loaded as shipped content.

Alternative rejected: keep Moment ids, coefficients or tactical phases in core. That would
make the second discipline a code change and violate ADR 0003. Alternative rejected: allow
script expressions in content. A closed numeric contract is inspectable, serializable and
validatable; scripts would move the algorithm into untyped data.

### Strength uses integer deci-points and all six declared weights

All arithmetic first converts normalized decimal inputs to integers:

- `statDeci = round(stat * 10)`;
- `formDeci = round(form * 10)`;
- `energyDeci = round(energy * 10)`.

Rounding here is exact for the existing one-decimal normalized grid. Inputs that are not finite,
outside their scale or off that grid are invalid rather than silently normalized by the
resolver.

Fatigue is a linear penalty of up to five stat points:

```
fatiguePenaltyDeci = floor((1000 - energyDeci) / 20)
effectiveStatDeci = clamp(statDeci + formDeci - fatiguePenaltyDeci, 10, 200)
```

Thus each two energy points missing remove 0.1 effective stat point; full energy has no
penalty, zero energy removes five points, and form applies symmetrically to every
content-weighted stat. Morale does not enter the formula because its current contract says it
drives events, not output.

For each Performer:

```
weightedTotal = sum(weight[stat] * effectiveStatDeci[stat])
performerStrengthDeci = roundHalfUp(weightedTotal / sum(weight))
```

For each side:

```
collectiveStrengthDeci = roundHalfUp(sum(performerStrengthDeci) / rosterSize)
```

`roundHalfUp(numerator / denominator)` is integer
`floor((2 * numerator + denominator) / (2 * denominator))` for these non-negative values.
All intermediates stay below JavaScript's exact integer limit under the validated bounds.
The result range is 10 through 200 deci-points.

The participant weight used when attributing a Moment is that participant's positive
`performerStrengthDeci`. This makes stats affect both the Collective's chance and which
Performer is observed without adding another formula.

Alternative rejected: a logistic curve. `Math.exp` would violate replay requirements and its
extra shape is not justified before the first deterministic measurements. Alternative
rejected: select the best member or sum strengths. Best-member selection erases roster depth;
a sum makes roster size a hidden strength multiplier even though the schema already owns it.

### A bounded linear probability replaces a logistic curve

Before each Moment, the first side's raw chance in basis points is:

```
rawFirstBps = 5000
  + (firstStrengthDeci - secondStrengthDeci) * strengthBpsPerDeciPoint
  + momentum * momentumBpsPerPoint
firstBps = clamp(rawFirstBps, underdogFloorBps, 10000 - underdogFloorBps)
```

Tactical content sets `strengthBpsPerDeciPoint = 30`,
`momentumBpsPerPoint = 10`, and `underdogFloorBps = 4000`. At equal strength and zero momentum
the chance is exactly 50 percent. One stat point is ten deci-points and therefore contributes
300 basis points, or three percentage points. Full momentum contributes ten percentage points.
Any combined advantage is capped at 60–40.

The random spread appears in exactly one side draw for every Moment. A 4,000-basis-point floor
is the declared magnitude: even at the strongest legal advantage, the weaker side owns 40
percent of the next-Moment distribution. Repeated scoring units still reward the stronger side
through aggregation, while the floor leaves a material upset tail. There is no second hidden
noise term.

The side draw consumes one raw uint32. The first side is selected when the draw is below
`floor(firstBps * 2^32 / 10000)`; otherwise the second is selected. Multiplication remains under
the exact-integer limit. This avoids floating probability comparison and rejection sampling.

Alternative rejected: add a per-Contest strength roll. It would make a whole result hinge on
one opaque number and weaken the causal link between feed and outcome. Alternative rejected:
uncapped linear chance. Legal stat extremes would make one side unreachable, contradicting the
required underdog chance.

### Momentum is signed recent pressure, not accumulated score

Momentum is an integer from -100 through 100 relative to the first Collective. Zero is neutral;
positive favours the first side and negative favours the second. Each Contest starts at zero.
For each Moment, side probability reads the current value. After the side and type are selected:

```
retained = truncTowardZero(momentumBefore * momentumRetentionBps / 10000)
signedShift = selectedType.momentumShift * (first selected ? 1 : -1)
momentumAfter = clamp(retained + signedShift, -100, 100)
```

Tactical retention is 75 percent, so old pressure decays on every setup and resolution Moment.
Decay is multiplicative and rounded towards zero; it cannot move through zero or create
pressure. Content controls the shift magnitudes and the human meaning of the bar, while the
core algorithm stays the same.

The next Moment reads `momentumAfter`. This creates streaks without a separate random state.
A setup Moment can move momentum before the same unit's scoring resolution. A later run for the
trailing side can make momentum negative while the first side remains ahead on tally.

Alternative rejected: no decay. Early Moments would dominate the whole Contest and make the
bar an indirect cumulative tally. Alternative rejected: derive momentum from score. That
makes “ahead on tally while losing initiative” impossible by construction.

### Slots make scoring discrete and independent

Core iterates units from one through `maxUnits` and, inside each unit, visits content-declared
slots in array order. Tactical content has two:

1. `setup`, which always emits a non-scoring Moment;
2. `resolution`, which always emits one scoring Moment.

Only the selected side of a scoring slot receives `scoreDelta = 1`. Non-scoring slots always
carry zero. Momentum never changes tally, and tally never changes momentum or side chance.
After the final slot, resolution stops if either side reached `scoreToWin`; otherwise it starts
the next unit. At `maxUnits`, the greater tally wins and an equal tally draws.

With target 13 and maximum 24, tactical resolution produces 13–24 complete units and 26–48
Moments. Reaching the cap without a thirteenth point can only produce 12–12, so the general
higher-tally-at-cap branch is exercised by the second-discipline fixture rather than tactical
content. At equal per-unit side chance, the tactical draw share is
`choose(24, 12) / 2^24`, approximately 16.1 percent; accepting that regulation draw rate avoids
inventing overtime. The result can show a positive tally lead alongside negative final momentum,
and every intermediate Moment carries both independent states for presentation.

Alternative rejected: one Moment per tactical unit. It shortens the intended broadcast and
mechanically couples every momentum change to a score. Alternative rejected: a fixed arbitrary
Moment count with probabilistic scoring. It hides the tactical 13-point contract inside type
frequency and can end without a coherent scoring-unit boundary.

### Moment type, side and participant selection have one canonical draw order

The caller derives the isolated stream with
`createRng(runSeed).stream(CONTEST_STREAM_NAME)`, where the exported
`CONTEST_STREAM_NAME` is exactly `"contest"`, and supplies that stream's numeric seed and state.
This follows ADR 0002: contests cannot shift week or incident randomness. For every produced
Moment, core then performs exactly three RNG operations in this order:

1. filter types by the current slot, sort them by ascending type id, and call
   `weightedIndex` with their positive content weights;
2. calculate `firstBps` from the pre-Moment momentum and consume one raw uint32 for side;
3. sort participants of the selected Collective by ascending Performer id and call
   `weightedIndex` with their precomputed strength deci-points.

All three calls occur even when a slot has one type or a Collective has one participant. Each
`weightedIndex` and the side selection consume exactly one raw uint32 under the current RNG
contract, so every Moment consumes exactly three raw draws; tactical units consume six. No RNG
is consumed by validation, strength, decay, tally, outcome, energy, metric aggregation or
serialization. Early termination stops the loop and therefore stops draws.

Type and participant input order cannot affect selection. Slot array order is semantic content
and is preserved. The returned continuation is the contest stream immediately after the last
participant draw of the last Moment.

Alternative rejected: skip a draw for a singleton. A harmless content edit from one to two
options would shift every later choice for reasons unrelated to the selected result. Alternative
rejected: choose participant before side. It either draws from both sides or makes one side's
roster size alter the other side's continuation.

### Energy is calculated once after successful resolution

Strength reads every participant's opening energy. After all Moments and outcome are complete,
the resolver calculates:

```
energyAfter = max(0, energyBefore - energyCost)
energyDelta = energyAfter - energyBefore
```

Tactical `energyCost` is 20. A participant at 20 or above loses exactly 20; a participant below
20 reaches zero and reports the smaller actual delta. Low energy never excludes a participant
or rejects a valid roster: it already reduces strength, and allowing resolution at zero keeps a
future multi-Contest event from deadlocking. The current Contest is not weakened by its own
post-resolution cost; the next Contest sees the returned lower energy after #45 installs it.

The engine calculates consequences but does not mutate a `Collective` or `RunState`. It does
not recover energy. #45 owns when the result is installed relative to weekly activities and
recovery, and the week loop remains the only weekly recovery owner. Rejected resolution
calculates no consequence.

Alternative rejected: debit before strength. Then one call pays for itself before it occurs,
while later calls also see the debit, effectively making the first cost qualitatively different.
Alternative rejected: reject insufficient energy. That prevents the “reach the final exhausted”
dynamic and makes a low-energy career state impossible to resolve without an invented fallback.

### Rejection is complete, pure and draw-free

Runtime validation rejects before constructing or restoring RNG when:

- ids are empty/invalid, Collective ids repeat, participant ids repeat or overlap, or a roster
  count differs from `rosterSize`;
- a stat, form or energy value is non-finite, out of range or not on the one-decimal grid;
- stat weights omit a key, are non-integer/out of range or sum to zero;
- rules use a kind other than `head-to-head`, invalid score/unit/energy/chance/retention bounds,
  too many slots, metrics or types, duplicate slots/metrics/types, no scoring slot, more than
  one scoring slot, a non-final scoring slot, or no reachable type for a slot;
- a Moment type has an unknown slot/metric, an out-of-range or non-integer weight or shift, or
  an out-of-range or non-integer metric delta;
- the contest-stream seed is not an integer from 0 through `2^32 - 1`, or its state is not
  exactly four integers in that same range.

Content schema and validator catch the same discipline-side failures at load time. Runtime
validation still exists because core accepts already-loaded plain data and cannot trust an
arbitrary caller. A thrown rejection leaves every input byte-for-byte equivalent, returns no
partial result, consumes no raw draw and leaves the supplied seed/state usable for an identical
later successful call.

### Serialization carries replay evidence, not process state

Input, every Moment, participant consequences and continuation contain only JSON primitives,
arrays and objects. They contain no class instance, `Map`, `Set`, callback, `undefined`, `NaN`
or infinity. JSON round-trip of a valid input followed by resolution produces the same result
as the original input. JSON round-trip of a result is deeply equal to that result, and restoring
the returned seed/state reproduces the next Contest continuation.

A result deliberately carries both before/after energy and Moment-by-Moment state rather than
asking a consumer to infer changes from the final values. The additional data is bounded by 48
Moments and two rosters, so auditability costs little and prevents ownership mistakes.

### Verification fixes invariants and thresholds before implementation

Unit tests cover the exact strength arithmetic, probability boundaries, momentum retention and
clamping, two-slot scoring, all outcome variants, canonical selection order, exact three-draw
Moment order, consequence calculation and every rejection family.

Property tests use the repository's globally pinned fast-check configuration in
`tests/setup/fast-check.ts` (ADR 0014), never a per-test seed, and prove:

- identical valid input yields deep-identical result and continuation;
- inputs are unchanged on success and failure, and rejection leaves the continuation unchanged;
- momentum, tally, unit and energy ranges always hold;
- tally increments only on scoring slots and equals `unitsResolved` when one slot scores;
- every selected Performer belongs to the selected Collective;
- reordering participants or Moment types leaves result and continuation unchanged;
- input/result/continuation JSON round-trips preserve replay.

The sim harness adds one contest-only scenario and calls core directly; it does not advance a
week or apply consequences. Its seed set is the integer sequence 0 through 4095 inclusive and
is declared in scenario data. For each seed it resolves the same tactical rules twice with
first/second positions swapped and aggregates only public outcomes. The mechanical-edge case
uses five-performer sides equal at stat 10, form 0 and energy 100 except that every Performer on
the stronger side has Mechanical 14. Across 4,096 seeds per orientation:

- the stronger side's wins divided by all 4,096 Contests, including draws, must be at least
  55 percent;
- its win rate on that same denominator must exceed the weaker side's by at least 10 percentage
  points;
- the weaker side's wins divided by all 4,096 Contests must be at least 20 percent.

A maximum-gap case sets every positively weighted tactical stat to 20 on one side and 1 on the
other, with equal form and energy. The weaker side's wins divided by all 4,096 Contests must
still be at least 5 percent across the same seeds. Counts and rates must be identical on repeated
runs; side-swapped aggregates may differ by at most three percentage points, preventing material
positional bias without treating finite-sample noise as a defect.

These are deterministic statistical assertions over an announced population, not examples
chosen after output is seen. They exercise the public resolver and observable outcome, not a
private probability helper. The report records scenario id, rules id, seed range, roster
profiles, win/draw counts and integer basis-point rates. It produces no golden file and is not
a balance baseline.

### The legacy stub is migrated, narrowed and removed

PR-2 carries forward the legacy stub's separation of momentum and tally, structured Moment
production and data-driven disciplines. It makes the formula, ranges, termination, consequences,
rejection and replay requirements executable.

It narrows “contest engine” to one head-to-head Contest. Presentation, intervention windows,
series and multi-Collective formats are rejected or deferred rather than represented by empty
fields. `specs/0004-match-engine.md` is deleted only in PR-2 after these requirements are
implemented; the one live reference at `docs/INDEX.md:16` then points contest work to the live
`contest-engine` spec. Historical references under `openspec/changes/archive/**` remain frozen.
No other retired spec or intent document changes.

## Risks / Trade-offs

- A 40-percent per-Moment floor deliberately limits how deterministic even an extreme roster
  edge can become. Aggregation still produces a strong aggregate advantage; the fixed-seed
  thresholds will expose if the chosen floor makes development illegible or upsets too rare.
- Linear fatigue adds one balance rule beyond the old stub. It is required for energy loss
  between future consecutive Contests to matter, uses the existing scales, and is isolated in
  observable strength evidence for later tuning.
- Content now has more required numeric fields. The cost is justified because hidden defaults
  would make a new discipline depend on tactical constants and violate ADR 0003.
- Two Moments per unit intentionally permits setup pressure to be reversed by resolution. That
  creates the desired score/momentum tension but may make individual cards feel noisy; metric
  and win-rate reports expose the behavior before UI work begins.
- The result is evidence-rich rather than minimal. At the tactical maximum it remains only 48
  Moments, while replay debugging and exactly-once consequence application benefit directly.

## Migration Plan

PR-2 first changes the discipline schema, tactical content and validator tests so core receives
one closed executable rules object. It then adds public contest types and validation, weighted
strength, Moment generation, momentum, tally/outcome, consequences and continuation in focused
TDD slices. Unit/property coverage and the content-only second fixture land with their owning
behavior. The contest-only sim-harness scenario and fixed thresholds land after the public API
is complete.

After focused smoke runs, `docs/INDEX.md` moves its contest pointer from the retired stub to the
live capability and `specs/0004-match-engine.md` is removed. The branch runs format, lint,
language, typecheck and full `pnpm verify`, then `/opsx:archive contest-engine` merges the new
contest spec and sim-harness delta. Golden and baseline paths remain untouched; any later
snapshot is a separate pull request containing one `golden:` commit.
