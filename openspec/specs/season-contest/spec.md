# season-contest Specification

## Purpose
Season contest turns one marked calendar entry into a concrete encounter: a reproducible
opponent, one resolved head-to-head Contest, and the participant, reward and season-fact
consequences applied exactly once before time continues.

## Requirements

### Requirement: One marked entry binds to exactly one supported Contest

An encounter SHALL be identified by the `SeasonCalendarEntryId` of exactly one marked calendar
entry, and a `contest`-marked entry SHALL bind to exactly one head-to-head Contest resolved by
the accepted contest engine. The career Collective SHALL always occupy the `first` ordered
position of that Contest, so `first-win`, `second-win` and `draw` map to the season outcomes
`win`, `loss` and `draw` without a second orientation rule.

A `series`-marked entry SHALL NOT be settled by this capability. Attempting it SHALL be rejected
before any state or RNG moves, SHALL NOT resolve one Contest in its place, and SHALL NOT record a
`SeasonContestFact`. A season whose template declares `series` weeks therefore cannot complete
until a separate accepted change supplies that format; this capability SHALL NOT substitute a
single Contest, an average, a coin flip or a default outcome for it.

An entry that is unknown, unmarked or later than the current entry SHALL be rejected before any
state or RNG moves. An already settled entry SHALL instead return its stored encounter unchanged,
as specified by the idempotent lifecycle below.

#### Scenario: A contest entry resolves one Contest

- **WHEN** a `contest`-marked entry is settled
- **THEN** exactly one head-to-head Contest is resolved for that entry, with the career
  Collective in the `first` position, and its outcome maps to exactly one `win`, `loss` or `draw`
  season fact

#### Scenario: A series entry is refused, not faked

- **WHEN** settlement is requested for a `series`-marked entry
- **THEN** it is rejected, no opponent is materialized, no Contest is resolved, no fact is
  recorded, and no money, energy or RNG continuation changes

#### Scenario: A future entry cannot be settled early

- **WHEN** settlement is requested for a marked entry later than the current one
- **THEN** it is rejected and the season, run and every RNG continuation are unchanged

### Requirement: The season's opponent field is materialized once

A season SHALL hold an opponent field: exactly one materialized opponent for every definition in
the caller-supplied pool of validated encounter definitions. The field SHALL be materialized by
one explicit operation before the season's first encounter is opened, visiting the definitions in
stable id order and generating each opponent's Performers through the existing core generator
from that definition's declared origin and level. Each opponent SHALL carry exactly the
participant count its discipline declares, and each generated Performer SHALL enter every Contest
with the stats, form and energy the generator produced.

Opening an encounter while the season has no materialized field SHALL be rejected before any
state or RNG moves. Materializing a field twice for the same season SHALL be rejected rather than
replacing the existing one, so no opponent can be silently regenerated mid-season.

Every opponent Collective and Performer identity SHALL be derived from the season and its
definition id so that it cannot equal a career identity; materialization SHALL be rejected rather
than resolved if any generated identity still collides with a current collective member. An empty
pool, a duplicate definition id, a definition naming an unknown discipline, origin or level, or a
definition whose discipline is not the one the collective plays SHALL be rejected before any draw.

#### Scenario: The field exists before the first encounter

- **WHEN** an encounter is opened for a season whose field has not been materialized
- **THEN** it is rejected before any draw, and the season, run and every RNG continuation are
  unchanged

#### Scenario: A field is materialized exactly once

- **WHEN** field materialization is requested for a season that already has one
- **THEN** it is rejected, the existing opponents are unchanged, and no RNG continuation moves

#### Scenario: Generated opponents cannot be career people

- **WHEN** a field is materialized for a collective whose members were generated from the same
  origin
- **THEN** every opponent identity is distinct from every career identity, and the opponent
  Performers are absent from the collective, from engagements and from weekly recovery

#### Scenario: An empty or malformed pool is inert

- **WHEN** the supplied pool is empty, repeats a definition id, names an unknown origin or level,
  or names a discipline other than the one the collective plays
- **THEN** materialization is rejected before a draw, and the season, run and every RNG
  continuation are unchanged

### Requirement: An encounter draws one opponent from the season field

