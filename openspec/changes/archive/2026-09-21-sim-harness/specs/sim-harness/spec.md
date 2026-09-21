## Purpose

The harness is how the simulation is observed without a person in front of it: a headless
run of many weeks on declared seeds, driven by a stated policy instead of a user, reporting
what happened to money, people and attention. It measures the game; it never decides it.

## ADDED Requirements

### Requirement: A run is defined by a scenario, a policy, a seed set and a horizon

A run SHALL take its starting conditions from a declared scenario: the org's opening values,
the parameters the collective is generated from, the activity identifiers in play, the
length of a planning block and the sensitivity the run reads a return of control against.
The scenario SHALL be a versioned file rather than a value compiled into the runner, so
tuning it is a content-shaped change. The command line SHALL override only the seed set, the
horizon in weeks, the policy and the output format. A scenario SHALL be rejected before any
week is advanced when it names an activity the content tree does not define, a block length
outside the range the week loop accepts, or a masked reason the week loop refuses to mask;
the rejection SHALL name the scenario and the offending value. Every policy of one
invocation SHALL run from identical starting conditions, identical seeds and the identical
sensitivity, so a difference between two policies is attributable to the policy alone.

#### Scenario: One command runs the three policies on one seed set

- **WHEN** the harness is asked for the money, development and balanced policies over the
  declared seed set
- **THEN** all three run headless in that invocation, each from the same generated
  collective and the same opening org values for a given seed

#### Scenario: A scenario is data

- **WHEN** the opening balance in the scenario file is changed and the runner is invoked
  again with the same command line
- **THEN** the run reflects the new value without a change to the runner's code

#### Scenario: An unknown activity identifier fails the run

- **WHEN** a scenario names an activity identifier that no file in the content tree defines
- **THEN** the run fails naming the scenario and the missing identifier, and no week is
  advanced

#### Scenario: A block length the week loop would reject

- **WHEN** a scenario declares a planning block shorter or longer than the week loop accepts
- **THEN** the run fails naming the scenario and the declared length, rather than surfacing
  the week loop's own rejection from inside the walk

#### Scenario: One sensitivity across the policies of an invocation

- **WHEN** the three policies are run in one invocation from a scenario that masks a reason
- **THEN** all three read a return of control against that same mask, and the report names
  the mask once for the invocation

### Requirement: A policy chooses, and the core decides what that costs

A policy SHALL decide only which activity is planned in which week and, for an activity
aimed at one member, which member takes part. It SHALL NOT compute a payout, apply an
effect, recover energy, or reproduce any arithmetic the week loop owns. A policy's ordering
over candidates SHALL be total and stated: two candidates SHALL NOT be separated by the
iteration order of a collection, a hash, or a call to the random number generator.

#### Scenario: Two runs of the same policy plan the same weeks

- **WHEN** the same policy is run twice from the same scenario, seed and horizon
- **THEN** both runs plan the identical activities for the identical members in every week

#### Scenario: A policy leaves the payout to the core

- **WHEN** a policy plans an audience-driven activity
- **THEN** the money the run reports for that week is the amount the week loop credited, and
  the policy has contributed no figure of its own

### Requirement: A run executes exactly the horizon, one week at a time

A run SHALL advance exactly the requested number of weeks, reading the state the core
returned after every one of them, so a weekly series is observed rather than interpolated.
A week whose result carries a reason the sensitivity leaves unmasked SHALL be recorded as a
return of control and SHALL NOT end the run: the remaining weeks the block had already
planned SHALL be advanced next, with the activities and members they were planned with. Only
a week that has never been planned SHALL be decided by the policy, against the state as it
then stands. Every plan SHALL cover a whole planning block, so it is valid to the week
loop, and SHALL be validated the way the week loop validates one before its first week; a
run that reaches its horizon inside a block SHALL leave the rest of that block unexecuted
rather than advancing past the horizon.

#### Scenario: A returned control does not end the run

- **WHEN** a performer's energy crosses its threshold in the second week of a four-week
  block and the horizon is twenty-four weeks
- **THEN** the run records the return of control at that week and goes on to advance all
  twenty-four

#### Scenario: A carried-forward week keeps its plan

- **WHEN** control returns inside a block that still has unexecuted weeks
- **THEN** those weeks are advanced with the activities and members they were planned with,
  and no week is advanced twice

#### Scenario: A horizon that is not a whole number of blocks

- **WHEN** the horizon ends partway through a planning block
- **THEN** the weeks up to the horizon are advanced and the rest of that block's plan is
  left unexecuted, so the run ends on the horizon rather than past it

