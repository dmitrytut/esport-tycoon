## Context

See `proposal.md` for motivation. Three accepted capabilities already exist and stop exactly at
each other's edge:

- `season-calendar` materializes entries with stable `SeasonCalendarEntryId` values and one
  `WeekMarking` each, delegates every week to `advance`, accepts one `SeasonContestFact` per
  marked entry through `recordSeasonContestFact`, and refuses to complete while a marked entry has
  no fact. It explicitly leaves the ordering of contest effects against the week to #45.
- `week-loop` returns control on the week *preceding* a marked one with `contest-ahead`, and owns
  activities, recovery, the single recurring engagement settlement and `consecutiveNegativeWeeks`.
- `contest-engine` resolves one head-to-head Contest from a closed JSON input plus the named
  `contest` stream, and returns moments, tally, a tagged outcome, participant evidence with an
  authoritative `energyAfter`, and the stream continuation. It explicitly rejects `series` and
  states that #45 owns opponent, calendar linkage, career installation, facts and rewards.

Current shapes this change builds on: `RunState` holds `org`, `collective`, `engagements`, `week`,
`consecutiveNegativeWeeks`, `seed`, `rng` and `incidents`. `SeasonEvidence` holds number,
`startWeek`, position, `templateId`, calendar, goal, kinds, uninterrupted counters, `facts` and
`calendarRng`. `generatePerformer(rng, params)` produces a Performer with stats, `form: 0`,
`energy` in 70–100 and `morale` in 55–90 from an `OriginProfile` and a level of 1–5, spawning a
per-performer substream so neighbours do not shift. `applyOrgChange` is the only way to move
money. The shipped `standard` season template declares 24 weeks, 6–8 `contest` and exactly 2
`series`.

Design intent: `design/loops.md` sizes a season as 24 weeks with two big events and 6–8 matches;
`design/match.md` makes a normal match a Bo3 and a big event a multi-match week; `design/
disciplines.md` makes prize money the tactical discipline's economic channel; `design/acts.md`
puts meaningful prize income in act two while act one starts at zero money.

## Goals / Non-Goals

**Goals:**

- One binding from a marked calendar entry to one resolvable Contest, with no fabricated result
  for a format the engine does not support.
- A reproducible opponent that is fixed at materialization and cannot change on a second look.
- Exactly-once application of participant energy, reward and season fact, proven by a second call
  that changes nothing.
- One declared ordering against the week that keeps #31 the only owner of recurring expense and
  the negative-week count, and lets the final encounter reach the season result.
- A headless end-to-end path inside `packages/core` with no I/O and no domain vocabulary.

**Non-Goals:**

