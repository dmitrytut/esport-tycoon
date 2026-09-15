## Purpose

The audience is how many people follow the organization. It is what makes an offer worth
money: in a basement nobody is watching, and the same campaign in an organization with a
following pays for itself many times over.

## ADDED Requirements

### Requirement: The audience is a value of the org that only an effect moves

The org SHALL carry an audience: a count of people following it, at least zero and not
bounded above. It SHALL change only as the explicit result of an activity effect of kind
`audience`, and SHALL NOT drift, decay or grow between two calls. An audience effect SHALL
be applied once per execution of the activity rather than once per participant, because the
audience belongs to the org and not to the people who took part.

#### Scenario: An activity gains followers

- **WHEN** an activity whose effect is audience 400 is executed by four participants
- **THEN** the audience has risen by 400, not by 1600

#### Scenario: Nothing moves without an effect

- **WHEN** a block of weeks is advanced and no planned activity carries an audience effect
- **THEN** the audience at the end of the block equals the audience at its start

#### Scenario: The audience does not go negative

- **WHEN** an effect would take the audience below zero
- **THEN** it settles at zero, and no value of the run is left outside its scale

### Requirement: An audience-driven payout is its base scaled by reach

Money credited by an audience-driven effect SHALL be its declared base multiplied by a
reach factor derived from the org's audience. The reach factor SHALL be zero when the
audience is zero, SHALL rise strictly as the audience rises, and SHALL never reach or
exceed one, so a base is an unreachable ceiling rather than a payout. The factor SHALL be
computed from addition, subtraction, multiplication and division alone: `adr/0002` forbids
`Math.pow`, `Math.log` and `Math.exp` in core, because a curve whose last digit depends on
the machine makes a snapshot worthless.

#### Scenario: Nobody is watching

- **WHEN** an audience-driven effect with a base of 5000 is executed at an audience of zero
- **THEN** it credits nothing, and the activity still costs its slots and its energy

#### Scenario: A larger audience pays more, and never the whole base

- **WHEN** the same audience-driven effect is executed at two different audiences, one
  larger than the other
- **THEN** the larger audience credits strictly more than the smaller one, and both credit
  strictly less than the base

#### Scenario: The same audience always pays the same

- **WHEN** an audience-driven effect is executed twice from the same audience
- **THEN** both executions credit exactly the same amount

### Requirement: Returns on the audience diminish

Equal additions to the audience SHALL produce ever smaller additions to the payout: the
curve SHALL be concave, so growing an audience is worth most while it is small and the
value of a following is never a straight line. The audience at which a base pays half of
itself SHALL be a named constant of the model, so the balance track can retune the whole
curve by moving one number.

#### Scenario: The second doubling is worth less than the first

- **WHEN** an audience-driven effect is executed at the half-reach audience, at twice it,
  and at four times it
- **THEN** the gain from the first doubling is strictly larger than the gain from the
  second
