## Purpose

The contest engine resolves one domain-neutral head-to-head Contest into an auditable Moment
stream, momentum trace, discrete tally, outcome, participant consequences and reproducible RNG
continuation without taking ownership of calendar, career or economy state.

## ADDED Requirements

### Requirement: One Contest has a complete serializable input

Resolution SHALL consume one JSON-compatible input containing a stable Contest id, discipline
id, one closed head-to-head rules object, ordered `first` and `second` Collective inputs and the
numeric seed plus four-word continuation state of the isolated contest RNG stream. The exported
`CONTEST_STREAM_NAME` SHALL be exactly `"contest"`; callers SHALL derive it from the run root
seed before invoking resolution. Each Collective input SHALL have a distinct stable id and
exactly the discipline roster size of participants. Each participant SHALL have a globally
unique Performer id, all six stats, form and energy; resolution SHALL NOT require a name,
presentation text, morale, traits, hidden growth fields, calendar identity, organization or
career state.

Stats SHALL be finite values on the existing 1–20 scale, form on -3–3 and energy on 0–100, all
on the existing one-decimal grid. Every input field that resolution uses SHALL survive a JSON
round-trip without normalization or recovery from process memory.

#### Scenario: JSON input resolves identically

- **WHEN** a valid Contest input is copied through a JSON-compatible representation
- **THEN** resolving the original and copied values produces identical Moments, tally, outcome,
  participant results and RNG continuation

#### Scenario: Calendar identity is not an engine input

- **WHEN** a caller prepares a valid Contest input without a `SeasonCalendarEntryId` or
  `SeasonContestFact`
- **THEN** the engine can resolve it, because #45 rather than the Contest owns calendar linkage

### Requirement: Discipline rules are a closed data contract

A discipline SHALL declare all six stat weights as integers from 0 through 100 with a positive
sum. Its Contest rules SHALL declare `head-to-head`, an integer score target from 2 through 100,
a positive integer unit cap, integer energy cost from 1 through 100, integer side-chance
coefficients, integer momentum retention in basis points, ordered unique Moment slots, stable
metric declarations and weighted Moment types. `strengthBpsPerDeciPoint` and
`momentumBpsPerPoint` SHALL be integers from 0 through 1,000; `underdogFloorBps` SHALL be an
integer from 1 through 4,999; and `momentumRetentionBps` SHALL be an integer from 0 through
10,000. The unit cap SHALL be at least the score target and at most twice one less than the
target. There SHALL be one through four slots, one through sixteen metrics and one through
sixty-four Moment types. Exactly one slot SHALL score and it SHALL be last.

Each Moment type SHALL declare a unique stable id, an existing slot id, integer selection weight
from 1 through 1,000, integer momentum shift from 1 through 100 and signed integer participant
metric deltas from -100 through 100 using declared metric ids. Every slot SHALL have at least one
reachable type. Unknown fields, slots, metrics or executable expressions SHALL be rejected
rather than ignored or interpreted as zero.

The tactical-shooter discipline SHALL declare weights `3, 1, 2, 3, 0, 0` in core stat order,
score target 13, maximum 24 units, nominal participant energy cost 20, a non-scoring `setup`
slot followed by a scoring `resolution` slot, momentum retention 7,500 basis points, and the
side-chance constants required below. It SHALL declare these metric ids and labels:
`eliminations`/“Eliminations”, `deaths`/“Deaths”, `assists`/“Assists” and
`resources`/“Resources”. It SHALL declare exactly this Moment catalog:

| id | slot | weight | momentum shift | metric deltas |
|---|---|---:|---:|---|
| `early-advantage` | `setup` | 4 | 12 | `eliminations: 1` |
| `coordinated-pressure` | `setup` | 3 | 10 | `assists: 1` |
| `resource-control` | `setup` | 2 | 8 | `resources: 2` |
| `clean-conversion` | `resolution` | 4 | 18 | `eliminations: 2`, `assists: 1`, `resources: 1` |
| `traded-conversion` | `resolution` | 3 | 14 | `eliminations: 2`, `deaths: 1`, `assists: 1` |
| `resource-conversion` | `resolution` | 2 | 12 | `eliminations: 1`, `assists: 2`, `resources: 2` |

