---
paths:
  - "tools/**/*.ts"
  - "tools/**/*.mts"
---

# Tools

- **One toolchain.** Tools are written in TypeScript and run via `pnpm`,
  not in Python. Reason — `docs/adr/0008`.
- **Domain-neutrality doesn't extend here.** `tools/` is not the core, esports
  words are allowed here.
- **`as` is allowed** at the boundary where external data is parsed (`unknown` → type after
  schema validation). The ban in `docs/adr/0010` covers `packages/*/src/**` only — a
  deliberate difference: a mis-typed tool fails loudly, a mis-typed core corrupts the
  simulation. Two rules still apply here, repository-wide: `no-non-null-assertion` and
  `no-unnecessary-type-assertion`.
- **Tests under `tools/` are not covered by `.claude/rules/tests.md`** (its globs are
  `packages/*/test/**` and `tests/**`). The golden and baseline discipline applies to them
  all the same: `sim/baseline/**` is protected wherever it lands.