- Series, Bo3, Bo5 or big-event weeks; intervention windows; overtime.
- Standings, divisions, places, relegation, transfers or an opponent world that evolves.
- Any change to contest probability, draw semantics, metric definitions or energy arithmetic.
- Balancing reward magnitudes, starting capital or act-one viability (#52).
- Harness scenarios, reports, UI, commentator text and presentation strings.

## Decisions

### The unit is one marked entry, and a series is refused rather than faked

A `contest`-marked entry binds to exactly one head-to-head Contest. The career Collective always
takes the `first` ordered position, so the outcome mapping is a fixed table — `first-win → win`,
`second-win → loss`, `draw → draw` — with no per-encounter orientation rule to audit. The accepted
harness measurement already shows aggregate win rates differing by at most three percentage points
between orientations, so fixing the orientation costs no fairness and removes a whole class of
mapping bug.

A `series`-marked entry has no supported format. `contest-engine` rejects `series` before any draw
and states that a `series` marking is not a request to call the resolver once. This change
therefore rejects settlement of a `series` entry instead of resolving one Contest, averaging
several, or writing a default fact. The consequence is stated plainly rather than hidden: the
shipped `standard` template declares exactly two `series` weeks, so a shipped season cannot
complete under #45 alone. That is a named dependency on a separate series-format change, which
must land before the first playable season is actually completable.

The headless proof therefore uses a **non-shipped season template fixture** under
`packages/core/test/fixtures/` declaring 24 weeks, 6–8 `contest` and `series` `min: 0, max: 0`.
`season-calendar` already requires that adding another valid template be content-only, and its
schema already permits a zero range, so this needs no code or shipped-content change.

Alternative rejected: resolve a `series` entry as a best-of-three sequence of Contests here. It is
explicitly out of scope for #45 and would silently define a format — number of Contests, energy
carry-over between them, whether a Bo3 is one fact or three — that belongs to its own accepted
change. Alternative rejected: edit `content/seasons/standard.json` to drop `series` weeks. That
deletes a designed act-one feature (`design/match.md` §7.5) through a content edit, which is a
design decision and not this change's to take.

### The opponent is drawn from content and frozen at materialization

An encounter definition is a content file:

```
{ "id": "...", "label": "...", "disciplineId": "...",
  "opponent": { "originId": "...", "level": 1..5 },
  "reward": { "win": n, "loss": n, "draw": n } }
```

The caller (the domain layer, which is allowed to read files) loads and validates the pool and
passes it to core, exactly as regions, activities and disciplines already arrive. Opening an
encounter draws one definition uniformly from the pool sorted by stable id — one draw even for a
single-entry pool, so adding a second definition later does not shift the sequence for a pool of
one — then generates the participant count the discipline declares, in order, through
`generatePerformer`.

Freezing happens at materialization, not at resolution. The `pending` encounter stores the chosen
definition id, the opponent Collective identity and the complete participant list with stats,
form and energy. Reopening returns that record and moves nothing. Nothing recovers, ages or
retrains an opponent: outside its own encounter the opponent does not exist.

Generated ids are namespaced by the encounter identity, because `generatePerformer` derives its id
from origin id and draw seed and could in principle repeat a career id. Namespacing makes the
collision structurally impossible; materialization still rejects rather than resolves if an
identity somehow equals a current member's, because `contest-engine` requires globally unique
participant ids and a duplicate would otherwise surface as an opaque resolver rejection.

Repeats within a season are allowed. There is no table, bracket or elimination to violate, and
forbidding them would need a rule this change has no reason to invent.

Alternative rejected: hand-author complete opponent rosters in content. It multiplies content
weight per opponent, freezes stat values that the generator already derives from origin and level,
and gives no reproducible way to scale to more opponents. Alternative rejected: generate the
opponent at resolution time. Then a UI preview of "who you face this week" would either resolve
the Contest early or show an opponent that later changes.

### Two states, one atomic settlement

The lifecycle is `pending → settled` and nothing else. The tempting third state — resolved but not
yet applied — buys nothing and costs a separate idempotency proof for each of energy, reward and
fact, plus a reachable state where a crash or a caller mistake leaves half the consequences
applied. Presentation does not need it either: the settled encounter stores the whole
`ContestResult`, so the moment feed is replayed from stored evidence whenever the player opens it,
before or after the week advances.

Settlement is one transition: resolve the Contest, install `energyAfter`, credit the reward,
record the fact, store the `settled` encounter — or change nothing. A second call returns the
stored encounter and moves no stream, energy, balance, fact or counter. Because a marked entry
without a `settled` encounter also has no fact, `season-calendar`'s existing "missing fact holds
completion" rule is already the enforcement for "advancement must not skip a marked entry"; no new
stop reason is needed.

### Streams: `encounter` for the opponent, `contest` for the Contest, both retained in the run

Two named streams derived from the run root seed, in the pattern `contest-engine` already
declares: `encounter` for definition selection and opponent generation, `contest` for resolution.
Opening moves only the first; settling moves only the second. A subsystem that spends an extra
draw therefore cannot shift the other.

Both continuations live in `RunState`, not in season state. `season-calendar` requires every
non-season continuation to carry forward across the boundary, and encounter identity is
season-scoped while the streams are not: season two's first opponent must continue the sequence
rather than restart it. The encounters themselves are season-scoped and are stored in season
state, keyed by entry identity, reset by `startNextSeason` with the other season-owned
accumulators. That is the only reason `season-calendar` is modified at all.

Alternative rejected: keep encounters in `RunState` and clear them when a season starts. Season
lifetime state living outside the season value makes the reset a remote side effect and puts the
"what resets at the boundary" answer in two places. Alternative rejected: one shared stream for
opponent and Contest. Any future change to opponent generation would then move every Contest
result in the run.

### Consequences are installed by replacement, in a fixed order, once

Settlement applies, in this order:

1. participant energy — each career participant's energy is **replaced** by the Contest's
   `energyAfter`, never reduced by `nominalEnergyCost`; `contest-engine` states that value is
   authoritative and that a consumer must not reconstruct the delta;
2. the reward — one `applyOrgChange` with only `money`, by the amount the outcome names;
3. the season fact — one `recordSeasonContestFact` for this entry with the mapped outcome;
4. the encounter becomes `settled`, storing the full `ContestResult`.

Nothing else moves. No morale, form, stat, age or engagement change is invented: the Contest
reports none, and inventing one here would make the contest contract untrue. Metric totals are
stored exactly as returned and are never extended, recomputed or re-attributed — the known
limitation that opponent-side metrics such as `deaths` cannot be physically coherent across sides
belongs to `contest-engine` and is not papered over here. Opponent participant results stay inside
the encounter.

### The reward is data, and the draw row is permanent

The three amounts sit on the encounter definition, next to the opponent that earns them, because
opponent tier and payout move together and a separate reward-table file would need a second
identifier and a second referential check for no gain. Each amount is a non-negative value on the
existing one-tenth money grid. Negative amounts — entry fees — are deliberately excluded: a
recurring or conditional debit is `engagement-economy` and #31's territory, and admitting one here
would create a second expense owner.

`draw` is a declared row with its own amount, not a fallback. The accepted `contest-engine`
contract makes a regulation draw a permanent outcome — a 12–12 finish at the 24-unit cap, with an
accepted draw share of `choose(24,12) / 2^24` ≈ 16.1 percent at equal per-unit chance. Nothing
here is designed on the assumption that draws will later disappear, and nothing here requires the
draw semantics to change. If a future change narrows the probability clip, raises `maxUnits` or
adds overtime, this reward model keeps working with a smaller `draw` frequency and needs no
rewrite — that is the point of giving the draw its own declared amount rather than deriving it.

The magnitudes themselves are not decided here. #45 owns the structure and the exactly-once
application; #52 owns whether the numbers make act one viable against weekly activity income and
the engagement expense. The noted tension with `design/acts.md`, where meaningful prize money
belongs to act two while act one opens at zero, is a magnitude question and lands in #52 — the
mechanism has to exist before it can be tuned to near-zero or to something worth playing for.

### Settlement sits between weeks, before the marked week advances

The canonical ordering is: block advancement returns control on the preceding week with
`contest-ahead` → the caller opens and settles the current marked entry → the caller advances the
marked week. This ordering is chosen for three concrete reasons:

- the Contest reads opening energy and returns a lower one; installing it before the marked week
  means that week's single recovery applies to the post-contest value, which is the direction
  `design/match.md` describes and needs no new recovery rule;
- the reward lands before the week's recurring engagement debit, so the week's own
  `money-negative` crossing and `consecutiveNegativeWeeks` update already account for the prize,
  under #31's unchanged single-settlement rule;
- the fact is recorded while the entry is *current*, which `season-calendar` accepts, so when the
  **final** calendar week then advances and produces `season-ended`, completion already sees every
  marked entry's fact and the season completes in that same advancement. No second pass, no
  special case for the last encounter.

A late settlement — the marked week advanced first — is still accepted, because
`season-calendar` accepts a fact for an already-advanced marked entry and refusing it would make a
run unrecoverable. It applies every consequence exactly once; only the week-relative ordering
differs, and that difference is the caller's, not a second code path.

Settlement itself executes no activity, no recovery, no engagement debit and no incident, does not
touch `week` or `consecutiveNegativeWeeks`, and produces no stop reason. The negative-week count
keeps moving only at a week's close: a reward that lifts the balance between two weeks does not
reset the counter by itself.

Alternative rejected: settle after the marked week advances as the canonical order. The week would
then recover energy before the Contest spent it, the prize would arrive after that week's debit
had already been judged, and the final encounter would need an extra advancement or a special
completion path to reach the season result.

### The headless proof lives in core, not in the harness

The end-to-end check is a core test: a run and a season built on the zero-series template fixture
and an encounter pool fixture, advanced block by block, settling each marked entry before its
week, asserting a concrete opponent, a real `resolveContest` call, installed energies, credited
rewards, recorded facts, a completed season with an evaluated goal, and byte-identical repetition
from the same seed.

`sim-harness` is deliberately untouched. Its week-walk scenarios declare no contest configuration,
and its spec requires that a mechanic a run does not implement stay absent rather than appear as a
zero — so the existing scenarios keep running contest-free and unchanged. Teaching the week walk
to settle encounters means extending the policy contract, the report and the scenario schema; that
is a `sim-harness` capability decision and #52 will need it before it can measure act-one economy
with prize income. It is named here as a follow-up, not smuggled in.

## Risks / Trade-offs

- **A shipped season still cannot complete.** Two `series` weeks in `standard` have no settlement
  path. Mitigation: the gap is explicit, the E2E uses a fixture template, and a series-format
  change is named as a prerequisite for the playable-season milestone. It is not mitigated by
  fabricating a result.
- **Draw frequency is high for an economic outcome.** Roughly one in six encounters pays the draw
  amount at equal strength. Mitigation: `draw` is declared per definition, so #52 can price it
  without touching this contract, and nothing assumes draws vanish.
- **Fixed `first` orientation.** If a future rules change makes side order matter, every encounter
  inherits the same bias. Mitigation: the harness's accepted orientation check (≤3 percentage
  points) is the falsifier, and `contest-engine` owns it.
- **Opponent repeats can look odd.** The same definition may be drawn twice in one season.
  Mitigation: with no table or bracket this is cosmetic; a no-repeat rule would need its own
  gameplay justification.
- **Two continuations added to `RunState`.** Save state (#20) grows by two stream states.
  Mitigation: both are plain four-word states, already the established shape.

## Migration Plan

Additive. No existing behavior is removed or renamed. `RunState` gains two continuations and
season state gains its encounters; existing runs have neither, so PR-2 must require them
explicitly at construction rather than defaulting them, keeping ADR 0002's "no hidden seed" rule.
No golden snapshot or balance baseline is created or regenerated; if later evidence justifies one,
it is a separate pull request with a single `golden:` commit.

## Open Questions

None blocking implementation. Two decisions are recorded above rather than deferred: the series
gap is a named dependency on a separate change, and reward magnitudes are #52's with this change
owning only their structure and exactly-once application.
