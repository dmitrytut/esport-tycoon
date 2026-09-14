# activity-catalog Specification

## Purpose
Activities are the things a slot of the week can be spent on. They are data, so the balance
of their costs and effects can be tuned without touching code.

## Requirements

### Requirement: An activity is a content file, not code

Every activity SHALL live as one file under `content/activities/`, named after its `id`,
validated against `content/schema/activity.schema.json`, and loaded by the same content
pipeline as the other entity types. Adding, removing or re-balancing an activity SHALL NOT
require a change to code.

#### Scenario: A new activity is added by adding a file

- **WHEN** a valid activity file is added to `content/activities/` and content validation is
  run
- **THEN** validation passes and the activity is available to a week plan without any code
  change

#### Scenario: The file name must match the id

- **WHEN** an activity file's name does not match the `id` inside it
- **THEN** content validation fails naming the file and the mismatch

### Requirement: An activity declares its cost in slots and energy

An activity SHALL declare a slot cost that is an integer of at least 1, and an energy cost
that is a number of at least 0 charged to each participant. Both SHALL be required fields;
a file missing either, or carrying a value outside those bounds, SHALL fail validation.

#### Scenario: A zero-slot activity is rejected

- **WHEN** an activity declares a slot cost of 0
- **THEN** content validation fails: a slot is the unit of attention and an activity that
  costs none is free

#### Scenario: A three-slot activity is accepted

- **WHEN** an activity declares a slot cost of 3 and an energy cost of 45
- **THEN** content validation passes

### Requirement: An activity declares who it applies to

An activity SHALL declare its target as either the whole collective or a single named
member chosen when the activity is planned. The target SHALL decide who pays the energy
cost and who receives the effects.

#### Scenario: A collective-wide activity

- **WHEN** an activity targeting the whole collective is executed
- **THEN** every eligible member pays the energy cost and receives the effects

#### Scenario: A single-member activity needs a member

- **WHEN** an activity targeting a single member is planned without naming one
- **THEN** the plan is rejected before any week is advanced

### Requirement: Effects come from a closed set of kinds

An activity's effects SHALL be a list, each item naming one kind from the closed set
`stat`, `energy`, `morale`, `money`, `reputation`, with the amount of the change. A kind
outside the set SHALL fail validation. An activity SHALL NOT carry a script, an expression
or any other executable field: what a kind means is decided by code, and content only
chooses the kind and the amount.

#### Scenario: An unknown effect kind is rejected

- **WHEN** an activity declares an effect of kind `chemistry`
- **THEN** content validation fails listing the kinds that are allowed

#### Scenario: A stat effect names one of the six stats

- **WHEN** an activity declares a `stat` effect whose target is not one of the six stats of
  the performer model
- **THEN** content validation fails naming the unknown stat

### Requirement: Content referential integrity covers activities

Content validation SHALL check every identifier an activity refers to — stats, disciplines,
traits — against the entities that exist, and SHALL fail on a reference that points at
nothing. Activities SHALL be reported by the validator the same way the other entity types
are.

#### Scenario: A reference to a missing discipline

- **WHEN** an activity restricts itself to a discipline id that has no file in
  `content/disciplines/`
- **THEN** content validation fails naming the activity and the missing id

#### Scenario: The validator counts activities

- **WHEN** content validation runs on a tree that contains activities
- **THEN** its report includes activities alongside disciplines, traits, events, regions and
  name pools
