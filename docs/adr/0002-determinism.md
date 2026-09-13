# ADR 0002: full determinism by seed

**Status:** accepted

## Context

The game is a simulation with a large amount of randomness: match outcomes, player
breakdowns, event rolls, player generation. Code like this has an unpleasant property:
a balance regression is not visible either to the eye or to ordinary unit tests. In
agent-driven development, where changes are made often and in different places, this
is fatal.

## Decision

1. The single source of randomness is the RNG module, which accepts a seed. System
   random number functions are forbidden everywhere in the code except this module.
2. The RNG is passed explicitly (injected), not taken from global state.
3. Each subsystem receives its own stream derived from the root seed, so a change in
   one does not shift the sequence in another.
4. The save game contains the seed and the stream state: loading reproduces the
   continuation.
5. The same seed plus the same sequence of user decisions produce a bit-for-bit
   identical season.

## Consequences

- A sim-harness (`specs/0002`) and golden tests on outcomes become possible.
- A report of "what changed in the balance after this commit" becomes possible.
- Cost: randomness cannot be called lazily from anywhere. This is a deliberate
  tradeoff.
