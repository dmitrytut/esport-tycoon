## Context

See `proposal.md` for motivation. The week loop already owns activity execution, recovery,
incident selection, stop reasons and `WeekKind`; `AdvanceOptions.calendar` is only an optional
array indexed by absolute week. `RunState.week` is the absolute next week, while the harness
also walks `executeWeek` directly to retain per-week state.

Two accepted records deliberately disagree about uninterrupted weeks. `week-loop` appends
`block-ran-out` to the last week returned by `advance`; `sim-harness` omits that synthetic
reason and currently defines interruption only from a week's own reasons so the metric is
invariant to block length. Issue #29 explicitly chooses the actual-return meaning, including
the block's last week as interrupted.

The intent documents also disagree about calendar rhythm. `loops.md` gives a concrete season
of 24 weeks, 2 large series and 6–8 contests. `week.md` §6.3 gives approximate shares that
would imply roughly 1 series and 5 contests. Neither intent document may be edited in this
change.

## Goals / Non-Goals

**Goals:**

- One authoritative, serializable season value with a materialized calendar and auditable
  result.
- A thin season coordinator that delegates every week rule to `advance` rather than growing a
  second loop.
- Calendar balance expressed as validated data while selection remains reproducible by an
  injected RNG stream.
- A minimal factual result contract that #45 can satisfy without coupling the season to a
  contest engine or standings table.

**Non-Goals:**

- Calculating a contest or series, choosing opponents, applying rewards, or defining ordering
  between contest energy and weekly recovery.
- Deriving goals from organization strength, introducing standings, or applying a failed
  goal's eventual relegation consequence.
- Making a season equal a year, adding a transfer window mechanic, or resetting performer
  condition for convenience.
- Adding persistence I/O. The state inventory is for #20; it is not a save format.

## Decisions

### `Season` is separate authoritative state around `RunState`

`RunState.week` remains the absolute simulation clock used by weeks and incidents. `Season`
owns a bounded view of that clock and is a tagged union:

- active: season number, absolute start, relative next position, template id, materialized
  calendar, goal, accumulated kind/interruption counts, contest facts and calendar RNG state;
- completed: the same evidence plus the immutable `SeasonResult`.

Keeping the values separate avoids embedding a season into `executeWeek`, which the harness
uses for a deliberately seasonless weekly measurement. It also avoids duplicating the
absolute week: relative position is checked against `RunState.week - calendar.startWeek` on
every season operation. A mismatch fails before mutation.

`advanceSeason(runState, season, plan, options)` validates the season-specific preconditions,
calls the existing `advance` exactly once, and folds its returned `weeks` and `kinds` into a
new `Season`. It neither calls `executeWeek` itself nor interprets an activity or incident.
This wrapper is orchestration, not a second week engine.

Alternative rejected: put `Season` inside `RunState`. That would force the week-only harness
to invent a calendar and goal merely to call `executeWeek`, and it would make the low-level
week primitive own a lifecycle it does not use.

### Calendar is a content template plus a seeded materializer

`SeasonTemplate` carries a stable content id, length, and inclusive count ranges for
`contest` and `series`. The first file declares 24, `series: 2..2`, `contest: 6..8`, taking
the concrete counts from `loops.md`. No code constant supplies a missing value. A new format
using the same two markings is a new data file; a genuinely new marking remains a code and
schema change because `WeekMarking` is intentionally closed.

Generation has a fixed draw order so replay is portable:

1. draw the `series` count, then the `contest` count, inclusively from their declared ranges;
2. shuffle relative week indexes once with the injected season-calendar stream;
3. assign the first indexes to `series`, the next indexes to `contest`, and the rest to
   `none`;
4. restore chronological order and derive each stable entry id from season number and
   relative week.

This permits clustering. A spacing rule has no support in the intent layer; inventing one
would be a hidden balance decision. If seed reports show bad clustering, the template schema
can gain explicit placement constraints in its own proposal.

Alternative rejected: a complete calendar in content. It would make the seed irrelevant.
Pure generation with hard-coded counts is also rejected: adding a league format would require
code, contrary to ADR 0003.

### The calendar RNG is an independent serialized stream

The caller derives one named `season-calendar` stream from the run's root seed and supplies
its `RngState`. Season construction returns and stores the continuation after materializing
the full calendar. Starting the next season restores that continuation; week and incident
streams never move. Both the materialized calendar and continuation are retained: the former
prevents content or algorithm changes from rewriting the current season, and the latter
reproduces future season construction.

The #20 inventory is therefore: root seed in the run; season tag, number, absolute start and
relative position; template id; full calendar entries; goal; kind counts; interruption count
and total; contest facts; completed result when present; and the season-calendar `RngState`.
Derived share and achieved flag need not be stored if #20 proves they recompute identically.

### Block and one-week advancement receive different calendar inputs

Replace the optional raw array shared through `AdvanceOptions` with two explicit contracts.
`executeWeek` receives the current entry's required `WeekMarking`; the week-only harness
passes `none` explicitly and remains independent of season lifecycle. Block `advance` receives
the bounded `SeasonCalendar`, resolves both current and next markings against absolute
`RunState.week`, and passes only the current marking to `executeWeek`.

`advance` still produces `contest-ahead` on the unmarked preparation week before a marked
entry. Season facts may be recorded for the current entry before weekly execution or for an
already advanced entry. This deliberately leaves #45 free to place contest effects before or
after weekly activities and recovery while giving goal evaluation one exactly-once fact.