The legacy `contest.format`, `unit`, `tally` and `participants` fields SHALL be removed.
`momentumMeans` SHALL remain required player-facing content, and the legacy `columns` labels
SHALL move onto the matching metric declarations. Labels SHALL NOT enter core results or
resolution branches. Tactical content SHALL NOT describe one Contest as Bo3 or Bo5.

#### Scenario: All six stat weights are explicit

- **WHEN** tactical discipline content is validated
- **THEN** Mechanical, Cognitive, Collective and Composure have weights 3, 1, 2 and 3, while
  Adaptability and Presence are present with weight zero rather than omitted or special-cased

#### Scenario: A slot has no reachable type

- **WHEN** a discipline declares a Moment slot with no positive-weight type
- **THEN** content validation rejects that discipline before it can reach core

#### Scenario: Executable content is closed

- **WHEN** a Moment type declares a script, formula string, unknown metric or unknown field
- **THEN** content validation rejects it rather than extending resolution implicitly

### Requirement: A content-only second discipline uses the same resolver

The implementation SHALL include a non-shipped second discipline fixture under
`packages/core/test/fixtures/` that satisfies the same schema while declaring different stat
weights, slot ids, Moment type ids, metrics and valid balance numbers. Its unit cap SHALL be
strictly below `2 * (scoreToWin - 1)` so a higher-tally win at the cap is reachable. The fixture
SHALL be validated by the same schema and referential checks that `pnpm validate:content` applies
to `content/disciplines/`, without being loaded as shipped content. Validation and resolution
SHALL dispatch only on the closed rules shape; they SHALL NOT branch on either discipline id or
tactical-shooter concepts.

#### Scenario: Second fixture requires no algorithm change

- **WHEN** the second fixture is validated and supplied with two valid Collectives and an RNG
  continuation
- **THEN** the existing resolver returns a valid result using its declared slots, types, metrics
  and numbers without a new source-code branch

### Requirement: Weighted strength is integer and auditable

Resolution SHALL convert every stat, form and energy to tenths. For each participant it SHALL
calculate fatigue penalty as `floor((1000 - energyTenths) / 20)` and each effective stat as the
participant's stat tenths plus form tenths minus that penalty, clamped to 10 through 200.
Participant strength SHALL be the half-up rounded weighted mean of all six effective stats using
the discipline weights. Collective strength SHALL be the half-up rounded arithmetic mean of its
participant strengths. Both SHALL be reported in deci-points and SHALL remain between 10 and 200.

Half-up rounding of non-negative `numerator / denominator` SHALL mean
`floor((2 * numerator + denominator) / (2 * denominator))`. Morale, traits, identity, input
array order and roster size beyond the validated exact count SHALL NOT modify strength.

#### Scenario: Discipline weights change strength

- **WHEN** two otherwise identical Collectives differ only in stats whose discipline weights are
  positive
- **THEN** their reported strengths differ by the declared weighted integer formula

#### Scenario: Zero-weight stats stay outside tactical strength

- **WHEN** tactical participants differ only in Adaptability or Presence
- **THEN** their participant and Collective strengths are equal

#### Scenario: Opening energy affects the next Contest

- **WHEN** two otherwise identical participants enter at energy 100 and energy 80
- **THEN** the second participant has exactly one fewer effective stat point before weighting,
  and no post-Contest energy cost has yet entered that strength

### Requirement: Side probability is bounded linear integer arithmetic

Before each Moment, the first Collective's chance in basis points SHALL be
`5000 + strengthDifferenceDeci * strengthBpsPerDeciPoint + momentum * momentumBpsPerPoint`,
clamped to the declared underdog floor and its complement. Tactical rules SHALL declare 30 basis
points per strength deci-point, 10 basis points per momentum point and a 4,000-basis-point floor,
so every tactical side draw is within 40–60 percent inclusive.

The side choice SHALL consume one raw uint32 and compare it to the integer threshold
`floor(firstBps * 2^32 / 10000)`. Resolution SHALL NOT use `Math.pow`, `Math.exp`, `Math.log`,
another platform-sensitive curve, a clock, system randomness or I/O, and SHALL NOT add a hidden
per-Contest strength roll.

#### Scenario: Equal sides start even

- **WHEN** equal-strength Collectives resolve the first Moment at zero momentum
- **THEN** the first-side threshold is exactly 5,000 basis points

#### Scenario: Legal extremes preserve both sides

