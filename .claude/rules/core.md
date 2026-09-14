---
paths:
  - "packages/core/src/**/*.ts"
---

# Core

This file points at checks; it does not copy their contents. When a list here and a check
disagree, the check wins — it is what the gate actually runs.

- **Domain-neutral.** Not a single esports word. The authoritative list of forbidden words
  is `FORBIDDEN_CORE_WORDS` in `eslint.config.mjs`; the domain-neutral vocabulary to use
  instead is `docs/glossary.md`. Enforced by `et/no-domain-words`. Reason — `docs/adr/0001`.
- **Deterministic.** No system randomness and no wall clock: everything goes through the
  injected `Rng`. The authoritative list of banned globals and properties is the
  `no-restricted-globals` / `no-restricted-properties` block in `eslint.config.mjs`.
  Reason — `docs/adr/0002`.
- **Depends on nothing.** No `@et/*`, `node:*`, filesystem or `pixi.js` imports — the core
  has no I/O and no rendering. Enforced by `no-restricted-imports` (`docs/adr/0001`, `0008`).
- **The type and the constant live next to the code that holds their invariant.** Separate
  `types.ts` and `consts.ts` appear only from a third consumer on. This is not checked by
  any rule — it is a convention from `docs/adr/0010`, and it holds for every package,
  not just this one.

Read the whole ADR only if a rule seems wrong — that's where the reason and the rejected
alternatives are.