Opening an encounter SHALL select exactly one member of the season field, drawn from the field
ordered by stable definition id, and SHALL store that definition id on the encounter. A field of
one member SHALL still consume its selection draw. Opening SHALL generate no Performer: the
opponent already exists.

The same field member MAY be drawn for more than one marked entry of a season, and when it is, it
SHALL be the same Collective with the same Performers, identities, stats, form and energy as the
first time. No standing, table, seeding or elimination exists to order, forbid or advance those
meetings.

A field member SHALL be frozen for the whole season: its identity, participants, stats, form and
energy SHALL NOT change when an encounter is opened, when weeks advance, or when a Contest is
resolved. The participant consequences a Contest reports for opponent Performers SHALL stay inside
that encounter's stored result and SHALL NOT be written back to the field, because opponents
receive no weekly recovery and a one-way drain would make a repeated meeting progressively
easier.

#### Scenario: Reopening returns the same opponent

- **WHEN** an already-opened encounter is opened a second time
- **THEN** the stored definition id, opponent identity, participants, stats, form and energy are
  returned unchanged and no RNG continuation moves

#### Scenario: The same opponent is the same people

- **WHEN** the same field member is drawn for two marked entries of one season
- **THEN** both encounters name the same Collective and the same Performer identities, stats and
  form, and both Contests start from that member's materialized energy

#### Scenario: A defeated opponent is not worn down

- **WHEN** a field member has already played one Contest of the season and is drawn again
- **THEN** its participants enter the second Contest at their materialized energy, and the first
  Contest's opponent energy results remain evidence inside the first encounter only

### Requirement: An encounter has an explicit two-state lifecycle

Every encounter SHALL be one of exactly two tagged states: `pending` once its opponent exists and
no Contest has been resolved, and `settled` once its Contest result, participant consequences,
reward and season fact have all been applied. There SHALL be no state in which a Contest has been
resolved but its consequences are not yet applied: settlement SHALL be one transition that either
applies every consequence or changes nothing.

Settling an encounter that is already `settled` SHALL return the stored encounter and SHALL move
no RNG continuation, no performer energy, no balance, no season fact, no week and no season
counter. A rejected settlement SHALL leave the encounter, the run state, the season state and
both named RNG continuations byte-for-byte unchanged.

Advancement SHALL NOT skip a marked entry: a marked entry that has no `settled` encounter has no
season fact, which is already sufficient to hold season completion.

#### Scenario: Settlement is idempotent

- **WHEN** settlement is called a second time for the same entry
- **THEN** the returned result, outcome, participant energies, balance, recorded facts and both
  RNG continuations are identical to those after the first call

#### Scenario: A failed settlement applies nothing

- **WHEN** settlement rejects for any declared reason
- **THEN** no participant energy, no balance, no fact, no encounter state and no RNG continuation
  has moved

#### Scenario: An unsettled marked entry holds the season

- **WHEN** the final calendar week has advanced while one marked entry is still `pending`
- **THEN** the season does not complete, and completing it requires that encounter's settlement
  rather than an invented fact

### Requirement: Encounter randomness uses named injected streams only

Field materialization and opponent selection SHALL draw only from a named `encounter` stream
derived from the run's root seed. Contest resolution SHALL receive the named `contest` stream's
seed and current state and SHALL return its continuation, which SHALL be stored before the
settlement returns. Both continuations SHALL be retained in run state, not in season state, so
they survive the season boundary unchanged. Settlement SHALL consume no randomness of its own
beyond those two streams, and SHALL NOT read a system random number generator or a clock.

Identical run state, season state, pool, discipline rules and seed SHALL produce an identical
field, opponent, Contest result, installed energy, reward, recorded fact and both continuations.
Materializing the field and opening an encounter SHALL move only the `encounter` continuation;
settling an encounter SHALL move only the `contest` continuation.

#### Scenario: Each phase moves exactly its own stream

- **WHEN** a field is materialized, an encounter is opened and then settled
- **THEN** materialization and opening moved the `encounter` continuation and left the `contest`
  one unchanged, and settlement moved the `contest` continuation and left the `encounter` one
  unchanged

