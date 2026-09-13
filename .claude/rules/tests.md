---
paths:
  - "packages/*/test/**"
  - "tests/**"
---

# Tests

- **The golden and baseline branch is not touched.** Editing `test/golden/**` and `sim/baseline/**`
  is blocked by the `PreToolUse` hook, and the formatter doesn't go there either. Regeneration is
  only on `master`, as a separate commit with a `golden:`/`baseline:` prefix and an explanation
  of what rule change shifted the numbers. Details — `tests/README.md`, `docs/adr/0009`.
- **A red golden means "the simulation drifted,"** not "fix the file." The same applies
  to `it.skip` in a golden test: that's muting the check, not fixing it.
- A test checks observable behavior and an invariant, not how the code is written.
- **Core tests live under softer rules**: domain-neutrality and the import ban are
  deliberately turned off for them — they test the core from the outside, and they need access
  to the filesystem. The ban on type assertions doesn't apply to tests either.
