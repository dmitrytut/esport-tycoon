## Purpose

The incident engine turns authored event data into deterministic interruptions whose target,
choice, consequence and cooldown are part of the run rather than inventions of a caller.

## ADDED Requirements

### Requirement: Incident content is a closed executable contract

An incident SHALL declare a stable id, category, non-negative base weight, global cooldown,
player-facing text containing the `{player}` token, and two or three choices with unique
stable ids, non-empty labels and non-empty consequence details. It MAY declare conditions. A
choice SHALL declare either direct effects or one stat check with separate success and
failure effects. Conditions, outcomes and effects outside the closed contract SHALL fail
content validation rather than being ignored or treated as zero.

The closed performer effects SHALL be energy, morale, form and one named stat. The closed
organization effects SHALL be flat money, audience and reputation. An effect SHALL declare a
signed amount; incident content SHALL NOT carry a script, expression, scaled money, delayed
consequence, contest result, respect score or other executable field.

#### Scenario: An unsupported effect fails validation

- **WHEN** an incident choice declares a contest-loss risk
- **THEN** content validation rejects the file naming that effect, and no run can load it

#### Scenario: Choice ids are stable and unique

- **WHEN** two choices of one incident declare the same id
- **THEN** content validation rejects the incident rather than addressing choices by array position

#### Scenario: The selected performer can be rendered

- **WHEN** an incident omits the `{player}` token from its player-facing text
- **THEN** content validation rejects it rather than leaving the shell to invent a subject

### Requirement: Eligibility is evaluated for one performer after the week

An incident SHALL target one performer. Its conditions SHALL be evaluated after the week's
activities and recovery against that performer and the completed week's preliminary
classification. Supported conditions SHALL be strict energy-below and morale-below
thresholds, possession of every listed trait, membership in a listed region, and membership
in a listed `baseWeekKind`. Different condition fields SHALL combine with AND. An omitted
`conditions` object or an empty object SHALL impose no restriction. An absent field inside
the object SHALL impose no restriction; an empty allow-list and an unknown condition SHALL
fail content validation.

`baseWeekKind` SHALL mean the kind obtained from the calendar marking, spent slots and every
reason except `incident-pending`. The final kind SHALL still be classified by the week loop
from every reason, so selecting an incident may turn a base `quiet` week into final
`ordinary`.

#### Scenario: One failed condition excludes one candidate

- **WHEN** an incident requires energy below 30 and a trait, and a performer has the trait at energy 30
- **THEN** that performer is not an eligible target for that incident

#### Scenario: Incident reason changes only the final kind

- **WHEN** an incident eligible only on base kind `quiet` is selected in a week with no work or other reason
- **THEN** the incident is eligible against base `quiet`, and the returned week is final kind `ordinary`

#### Scenario: No conditions means every performer is eligible

- **WHEN** an otherwise valid incident omits `conditions` or declares an empty object
- **THEN** every performer is an eligible target before weight and cooldown rules are applied

### Requirement: Cadence and weighted selection are separate inputs

A caller that enables incidents SHALL declare a cadence from zero through one separately
from the incidents' relative weights. At the end of an eligible week, the cadence gate SHALL
be evaluated at most once. A zero cadence SHALL produce no incident; a cadence of one SHALL
produce one when at least one incident has a positive effective weight. No hidden default
cadence SHALL create incidents for a caller that did not enable them.

For each incident with eligible performers, one performer's multiplier SHALL be the product
of that performer's declared trait multipliers for the incident category, using one for a
missing multiplier. The incident's effective weight SHALL be its base weight multiplied by
the arithmetic mean of its eligible performer multipliers. Selection SHALL first choose one
incident by effective weight, then one of that incident's eligible performers by multiplier.
Zero effective weight SHALL be unreachable. The number of eligible performers SHALL NOT by
itself multiply an incident's relative weight.

Before each weighted choice, eligible incidents and performers SHALL be ordered by ascending
code-point order of their stable ids. Catalog or collection iteration order SHALL NOT change
the selected identity for the same set of candidates and RNG state.

Trait `eventWeightBoost` keys SHALL be declared incident categories and their values SHALL be
non-negative. Content validation SHALL reject an unknown category or negative multiplier
rather than passing an invalid weight to core.

#### Scenario: Catalog size does not imply occurrence frequency

- **WHEN** the same eligible state and cadence are run with additional positive-weight incidents
- **THEN** the cadence still decides whether one incident occurs, while the weights decide only which incident occurs

#### Scenario: More eligible performers do not multiply event weight

- **WHEN** two incidents have equal base weight and trait multipliers but one has five eligible performers and the other has one
- **THEN** both incidents have equal effective weight before target selection

#### Scenario: A trait changes selection without changing cadence

- **WHEN** one eligible performer has a category multiplier above one
- **THEN** the matching incident and that performer receive the declared relative boost, while the cadence gate is unchanged

#### Scenario: Input order does not choose the winner

- **WHEN** the same eligible incidents and performers are supplied in a different order
- **THEN** the cadence result, selected incident, selected performer and final incident RNG state are unchanged

#### Scenario: Invalid trait multiplier fails before selection

- **WHEN** a trait declares a negative multiplier or a category outside the incident category set
- **THEN** content validation rejects that trait and no run loads it

### Requirement: One pending incident blocks time

A selected incident SHALL become the run's single pending incident, identifying the incident,
target performer and absolute week. The completed week SHALL report the unmaskable
`incident-pending` reason with that identity. While pending exists, another one-week or block
advance SHALL fail before a plan is validated, state is changed or any RNG draw is consumed.
No second incident SHALL be selected or queued.

#### Scenario: Advancing unresolved state is inert

