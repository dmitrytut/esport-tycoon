# season-calendar Specification

## Purpose
A season turns consecutive week ticks into a deterministic calendar arc with an announced
objective, auditable progress, a structured result and an explicit boundary before the next
season begins.

## Requirements

### Requirement: A season template declares the whole calendar shape

A season template SHALL be data identified by a stable content id. It SHALL declare a
positive length and inclusive minimum and maximum counts for each supported marked-week kind,
`contest` and `series`; unselected weeks SHALL be marked `none`. Every count SHALL be a
non-negative integer, each minimum SHALL NOT exceed its maximum, and the sum of maximums SHALL
NOT exceed the season length. Calendar construction SHALL have no fallback length, marking
count or balance default outside the template. Adding another valid template SHALL NOT require
a code change.

The first playable template SHALL declare 24 weeks, exactly 2 `series` weeks and between 6
and 8 `contest` weeks inclusive.

#### Scenario: First playable template supplies the season rhythm

- **WHEN** the first playable season template is loaded
- **THEN** its length is 24, its `series` range is 2 through 2, and its `contest` range is 6
  through 8

#### Scenario: Maximum markings do not fit

- **WHEN** a template of 10 weeks permits up to 3 `series` and 8 `contest` weeks
- **THEN** the template is rejected before a calendar or RNG state is changed

#### Scenario: A new valid template is content-only

- **WHEN** another template declares a different valid length and marking ranges using the
  same schema
- **THEN** it can be validated and supplied to season construction without extending the
  calendar generator

### Requirement: Calendar construction is deterministic and materialized

Constructing a season SHALL take its number, absolute starting week, template and injected
serializable season-calendar RNG state as explicit inputs. It SHALL return a calendar
entry for every relative week and the RNG continuation after construction. Every entry SHALL
carry a stable identity, its relative and absolute week, and exactly one existing
`WeekMarking`. The selected count of each marked kind SHALL lie inside the template's declared
range, and no week SHALL receive two entries or two markings.

The materialized entries and the returned RNG state SHALL be authoritative for the current
season: later advancement SHALL NOT regenerate them. The system SHALL NOT read a system RNG
or clock (ADR 0002).

#### Scenario: Same inputs produce the same calendar and continuation

- **WHEN** the same season number, starting week, template and season-calendar RNG state are
  used twice
- **THEN** both constructions return identical entries, markings, stable identities and RNG
  continuation

#### Scenario: A different stream state remains reproducible

- **WHEN** a season is constructed twice from another identical RNG state
- **THEN** those two calendars and continuations are identical to each other, whether or not
  their markings differ from the first state

#### Scenario: Every declared week is materialized once

- **WHEN** a 24-week calendar is constructed with 2 `series` weeks and a selected count of 7
  `contest` weeks
- **THEN** it contains 24 ordered entries: 2 marked `series`, 7 marked `contest`, 15 marked
  `none`, and no repeated identity or week

### Requirement: Season advancement delegates week execution to the week loop

Advancing an active season SHALL make exactly one call to the existing block `advance`
contract with the season's materialized calendar. Season advancement SHALL NOT execute an
activity, recover a performer, classify a week, select an incident or reproduce a stop rule.
It SHALL fold only the `AdvanceResult` returned by the week loop into season progress.

Season advancement SHALL NOT require a contest fact at a fixed point relative to weekly
activities or recovery. A fact MAY be submitted for the current marked entry before it is
advanced or for an already advanced marked entry; the ordering of contest effects against
the week belongs to #45. Advancement SHALL stop after the final calendar week and SHALL NOT
execute a week belonging to the next season. The season SHALL NOT complete until every marked
entry has exactly one factual result.

#### Scenario: Calendar marking stops preparation through the existing loop

- **WHEN** an active season advances a block whose next week is marked `contest`
- **THEN** the week loop returns control on the preceding week with its existing
  `contest-ahead` reason, and season code does not simulate either week itself

#### Scenario: A marked opening week keeps its marking

- **WHEN** the first entry of a season is marked `series`
- **THEN** there is no prior in-season preparation week, and advancing that entry passes
  `series` to the existing week classification without inventing an earlier stop

#### Scenario: A fact can arrive on either side of weekly execution

- **WHEN** #45 submits one result for the current marked entry before weekly execution or for
  that entry after weekly execution
- **THEN** either ordering records the same season fact once, and season code does not decide
  contest energy, activity or recovery ordering

#### Scenario: A plan extends past the season

- **WHEN** a valid block plan has weeks remaining after the final calendar entry
- **THEN** only weeks through the final entry are executed, control returns with the season
  boundary reported, and the remaining planned weeks are not executed

### Requirement: A season goal is declared and evaluated from factual contest results

Season creation SHALL require a declared goal and SHALL NOT derive one from organization or
performer state. The initial goal kind SHALL be `minimum-contest-wins` with an integer target
from zero through the number of marked calendar entries. A contest fact SHALL identify one
marked calendar entry and carry exactly one outcome: `win`, `loss` or `draw`. Both `contest`
and `series` entries contribute one final fact; the season contract SHALL NOT calculate the
contests inside a series, an opponent, a score, standings, prizes or relegation.

A fact SHALL be accepted only for a marked entry that is current or already advanced and only
once. An unknown, unmarked, future or already-recorded entry SHALL be rejected before state or
RNG moves. Goal evaluation SHALL count only recorded `win` outcomes and compare the count to
the declared target. Completion SHALL wait until every marked entry has one fact.

