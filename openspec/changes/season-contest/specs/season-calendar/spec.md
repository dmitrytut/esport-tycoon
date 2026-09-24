## MODIFIED Requirements

### Requirement: The season boundary preserves the run and resets only season-owned state

A completed season SHALL retain its immutable result until the caller explicitly starts the
next season. Starting the next season SHALL increment the season number, begin at the run's
next absolute week, construct a new calendar, install the newly declared goal, and reset the
relative position, week-kind counts, interruption counts, contest facts, the season's opponent
field and its encounters.

Organization state, collective membership, engagements, the consecutive-negative-week count,
every performer field including energy, morale, form and age, incident lifecycle state, and every
non-season RNG continuation — including the `contest` and `encounter` continuations — SHALL carry
forward unchanged. Starting the next season SHALL be rejected while an incident choice, an
expired engagement or another required resolution from the completed season remains pending.

#### Scenario: People and organization carry across the boundary

- **WHEN** season 2 starts after season 1 completed with changed balance, audience, performer
  energy, morale and form
- **THEN** season 2 begins with those exact values and with fresh season-owned accumulators

#### Scenario: Engagement expense state carries across the boundary

- **WHEN** a season completes with current engagements and a non-zero consecutive-negative-week
  count
- **THEN** the next season begins with the same engagement terms and count rather than re-quoting,
  resetting or charging them

#### Scenario: The field and encounters are season-owned, continuations are not

- **WHEN** season 2 starts after a season whose marked entries were all settled
- **THEN** season 2 begins with no opponent field and no encounters of its own, so its opponents
  are materialized afresh, while the `contest` and `encounter` continuations carry forward so the
  next field and Contest follow the same streams

#### Scenario: Pending resolution holds the boundary

- **WHEN** the final week completed with an unresolved incident
- **THEN** the season result remains available, but starting the next season is rejected until
  that incident is resolved

#### Scenario: Expired engagement holds the boundary

- **WHEN** an engagement expires on the final season week
- **THEN** the season result remains available, but starting the next season is rejected until the
  engagement is renewed or terminated

#### Scenario: Starting the next season is explicit

- **WHEN** a season is complete and no next-season operation is requested
- **THEN** repeated reads return the same completed result and no calendar or RNG state moves

### Requirement: All continuation-bearing season state is explicit

The authoritative season state SHALL be a tagged active or completed value. It SHALL retain
the season number, absolute starting week and relative position, template content id,
materialized calendar, declared goal, accumulated `WeekKindCounts`, uninterrupted count and
total, recorded contest facts, the materialized opponent field once it exists, the encounter held
by each marked entry that has one, season-calendar RNG continuation, and the completed result at
the boundary. No one of those
values SHALL be recoverable only from process memory or a system clock.

The opponent field SHALL be retained for the whole season so a repeated opponent is the same
Collective rather than a regenerated one. An encounter SHALL be stored against the identity of
exactly one marked calendar entry, and both the field and the encounters SHALL be owned by the
season-contest capability rather than interpreted here: season code SHALL NOT read an opponent, a
Contest result, a reward or a metric while classifying a week, accepting a fact, evaluating a
goal or producing a result.

These fields SHALL define the season-owned portion that issue #20 later includes in
`RunSnapshot`, together with the run's root seed. Derived shares and the achieved flag MAY be
recomputed only from the retained authoritative values and SHALL produce the identical
result.

#### Scenario: Restored state has the same continuation

- **WHEN** an active season value and its run state are copied through a JSON-compatible
  representation and advancement resumes with the same decisions
- **THEN** the remaining calendar, contest acceptance, RNG continuation and final result are
  identical to uninterrupted advancement

#### Scenario: Completed state preserves its evidence

- **WHEN** a completed season value is inspected before the next season starts
- **THEN** its goal, calendar, facts, field, encounters, counts, RNG continuation and result are
  all still present without regenerating any of them

#### Scenario: Season code does not read an encounter

- **WHEN** a marked entry holds a settled encounter naming a field member, a Contest result and a
  reward
- **THEN** week classification, fact acceptance, goal evaluation and the season result use only
  the recorded outcome and week observations, and none of them reads the opponent, the moments,
  the metrics or the reward
