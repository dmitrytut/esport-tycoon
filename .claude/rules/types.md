---
paths:
  - "packages/*/src/**/*.ts"
  - "packages/*/src/**/*.mts"
---

# Typing discipline for production code

The reason for everything below — `docs/adr/0010`.

- **Type assertions are forbidden**, except `as const`. `satisfies` is not a substitute: it
  checks a finished value rather than asserting an unverified one. Rewrite so the type
  is inferred — see the `statsFrom` example in `packages/core/src/performer.ts`. A provably safe
  case gets an `eslint-disable` with an explanation, not silence.
- **Anonymous object types on the module surface are forbidden**: such a type can't be
  reused and can't be named in a spec. Declare a named type or interface next to it.
  Inside a function body a local shape is fine — the rule only looks at type positions
  outside implementations (`et/no-anonymous-shape`).
- **Identifiers are branded** (`Seed`, `PerformerId`), so the compiler can't let them
  be confused with bare `number`/`string`.
- **States are tagged unions** with a `kind` field, not a bag of optional fields.
- Code, names and comments are English (`docs/adr/0011`).
- **A type and a constant live in the module whose code holds their invariant.** A separate
  `types.ts` or `consts.ts` appears only from a third consumer on — the same "third
  consumer" test by which packages are split. Suffix layouts (`name.type.ts`,
  `name.interface.ts`) were rejected in `docs/adr/0010` with reasons.