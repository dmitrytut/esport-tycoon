---
paths:
  - "packages/*/src/**/*.ts"
  - "tools/*/src/**/*.ts"
---

# Comments

Reason for all of it — `docs/adr/0013`.

- **Short, but enough** to understand the piece without reading it. One or two sentences.
- **Say what it is for, which invariant it holds, or why it is done this way** — never what
  the line already says. `// increments the counter` above `counter += 1` is worse than
  nothing: it takes space and ages separately from the code.
- **Required**: exported declarations (classes, functions, types, interfaces, constants),
  fields of types and interfaces, complex logic, utilities. Enforced by
  `et/require-comment`, which checks presence only — being enough is on you.
- **Optional**: anything inside a function body, local variables.
- **A comment covers a run of neighbours** with no blank line between them: a block of
  related bounds under one header needs one comment, not six.
- Units, ranges and bounds belong in the comment on the field: the type says `number` and
  nothing else.
