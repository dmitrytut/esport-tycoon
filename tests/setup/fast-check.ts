// Global fast-check configuration, applied through vitest `setupFiles`.
//
// The seed is pinned on purpose. A property test that picks a fresh seed on every run fails
// once in twenty runs and passes the other nineteen, and in this repository a red test means
// "the simulation drifted" — a flaky one destroys that meaning. With a fixed seed a failure
// is reproducible and a green run is a fact about the same inputs as yesterday.
//
// Widening the search is then a deliberate act: raise `numRuns` or change the seed in its own
// commit, the same way a golden snapshot is regenerated (docs/adr/0014).
import fc from "fast-check";

fc.configureGlobal({
  seed: 20260914,
  numRuns: 300,
  // A counterexample must come back as the smallest failing input, not the first one found.
  endOnFailure: true,
});