- **WHEN** strength and momentum jointly favour either Collective beyond the tactical cap
- **THEN** the advantaged side receives 6,000 basis points and the weaker side retains 4,000,
  so neither side is unreachable

#### Scenario: One stat point has a declared scale

- **WHEN** the first Collective leads by ten strength deci-points at zero momentum under tactical
  rules
- **THEN** its unclamped chance is 5,300 basis points

### Requirement: Momentum is bounded recent pressure

Momentum SHALL start at zero and use signed integer points from -100 through 100 relative to the
first Collective. Each Moment's side probability SHALL read momentum before that Moment. After
selection, prior momentum SHALL retain the content-declared basis-point fraction rounded towards
zero, then receive the selected Moment type's shift with positive sign for the first Collective
or negative sign for the second, then clamp to the range.

Tactical content SHALL retain 7,500 basis points, or 75 percent, after every Moment. The result
SHALL report momentum before retention, the retained value, signed shift and final value for
every Moment. Tally SHALL NOT enter momentum calculation.

#### Scenario: Positive momentum decays without crossing zero

- **WHEN** a Moment opens at momentum 3 under tactical retention and the second Collective earns
  a type with shift 1
- **THEN** retained momentum is 2, signed shift is -1 and final momentum is 1

#### Scenario: Momentum remains bounded

- **WHEN** repeated Moments would move momentum beyond either endpoint
- **THEN** every reported final momentum stays from -100 through 100

#### Scenario: Score does not set momentum

- **WHEN** a Collective leads the tally but recent selected Moments move momentum to the other
  side
- **THEN** the tally leader can be reported with momentum favouring its opponent

### Requirement: Ordered slots produce structured Moments

Resolution SHALL visit units in ascending order and each unit's slots in content order. For the
tactical discipline it SHALL emit one `setup` Moment with score delta zero followed by one
`resolution` Moment with score delta one. Every Moment SHALL report index, unit, slot id, type
id, selected Collective and Performer ids, complete momentum transition, score delta, tally
after the Moment and selected participant metric deltas.

A Moment SHALL contain no label, sentence, commentator copy, rendered timestamp or other
presentation string. Presentation SHALL be able to render from stable ids and numeric evidence
without core selecting language.

#### Scenario: Tactical unit has two ordered Moments

- **WHEN** one tactical scoring unit resolves
- **THEN** the feed appends a non-scoring setup Moment and then one scoring resolution Moment for
  the same unit

#### Scenario: Feed contains data, not copy

- **WHEN** a resolved Moment is serialized
- **THEN** it contains stable ids and numeric momentum, score and metric evidence and contains no
  presentation string

### Requirement: Type, side and participant use a fixed draw order

For every Moment, resolution SHALL perform exactly three RNG operations in order: one weighted
Moment-type selection among current-slot types sorted by id, one raw uint32 side selection, and
one weighted participant selection among selected-Collective participants sorted by Performer
id. Participant weights SHALL be their positive reported strength deci-points. All three draws
SHALL occur even for one type or one participant. No other Contest calculation SHALL draw RNG.

Each weighted selection SHALL consume the one raw draw defined by the existing RNG contract.
Tactical resolution SHALL therefore consume six raw draws for every complete unit and return the
continuation immediately after the final participant draw of the final Moment.

#### Scenario: Fixed draw order yields fixed continuation

- **WHEN** identical valid input, seed and RNG continuation are resolved twice
- **THEN** every type, side, participant, Moment, outcome and returned continuation is bit-for-bit
  identical

#### Scenario: One candidate still consumes its draw

- **WHEN** a valid slot has one Moment type or a selected Collective has one participant
- **THEN** its weighted-selection position still consumes one raw draw and later choices retain
  the declared three-draw-per-Moment order

#### Scenario: Input order does not choose identities

- **WHEN** participants or same-slot Moment types are supplied in a different array order with
  every other input and RNG continuation equal
- **THEN** the result and returned continuation are unchanged

### Requirement: A participant belongs to the selected Collective

The Performer attributed to each Moment SHALL be selected only from the Collective selected by
that Moment's side draw. Its positive selection weight SHALL be its participant strength. Metric
deltas SHALL be applied to that selected participant's Contest totals only, and result totals
SHALL equal the sum of that participant's Moment deltas in ascending metric-id order.

