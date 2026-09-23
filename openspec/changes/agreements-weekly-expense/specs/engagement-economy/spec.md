## Purpose

Engagement economy makes the recurring cost of retaining performers explicit, deterministic and
predictable while keeping employment terms separate from a performer's identity.

## ADDED Requirements

### Requirement: An engagement is separate authoritative run state

An `Engagement` SHALL identify itself, one performer and one collective, and SHALL retain a
positive weekly rate on the one-tenth money grid, an inclusive non-negative integer start week and
an exclusive integer end week greater than its start. Engagements SHALL be stored separately from
`Performer` and `Collective`; neither performer identity nor `PerformerSnapshot` SHALL gain
employment fields.

Engagement ids SHALL be unique. Intervals for one performer SHALL NOT overlap. An engagement SHALL
NOT name a performer outside its named collective. Before a week advances, every current member of
the collective SHALL have exactly one engagement covering that absolute week, where coverage means
`startsAtWeek <= week < endsBeforeWeek`. Every rejection SHALL leave the run and every RNG
continuation unchanged.

#### Scenario: A covered member can advance

- **WHEN** the next week is 3 and a member's only engagement starts at week 3 and ends before week
  7
- **THEN** that engagement covers the member for week 3

#### Scenario: The exclusive end does not cover the next week

- **WHEN** the next week is 7 and a member's engagement ends before week 7
- **THEN** advancement is rejected before plan validation, state mutation or RNG movement

#### Scenario: Overlapping terms are rejected

- **WHEN** two engagements for one performer cover any common absolute week
- **THEN** the terms are rejected without choosing one by array order

#### Scenario: Employment does not change performer serialization

- **WHEN** a performer is serialized before and after an engagement is created
- **THEN** both performer snapshots have the same fields and the engagement exists only in run
  state

### Requirement: A generated performer receives a deterministic quoted rate

A generated performer's weekly-rate quote SHALL equal the arithmetic mean of the performer's six
current stats multiplied by the origin rate scale and discipline rate scale, rounded once to one
tenth. Both scales SHALL be explicit, finite and positive. The domain content fields supplying
them SHALL be required and positive and SHALL have no code fallback.

Age, peak age, potential, traits, energy, morale and form SHALL NOT enter the quote. Quotation SHALL
consume no RNG value and SHALL NOT change performer generation order or continuation. Once copied
into an engagement, a rate SHALL remain materialized and SHALL NOT follow later stat, content or
scale changes.

#### Scenario: The same generated profile quotes the same rate

- **WHEN** identical performer stats and identical origin and discipline rate scales are quoted
  twice
- **THEN** both results are identical to one tenth and every RNG continuation is unchanged

#### Scenario: Temporary state does not change a quote

- **WHEN** two otherwise identical performers differ only in energy, morale and form
- **THEN** they receive the same quote

#### Scenario: Hidden potential does not leak into price

- **WHEN** two performers have identical current stats but different potential and peak age
- **THEN** they receive the same quote

#### Scenario: Missing scale has no fallback

- **WHEN** a region or discipline omits its rate scale or supplies a non-positive value
- **THEN** content validation fails before a performer is quoted

### Requirement: Renewal and termination are explicit boundary operations

Renewing an engagement SHALL be allowed only when it expired at the run's current next week. It
SHALL preserve the engagement, performer and collective identities, start the replacement term at
the current next week, and require an explicit positive rate and a later exclusive end week. It
SHALL NOT derive a new rate or consume randomness.

Terminating a current or expired engagement between weeks SHALL atomically remove both that
engagement and its performer from the collective, SHALL apply no fee or other organization effect,
and SHALL consume no randomness. Renewal and termination SHALL both reject while an incident is
pending, preserving the incident target until resolution. Every rejected operation SHALL leave
state and RNG continuations unchanged.

#### Scenario: Renewal covers the next week

- **WHEN** an engagement ends before week 7 and is renewed at the boundary with end week 11 and an
  explicit rate
- **THEN** the replacement term covers weeks 7 through 10 and keeps the supplied rate unchanged

#### Scenario: Early renewal is rejected

- **WHEN** an engagement still covers the current next week
- **THEN** renewal is rejected without changing its rate or dates

#### Scenario: Termination removes both sides of membership

- **WHEN** a member's engagement is terminated between weeks
- **THEN** the engagement and member are absent together and no money or RNG state moves

#### Scenario: Incident resolution precedes departure

- **WHEN** an incident is pending for a performer whose engagement also expired
- **THEN** termination and renewal reject until that incident has been resolved

### Requirement: The next planning block has an exact expense forecast

A pure engagement forecast SHALL accept a horizon from four through six weeks. For each future
week whose collective membership remains covered by current engagements, it SHALL return the
engagement ids that would be charged, the total scheduled expense and the projected closing
balance under zero additional income. It SHALL list engagements expiring at each boundary and the
first projected negative week within the determinate prefix, or none when that prefix never ends
negative.

The forecast SHALL stop projecting balances from the first week whose membership depends on an
expired engagement. It SHALL mark that suffix unavailable rather than assuming renewal,
termination or a replacement rate. It SHALL read no RNG and mutate no state. When membership and
terms remain unchanged, every actual recurring debit in the determinate prefix SHALL equal its
forecast.

#### Scenario: Forecast matches unchanged settlement

- **WHEN** a four-week forecast contains no expiration and those four weeks advance without a
  membership or term change
- **THEN** every forecast engagement id and expense equals the corresponding completed week's
  recurring-expense evidence

#### Scenario: An expiration ends the determinate prefix

- **WHEN** an engagement's last paid week is the second week of a four-week forecast
- **THEN** the forecast shows that second-week expiration and does not invent closing balances for
  weeks three and four

#### Scenario: Zero-income runway is explicit

- **WHEN** scheduled expenses alone first make the projected closing balance negative in a
  determinate week
- **THEN** the forecast identifies that absolute week

### Requirement: Continuation state retains materialized terms and the negative series

The continuation-bearing state later consumed by issue #20 SHALL include every current engagement
field and the run's consecutive-negative-week count. Restoring current-version state SHALL use the
materialized rate and term; it SHALL NOT regenerate a performer, re-quote a rate or reread current
content to replace accepted terms. Forecast output and past week results SHALL be derivable or
historical output rather than required continuation state.

#### Scenario: JSON-compatible state preserves terms

- **WHEN** run state is copied through a JSON-compatible representation
- **THEN** every engagement id, relationship, rate and week boundary and the negative-week count
  remain identical

#### Scenario: Content changes do not reprice an accepted term

- **WHEN** a restored engagement was accepted under earlier content scale values
- **THEN** its stored weekly rate remains unchanged