- **WHEN** advancement is attempted while an incident awaits a choice
- **THEN** it fails, and the week, organization, collective, pending incident, cooldowns and every RNG state remain identical

#### Scenario: At most one incident occurs in a week

- **WHEN** several incidents are eligible and the cadence gate succeeds
- **THEN** exactly one incident and one target become pending

### Requirement: A choice resolves exactly once

Resolving a pending incident SHALL require a choice id belonging to that incident. A direct
choice SHALL apply its effects without a random draw. A checked choice SHALL resolve its
check once and apply exactly one branch. The returned resolution SHALL identify the incident,
target, occurrence week, choice, direct/success/failure outcome, check roll when one exists,
and the effects applied. Resolution SHALL NOT advance the week.

A successful resolution SHALL apply its effects, install the cooldown and clear pending as
one state transition. Resolving when nothing is pending, naming a missing incident or target,
or naming an unknown choice SHALL fail without changing state or RNG. A second resolution of
the same choice SHALL therefore fail and SHALL NOT apply an effect twice.

#### Scenario: Direct choice consumes no random draw

- **WHEN** a direct choice is resolved
- **THEN** its declared effects apply once, pending clears, and the incident RNG state is unchanged by resolution

#### Scenario: The same choice cannot land twice

- **WHEN** a resolved choice is submitted again
- **THEN** resolution fails and every organization, performer, cooldown and RNG value remains at the once-resolved state

### Requirement: A stat check has one deterministic rule

A checked choice SHALL name one performer stat and an integer difficulty. Resolution SHALL
draw one integer uniformly from 1 through 20 from the incident RNG and add the targeted
performer's current stat. A total greater than or equal to the difficulty SHALL select the
success effects; a lower total SHALL select the failure effects. The roll and total SHALL be
part of the resolution.

#### Scenario: Equality succeeds

- **WHEN** the target's stat plus the d20 roll equals the declared difficulty
- **THEN** the success effects apply and the resolution reports success

#### Scenario: Failure applies no success effect

- **WHEN** the target's stat plus the d20 roll is below the difficulty
- **THEN** only the failure effects apply

### Requirement: Effects move only their declared owner

Performer effects SHALL apply to the selected target only. Organization effects SHALL apply
once to the organization and SHALL NOT be multiplied by roster size. Effects of one branch
SHALL be summed by destination before application so repeated fields undergo clamping and
rounding once. Stats, energy, morale, form, audience and reputation SHALL preserve their
existing bounds and numeric discipline; money SHALL remain an unclamped balance.

Effects that cross an energy, morale or money stop threshold SHALL remain observable in the
resolution's applied effects and returned state. They SHALL NOT rewrite the immutable
completed week, append a second retrospective stop reason, or carry a synthetic crossing
into the next week: the incident occurrence has already returned control before the choice.
The following week SHALL use the post-resolution values as its opening snapshot.

#### Scenario: One organization effect lands once

- **WHEN** an incident targeting one member applies an audience effect
- **THEN** the organization audience moves by the declared amount once and no performer value is changed by that effect

#### Scenario: Performer state remains bounded

- **WHEN** a choice would move its target's energy below the scale
- **THEN** the target ends at the existing energy minimum and every other performer is unchanged

#### Scenario: A choice-caused crossing is not delayed

- **WHEN** resolving an incident moves the organization balance from non-negative to negative
- **THEN** the resolution reports the money effect and negative returned balance, while the
  completed week is not rewritten and the next week does not invent a delayed money crossing

### Requirement: Cooldown is global per incident

An incident with cooldown `N` that occurred in week `W` SHALL be ineligible for every target
in weeks `W + 1` through `W + N` and SHALL become eligible again in week `W + N + 1`.
Cooldown zero SHALL permit the incident in the next week. The cooldown SHALL be recorded when
the pending incident resolves; because pending blocks time, resolution timing SHALL NOT
change the eligible week. Other incident ids SHALL remain unaffected.

#### Scenario: Another target does not bypass cooldown

- **WHEN** an incident occurred for one performer and another performer satisfies its conditions during cooldown
- **THEN** the incident remains ineligible until its global cooldown expires

#### Scenario: Zero cooldown permits next week

- **WHEN** an incident with cooldown zero resolves in week four and remains eligible
- **THEN** it may be selected again in week five

### Requirement: Incident randomness is reproducible and isolated

Incident occurrence, weighted selection and stat checks SHALL use an injected, serializable
incident RNG stream. They SHALL NOT read a system RNG or clock. The same run state, incident
input and decisions SHALL produce the same incident sequence, targets, rolls, outcomes,
effects and continuation. Incident draws SHALL NOT advance the random stream owned by another
subsystem, and ineligible content SHALL consume no incident draw.

#### Scenario: Same seed and choices reproduce the sequence

- **WHEN** two runs start from identical state and content and resolve the same choices
- **THEN** they produce identical incidents, targets, rolls, outcomes, cooldowns and final state

#### Scenario: Ineligible content does not drift the stream

- **WHEN** an incident that cannot satisfy its conditions is added to a catalog
- **THEN** every occurrence, target and check in the otherwise identical run remains unchanged

### Requirement: Executable content covers every resolution family

The shipped catalog SHALL contain at least three executable incidents: one whose resolution
changes its target performer directly, one whose resolution changes the organization, and
one whose resolution checks Presence and has distinct success and failure effects. Every
shipped incident SHALL use only behavior the engine implements now; a story whose consequence
depends on an absent contest or relationship mechanic SHALL remain outside executable
content.

#### Scenario: The catalog proves all three paths

- **WHEN** the shipped incident catalog is exercised with declared deterministic inputs
- **THEN** a performer effect, an organization effect, and both branches of a Presence check can each be observed without a code or schema change
