## MODIFIED Requirements

### Requirement: Advancing stops only on a reason from the closed list

Advancing SHALL execute the plan week after week without user input and SHALL stop at the end
of the first week that produced at least one stop reason. The list of stop reasons is closed
and consists of exactly: the plan's block ran out; the active season ended; a planned activity
was skipped; a performer's energy crossed its threshold downward; a performer's morale crossed
its threshold downward; the money balance crossed zero downward; an engagement reached its
exclusive end; the active season calendar marks the next week as contested; an incident awaits
a choice. Advancing SHALL report the index of the week it stopped at together with every reason
that week produced. A week with no reason SHALL pass without stopping.

The calendar SHALL be a required materialized season calendar with an absolute starting week
and a finite entry for every season week. Advancing SHALL read markings from that calendar;
it SHALL NOT accept a parallel caller-authored marking list. It SHALL add `season-ended` to
the final calendar week's reasons and SHALL NOT execute a planned week after that boundary.

For lookahead only, the week after the final calendar entry SHALL resolve as `none`; the
current final entry still produces `season-ended`, so that out-of-range week is never
executed under the completed calendar.

When incident input is present, one eligible incident MAY be selected after the week's
activities, recovery, recurring engagement settlement and other reasons have been produced. A
selected incident SHALL be stored in run state and SHALL add `incident-pending` to that same
week's reasons. Advancing SHALL validate the engagement coverage invariant defined by
engagement economy before validating or executing the plan, and SHALL fail there when the input
state already has a pending incident or an unresolved expired engagement for a current member.

`engagement-expired` SHALL be unmaskable. It SHALL be produced on the last paid week for each
engagement whose `endsBeforeWeek` equals the run's next week after advancement. That last paid
week SHALL complete and advance time normally. No uncovered following week SHALL execute until
each expired engagement is renewed or terminated.

#### Scenario: Quiet weeks pass in one call

- **WHEN** a block of five weeks is advanced and only week four produces a stop reason
- **THEN** weeks one through four are simulated, advancing stops at week four reporting that
  reason, and week five is not simulated

#### Scenario: A block that produces nothing stops at its end

- **WHEN** a block of four weeks is advanced and no week produces another reason
- **THEN** all four weeks are simulated and advancing stops with the reason that the block
  ran out

#### Scenario: Several reasons in the same week

- **WHEN** a week both skips a planned activity and takes a performer's energy across its
  threshold
- **THEN** advancing stops at that week and reports both reasons

#### Scenario: A selected incident stops the block

- **WHEN** the incident cadence succeeds after week two of a four-week block
- **THEN** week two reports `incident-pending` with the selected incident and target,
  advancing stops there, and weeks three and four remain unexecuted

#### Scenario: Pending state cannot advance

- **WHEN** block advancement is called with an unresolved incident already in run state
- **THEN** it fails before plan validation, and no week or random stream moves

#### Scenario: The next marked week returns control before it

- **WHEN** a block reaches an unmarked week whose following calendar entry is marked
  `contest`
- **THEN** the unmarked week reports `contest-ahead`, advancing returns after that week, and
  the marked week remains unexecuted

#### Scenario: The season boundary truncates a valid block

- **WHEN** a valid six-week plan starts three weeks before the active season ends and no
  earlier reason stops it
- **THEN** three weeks are simulated, the last reports `season-ended`, and the other three
  planned weeks remain unexecuted

#### Scenario: The last paid week returns control

- **WHEN** an engagement covers weeks 3 through 6 and week 6 is advanced
- **THEN** week 6 is charged and completed, reports `engagement-expired`, and week 7 remains
  unexecuted until renewal or termination

#### Scenario: Coincident expiration and incident are both visible

- **WHEN** the last paid week also selects an incident
- **THEN** the result contains both unmaskable reasons and no later week advances

### Requirement: Sensitivity masks the optional reasons and never the core ones

Advancing SHALL accept a sensitivity mask that suppresses stop reasons. Five reasons SHALL be
unmaskable: the plan's block ran out, the active season ended, an engagement expired, an incident
awaits a choice, and the calendar marks the next week as contested. Every other reason SHALL be
suppressible. A suppressed reason SHALL still be recorded in the week's result, so nothing is
lost — it simply does not stop the advance.

#### Scenario: A masked reason does not stop the advance

- **WHEN** the energy-threshold reason is masked and a performer crosses it in week two of a
  four-week block
- **THEN** advancing continues past week two, stops at the end of the block, and the week two
  result still records the energy reason

#### Scenario: A core reason cannot be masked

- **WHEN** a mask that suppresses the incident reason is submitted
- **THEN** it is rejected, and no week is advanced

#### Scenario: Season end cannot be masked

- **WHEN** a mask that suppresses the season-ended reason is submitted
- **THEN** it is rejected, and no week is advanced

#### Scenario: A contested week cannot be masked

- **WHEN** a mask that suppresses the contest-ahead reason is submitted
- **THEN** it is rejected, and no week is advanced

#### Scenario: Engagement expiration cannot be masked

- **WHEN** a mask that suppresses the engagement-expired reason is submitted
- **THEN** it is rejected, and no week is advanced

