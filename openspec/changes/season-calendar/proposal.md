## Why

The week loop can advance time but nothing owns a season, produces its calendar markings,
announces a goal, or closes the season with an auditable result. Issue #29 supplies that
missing time boundary so contests, failure rules, snapshots and season-scale simulation have
one deterministic contract to integrate with.

## What Changes

- Add a domain-neutral `Season` with an explicit number, fixed length, current position,
  materialized calendar, announced goal, accumulated observations and active/completed state.
- Build each calendar deterministically from a validated content template and an injected,
  serializable season-calendar RNG stream. The template declares the length and the complete
  count range for every supported marking; code supplies no balance defaults.
- Use `docs/design/loops.md` as the source for the first template: 24 weeks, exactly 2
  `series` weeks and 6–8 `contest` weeks. This consciously rejects the 20%/5% calendar split
  in `docs/design/week.md` §6.3; that table remains an unresolved intent-document correction
  and is not edited in this change.
- **BREAKING**: make the existing week-loop `advance` consume the active season's materialized
  markings instead of accepting an optional caller-owned calendar. The week loop remains the
  sole owner of executing weeks and returning control; season code supplies time, records the
  returned results and prevents a plan from crossing the season boundary.
- Keep `WeekKind` unchanged as the structural classification of one week. Separately count
  `uninterruptedWeeks` from actual block advancement: every simulated week before the one
  that returns control counts; the returned final week does not, including a week whose only
  reason is `block-ran-out`. A masked reason does not interrupt an earlier week.
- **BREAKING**: align the sim-harness report with that return-of-control definition. Planning
  block length is therefore an explicit gameplay input to the metric rather than something
  the report normalizes away.
- Accept a declared `minimum-contest-wins` goal when a season is created; do not derive one
  from organization state and do not invent standings or relegation. Evaluation consumes
  exactly-once factual contest outcomes keyed to stable calendar entries, a contract #45 will
  fulfill without #29 implementing a contest.
- Return a structured season result containing the season number, announced goal, whether it
  was achieved, completed contest facts, existing `WeekKindCounts`, and uninterrupted count,
  total and share.
- Preserve organization, collective and performer state across the boundary. Reset only the
  calendar, goal, relative position and season accumulators when the caller explicitly starts
  the next season. A season boundary does not call `advanceYear`; seasons and years are
  independent clocks.
- Define the state #20 must later include in `RunSnapshot`: active/completed season tag,
  season number and relative position, template content id, materialized calendar, goal,
  accumulated kind and interruption counts, recorded contest facts, completed result when at
  the boundary, and the season-calendar RNG state alongside the root seed.

Out of scope: contest simulation, opponent selection, contest prizes and economy, transfer
mechanics, divisions and relegation, UI, economy balancing, file persistence, and any
implementation in this proposal pull request.

## Capabilities

### New Capabilities

- `season-calendar`: season lifecycle, template-driven deterministic calendar generation,
  declared goal and factual evaluation, structured result, boundary carry/reset rules and
  snapshot-owned season state.

### Modified Capabilities

- `week-loop`: advancement reads the active season calendar, cannot cross its boundary, and
  exposes the actual return-of-control observations the season accumulator consumes without
  changing `WeekKind`.
- `sim-harness`: uninterrupted weeks follow actual block returns, including the final
  `block-ran-out` week as interrupted, while remaining separate from week-kind counts.

## Impact

The core public surface gains separate authoritative season state, while `RunState.week`
remains the absolute clock the week loop owns. Existing block-advance callers migrate in one
cutover to the bounded `SeasonCalendar`; season-aware callers construct a season from a
validated template and declared goal, then use the coordinator that delegates to the same
week-loop advancement API without a parallel raw marking list. The content tree gains season
templates and validation. The sim harness changes only where its week-by-week walk records
declared block returns and reports the interruption metric; it does not become the owner of
calendar or goal rules.

The main compatibility risk is deliberate: the accepted sim-harness contract currently
normalizes `uninterruptedWeeks` across four- and six-week blocks, while issue #29 defines the
last week of every block as a return of control. This change modifies that requirement rather
than creating a second metric with the same name.

No accepted ADR is contradicted. Core stays domain-neutral (`Season`, `Contest`, `series`),
randomness remains injected and serializable, and core receives already loaded template data
rather than reading content files.

## Player Experience (MDA / SDT)

The season gives the player a readable arc: upcoming heavy weeks make block planning matter,
an announced goal makes the stakes explicit, and the final result explains success or failure
from recorded facts rather than hidden scoring. This should support autonomy through timing
choices and competence through deterministic, legible feedback; it adds no new interpersonal
mechanic, so relatedness is neutral. A falsifiable failure signal is a full-season playtest in
which the player never changes one planned activity in response to a visible upcoming
`contest` or `series` week: the calendar would then be chronology without a meaningful
decision.

## Affects

- `packages/core/src/season.ts`
- `packages/core/src/week.ts`
- `packages/core/src/index.ts`
- `packages/core/test/season.test.ts`
- `packages/core/test/week.test.ts`
- `packages/core/test/property/season.property.test.ts`
- `packages/core/test/property/arbitraries.ts`
- `packages/core/test/purity.test.ts`
- `content/seasons/*.json`
- `content/schema/season.schema.json`
- `content/README.md`
- `tools/validate-content/src/index.ts`
- `tools/validate-content/test/validate-content.test.ts`
- `tools/sim-harness/src/run.ts`
- `tools/sim-harness/src/report.ts`
- `tools/sim-harness/test/**`
- `docs/INDEX.md`
- `openspec/changes/season-calendar/**`
- `openspec/specs/season-calendar/spec.md`
- `openspec/specs/week-loop/spec.md`
- `openspec/specs/sim-harness/spec.md`

Not touched: `docs/design/**`, `docs/adr/**`, `specs/**`, `test/golden/**`,
`sim/baseline/**`, contest calculation, opponent generation, prize application, transfer
mechanics, divisions, relegation, UI or persistence.