#### Scenario: An unplannable plan fails before the week

- **WHEN** a plan would place an activity aimed at one member without naming a member of the
  collective
- **THEN** the run fails naming the activity before that week is advanced

### Requirement: The walk produces what advancing a block produces

The week-by-week walk SHALL be equal to the core's own block advance over the same plan:
for a plan a block long, from the same state and seed, the walk SHALL produce the same weeks
in the same order, the same reasons, the same kinds and the same resulting state, up to and
including the week the block advance stopped at. The harness SHALL NOT reproduce the week
loop's arithmetic, its recovery, its classification or its reasons; the only judgement the
harness adds is when a user would have been asked to look.

#### Scenario: The walk equals the block advance

- **WHEN** a block-long plan is advanced by the harness and by the core's block advance from
  the same state and seed
- **THEN** the weeks, their kinds, their executed and skipped activities, their reasons and
  the resulting state are identical, save for the block-ran-out reason the block advance
  appends to its last week

#### Scenario: The harness carries no copy of the week's arithmetic

- **WHEN** the money, audience, energy, morale and stat figures of a short run are compared
  against the same weeks advanced directly through the core
- **THEN** every figure matches, because the harness read them from the core rather than
  computing them

### Requirement: A quiet week and an uninterrupted week are reported apart

The report SHALL carry the structural classification of the week loop — `quiet`, `ordinary`,
`contest`, `series` — and, separately, the count and share of uninterrupted weeks. A week
SHALL count as uninterrupted when its result carries no reason the run's sensitivity leaves
unmasked. A masked reason SHALL be recorded and SHALL NOT make a week interrupted. The
figure SHALL NOT depend on how the horizon was divided into planning blocks, and the report
SHALL NOT present either figure as the other.

#### Scenario: A week of planned work that nothing interrupts

- **WHEN** a week executes a planned training session and produces no reason
- **THEN** it counts as uninterrupted, and it counts as `ordinary` rather than `quiet`

#### Scenario: A masked reason is recorded and does not interrupt

- **WHEN** a scenario masks the energy-threshold reason and a performer crosses it during
  the run
- **THEN** the report lists that reason for that week, and the week still counts as
  uninterrupted

#### Scenario: Slicing the horizon does not move the metric

- **WHEN** the same horizon is run with a four-week planning block and with a six-week one,
  everything else equal
- **THEN** the count of uninterrupted weeks depends only on the weeks the policies produced,
  not on the block length

### Requirement: The report states its inputs and keeps duration out of the result

The report SHALL be produced in a machine-readable form and a human-readable form from the
same data, and SHALL name the scenario, the seed set, the horizon, the policy, the
sensitivity and the content the run was given. It SHALL report a value per week where the
core exposes one — the balance, the audience, energy and morale — and SHALL NOT attribute a
figure the core does not attribute. Game metrics SHALL be reproducible: the same inputs
SHALL produce byte-identical machine-readable output once the measured duration is excluded.
The duration SHALL be reported and SHALL NOT be part of any comparison between runs or
policies.

#### Scenario: The same inputs report the same numbers

- **WHEN** the identical invocation is run twice
- **THEN** every game metric is identical, and only the measured duration is allowed to
  differ

#### Scenario: Money is reported per week, not invented per activity

- **WHEN** a week executes two activities that both move the balance
- **THEN** the report states what the balance did that week and which activities ran, and
  states no per-activity split, which the core does not produce and the harness may not
  compute

#### Scenario: The report says what it ran

- **WHEN** a report is read without access to the command that produced it
- **THEN** the scenario, the seeds, the horizon, the policy, the mask and the size of the
  content set are readable from the report itself

### Requirement: A mechanic that does not exist is absent, not zero

The report SHALL cover only what the simulation currently produces: the balance, audience,
stats, energy, morale, skipped activities by cause, reasons by kind, week kinds and
uninterrupted weeks. A mechanic that is not implemented — a salary, a prize, a contest, a
bankruptcy — SHALL NOT appear as a metric with a zero value, and the harness SHALL NOT
supply an economy of its own to fill the gap.

#### Scenario: No invented spending

- **WHEN** a run covers a horizon in which nothing debits the balance but an activity effect
- **THEN** the report shows the balance moved by activity effects only, and carries no
  salary, prize or bankruptcy figure

#### Scenario: A comparison of policies stays a comparison

- **WHEN** the three policies are reported side by side
- **THEN** the report presents their measured differences and declares no policy the winner
