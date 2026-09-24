## Why

Training, form and energy currently cannot affect a competitive result because core has no
way to resolve even one Contest. Issue #30 adds the smallest deterministic contest capability
that turns a Collective's performers and discipline data into an auditable moment feed, tally,
outcome and participant consequences without taking over season or career orchestration.

## What Changes

- Add a pure, domain-neutral `Contest` resolver for exactly two Collectives. It consumes a
  complete JSON-compatible input and an injected serializable contest RNG continuation, and
  returns structured `Moment` data, an independent discrete tally, the outcome, calculated
  participant consequences and the next RNG continuation.
- Calculate each performer's strength from all six stats, form, energy and the discipline's
  six declared stat weights. The tactical-shooter content keeps Adaptability and Presence out
  of Contest strength by assigning them explicit zero weights, preserving `player.md` §5.1
  without giving core a discipline-specific exception.
- Use integer-only linear probability in basis points instead of a logistic curve. Strength
  difference and bounded momentum move the next-Moment side probability, while a declared
  4,000-basis-point underdog floor limits every side selection to 40–60 percent. The random
  spread occurs only through the injected contest stream.
- Represent momentum as signed integer points from -100 through 100 relative to the first
  Collective. Every Moment retains 75 percent of the prior value, rounded towards zero, then
  applies its content-declared signed shift. Momentum influences the next side draw but never
  derives or overwrites the tally.
- Resolve the first tactical-shooter Contest as one map of at most 24 scoring units. Each unit
  emits a non-scoring setup Moment and then a scoring resolution Moment. The first side to 13
  wins; 12–12 after 24 units is a draw. Overtime, Bo3/Bo5 orchestration and a season `series`
  marking remain unsupported and are rejected rather than collapsed into one Contest.
- **BREAKING**: replace the current discipline `contest.format` value that conflates a series
  with one Contest with a validated head-to-head resolution contract: score target, unit cap,
  ordered Moment slots, momentum parameters, energy cost, stable metric ids and weighted
  Moment types. Tactical content declares an exact energy cost of 20 per participant.
- Keep Moment types and discipline semantics in content. A Moment type declares a stable id,
  slot, positive selection weight, momentum shift and participant metric deltas; results carry
  ids and numbers only, never presentation strings. A second test discipline is supplied only
  as a content fixture and resolves through the same algorithm with no branch or code change.
- Make participant consequences explicit and authoritative. The engine calculates each
  participant's bounded post-Contest energy and content-defined metric totals without mutating
  either input Collective; #45 will install those returned values once and must not subtract
  the cost or reconstruct metrics again. No stat, form or morale change is invented.
- Validate the complete input before constructing or advancing RNG state. Unsupported formats,
  malformed rules, invalid ranges, duplicate or overlapping identities and invalid participant
  state fail without changing input state or the supplied continuation.
- Add deterministic unit and property coverage plus a fixed-seed statistical harness scenario.
  Thresholds are declared before implementation and compare observable win rates; they are not
  a golden snapshot or balance baseline.
- Retire `specs/0004-match-engine.md` during PR-2 after its accepted intent has moved into the
  live OpenSpec capability. Its intervention windows and series formats remain deferred rather
  than receiving placeholder behavior.

Out of scope: selecting or materializing an opponent; `SeasonCalendarEntryId` linkage;
recording `SeasonContestFact`; applying the result to `RunState`; rewards, prize money or any
other economy effect; week advancement, recovery or recurring engagement settlement;
`advance`, `advanceSeason` or `startNextSeason`; Bo3/Bo5, points tables or battle-royale
placement; intervention windows; UI, commentator text, economy balancing; and golden or
baseline regeneration.

## Capabilities

### New Capabilities

- `contest-engine`: deterministic single-Contest resolution, data-driven strength and Moments,
  bounded momentum, discrete scoring, outcome, participant consequences, rejection purity,
  serialization and RNG continuation.

### Modified Capabilities

- `sim-harness`: a contest-only fixed-seed scenario measures stat influence, underdog wins and
  deterministic outcome distributions without advancing a week, applying career state or
  creating a golden/balance baseline.

## Impact

PR-2 will add one core contest module and exports, extend discipline schema/content and its
validator, add focused core and content tests, and add an isolated contest mode to the existing
simulation harness. It will remove the retired `specs/0004-match-engine.md` only after the
accepted delta is ready to archive and update `docs/INDEX.md` to point contest work at the live
capability.

The resolver is deliberately below season and career orchestration. Its result does not contain
or write a `SeasonCalendarEntryId` or `SeasonContestFact`; #45 will later bind one resolved
Contest to the correct calendar entry, install participant energy exactly once, apply any reward
exactly once and decide the ordering against weekly work. Resolving the last Contest does not
advance a week, complete a season or call any season operation. A `series` marking is not a
request to call this resolver once.

No accepted ADR is contradicted. Core uses only `Contest`, `Moment`, `Collective` and
`Performer` vocabulary (ADR 0001); every random choice uses one injected serialized stream and
integer arithmetic (ADR 0002); discipline weights, Moment types and meanings remain validated
data (ADR 0003). PR-1 changes only `openspec/changes/contest-engine/**` (ADR 0009).

## Player Experience (MDA / SDT)

The intended experience is a short broadcast-like arc in which initiative can swing before the
score moves, a favourite can wobble, and an underdog remains dangerous. Roster development and
energy management are the meaningful upstream decisions: weighted stats affect side and actor
selection, while the feed, momentum trace, tally and per-performer evidence make their
consequences legible. This supports competence through auditable causality, autonomy through
roster/preparation choices, and relatedness by attributing every Moment to a performer; there is
no in-Contest intervention yet, so autonomy during resolution is intentionally neutral. A
falsifiable failure signal is a fixed-seed comparison in which a uniformly stronger mechanical
lineup fails to gain the declared win-rate advantage, or players cannot tell from the returned
feed why momentum and score diverged.

## Affects

- `packages/core/src/contest.ts`
- `packages/core/src/index.ts`
- `packages/core/test/contest.test.ts`
- `packages/core/test/property/contest.property.test.ts`
- `packages/core/test/property/arbitraries.ts`
- `packages/core/test/fixtures/*.json`
- `content/schema/discipline.schema.json`
- `content/disciplines/tactical-shooter.json`
- `content/README.md`
- `tools/validate-content/src/index.ts`
- `tools/validate-content/test/validate-content.test.ts`
- `tools/sim-harness/src/**`
- `tools/sim-harness/test/**`
- `tools/sim-harness/scenarios/contest-strength.json`
- `docs/INDEX.md`
- `specs/0004-match-engine.md`
- `openspec/changes/contest-engine/**`
- `openspec/specs/contest-engine/spec.md`
- `openspec/specs/sim-harness/spec.md`

Not touched in PR-2: `packages/core/src/week.ts`, `packages/core/src/season.ts`,
`packages/core/src/incident.ts`, `openspec/specs/week-loop/**`,
`openspec/specs/season-calendar/**`, `openspec/specs/incident-engine/**`, `docs/design/**`,
`docs/adr/**`, `test/golden/**` or `sim/baseline/**`.
