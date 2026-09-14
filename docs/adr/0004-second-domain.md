# ADR 0004: lay the groundwork for a second domain

**Status:** accepted (implementation deferred)

## Context

There is an intent to later build, on the same core, a music band or production label
tycoon. The entity structure matches almost entirely: performers with stats and
character, a collective, a calendar, energy and morale, events, economics, regions,
growth from garage to corporation.

## Decision

The core is designed domain-neutral (`adr/0001`), the domain binding lives in
`src/domain/` and `content/`. The second game is a new set of configs and texts, not a
fork.

There is no need to design the second game now. There is one requirement: **do not
bake anything into the core that would get in the way.** The detailed breakdown of
"what is in the core, what is in config" — section 13 of the concept, copied into
`adr/0001`.

## Deliberate risk

Full abstraction slows down the start of the first game. Practical compromise: do not
carve out abstractions in advance "for the future," but also do not hardcode stat
names, event types, and domain vocabulary into the logic. This is enough.