#### Scenario: Declared win target is achieved

- **WHEN** a completed season has goal `minimum-contest-wins: 5` and its recorded facts contain
  5 wins, 2 losses and 1 draw
- **THEN** the goal is reported as achieved

#### Scenario: Declared win target is missed without an invented consequence

- **WHEN** a completed season has goal `minimum-contest-wins: 5` and only 4 recorded wins
- **THEN** the goal is reported as not achieved, and no division, relegation or other penalty
  is invented

#### Scenario: Duplicate fact is rejected

- **WHEN** a second contest fact is submitted for an entry that already has one
- **THEN** it is rejected and the stored facts and every RNG stream remain unchanged

#### Scenario: Missing fact holds season completion

- **WHEN** the final calendar week has advanced but one marked entry has no contest fact
- **THEN** no `SeasonResult` is produced, no further week can advance, and submitting the
  missing fact permits deterministic completion

#### Scenario: Goal cannot require more wins than scheduled entries

- **WHEN** a goal target exceeds the number of `contest` and `series` entries in the
  materialized calendar
- **THEN** season creation is rejected before the season becomes active

### Requirement: The season result is structured and auditable

After the final calendar week has advanced and every marked entry has a fact, the season SHALL
produce a data result containing the season number,
template id, declared goal, achieved flag, contest facts in calendar order, existing
`WeekKindCounts`, and uninterrupted count, total and share. The total for the uninterrupted
share SHALL equal the number of advanced weeks, and a zero total SHALL yield a share of zero.
The result SHALL NOT print, format or infer a standing, prize, division or transfer outcome.

The four week-kind counts SHALL sum to the number of advanced weeks. The uninterrupted count
SHALL follow actual returns of control and SHALL remain separate from the `quiet` count.

#### Scenario: Ordinary work can be uninterrupted

- **WHEN** a planned activity makes a week `ordinary` and block advancement does not return
  control on that week
- **THEN** the result increments `ordinary` and `uninterruptedWeeks` separately

#### Scenario: The final week of a block returns control

- **WHEN** a block reaches its last planned week without another unmasked reason
- **THEN** that week contributes its `WeekKind` but does not increment `uninterruptedWeeks`

#### Scenario: Result counts reconcile

- **WHEN** a 24-week season completes
- **THEN** its four kind counts total 24, its uninterrupted total is 24, its uninterrupted
  count is between 0 and 23 inclusive, and its share equals count divided by total

### Requirement: The season boundary preserves the run and resets only season-owned state

A completed season SHALL retain its immutable result until the caller explicitly starts the
next season. Starting the next season SHALL increment the season number, begin at the run's
next absolute week, construct a new calendar, install the newly declared goal, and reset the
relative position, week-kind counts, interruption counts and contest facts.

Organization state, collective membership, every performer field including energy, morale,
form and age, incident lifecycle state, and every non-season RNG continuation SHALL carry
forward unchanged. Starting the next season SHALL be rejected while an incident choice or
other required resolution from the completed season remains pending.

#### Scenario: People and organization carry across the boundary

- **WHEN** season 2 starts after season 1 completed with changed balance, audience, performer
  energy, morale and form
- **THEN** season 2 begins with those exact values and with fresh season-owned accumulators

#### Scenario: Pending resolution holds the boundary

- **WHEN** the final week completed with an unresolved incident
- **THEN** the season result remains available, but starting the next season is rejected until
  that incident is resolved

#### Scenario: Starting the next season is explicit

- **WHEN** a season is complete and no next-season operation is requested
- **THEN** repeated reads return the same completed result and no calendar or RNG state moves

### Requirement: A season boundary is not a year boundary

Completing or starting a season SHALL NOT call `advanceYear`, change a performer's age, or
apply any age-curve stat change. Year advancement SHALL remain an explicit, independent
operation whose future calendar owner is outside this change.

#### Scenario: Two seasons do not imply two birthdays

- **WHEN** two season boundaries are crossed without an explicit year advancement
- **THEN** every performer's age and age-curve stats are unchanged by those boundaries

#### Scenario: Explicit year advancement remains independent

- **WHEN** `advanceYear` is applied separately between two seasons
- **THEN** its existing age and stat changes occur exactly once and season numbering is
  unaffected

### Requirement: All continuation-bearing season state is explicit

The authoritative season state SHALL be a tagged active or completed value. It SHALL retain
the season number, absolute starting week and relative position, template content id,
materialized calendar, declared goal, accumulated `WeekKindCounts`, uninterrupted count and
total, recorded contest facts, season-calendar RNG continuation, and the completed result at
the boundary. No one of those values SHALL be recoverable only from process memory or a
system clock.

These fields SHALL define the season-owned portion that issue #20 later includes in
`RunSnapshot`, together with the run's root seed. Derived shares and the achieved flag MAY be
recomputed only from the retained authoritative values and SHALL produce the identical
result.

#### Scenario: Restored state has the same continuation

- **WHEN** an active season value and its run state are copied through a JSON-compatible
  representation and advancement resumes with the same decisions
- **THEN** the remaining calendar, contest acceptance, RNG continuation and final result are
  identical to uninterrupted advancement

#### Scenario: Completed state preserves its evidence

- **WHEN** a completed season value is inspected before the next season starts
- **THEN** its goal, calendar, facts, counts, RNG continuation and result are all still
  present without regenerating any of them
