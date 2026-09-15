## MODIFIED Requirements

### Requirement: Effects come from a closed set of kinds

An activity's effects SHALL be a list, each item naming one kind from the closed set
`stat`, `energy`, `morale`, `money`, `reputation`, `audience`, with the amount of the
change. A kind outside the set SHALL fail validation. An activity SHALL NOT carry a script,
an expression or any other executable field: what a kind means is decided by code, and
content only chooses the kind and the amount.

#### Scenario: An unknown effect kind is rejected

- **WHEN** an activity declares an effect of kind `chemistry`
- **THEN** content validation fails listing the kinds that are allowed

#### Scenario: A stat effect names one of the six stats

- **WHEN** an activity declares a `stat` effect whose target is not one of the six stats of
  the performer model
- **THEN** content validation fails naming the unknown stat

#### Scenario: An audience effect needs no target

- **WHEN** an activity declares an effect of kind `audience` with an amount
- **THEN** content validation passes: the audience belongs to the org, so there is nothing
  to name

## ADDED Requirements

### Requirement: A money effect declares whether it scales with the audience

A money effect SHALL declare its scaling as either `flat` — a sum that does not depend on
who is watching, such as a fine, a salary or rent — or `audience`, a base the org's reach
multiplies. An effect that declares no scaling SHALL be `flat`, so a file written before
this distinction existed keeps its meaning. A scaling outside the two SHALL fail
validation, naming the ones that are allowed. No other kind of effect SHALL carry a
scaling: a training session is worth the same to a famous org as to an unknown one.

#### Scenario: A cost is flat by default

- **WHEN** a money effect of −400 declares no scaling
- **THEN** content validation passes and the effect is read as a flat sum

#### Scenario: A campaign declares itself audience-driven

- **WHEN** a money effect declares scaling `audience` with an amount of 5000
- **THEN** content validation passes and the amount is read as a base, not as a payout

#### Scenario: An unknown scaling is rejected

- **WHEN** a money effect declares scaling `viewers`
- **THEN** content validation fails listing the scalings that are allowed

#### Scenario: A scaling on another kind is rejected

- **WHEN** a `stat` or `morale` effect declares a scaling
- **THEN** content validation fails: only money is scaled by who is watching
