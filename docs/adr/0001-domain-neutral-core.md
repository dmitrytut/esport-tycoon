# ADR 0001: the core is domain-neutral

**Status:** accepted

## Context

The game is structured as one engine and several configs: three disciplines now, a
fourth and fifth later. Separately there is an intent to build, on the same core, a
game about a music band or a production label.

## Decision

`[ARCHITECTURE REQUIREMENT]` The core is designed domain-neutral, so that a second
game — a music band / production label tycoon — can be built on it without rewriting
the engine.

Practical rule: **the core code must contain no esports vocabulary.** Everything
domain-specific lives in configs and text resources.

What stays in the core as-is:
- The "performer" entity (player → artist): stats, traits, state, age curve,
  information fog
- The "collective" entity (team → band): variable-size roster, chemistry and pair
  conflicts
- The week calendar, the slot pool, the block plan, the "next" button, weeks of
  different weight
- Energy, morale, form, and weighted-breakdown logic
- Organization economics, contracts, debts, reputation, loss conditions
- Event system with choices and consequences
- Regions and logistics
- Acts (growth of the player's role) and infrastructure
- Collective serialization for server-side simulation

What is parameterized by config:
- Stat names and weights (Mechanics/Head → Technique/Musicality/Stage, etc.)
- "Discipline" → format/genre
- "Match" → performance or release: the same contest engine (momentum bar + discrete
  score + moment feed + intervention windows), but the score becomes crowd reaction or
  chart position, and the table columns become their own metrics
- Income sources (prize money/sponsors → royalties/labels/tours)
- All texts, events, art

There is no need to design the second game now — it is enough not to bake anything
into the core that would get in the way.

## How this is enforced

A linter rule for forbidden words in `src/core/`. The list of forbidden terms is in
`docs/glossary.md`, along with the mapping table.
