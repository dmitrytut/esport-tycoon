## Purpose

The week is the unit of time in a run: a pool of attention is spent on activities, energy
and morale move, and the user advances through weeks that stop only when something worth a
decision happened.

## ADDED Requirements

### Requirement: A week spends no more slots than its pool holds

A week SHALL carry a slot pool, and the total slot cost of the activities executed in that
week SHALL NOT exceed it. An activity that does not fit the remaining pool SHALL NOT be
executed, SHALL leave every value of the run untouched, and SHALL be reported as skipped
with the reason it did not fit.

#### Scenario: Plan asks for more slots than the week holds

- **WHEN** a week with a pool of 5 slots is advanced with a plan whose activities cost 3, 3
  and 1 slots in that order
- **THEN** the first activity and the third are executed, the second is reported as skipped
  for want of slots, and 1 slot of the pool is left unspent

#### Scenario: An activity larger than the whole pool

- **WHEN** a plan places an activity costing 3 slots in a week whose pool is 2
- **THEN** the activity is never executed in that week and is reported as skipped for want
  of slots

### Requirement: Energy is paid by the participants of an activity

An activity SHALL debit its energy cost from every performer that takes part in it. A
performer whose energy is below the cost SHALL NOT take part; when no participant remains,
the activity SHALL NOT be executed and SHALL be reported as skipped for want of energy.
Energy SHALL stay within its scale, and no performer SHALL be left below the minimum.

#### Scenario: One member cannot afford the activity

- **WHEN** a collective of five is sent to an activity costing 30 energy and one member has
  14 energy
- **THEN** the other four are debited 30 each, the member with 14 keeps their energy
  unchanged and is reported as excluded, and the activity counts as executed

#### Scenario: Nobody can afford the activity

- **WHEN** every member's energy is below the cost of the planned activity
- **THEN** the activity is not executed, is reported as skipped for want of energy, and no
  slot of the pool is spent

### Requirement: The week tick is the only source of recovery

Energy and morale SHALL change only as the explicit result of advancing a week or of an
activity's effect; a performer SHALL NOT recover between two calls. Advancing one week
SHALL apply recovery exactly once per performer.

#### Scenario: Recovery is applied once

- **WHEN** a collective is advanced by one week with an empty plan
- **THEN** every performer's energy has risen by exactly the weekly recovery and nothing
  else about them has changed

#### Scenario: No recovery without a tick

- **WHEN** a run is read repeatedly without advancing a week
- **THEN** every performer's energy, morale and form are identical on every read

### Requirement: Morale is stored per performer and derived for the collective

Morale SHALL be stored on the performer only. The morale of a collective SHALL be a pure
function of its members' morale — the mean tempered towards the lowest member, with the
weights recorded in `design.md` — and SHALL NOT be a stored value of its own. An effect
described as morale for the whole collective SHALL be applied as a per-performer change to
each participant.

#### Scenario: Collective morale follows its worst member

- **WHEN** four members sit at 80 morale and the fifth drops to 10
- **THEN** the collective morale is below the mean of the five and above the lowest member

#### Scenario: A collective-wide effect lands on people

- **WHEN** an activity whose effect is morale for the whole collective is executed
- **THEN** every participant's own morale has moved, and reading the collective morale
  again returns the value derived from the changed members

### Requirement: A plan covers a block of four to six weeks

A plan SHALL cover between four and six weeks inclusive, assigning activities to each week
of the block. A plan outside that range SHALL be rejected before any week is advanced.

#### Scenario: A plan of three weeks is rejected

- **WHEN** a plan covering three weeks is submitted
- **THEN** it is rejected, and no week is advanced

#### Scenario: A plan of six weeks is accepted

- **WHEN** a plan covering six weeks is submitted
- **THEN** it is accepted, and advancing uses it week by week in order

### Requirement: Advancing stops only on a reason from the closed list

Advancing SHALL execute the plan week after week without user input and SHALL stop at the
end of the first week that produced at least one stop reason. The list of stop reasons is
closed and consists of exactly: the plan's block ran out; a planned activity was skipped; a
performer's energy crossed its threshold downward; a performer's morale crossed its
threshold downward; the money balance crossed zero downward; the calendar marks the next
week as contested; an incident awaits a choice. Advancing SHALL report the index of the
week it stopped at together with every reason that week produced. A week with no reason
SHALL pass without stopping.

#### Scenario: Quiet weeks pass in one call

