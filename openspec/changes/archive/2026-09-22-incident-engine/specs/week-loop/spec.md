## MODIFIED Requirements

### Requirement: Advancing stops only on a reason from the closed list

Advancing SHALL execute the plan week after week without user input and SHALL stop at the
end of the first week that produced at least one stop reason. The list of stop reasons is
closed and consists of exactly: the plan's block ran out; a planned activity was skipped; a
performer's energy crossed its threshold downward; a performer's morale crossed its
threshold downward; the money balance crossed zero downward; the calendar marks the next
week as contested; an incident awaits a choice. Advancing SHALL report the index of the
week it stopped at together with every reason that week produced. A week with no reason
SHALL pass without stopping.

When incident input is present, one eligible incident MAY be selected after the week's
activities, recovery and other reasons have been produced. A selected incident SHALL be
stored in run state and SHALL add `incident-pending` to that same week's reasons. Advancing
an input state that already has a pending incident SHALL fail before validating or executing
the plan.

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

#### Scenario: A selected incident stops the block

- **WHEN** the incident cadence succeeds after week two of a four-week block
- **THEN** week two reports `incident-pending` with the selected incident and target,
  advancing stops there, and weeks three and four remain unexecuted

#### Scenario: Pending state cannot advance

- **WHEN** block advancement is called with an unresolved incident already in run state
- **THEN** it fails before plan validation, and no week or random stream moves

### Requirement: Week kind is classified from that week alone

Every advanced week SHALL be labelled with exactly one final kind: `series` when the calendar
marked it as a series of contests, `contest` when it held a single contest, `ordinary` when
it produced a stop reason or spent at least one slot, `quiet` otherwise. The final kind SHALL
be a function of that week's own inputs and results only: it SHALL NOT depend on the kinds of
earlier weeks, on the distribution accumulated so far, or on any target share. Advancing
SHALL report the final kind of every week it simulated.

When incident eligibility reads `baseWeekKind`, the week loop SHALL classify it by the same
rule before adding `incident-pending`; after selection, the final kind SHALL be classified
again with that reason included. The base kind SHALL exist only as incident input and SHALL
NOT replace the final kind in the week result.

#### Scenario: The same week classifies the same way regardless of history

- **WHEN** two runs reach an identical week — same calendar marking, same plan, same
  outcomes — after different sequences of earlier weeks
- **THEN** both label that week with the same kind

#### Scenario: A week that spends nothing is quiet

- **WHEN** a week is advanced with no activities planned, no calendar marking and no stop
  reason produced
- **THEN** the week is labelled `quiet`

#### Scenario: An incident changes quiet to ordinary

- **WHEN** a week with base kind `quiet` selects an incident
- **THEN** incident conditions read `quiet`, while the returned final kind is `ordinary`

#### Scenario: The distribution is an observation

- **WHEN** a season of weeks is advanced
- **THEN** the count of each kind is reported for the run, and no rule of the week loop has
  read those counts while classifying or executing a week

### Requirement: Advancing a week is deterministic

Advancing SHALL depend only on its inputs: the state of the run, the plan, the sensitivity
mask, the calendar, the incident catalog and cadence, the trait category multipliers, and
the injected serializable random streams. The same inputs SHALL produce the same weeks,
incident occurrence and target, stop index, reasons, kinds and resulting state. The week
loop SHALL NOT read a system random number generator or a system clock, and incident draws
SHALL NOT move another subsystem's stream.

#### Scenario: Same seed, same plan, same result

- **WHEN** the same run is advanced twice from the same state with the same seed, plan,
  mask, calendar, incident input and trait category multipliers
- **THEN** both advances produce identical results down to every performer's state, the
  pending incident, every RNG state, the stop index, the reasons and the week kinds

#### Scenario: A different seed is allowed to differ

- **WHEN** the same run and plan are advanced with a different seed
- **THEN** the result may differ, and it is again reproducible for that seed
