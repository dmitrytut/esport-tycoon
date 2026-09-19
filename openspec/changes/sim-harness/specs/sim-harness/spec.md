## Purpose

The harness is how the simulation is observed without a person in front of it: a headless
run of many weeks on declared seeds, driven by a stated policy instead of a user, reporting
what happened to money, people and attention. It measures the game; it never decides it.

## ADDED Requirements

### Requirement: A run is defined by a scenario, a policy, a seed set and a horizon

A run SHALL take its starting conditions from a declared scenario: the org's opening values,
the parameters the collective is generated from, the activity identifiers in play, the
length of a planning block and the sensitivity the run advances with. The scenario SHALL be
a versioned file rather than a value compiled into the runner, so tuning it is a
content-shaped change. The command line SHALL override only the seed set, the horizon in
weeks, the policy and the output format. A scenario SHALL be rejected before any week is
advanced when it names an activity the content tree does not define, or a block length
outside the range the week loop accepts, and the rejection SHALL name the scenario and the
offending value. Every policy of one invocation SHALL run from identical starting
conditions, identical seeds and the identical sensitivity, so a difference between two
policies is attributable to the policy alone.

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
- **THEN** all three advance with that same mask, and the report names the mask once for the
  invocation

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

### Requirement: A run executes exactly the horizon it was given

A successful run SHALL advance exactly the requested number of weeks. A stop inside a
planning block SHALL NOT discard the planned work that had not been executed yet, SHALL NOT
execute any week twice, and SHALL NOT restart the random number stream: the run SHALL
continue from the state the core returned. The weeks a stopped block had planned but not
executed SHALL be carried forward exactly as they were planned, whichever way they are
advanced afterwards; only a week that has never been planned SHALL be decided by the policy
against the state as it then stands. When fewer weeks remain than a planning block holds,
the run SHALL still land on the horizon exactly.

#### Scenario: A stop inside a block resumes where it ended

- **WHEN** a run stops at the second week of a four-week block and continues to its horizon
- **THEN** the third and fourth weeks of that block are executed once each, in their planned
  order, and the week that produced the stop is not executed again

#### Scenario: The tail is shorter than a block

- **WHEN** the weeks left to reach the horizon are fewer than the minimum length of a
  planning block
- **THEN** those weeks are still advanced through the core, and the run ends on the horizon
  rather than past it

#### Scenario: A stop leaves its remainder inside the tail

- **WHEN** a block stops with unexecuted weeks left and fewer weeks remain to the horizon
  than a planning block holds
- **THEN** those carried-forward weeks are advanced with the activities and members they
  were planned with, not with a plan re-derived from the advanced state

#### Scenario: Continuation does not rewind the stream

- **WHEN** a run of the full horizon is compared against the same horizon advanced with no
  stop in the middle from the same seed and the same planned weeks
- **THEN** every reported value matches: the stop changed when control returned, not what
  the simulation produced

### Requirement: A quiet week and an uninterrupted week are reported apart

The report SHALL carry the structural classification of the week loop — `quiet`, `ordinary`,
`contest`, `series` — and, separately, the count and share of uninterrupted weeks. A week
SHALL count as uninterrupted when it produced no stop reason that the run's sensitivity
leaves unmasked, disregarding the reason that a planning block ran out, which is an artifact
of how the run slices its horizon. A masked reason SHALL be recorded and SHALL NOT make a
week interrupted. The report SHALL NOT present either figure as the other.

#### Scenario: A week of planned work that nothing interrupts

- **WHEN** a week executes a planned training session and produces no stop reason
- **THEN** it counts as uninterrupted, and it counts as `ordinary` rather than `quiet`

#### Scenario: A masked reason is recorded and does not interrupt

- **WHEN** a run masks the energy-threshold reason and a performer crosses it
- **THEN** the report lists that reason for that week, and the week still counts as
  uninterrupted

#### Scenario: Slicing the horizon does not move the metric

- **WHEN** the same horizon is run with a four-week planning block and with a six-week one,
  everything else equal
- **THEN** the count of uninterrupted weeks is the same in both runs

### Requirement: The report states its inputs and keeps duration out of the result

The report SHALL be produced in a machine-readable form and a human-readable form from the
same data, and SHALL name the scenario, the seed set, the horizon, the policy, the
sensitivity and the content the run was given. Game metrics SHALL be reproducible: the same
inputs SHALL produce byte-identical machine-readable output once the measured duration is
excluded. The duration SHALL be reported and SHALL NOT be part of any comparison between
runs or policies.

#### Scenario: The same inputs report the same numbers

- **WHEN** the identical invocation is run twice
- **THEN** every game metric is identical, and only the measured duration is allowed to
  differ

#### Scenario: The report can be checked against the core

- **WHEN** a short scenario is also advanced directly through the core with the same seed
  and the same planned weeks
- **THEN** the money, audience, energy, morale and stat figures in the report equal what the
  direct advance produced

#### Scenario: The report says what it ran

- **WHEN** a report is read without access to the command that produced it
- **THEN** the scenario, the seeds, the horizon, the policy and the size of the content set
  are readable from the report itself

### Requirement: A mechanic that does not exist is absent, not zero

The report SHALL cover only what the simulation currently produces: money and its sources,
audience, stats, energy, morale, skipped activities by cause, stop reasons by kind, week
kinds and uninterrupted weeks. A mechanic that is not implemented — a salary, a prize, a
contest, a bankruptcy — SHALL NOT appear as a metric with a zero value, and the harness
SHALL NOT supply an economy of its own to fill the gap.

#### Scenario: No invented spending

- **WHEN** a run covers a horizon in which nothing debits the balance but an activity effect
- **THEN** the report shows the balance moved by activity effects only, and carries no
  salary, prize or bankruptcy figure

#### Scenario: A comparison of policies stays a comparison

- **WHEN** the three policies are reported side by side
- **THEN** the report presents their measured differences and declares no policy the winner
