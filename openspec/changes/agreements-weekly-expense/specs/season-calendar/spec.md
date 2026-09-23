## MODIFIED Requirements

### Requirement: The season boundary preserves the run and resets only season-owned state

A completed season SHALL retain its immutable result until the caller explicitly starts the
next season. Starting the next season SHALL increment the season number, begin at the run's
next absolute week, construct a new calendar, install the newly declared goal, and reset the
relative position, week-kind counts, interruption counts and contest facts.

Organization state, collective membership, engagements, the consecutive-negative-week count,
every performer field including energy, morale, form and age, incident lifecycle state, and every
non-season RNG continuation SHALL carry forward unchanged. Starting the next season SHALL be
rejected while an incident choice, an expired engagement or another required resolution from the
completed season remains pending.

#### Scenario: People and organization carry across the boundary

- **WHEN** season 2 starts after season 1 completed with changed balance, audience, performer
  energy, morale and form
- **THEN** season 2 begins with those exact values and with fresh season-owned accumulators

#### Scenario: Engagement expense state carries across the boundary

- **WHEN** a season completes with current engagements and a non-zero consecutive-negative-week
  count
- **THEN** the next season begins with the same engagement terms and count rather than re-quoting,
  resetting or charging them

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