- **WHEN** a block of five weeks is advanced and only week four produces a stop reason
- **THEN** weeks one through four are simulated, advancing stops at week four reporting
  that reason, and week five is not simulated

#### Scenario: A block that produces nothing stops at its end

- **WHEN** a block of four weeks is advanced and no week produces a reason
- **THEN** all four weeks are simulated and advancing stops with the reason that the block
  ran out

#### Scenario: Several reasons in the same week

- **WHEN** a week both skips a planned activity and takes a performer's energy across its
  threshold
- **THEN** advancing stops at that week and reports both reasons

### Requirement: A threshold reason fires on a downward crossing, never on a level

A reason derived from a threshold SHALL be produced only by the week in which the value
moved from at or above the threshold to below it. A value that was already below the
threshold at the start of the week SHALL NOT produce that reason again, and a value that
rose back to or above the threshold SHALL be able to produce it once more.

#### Scenario: A crisis that lasts does not stop every week

- **WHEN** a performer's morale falls below its threshold in week one and stays below it
  through weeks two and three
- **THEN** advancing stops once, in week one, and weeks two and three produce no morale
  reason

#### Scenario: Recovered and fallen again

- **WHEN** a performer's morale returns to or above the threshold and later falls below it
  again
- **THEN** the second fall produces the morale reason again

### Requirement: Sensitivity masks the optional reasons and never the core ones

Advancing SHALL accept a sensitivity mask that suppresses stop reasons. Three reasons SHALL
be unmaskable: the plan's block ran out, an incident awaits a choice, and the calendar
marks the next week as contested. Every other reason SHALL be suppressible. A suppressed
reason SHALL still be recorded in the week's result, so nothing is lost — it simply does
not stop the advance.

#### Scenario: A masked reason does not stop the advance

- **WHEN** the energy-threshold reason is masked and a performer crosses it in week two of
  a four-week block
- **THEN** advancing continues past week two, stops at the end of the block, and the week
  two result still records the energy reason

#### Scenario: A core reason cannot be masked

- **WHEN** a mask that suppresses the incident reason is submitted
- **THEN** it is rejected, and no week is advanced

### Requirement: Week kind is classified from that week alone

Every advanced week SHALL be labelled with exactly one kind: `series` when the calendar
marked it as a series of contests, `contest` when it held a single contest, `ordinary` when
it produced a stop reason or spent at least one slot, `quiet` otherwise. The kind SHALL be a
function of that week's own inputs and results only: it SHALL NOT depend on the kinds of
earlier weeks, on the distribution accumulated so far, or on any target share. Advancing
SHALL report the kind of every week it simulated.

#### Scenario: The same week classifies the same way regardless of history

- **WHEN** two runs reach an identical week — same calendar marking, same plan, same
  outcomes — after different sequences of earlier weeks
- **THEN** both label that week with the same kind

#### Scenario: A week that spends nothing is quiet

- **WHEN** a week is advanced with no activities planned, no calendar marking and no stop
  reason produced
- **THEN** the week is labelled `quiet`

#### Scenario: The distribution is an observation

- **WHEN** a season of weeks is advanced
- **THEN** the count of each kind is reported for the run, and no rule of the week loop has
  read those counts while classifying or executing a week

### Requirement: Money is credited and debited by activity effects

An activity effect on money SHALL change the run's balance by the declared amount. A
balance SHALL be allowed to go negative, and the week in which it crosses zero downward
SHALL produce the money stop reason.

#### Scenario: A stream pays

- **WHEN** an activity whose effect credits money is executed
- **THEN** the balance has risen by that amount

#### Scenario: The balance falls through zero

- **WHEN** a week's debits take the balance from a positive number to a negative one
- **THEN** the week produces the money stop reason, and a later week that stays negative
  does not produce it again

### Requirement: Advancing a week is deterministic

Advancing SHALL depend only on its inputs: the state of the run, the plan, the sensitivity
mask, the calendar and the injected random number generator. The same inputs SHALL produce
the same weeks, the same stop index, the same reasons and the same kinds. The week loop
SHALL NOT read a system random number generator or a system clock.

#### Scenario: Same seed, same plan, same result

- **WHEN** the same run is advanced twice from the same state with the same seed, plan,
  mask and calendar
- **THEN** both advances produce identical results down to every performer's state, the
  stop index, the reasons and the week kinds

#### Scenario: A different seed is allowed to differ

- **WHEN** the same run and plan are advanced with a different seed
- **THEN** the result may differ, and it is again reproducible for that seed
