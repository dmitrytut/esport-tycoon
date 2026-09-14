---
paths:
  - "packages/*/test/**"
  - "tests/**"
---

# Tests

- **The golden and baseline directory is not touched from a work branch.** Editing
  `test/golden/**` and `sim/baseline/**` is blocked by the `PreToolUse` hook, and neither the
  formatter nor `eslint --fix` goes there. Regeneration is its own pull request containing a
  single commit prefixed `golden:`/`baseline:` that explains which rule change moved the
  numbers. There is no other route: `master` only takes pull requests (`docs/adr/0009`).
- **A red golden means "the simulation drifted,"** not "fix the file." The same applies
  to `it.skip` in a golden test: that's muting the check, not fixing it.
- A test checks observable behavior and an invariant, not how the code is written. The one
  deliberate exception is `purity.test.ts`, which asserts a property of the package manifest
  itself — that is why the filesystem import ban is lifted here.
- **Exactly two rules are lifted for core tests**: `et/no-domain-words` and
  `no-restricted-imports`. The first because these tests describe the core from the outside,
  the second because they read the manifest. Everything else still applies: `no-restricted-globals`
  and `no-restricted-properties` stay on, so `Date.now()` and `Math.random()` fail the gate
  in a test exactly as they do in `src`.
- **Type assertions are allowed in tests** — the ban in `docs/adr/0010` covers
  `packages/*/src/**` only. `no-non-null-assertion` and `no-unnecessary-type-assertion` are
  repository-wide and do apply here.
