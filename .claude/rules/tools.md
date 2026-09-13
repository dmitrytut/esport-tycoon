---
paths:
  - "tools/**/*.ts"
---

# Tools

- **One toolchain.** Tools are written in TypeScript and run via `pnpm`,
  not in Python. Reason — `docs/adr/0008`.
- **Domain-neutrality doesn't extend here.** `tools/` is not the core, esports
  words are allowed here.
- **Type assertions are allowed** at the boundary where external data is parsed (`unknown` → type
  after schema validation). Inside the core they are forbidden — this is a deliberate difference,
  `docs/adr/0010`.
