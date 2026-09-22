# sim-harness Specification

## Purpose
The harness is how the simulation is observed without a person in front of it: a headless
run of many weeks on declared seeds, driven by a stated policy instead of a user, reporting
what happened to money, people and attention. It measures the game; it never decides it.

## Requirements

### Requirement: A run is defined by a scenario, a policy, a seed set and a horizon

A run SHALL take its starting conditions from a declared scenario: the org's opening values,
the parameters the collective is generated from, the activity identifiers in play, the
length of a planning block, the sensitivity the run reads a return of control against, and
optional incident ids and cadence. The scenario SHALL be a versioned file rather than a
value compiled into the runner, so tuning it is a content-shaped change. The command line
SHALL override only the seed set, the horizon in weeks, the policy and the output format. A
scenario SHALL be rejected before any week is advanced when it names activity or incident
content the content tree does not define, repeats an incident id, declares an incident
cadence outside zero through one, declares a block length outside the range the week loop
accepts, or names a masked reason the week loop refuses to mask; the rejection SHALL name
the scenario and the offending value. Every policy of one invocation SHALL run from
identical starting conditions, identical seeds, identical sensitivity and identical
incident configuration, so a difference between two policies is attributable to the policy
alone.

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

#### Scenario: Unknown incident fails before the run

- **WHEN** a scenario names an incident id absent from loaded content
- **THEN** loading fails naming the scenario and id, and no week or RNG state advances

### Requirement: A policy chooses, and the core decides what that costs

A policy SHALL decide only which activity is planned in which week, which member takes part
in a member-targeted activity, and which choice id to submit for a pending incident. It SHALL
NOT select an incident, roll a check, compute a payout, apply an effect, recover energy, or
reproduce any arithmetic the week loop or incident engine owns. Every ordering SHALL be
total and stated: two candidates SHALL NOT be separated by collection order, a hash, or a
call to a random number generator. For this first incident contract, all three policies SHALL
use the same neutral ordering over choices: ascending code-point order of the stable choice id.

#### Scenario: Two runs of the same policy plan the same weeks

- **WHEN** the same policy is run twice from the same scenario, seed and horizon
- **THEN** both runs plan the identical activities for the identical members and submit the
  identical incident choices whenever an incident is pending

#### Scenario: A policy leaves the payout to the core

- **WHEN** a policy plans an audience-driven activity or submits an incident choice with an
  organization effect
- **THEN** the money the run reports is the amount core credited, and the policy has
  contributed no figure of its own

#### Scenario: Policy does not predict a checked outcome

- **WHEN** a pending incident offers a stat-check choice
- **THEN** the policy orders it by choice id without rolling or estimating the check, and
  core alone reports success or failure

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

Before any harness-only incident resolution, the week-by-week walk SHALL be equal to core's
own block advance over the same plan: for a plan a block long, from the same state and seed,
the walk SHALL produce the same weeks in the same order, the same reasons, the same kinds and
the same pending state, up to and including the week block advance stopped at. When that
week produced an incident, block advance SHALL leave it pending while the harness SHALL next
resolve it through core and record the resolved post-week state. The harness SHALL NOT
reproduce week or incident arithmetic; the only judgements it adds are when a user would
have been asked to look and which choice the policy submits.

#### Scenario: The walk equals the block advance

- **WHEN** a block-long plan is advanced by the harness and by core's block advance from the
  same state and seed
- **THEN** the weeks, their kinds, their executed and skipped activities, their reasons and
  the pre-resolution state are identical, save for the `block-ran-out` reason block advance
  appends to its last week; when an incident is pending, only core's separately returned
  resolution distinguishes the harness's recorded post-week state

#### Scenario: The harness carries no copy of the week's arithmetic

- **WHEN** the money, audience, energy, morale and stat figures of a short run are compared
  against the same weeks and incident choices advanced and resolved directly through core
- **THEN** every figure matches, because the harness read them from core rather than
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
sensitivity, the activity and incident content the run was given, and the configured
incident ids and cadence or that incidents were disabled. It SHALL report a value per week
where core exposes one — the balance, the audience, energy and morale — and SHALL NOT
attribute a figure core does not attribute. Game metrics SHALL be reproducible: the same
inputs SHALL produce byte-identical machine-readable output once measured duration is
excluded. Duration SHALL be reported and SHALL NOT be part of any comparison between runs
or policies.