#### Scenario: Continuations survive serialization and the season boundary

- **WHEN** run state is copied through a JSON-compatible representation and a season boundary is
  crossed
- **THEN** both the `encounter` and `contest` continuations are identical afterwards, and the next
  encounter draws from the exact next values rather than from the root seed

#### Scenario: The same inputs settle the same way

- **WHEN** the same run, season, pool, rules and seed settle the same entry twice from the same
  starting state
- **THEN** the opponent, moments, outcome, installed energies, reward amount, recorded fact and
  both continuations are identical

### Requirement: Participant consequences are installed exactly once

Settlement SHALL replace each participating career Performer's energy with the `energyAfter` the
Contest reported for that Performer. It SHALL NOT subtract `nominalEnergyCost`, recompute
`energyDelta`, apply weekly recovery, or apply the value a second time. Performers of the
collective that did not participate SHALL be unchanged.

Settlement SHALL NOT change morale, form, stats, age, potential, traits or engagements, and SHALL
NOT invent a consequence the Contest did not report. Contest participant metric totals SHALL be
retained as encounter evidence exactly as returned; settlement SHALL NOT extend, recompute,
reinterpret or attribute them to a Performer other than the one the Contest named. Opponent
participant results SHALL remain inside the encounter and SHALL NOT enter career state.

#### Scenario: Energy is installed by replacement

- **WHEN** a participant entered the Contest at energy 73 and the Contest reported nominal cost
  20 and energy after 53
- **THEN** that career Performer's energy is exactly 53 after settlement, and no further
  subtraction happens at any later point

#### Scenario: A second settlement does not debit again

- **WHEN** settlement is called again for the same entry
- **THEN** every participant's energy is still the value installed by the first settlement

#### Scenario: Nothing else about a person moves

- **WHEN** an encounter is settled
- **THEN** every participant's morale, form, stats, age and traits are unchanged, and the
  opponent's Performers are absent from the collective

### Requirement: The reward is declared data applied exactly once

An encounter definition SHALL declare exactly one money amount for each of `win`, `loss` and
`draw`. Each amount SHALL be a finite non-negative value on the existing one-tenth money grid,
and `draw` SHALL be an explicit declared amount rather than an omission, a fallback or a value
derived from the other two. A missing outcome amount SHALL fail content validation; there SHALL
be no code default.

Settlement SHALL credit exactly the amount its outcome names, through one organization change, at
the moment the encounter becomes `settled`. It SHALL NOT change audience or reputation, SHALL NOT
scale the amount by audience or reach, SHALL NOT debit an engagement and SHALL NOT pay a second
time. The reward magnitudes SHALL remain content; this capability SHALL NOT balance them.

#### Scenario: Each outcome pays its declared amount

- **WHEN** the same encounter definition settles once as a win, once as a loss and once as a draw
  in separate runs
- **THEN** the balance moves by exactly the declared win, loss and draw amounts respectively, and
  a declared zero moves it by nothing

#### Scenario: Draw is a first-class declared outcome

- **WHEN** a Contest ends in a regulation draw
- **THEN** the declared `draw` amount is credited, the season fact records `draw`, and no winner,
  rematch, overtime or substitute outcome is invented

#### Scenario: The reward is paid once

- **WHEN** settlement is called twice for the same entry
- **THEN** the balance reflects exactly one credit of the declared amount

### Requirement: Settlement crosses no week boundary

Settlement SHALL be an operation between weeks. It SHALL NOT execute or re-execute a planned
activity, apply weekly energy or morale recovery, debit a recurring engagement, select or resolve
an incident, advance the week index, produce a week result or produce a stop reason. It SHALL NOT
change the run's consecutive-negative-week count: that count SHALL continue to move only when a
week closes, under its existing owner.

The canonical ordering SHALL be settlement of the current marked entry before that entry's week is
advanced, which matches the existing `contest-ahead` return of control on the preceding week.
Settlement of a marked entry whose week has already advanced SHALL also be accepted and SHALL
apply every consequence exactly once. After settlement, advancement SHALL continue from the
state settlement left, SHALL advance the marked week exactly once, and SHALL NOT re-execute any
completed week.

