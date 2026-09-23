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

Engagement ids SHALL be unique and a performer SHALL have at most one stored engagement, since
only current terms are retained. An engagement SHALL NOT name a performer outside its named
collective. Before a week advances, every current member of the collective SHALL have exactly
one engagement covering that absolute week, where coverage means
`startsAtWeek <= week < endsBeforeWeek`. Every rejection SHALL leave the run and every RNG
continuation unchanged.

#### Scenario: A covered member can advance

- **WHEN** the next week is 3 and a member's only engagement starts at week 3 and ends before week
  7
- **THEN** that engagement covers the member for week 3

#### Scenario: The exclusive end does not cover the next week

- **WHEN** the next week is 7 and a member's engagement ends before week 7
- **THEN** advancement is rejected before plan validation, state mutation or RNG movement

#### Scenario: A second stored term is rejected

- **WHEN** a second engagement is stored for a performer who already has one
- **THEN** the terms are rejected without choosing one by array order

#### Scenario: Employment does not change performer serialization

- **WHEN** a performer is serialized before and after an engagement is created
- **THEN** both performer snapshots have the same fields and the engagement exists only in run
  state

### Requirement: A generated performer receives a deterministic quoted rate

A generated performer's weekly-rate quote SHALL equal a required positive base weekly rate
multiplied by the arithmetic mean of the performer's six current stats, the origin rate scale
and the discipline rate scale, rounded once to one tenth. The base rate SHALL carry the absolute
money magnitude so the origin and discipline scales stay relative multipliers; all three SHALL be
explicit, finite and positive. The domain content fields supplying them SHALL be required and
positive and SHALL have no code fallback.

Age, peak age, potential, traits, energy, morale and form SHALL NOT enter the quote. Quotation SHALL
consume no RNG value and SHALL NOT change performer generation order or continuation. Once copied
into an engagement, a rate SHALL remain materialized and SHALL NOT follow later stat, content or
scale changes.

#### Scenario: The same generated profile quotes the same rate

- **WHEN** identical performer stats and identical base rate, origin and discipline rate scales
  are quoted twice
- **THEN** both results are identical to one tenth and every RNG continuation is unchanged

#### Scenario: Temporary state does not change a quote

- **WHEN** two otherwise identical performers differ only in energy, morale and form
- **THEN** they receive the same quote

#### Scenario: Hidden potential does not leak into price

- **WHEN** two performers have identical current stats but different potential and peak age
- **THEN** they receive the same quote

#### Scenario: Missing base rate or scale has no fallback

- **WHEN** a discipline omits its base weekly rate, or a region or discipline omits its rate
  scale, or any of them supplies a non-positive value
- **THEN** content validation fails before a performer is quoted

#### Scenario: Magnitude and relative scales are separable

- **WHEN** only the base weekly rate changes
- **THEN** every quote moves by that same factor and the ratio between two origins is unchanged

### Requirement: Renewal and termination are explicit boundary operations

Renewing an engagement SHALL be allowed only when its `endsBeforeWeek` is at or before the run's
current next week. It SHALL preserve the engagement, performer and collective identities, start
the replacement term at the current next week, and require a later exclusive end week. Its rate
SHALL be the deterministic quote for that performer's current stats and current rate inputs; a
caller SHALL NOT supply a rate. Renewal SHALL consume no randomness.

Terminating a current or expired engagement between weeks SHALL atomically remove both that
engagement and its performer from the collective, SHALL apply no fee or other organization effect,
and SHALL consume no randomness. Terminating the collective's last remaining engagement SHALL be
rejected, so a run cannot reach a memberless state that owes nothing and can do nothing while
recruitment does not exist. Renewal and termination SHALL both reject while an incident is
pending, preserving the incident target until resolution. Every rejected operation SHALL leave
state and RNG continuations unchanged.

#### Scenario: Renewal covers the next week at the current quote

- **WHEN** an engagement ends before week 7 and is renewed at the boundary with end week 11
- **THEN** the replacement term covers weeks 7 through 10 and carries the quote for that
  performer's current stats, not the expired rate and not a caller-chosen number

#### Scenario: A stale boundary can still be renewed

- **WHEN** restored state contains an engagement whose end week is earlier than the current next
  week
- **THEN** renewal is accepted and starts its replacement term at the current next week

#### Scenario: Early renewal is rejected

- **WHEN** an engagement still covers the current next week
- **THEN** renewal is rejected without changing its rate or dates

#### Scenario: Growth is priced only at a boundary

- **WHEN** a performer's stats grow during a term and that term is later renewed
- **THEN** the charged rate is unchanged until the boundary and becomes the grown quote from the
  replacement term's first week

#### Scenario: Termination removes both sides of membership

- **WHEN** a member's engagement is terminated between weeks
- **THEN** the engagement and member are absent together and no money or RNG state moves

#### Scenario: The last engagement cannot be terminated

- **WHEN** termination would leave the collective with no members
- **THEN** it is rejected and both the engagement and the member remain

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
