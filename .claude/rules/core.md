---
paths:
  - "packages/core/src/**/*.ts"
---

# Core

- **Domain-neutral.** Not a single esports word: `Performer`, `Contest`,
  `Collective`, `Season` — yes; `Player`, `Match`, `Tournament`, `Frag` — no.
  Checked by the `et/no-domain-words` rule. Reason — `docs/adr/0001`.
- **Deterministic.** There is no system random number generator: all randomness goes through the
  injected `Rng`. `Date`, `performance`, `crypto`, `Math.random`, and platform-dependent
  `Math.sin/cos/tan/exp/log/pow` are forbidden. Reason — `docs/adr/0002`.
- **Depends on nothing.** Importing another `@et/*`, `node:*`, the filesystem,
  or `pixi.js` is forbidden: the core has no I/O and no rendering (`docs/adr/0001`, `0008`).
- **The type and the constant live next to the code that holds their invariant.** Separate
  `types.ts` and `consts.ts` are created only starting from a third consumer (`docs/adr/0010`).

It's worth reading the whole ADR only if a rule seems wrong — that's where the reason
and rejected alternatives are.