#### Scenario: A settled week still advances normally

- **WHEN** the current marked entry is settled and then its week is advanced
- **THEN** that week executes its plan, applies recovery once, settles its recurring engagements
  once, is classified `contest`, and the reward and installed energy are not applied again

#### Scenario: Settlement does not move the negative series

- **WHEN** a reward moves the balance from negative to positive between two weeks
- **THEN** the consecutive-negative-week count is unchanged by settlement and moves only when the
  next week closes

#### Scenario: A late settlement is still exactly once

- **WHEN** a marked week was advanced before its encounter was settled and settlement happens
  afterwards
- **THEN** the participant energy, reward and fact are applied exactly once, and that completed
  week's activities, recovery and recurring expense are not executed again

### Requirement: The season receives exactly the facts it owns

Settlement SHALL record exactly one `SeasonContestFact` for its entry, carrying that entry's
identity and one of `win`, `loss` or `draw`, and SHALL supply nothing else to the season: no
score, opponent, standing, place, prize figure, division or relegation. Goal evaluation and the
season result SHALL remain owned by the season capability and SHALL be computed only from those
facts and the existing week observations.

Because the fact is recorded while the entry is current, settling the final marked entry before
its week advances SHALL leave the season able to complete when that week produces its boundary.
Settlement SHALL NOT advance a week, complete a season or start the next one.

#### Scenario: The last encounter reaches the season result

- **WHEN** the final marked entry is settled and then the final calendar week is advanced
- **THEN** the season completes in that advancement, and its result counts that encounter's
  outcome exactly once

#### Scenario: Only the outcome crosses the boundary

- **WHEN** an encounter is settled
- **THEN** the season receives one entry identity and one outcome, and no opponent, score, prize
  or table value is stored in season evidence

#### Scenario: Settlement does not end a season

- **WHEN** the final marked entry is settled while its week has not advanced
- **THEN** no season result is produced by settlement itself, and the week loop remains the only
  owner of the boundary

### Requirement: Encounter definitions are closed validated content

An encounter definition SHALL be a data file declaring a stable id, an English player-facing
label, the discipline it belongs to, the opponent's origin id and integer level inside the
generator's accepted range, and the three reward amounts. Its discipline, origin and reward
values SHALL be validated referentially against existing content before reaching core, and
unknown fields, unknown references and out-of-range values SHALL be rejected rather than ignored
or defaulted. Adding, removing or retuning an encounter definition SHALL NOT require a code
change.

Labels SHALL remain content and SHALL NOT enter core results or any settlement branch. No
definition SHALL name a real organization, competition or person.

#### Scenario: A new opponent is content only

- **WHEN** another valid encounter definition is added to the content tree
- **THEN** it validates, can be supplied in a pool and produces an opponent through the same core
  path without a new code branch

#### Scenario: An unknown reference fails validation

- **WHEN** a definition names a discipline or origin the content tree does not define, or omits a
  reward outcome
- **THEN** content validation fails naming the file and the offending value, and no run can load
  that pool

### Requirement: The whole path is headless, neutral and serializable

Materializing a field, opening an encounter and settling one SHALL be pure state transitions
available without a user interface: they SHALL perform no I/O, read no clock and print nothing.
The field, encounter state, opponent participants, the stored Contest result and both
continuations SHALL contain only JSON primitives, arrays and objects, and a JSON round-trip SHALL
be deeply equal to the original.

Core declarations and behavior for this capability SHALL use domain-neutral `Encounter`,
`Contest`, `Collective`, `Performer` and `Season` vocabulary (ADR 0001) and SHALL NOT name a real
title, organization or person.

#### Scenario: A full season runs without an interface

- **WHEN** a season whose template declares no `series` week has its field materialized and is
  then advanced headlessly, settling each marked entry before its week
- **THEN** every encounter names a field member, a real Contest result, installed energy, a
  credited reward and one fact, and the season completes with its goal evaluated

#### Scenario: State survives a save

- **WHEN** run and season state are copied through a JSON-compatible representation between two
  encounters
- **THEN** the field, the remaining encounters, opponents, outcomes, rewards, facts and
  continuations are identical to an uninterrupted run
