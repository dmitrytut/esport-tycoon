# ADR 0014: property tests with a pinned seed

**Status:** accepted
**Date:** 2026-09-14
**Related:** `adr/0002` (determinism), `adr/0009` (golden and baseline discipline)

## Context

The core is a set of numeric rules with invariants no type carries: a stat lives on 1–20,
energy on 0–100, form on −3…+3, the shown range of a hidden value always contains the truth.
Two kinds of test existed for them.

Unit tests check the cases someone thought of. Golden tests catch a drift after the fact, on
one seed, at a few fixed points — a snapshot answers "something moved", never "this rule can
be broken by this input".

The gap is specific. `applyStatChange` clamps; nothing tried it with a delta of −50 on a stat
of 3. `observe` promises the range contains the true value; nothing tried it on a performer
whose stat sits at the edge of the scale, where clamping and the random offset meet.

## Decision

`fast-check` as a dev dependency, property tests in `packages/core/test/property/`, one file
per module. A property states an invariant that must hold for every input the game can
produce, and the library searches for a counterexample and shrinks it to the smallest one.

**The seed is pinned** — `fc.configureGlobal({ seed, numRuns: 300 })` in
`tests/setup/fast-check.ts`, wired through vitest `setupFiles`. Widening the search is a
deliberate act: raise `numRuns` or change the seed in its own commit, the same way a golden
snapshot is regenerated.

**Inputs come from the generator, not from field-by-field records.** `performerArb` builds a
performer through `generatePerformer` with arbitrary seeds and parameters. A record assembled
by hand would let the search invent people the game can never produce, and a counterexample
nobody can reach is noise, not a defect.

## Rejected options

- **A fresh seed on every run.** It finds more over a year and lies more every week: a test
  that fails once in twenty runs destroys the rule that a red test means the simulation
  drifted. The same reasoning already fixed the seeds of the golden tests.
- **Property tests instead of golden.** They answer different questions. A property says a
  rule cannot be broken; a golden says the numbers are the same as yesterday. Balance work
  needs the second one.
- **Arbitrary performers built field by field.** Wider inputs, weaker conclusions — see above.
- **A high `numRuns` in CI and a low one locally.** Then CI fails on something the author
  cannot reproduce, which is the flakiness problem wearing a different hat.

## Consequences

- The invariants of the core are now written down as executable statements: 26 properties
  across the RNG, the performer model, the fog and the generator.
- Validated by mutation, not by assumption: removing the upper bound from `clamp` fails six
  properties, dropping the "truth is inside the range" correction in `observe` fails two,
  breaking the swap in `shuffle` fails one.
- Cost: the suite grows by about 300 runs per property, which is around 0.6 s in total today.
  When it stops being free, `numRuns` is the dial.
- Cost: an invariant not written as a property is still unprotected. This is a floor, not a
  proof.