### Requirement: Money is credited and debited by activity effects

An activity effect on money SHALL change the run's balance by the amount it resolves to: a
flat effect by its declared amount, an audience-driven effect by its declared base scaled
by the org's reach. The reach SHALL be read from the audience the org holds at the moment
the activity is executed, so an activity earlier in the same week that grew the audience is
already reflected. A balance SHALL be allowed to go negative. The week in which opening money
of zero or more finishes negative SHALL produce the money stop reason, and a week that opened
negative SHALL NOT produce that crossing reason again.

#### Scenario: A flat effect pays its amount

- **WHEN** an activity whose effect credits a flat 400 is executed
- **THEN** the balance has risen by exactly 400, whatever the audience is

#### Scenario: A stream pays

- **WHEN** an activity whose effect credits an audience-driven base is executed
- **THEN** the balance has risen by that base scaled by the org's reach, which is less than
  the base

#### Scenario: A week's own audience gain counts

- **WHEN** one week plans an activity that grows the audience and then an audience-driven
  activity
- **THEN** the second is paid at the grown audience, not at the audience the week opened
  with

#### Scenario: The balance falls through zero

- **WHEN** a week opens with money of zero or more and its activity effects and recurring debit
  produce a negative final balance
- **THEN** that week produces the money stop reason, and a later week that stays negative does
  not produce it again

### Requirement: Advancing a week is deterministic

Advancing SHALL depend only on its inputs: the state of the run, its current engagements and
consecutive-negative-week count, the plan, the sensitivity mask, the materialized active-season
calendar, the incident catalog and cadence, the trait category multipliers, and the injected
serializable random streams. The same inputs SHALL produce the same weeks, incident occurrence
and target, recurring expense evidence, negative-week count, stop index, reasons, kinds and
resulting state. The week loop SHALL NOT regenerate a calendar, read a system random number
generator or read a system clock, and incident draws SHALL NOT move another subsystem's
stream.

Engagement array insertion order SHALL NOT change charged-id order, total expense, final
balance, count or reasons, and no engagement operation or settlement SHALL consume randomness.

One-week execution SHALL take that week's `WeekMarking` explicitly and SHALL NOT inspect a
calendar. Block advancement SHALL take the bounded calendar and pass the resolved current
marking into the one-week operation. Thus both paths use the same classification rule without
giving a one-week consumer ownership of season lifecycle.

#### Scenario: Same seed, same plan, same result

- **WHEN** the same run is advanced twice from the same state with the same seed, plan, mask,
  materialized season calendar, incident input and trait category multipliers
- **THEN** both advances produce identical results down to every performer's state, the
  pending incident, every RNG state, the stop index, the reasons and the week kinds

#### Scenario: A different seed is allowed to differ

- **WHEN** the same run and plan are advanced with a different seed
- **THEN** the result may differ, and it is again reproducible for that seed

#### Scenario: Reordered terms produce the same week

- **WHEN** the same valid engagements are supplied in two different array orders with all other
  inputs equal
- **THEN** both weeks return identical ordered expense evidence, final state and reasons

#### Scenario: JSON-compatible continuation matches uninterrupted advancement

- **WHEN** run state containing engagements and a negative-week count is copied through a
  JSON-compatible representation before the next week
- **THEN** continued advancement produces the same expense, count, reasons and state as the
  uninterrupted run

## ADDED Requirements

### Requirement: One recurring settlement closes the week and moves the negative series

After every planned activity and the existing weekly recovery, the week SHALL select exactly the
engagements covering the current absolute week, order them by stable id, sum their materialized
rates in integer tenths and debit that total through one organization change. It SHALL NOT debit
an engagement through an activity, season operation, incident or contest. The week result SHALL
report the ordered charged ids and total recurring expense as its own evidence rather than a
balance difference a consumer has to infer.

The run's `consecutiveNegativeWeeks` SHALL increment by one when the completed week's final
balance is below zero and SHALL reset to zero when that balance is zero or positive. An incident
resolved after the week SHALL NOT change that completed week's expense evidence or count.

#### Scenario: Same-week income funds recurring expense

- **WHEN** activities credit 50 during a week whose active engagements cost 40
- **THEN** the week applies the 50 first, debits 40 once, and closes 10 above the balance with
  which it opened

#### Scenario: One week charges exactly the active rates

- **WHEN** a collective has active engagements at 10.1, 20.2 and 30.3 for the current week
- **THEN** the week reports their three ids in stable order, debits exactly 60.6 once, and no
  other operation debits those rates

#### Scenario: A first negative close starts the series

- **WHEN** a run whose negative-week count is zero finishes a week below zero
- **THEN** the count becomes one

#### Scenario: A continuing negative balance advances the streak

- **WHEN** a run opens a week below zero and finishes it below zero again
- **THEN** its negative-week count increments

#### Scenario: Zero resets the series

- **WHEN** a run with a positive negative-week count finishes a week at exactly zero
- **THEN** the count resets to zero

#### Scenario: Incident money cannot rewrite a closed week

- **WHEN** an incident selected after settlement is later resolved with a money effect
- **THEN** the effect changes the next week's opening balance and leaves the completed week's
  recurring expense and negative-week count unchanged