#### Scenario: Selected participant is on the selected side

- **WHEN** any valid Contest resolves
- **THEN** every Moment's Performer id occurs in that Moment's selected Collective and never only
  in the opposing Collective

#### Scenario: Metric totals reconcile

- **WHEN** one Performer is selected by several Moment types with declared metric deltas
- **THEN** that Performer's result totals equal the signed sum of exactly those deltas

### Requirement: Discrete tally and outcome are independent from momentum

Only a scoring slot SHALL add exactly one point to its selected Collective. Non-scoring slots,
momentum value and momentum shift SHALL never add or remove a point. Resolution SHALL check
termination only after the scoring slot that completes a unit.

A Collective reaching `scoreToWin` SHALL win immediately. Otherwise resolution SHALL stop after
`maxUnits`; the higher tally SHALL win and equal tallies SHALL draw. Tactical resolution SHALL
therefore finish in 13 through 24 units and 26 through 48 Moments; reaching the tactical cap
without a thirteenth point can only produce 12–12 and SHALL draw because overtime is outside this
capability. At equal per-unit side chance, the accepted tactical draw share SHALL be
`choose(24, 12) / 2^24`, approximately 16.1 percent. The non-shipped second-discipline fixture
SHALL exercise the general higher-tally-at-cap outcome.

#### Scenario: Non-scoring pressure does not change tally

- **WHEN** a setup Moment moves momentum to either side
- **THEN** both tally values are unchanged until the resolution Moment selects one side

#### Scenario: Tactical target ends resolution

- **WHEN** either tactical Collective receives its thirteenth point
- **THEN** that unit completes, the selected Collective wins, and no later unit or RNG draw occurs

#### Scenario: Regulation can draw

- **WHEN** tactical unit 24 ends with tally 12–12
- **THEN** the outcome is `draw` and no overtime or series is invented

#### Scenario: Score leader can have negative momentum

- **WHEN** the first Collective remains ahead on tally after recent second-side Moments
- **THEN** the result may report a positive first tally lead and negative momentum without
  changing either value to reconcile them

### Requirement: Energy consequences are explicit and applied once later

Strength SHALL use every participant's opening energy. Only after successful Contest resolution,
participant evidence SHALL calculate `energyAfter = max(0, energyBefore - energyCost)` and
`energyDelta = energyAfter - energyBefore`. Tactical nominal cost SHALL be 20. Resolution SHALL
NOT mutate either input Collective or a career `RunState`, and SHALL NOT recover energy.

The participant result SHALL report opening energy, nominal cost, actual delta and final energy.
That final value is authoritative for #45 to install once; a consumer SHALL NOT subtract the
nominal cost or reconstruct the delta a second time.

#### Scenario: Full cost is calculated exactly

- **WHEN** a tactical participant enters at energy 73
- **THEN** the participant result reports nominal cost 20, delta -20 and energy after 53 while
  the input participant still has 73

#### Scenario: Energy clamps once at zero

- **WHEN** a tactical participant enters at energy 8
- **THEN** the participant result reports nominal cost 20, actual delta -8 and energy after zero,
  and resolution is not rejected for insufficient energy

#### Scenario: No double application

- **WHEN** #45 later installs the returned energy-after value into career state
- **THEN** the Contest contract requires no further subtraction, recovery or energy calculation

### Requirement: Result and continuation are complete serializable evidence

A successful result SHALL identify the Contest and discipline, ordered Collectives and strengths,
units resolved, final tally, tagged outcome, all ordered Moments, one participant result for every
input participant and the contest RNG seed/state continuation. Win outcomes SHALL identify winner
and loser ids; a draw SHALL identify neither. Arrays and metric fields SHALL use deterministic
ordering.

The input, result, each Moment and continuation SHALL contain only JSON primitives, arrays and
objects and SHALL contain no callback, class-only state, `Map`, `Set`, `undefined`, non-finite
number or I/O handle. A JSON round-trip of a result SHALL be deeply equal to the original.

#### Scenario: Result survives serialization

- **WHEN** a complete Contest result including Moments and participant evidence is copied through
  a JSON-compatible representation
- **THEN** ids, numeric evidence, outcome and RNG continuation are deeply identical

#### Scenario: Continuation resumes the stream

