## MODIFIED Requirements

### Requirement: A quiet week and an uninterrupted week are reported apart

The report SHALL carry the structural classification of the week loop — `quiet`, `ordinary`,
`contest`, `series` — and, separately, the count and share of uninterrupted weeks. A week
SHALL count as uninterrupted only when block advancement passed it without returning control
to the player. A reason suppressed by the run's sensitivity SHALL be recorded and SHALL NOT
interrupt a week by itself. The week on which an unmasked reason returns control SHALL NOT
count, and the final week of every planning block SHALL NOT count because `block-ran-out`
returns control even when nothing else happened.

The harness's week-by-week walk SHALL reproduce those return points from the declared
sensitivity and the original planning-block grid. An earlier unmasked reason SHALL NOT move
the declared end of that block: its week and the original block-final week are both
interrupted, while intervening weeks without another return reason are uninterrupted. A
reporting horizon that ends inside a block SHALL NOT itself count as a return of control.

The figure MAY change when the scenario's block length changes; block length is a declared
gameplay input, not a slicing detail to normalize away. The report SHALL state that length
beside the uninterrupted count and share and SHALL NOT present either as `quiet` weeks.

#### Scenario: A week of planned work that nothing interrupts

- **WHEN** a week executes a planned training session, produces no unmasked reason and is not
  the final week of its planning block
- **THEN** it counts as uninterrupted, and it counts as `ordinary` rather than `quiet`

#### Scenario: A masked reason is recorded and does not interrupt

- **WHEN** a scenario masks the energy-threshold reason and a performer crosses it before the
  final week of the current block
- **THEN** the report lists that reason for the week, and the week still counts as
  uninterrupted

#### Scenario: The block's final week returns control

- **WHEN** the final week of a block produces no reason before `block-ran-out`
- **THEN** it keeps its structural `WeekKind` and does not count as uninterrupted

#### Scenario: Slicing the horizon does not move the metric

- **WHEN** the reporting horizon ends on a reason-free week inside a declared planning block
- **THEN** that last observed week counts as uninterrupted because measurement ended but
  player control did not return

#### Scenario: An earlier return does not move the block boundary

- **WHEN** an unmasked reason returns control in week two of a four-week plan and weeks three
  and four produce no other reason
- **THEN** weeks two and four are interrupted, week three is uninterrupted, and the original
  fourth-week `block-ran-out` boundary remains in place

#### Scenario: Block length is a declared input to the metric

- **WHEN** the same 24 produced weeks are grouped into four-week blocks and six-week blocks,
  with no other return reason
- **THEN** the four-week run reports 18 uninterrupted weeks and block length 4, while the
  six-week run reports 20 and block length 6, and both report identical week-kind counts

#### Scenario: Report names the interruption cadence

- **WHEN** a report is read without the scenario file
- **THEN** its declared planning-block length is present beside uninterrupted count and share