The final calendar entry adds a new unmaskable `season-ended` reason. `advance` stops there
even when the plan has more weeks; it returns every coincident reason, including
`block-ran-out` or `incident-pending`. If a marked entry still lacks a fact, the active season
stays at its boundary and no further week can run; the last missing fact deterministically
creates the result. A final-week incident may be resolved after the result exists, but
`startNextSeason` rejects while it remains pending, so the decision cannot leak across the
boundary.

Alternative rejected: slice or shorten the plan in the season coordinator. Plans remain valid
four-to-six-week decisions, and only the week loop decides where execution stops.

### `WeekKind` and `uninterruptedWeeks` answer different questions

`WeekKind` is untouched: marking wins, otherwise activity/reason makes `ordinary`, otherwise
`quiet`. It is counted from every returned `WeekResult`.

For an `AdvanceResult` of N weeks, the first N-1 weeks were passed without returning control;
the last is the return point and is interrupted, even if its only reason is
`block-ran-out`. The season coordinator therefore adds N to the interruption total and N-1
to `uninterruptedWeeks`. Masked reasons on earlier weeks remain visible in their immutable
results but do not change the count because they did not return control.

The sim harness walks one week at a time, so it mirrors the same observation from its declared
block boundaries and unmasked reasons. An earlier unmasked reason does not move the original
block-end boundary because the live harness contract carries the rest of that plan forward.
A horizon that stops inside a block is measurement truncation, not a return of player
control, so its last week remains uninterrupted absent another reason. This intentionally
replaces the old block-invariant definition without adding a third metric or renaming either
existing concept.

### The goal is declared, closed and based on minimal facts

The initial `SeasonGoal` is the closed variant `minimum-contest-wins` with an explicit integer
target. It is supplied when the season starts; core does not infer difficulty from an org or
silently default a target. The target cannot exceed the materialized count of marked entries.
This is an honest executable goal before standings and divisions exist; the `top-8` intent in
`failure.md` waits for a standings owner rather than receiving a fabricated place.

`SeasonContestFact` contains only calendar entry id and `win | loss | draw`. A `series` entry
also supplies one final fact: #45 may need a later series-format dependency to produce it,
but #29 does not pretend the individual contests happened. Facts are accepted for the current
marked entry or an already advanced marked entry, exactly once; a future entry is rejected.
Opponent, tally, reward and applied flags belong to #45 and #20, not to goal evaluation.

Once the final week and every fact exist, the result keeps facts in calendar order, making
`achieved` auditable as `wins >= target`. Failure has no automatic consequence in this
change.

Alternatives rejected: a generic string metric makes unsupported goals constructible; a
callback makes goal logic unserializable; `top-8` invents a standings table that no accepted
capability produces.

### The boundary carries the run and replaces season-owned fields

Completion retains a `SeasonResult` with number, template id, goal, achieved flag, ordered
facts, `WeekKindCounts`, uninterrupted count, total and numeric share. An active season may
sit at its final boundary while facts remain missing, but it cannot advance another week.
Starting the next season is an explicit operation over a completed season. It increments the
season number, uses the run's next absolute week, materializes a new calendar, installs a
caller-supplied goal and zeroes only season accumulators.

The returned `RunState` is carried unchanged: org, collective, energy, morale, form, incident
state and non-season RNG remain exactly as the final week or later incident resolution left
them. `advanceYear` is never called. A future calendar capability can call it at a genuine
year boundary; season count alone carries no such information.

### Rhythm conflict is resolved in favor of concrete counts

The shipped template follows `loops.md`: 24 weeks, exactly 2 `series`, 6–8 `contest`. For a
24-week season those are 8.3% and 25–33%, so the 5%/20% rows in `week.md` §6.3 are not treated
as generator targets. The earlier week-loop proposal already chose `loops.md` as the concrete
source while deferring the generator; this change closes that deferral.

`docs/design/week.md` remains textually inconsistent because intent changes require explicit
human authorization. A separate design-document PR should change those two percentages or
label them as obsolete time-budget examples. That documentation follow-up does not leave the
runtime behavior ambiguous and is not part of PR-1 or PR-2 for #29.

## Risks / Trade-offs

- **Random shuffling clusters heavy weeks.** Accepted rather than hiding an invented spacing
  rule; deterministic seed reports expose the distribution for a later balance decision.
- **The first goal is not the intended top-8 goal.** It is the smallest goal supported by
  facts #45 can provide without divisions. The closed union makes a standings goal an
  explicit future extension, not an accidental string.
- **Uninterrupted counts now depend on block length.** Deliberate: the metric answers how
  often the player receives control, and block length controls that cadence. Reports state
  the block length beside the metric.
- **A completed season can coexist with a final pending incident.** The result is immutable,
  but the next season is held until resolution; tests pin that no effect is lost or applied
  twice.
- **Two clocks can drift.** Every coordinator call checks relative position against absolute
  run week before doing work, and property tests exercise monotonic progress and rejection of
  mismatches.

## Migration Plan

PR-2 adds season content and validation first, then the core season value and generator,
then splits the one-week and block option contracts, makes `advance` require the bounded
calendar, and migrates every core test and caller. The sim harness keeps its week-horizon
mode: it passes `none` explicitly to `executeWeek`, while its virtual return-of-control metric
uses declared block boundaries. `docs/INDEX.md` gains the live season capability in the
weekly-cycle row.

After behavior and callers pass, `openspec archive season-calendar -y` merges all three
deltas. No live spec is edited by hand, no golden or baseline is regenerated, and the stale
percentages in `docs/design/week.md` remain for a separately authorized documentation PR.
