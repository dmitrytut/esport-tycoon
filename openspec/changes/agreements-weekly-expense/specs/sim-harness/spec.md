## MODIFIED Requirements

### Requirement: A run is defined by a scenario, a policy, a seed set and a horizon

A run SHALL take its starting conditions from a declared scenario: the org's opening values,
the parameters and discipline the collective is generated from, the explicit initial engagement
duration, the activity identifiers in play, the length of a planning block, the sensitivity the
run reads a return of control against, and optional incident ids and cadence. The scenario SHALL
be a versioned file rather than a value compiled into the runner, so tuning it is a content-shaped
change. The command line SHALL override only the seed set, the horizon in weeks, the policy and the
output format.

The loader SHALL resolve the declared region and discipline, generate performers through core,
quote their rates through core from the required content scales, and create one engagement per
member starting at week zero. It SHALL NOT duplicate the quote formula or provide a missing scale
or duration default. The declared duration SHALL cover the effective invocation horizon after any
command-line override because this change supplies no policy for resolving expiration inside a
headless walk.

A scenario or invocation SHALL be rejected before any week is advanced when it names activity,
region, discipline or incident content the content tree does not define, repeats an incident id,
declares an incident cadence outside zero through one, declares a non-positive engagement duration
or one shorter than the effective horizon, declares a block length outside the range the week loop
accepts, or names a masked reason the week loop refuses to mask; the rejection SHALL name the
scenario and the offending value. Every policy of one invocation SHALL run from identical starting
conditions, identical generated engagements, identical seeds, identical sensitivity and identical
incident configuration, so a difference between two policies is attributable to the policy alone.

#### Scenario: One command runs the three policies on one seed set

- **WHEN** the harness is asked for the money, development and balanced policies over the
  declared seed set
- **THEN** all three run headless in that invocation, each from the same generated collective,
  engagements and opening org values for a given seed

#### Scenario: A scenario is data

- **WHEN** the opening balance or initial engagement duration in the scenario file is changed and
  the runner is invoked again with the same command line
- **THEN** the run reflects the new value without a change to the runner's code

#### Scenario: An unknown activity identifier fails the run

- **WHEN** a scenario names an activity identifier that no file in the content tree defines
- **THEN** the run fails naming the scenario and the missing identifier, and no week is
  advanced

#### Scenario: An unknown discipline fails the run

- **WHEN** a scenario names a discipline identifier that content does not define
- **THEN** the run fails naming the scenario and identifier before performers are generated

#### Scenario: The effective measurement outlives its terms

- **WHEN** the scenario's initial engagement duration is shorter than the horizon selected by the
  scenario or a command-line override
- **THEN** the invocation fails before generation rather than silently renewing, terminating or
  stopping early

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

### Requirement: The report states its inputs and keeps duration out of the result

The report SHALL be produced in a machine-readable form and a human-readable form from the
same data, and SHALL name the scenario, the seed set, the horizon, the policy, the sensitivity,
the selected region and discipline, the initial engagement duration, the activity and incident
content the run was given, and the configured incident ids and cadence or that incidents were
disabled. It SHALL report a value per week where core exposes one — the balance, audience, energy,
morale, recurring engagement expense and consecutive-negative-week count — and SHALL NOT
attribute a figure core does not attribute. It SHALL report total recurring expense by summing the
core-produced weekly evidence rather than reconstructing rates or balance differences.

Game metrics SHALL be reproducible: the same inputs SHALL produce byte-identical
machine-readable output once measured duration is excluded. Duration SHALL be reported and SHALL
NOT be part of any comparison between runs or policies.

#### Scenario: The same inputs report the same numbers

- **WHEN** the identical invocation is run twice
- **THEN** every game metric is identical, and only the measured duration is allowed to
  differ

#### Scenario: Money is reported per week, not invented per activity

- **WHEN** a week executes two activities that both move the balance
- **THEN** the report states what the balance did that week and which activities ran, and
  states no per-activity split, which core does not produce and the harness may not compute

#### Scenario: Recurring expense comes from core evidence

- **WHEN** a week charges several active engagements
- **THEN** both report forms show the exact weekly total and resulting negative-week count returned
  by core, and harness code performs no separate debit or rate calculation

#### Scenario: The report says what it ran

- **WHEN** a report is read without access to the command that produced it
- **THEN** the scenario, seeds, horizon, policy, mask, selected region and discipline, initial term,
  activity and incident content sizes, and incident ids and cadence or disabled state are readable
  from the report itself

### Requirement: A mechanic that does not exist is absent, not zero

The report SHALL cover only what the simulation currently produces: the balance, audience,
stats, energy, morale, recurring engagement expense, consecutive-negative-week count, skipped
activities by cause, reasons by kind, week kinds, uninterrupted weeks, and incident occurrences
and resolutions. A mechanic that is not implemented — a prize, a contest result, a bankruptcy or
a relationship score — SHALL NOT appear as a metric with a zero value, and the harness SHALL NOT
supply an economy, contest or relationship system of its own to fill the gap.

#### Scenario: No invented spending

- **WHEN** a run advances one week with active engagements
- **THEN** the report uses the recurring expense core produced and carries no second salary or
  inferred spending figure

#### Scenario: No invented contest consequence

- **WHEN** an incident story would require a contest-loss risk that core does not implement
- **THEN** that story is absent from the executable scenario rather than reported with a
  zero risk or a substitute effect

#### Scenario: No invented bankruptcy

- **WHEN** the consecutive-negative-week count grows during a run
- **THEN** the report exposes the count and does not label any week as bankruptcy or terminate the
  run on a threshold

#### Scenario: A comparison of policies stays a comparison

- **WHEN** the three policies are reported side by side
- **THEN** the report presents their measured differences and declares no policy the winner

### Requirement: A scenario opts into incidents explicitly

A scenario MAY declare a set of incident ids and a cadence from zero through one. A scenario
that omits incident configuration SHALL run without incidents. Adding engagement inputs to the
act-one scenario SHALL NOT opt it into incidents or change its incident-free execution; other
declared inputs and resulting economy MAY change through their owning capabilities.

The repository SHALL carry a dedicated deterministic incident scenario with cadence one.
For every seed the scenario declares, it SHALL produce and resolve at least one incident
within its declared horizon. That scenario SHALL NOT be presented as the production
frequency of events or as a balance baseline.

#### Scenario: Existing act-one run is unchanged

- **WHEN** the shipped act-one scenario is invoked without an incident configuration
- **THEN** it advances with incidents disabled while using its current declared engagement inputs

#### Scenario: Smoke scenario proves the full path

- **WHEN** the dedicated incident scenario is run for each of its declared seeds and horizon
- **THEN** every machine-readable run contains at least one incident occurrence and its resolution

## ADDED Requirements

### Requirement: The harness preserves the single recurring-expense owner

Policies SHALL choose only activities, members and incident choices as before. They SHALL NOT choose
an engagement rate, renewal or termination; scenario construction SHALL supply terms covering the
effective invocation horizon. The harness SHALL advance those terms through core's week API and
SHALL NOT debit an engagement, update the negative-week count or synthesize an expiration result
itself.

#### Scenario: Policies share identical obligations

- **WHEN** all three policies run on one seed and scenario
- **THEN** they open with identical engagement ids, rates and dates, and any expense difference can
  arise only from a core-recognized membership or term change

#### Scenario: Direct core walk agrees with the harness

- **WHEN** a short harness run is compared with direct core week execution from the same generated
  state
- **THEN** every recurring expense, final balance and consecutive-negative-week count matches