#### Scenario: The same inputs report the same numbers

- **WHEN** the identical invocation is run twice
- **THEN** every game metric is identical, and only the measured duration is allowed to
  differ

#### Scenario: Money is reported per week, not invented per activity

- **WHEN** a week executes two activities that both move the balance
- **THEN** the report states what the balance did that week and which activities ran, and
  states no per-activity split, which core does not produce and the harness may not compute

#### Scenario: The report says what it ran

- **WHEN** a report is read without access to the command that produced it
- **THEN** the scenario, seeds, horizon, policy, mask, activity and incident content sizes,
  and incident ids and cadence or disabled state are readable from the report itself

### Requirement: A mechanic that does not exist is absent, not zero

The report SHALL cover only what the simulation currently produces: the balance, audience,
stats, energy, morale, skipped activities by cause, reasons by kind, week kinds,
uninterrupted weeks, and incident occurrences and resolutions. A mechanic that is not
implemented — a salary, a prize, a contest result, a bankruptcy or a relationship score —
SHALL NOT appear as a metric with a zero value, and the harness SHALL NOT supply an economy,
contest or relationship system of its own to fill the gap.

#### Scenario: No invented spending

- **WHEN** a run covers a horizon in which nothing debits the balance but an activity or
  incident effect
- **THEN** the report shows only the balance movement core produced, and carries no salary,
  prize or bankruptcy figure

#### Scenario: No invented contest consequence

- **WHEN** an incident story would require a contest-loss risk that core does not implement
- **THEN** that story is absent from the executable scenario rather than reported with a
  zero risk or a substitute effect

#### Scenario: A comparison of policies stays a comparison

- **WHEN** the three policies are reported side by side
- **THEN** the report presents their measured differences and declares no policy the winner

### Requirement: A scenario opts into incidents explicitly

A scenario MAY declare a set of incident ids and a cadence from zero through one. A scenario
that omits incident configuration SHALL run without incidents, preserving the existing
act-one measurement.

The repository SHALL carry a dedicated deterministic incident scenario with cadence one.
For every seed the scenario declares, it SHALL produce and resolve at least one incident
within its declared horizon. That scenario SHALL NOT be presented as the production
frequency of events or as a balance baseline.

#### Scenario: Existing act-one run is unchanged

- **WHEN** the shipped act-one scenario is invoked without an incident configuration
- **THEN** it advances the same incident-free inputs as before this capability

#### Scenario: Smoke scenario proves the full path

- **WHEN** the dedicated incident scenario is run for each of its declared seeds and horizon
- **THEN** every machine-readable run contains at least one incident occurrence and its resolution

### Requirement: The harness resolves pending incidents through core

When a walked week returns an incident pending, the harness SHALL record the return of
control, ask the selected policy for one choice id, and submit that id through core's public
resolution contract before advancing another week. Resolution SHALL NOT discard or re-plan
the unexecuted remainder of the current block. The post-week state recorded by the harness
SHALL be the resolved state, so its balance, audience, stats, energy and morale include the
incident effects exactly once.

#### Scenario: Incident inside a block preserves the plan

- **WHEN** an incident becomes pending in the second week of a four-week block
- **THEN** the harness resolves it and advances weeks three and four with their original
  activities and members, without executing or planning a week twice

#### Scenario: Harness does not apply effects itself

- **WHEN** a policy chooses an incident option that changes a performer or the organization
- **THEN** the reported post-week state equals core's resolution result, with no second
  application or independently computed value from the harness

### Requirement: The report links occurrence and resolution without merging them

The machine-readable report SHALL record, under the absolute week that produced it, the
incident id, target performer id, submitted choice id, direct/success/failure outcome, check
roll and total when present, and the effects core reports as applied. The text form SHALL
name the occurrence, choice and outcome. Occurrence SHALL remain the unmaskable return of
control in the week result; resolution SHALL remain a separate result produced after the
week. The report SHALL NOT claim that the immutable week result already contained the later
choice consequence.

#### Scenario: Checked choice is traceable

- **WHEN** the harness resolves a Presence check
- **THEN** one weekly report entry identifies the incident, target, choice, roll, total,
  success or failure, and the post-resolution state

#### Scenario: Direct choice has no invented roll

- **WHEN** the harness resolves a direct choice
- **THEN** its report records a direct outcome and carries no check roll or total
