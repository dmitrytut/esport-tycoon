---
paths:
  - "packages/*/src/**/*.ts"
---

# Typing discipline for production code

The reason for everything below — `docs/adr/0010`.

- **Type assertions are forbidden**, except `as const`. `satisfies` is not a substitute: it
  checks a finished value rather than asserting an unverified one. Rewrite so the type
  is inferred — see the `statsFrom` example in `packages/core/src/performer.ts`. A provably safe
  case gets an `eslint-disable` with an explanation, not silence.
- **Anonymous object types in exported signatures are forbidden**: such a type can't
  be reused and can't be named in a spec. Create a named type next to it instead.
- **Identifiers are branded** (`Seed`, `PerformerId`), so the compiler can't let them
  be confused with bare `number`/`string`.
- **States are tagged unions** with a `kind` field, not a bag of optional fields.
- Code, names and comments are English (`docs/adr/0011`).