- **WHEN** a subsequent Contest restores the returned seed and state
- **THEN** it starts at the exact next contest-stream draw rather than at the original seed or a
  stream owned by another subsystem

### Requirement: Invalid and unsupported input rejects without movement

Resolution SHALL validate every id, roster, participant field, six-weight map, rule bound, slot,
metric, Moment type and RNG value before constructing or restoring RNG and before any consequence
calculation. Duplicate or overlapping identities, invalid numeric scales or grids, zero total
weight, malformed unit bounds, invalid chance or retention values, missing/duplicate/non-final
scoring slots and unknown slot/metric references SHALL reject with no partial result. The
contest-stream seed SHALL be an integer from 0 through `2^32 - 1`; its state SHALL contain exactly
four integers in that same range.

Only `head-to-head` is supported. A series, Bo3, Bo5, points table, multi-Collective placement or
any other format SHALL reject before RNG movement and SHALL NOT be reinterpreted as one ordinary
Contest. Rejection SHALL leave the entire input and supplied RNG seed/state byte-for-byte
unchanged.

#### Scenario: Unsupported series is inert

- **WHEN** a caller submits a `series`, Bo3 or Bo5 format to the one-Contest resolver
- **THEN** resolution rejects before a draw, returns no partial result and changes no state

#### Scenario: Invalid participant is inert

- **WHEN** a participant is duplicated across Collectives or has an off-grid or out-of-range
  stat, form or energy value
- **THEN** resolution rejects before a draw and every input and RNG word is unchanged

#### Scenario: Malformed content-shaped rules are inert

- **WHEN** plain runtime data has a zero type weight, unknown slot, unknown metric or invalid
  score/unit relation despite not passing through content validation
- **THEN** core rejects it before RNG or input state moves

### Requirement: Contest resolution has no calendar, week, season or economy side effect

Resolving a Contest SHALL NOT call `advance`, `advanceSeason`, `startNextSeason`, a clock or I/O,
or any activity, recovery, recurring engagement, incident, reward or economy operation. It SHALL
NOT write a `SeasonContestFact`, complete a season, advance a week or infer that a last Contest
ends a season. The result SHALL contain no prize or reward.

Issue #45 SHALL later select/materialize the opponent, bind the result to one
`SeasonCalendarEntryId`, install participant consequences into career state, record exactly one
`SeasonContestFact` and apply any reward exactly once. The ordering of those effects against the
week remains #45's decision.

#### Scenario: Last Contest does not end a season

- **WHEN** a resolved Contest happens to be the final marked entry of an external season
- **THEN** the result contains only Contest evidence and no week, calendar position, season state
  or completion transition changes

#### Scenario: No reward or weekly settlement

- **WHEN** any Contest resolves successfully
- **THEN** no money, prize, recurring expense, weekly recovery or week index is read or changed

### Requirement: Core vocabulary remains domain-neutral

Core production declarations and behavior for this capability SHALL use domain-neutral
`Contest`, `Moment`, `Collective` and `Performer` vocabulary. Tactical meanings, labels and type
ids SHALL remain in content. Core SHALL NOT name a real title, team or person or use
esports-specific `Match`, `Player`, `Frag` or `Tournament` concepts.

#### Scenario: A second subject can consume the contract

- **WHEN** the head-to-head rules are populated with non-esports content ids and metric ids
- **THEN** the same core types and resolver work without an esports-named field or branch

### Requirement: Deterministic tests prove invariants rather than snapshots

Unit and property verification SHALL cover exact strength arithmetic, probability bounds,
momentum retention/clamping, independent scoring, every outcome, participant membership, metric
reconciliation, energy evidence, input-order invariance, exact RNG order, success/failure purity
and JSON continuation. Property runs SHALL use the repository's globally pinned fast-check
configuration in `tests/setup/fast-check.ts` (ADR 0014) rather than a per-test seed. They SHALL
assert observable results and invariants rather than private helper formulas except where the
formula itself is the public contract.

No implementation or verification in this change SHALL create or update a golden snapshot or
balance baseline. If a snapshot is later required, it SHALL be a separate pull request with one
`golden:` commit.

#### Scenario: Determinism is proved without golden regeneration

- **WHEN** PR-2 verification runs identical inputs under the globally pinned property-test
  configuration
- **THEN** public results and continuations match exactly, invariant checks pass, and golden and
  baseline paths remain unchanged
