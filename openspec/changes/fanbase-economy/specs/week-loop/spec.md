## MODIFIED Requirements

### Requirement: Money is credited and debited by activity effects

An activity effect on money SHALL change the run's balance by the amount it resolves to: a
flat effect by its declared amount, an audience-driven effect by its declared base scaled
by the org's reach. The reach SHALL be read from the audience the org holds at the moment
the activity is executed, so an activity earlier in the same week that grew the audience is
already reflected. A balance SHALL be allowed to go negative, and the week in which it
crosses zero downward SHALL produce the money stop reason.

#### Scenario: A flat effect pays its amount

- **WHEN** an activity whose effect credits a flat 400 is executed
- **THEN** the balance has risen by exactly 400, whatever the audience is

#### Scenario: A stream pays

- **WHEN** an activity whose effect credits an audience-driven base is executed
- **THEN** the balance has risen by that base scaled by the org's reach, which is less than
  the base

#### Scenario: A week's own audience gain counts

- **WHEN** one week plans an activity that grows the audience and then an audience-driven
  activity
- **THEN** the second is paid at the grown audience, not at the audience the week opened
  with

#### Scenario: The balance falls through zero

- **WHEN** a week's debits take the balance from a positive number to a negative one
- **THEN** the week produces the money stop reason, and a later week that stays negative
  does not produce it again
