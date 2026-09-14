# ADR 0013: comments on the module surface

**Status:** accepted
**Date:** 2026-09-14
**Related:** `adr/0010` (style and type discipline)

## Context

`adr/0010` settled how code is written but said only one thing about comments: a comment
explains the reason, not the line. That leaves the question of where a comment is required
unanswered, and an agent starting in a clean worktree answers it differently every session —
generously in the first file, not at all by the fifth.

The cost of the gap is specific here. The core is numeric rules with invariants that the
types do not carry: `form` is `number`, and that it lives in −3…+3 as a fraction of the stat
scale exists only in someone's head. A reader of `readonly form: number` learns nothing.

## Decision

**Style.** Short, but enough to understand the commented piece without reading it. One or
two sentences, not a paragraph. A comment says what the thing is for, which invariant it
holds, or why it is done this way — never what the line already says. `// increments the
counter` above `counter += 1` is worse than no comment: it takes space and ages separately
from the code.

**Required:**

| Where | Why |
|---|---|
| Exported declarations: classes, functions, types, interfaces, constants | The module surface is what a caller reads instead of the implementation |
| Fields of types and interfaces | Units, ranges and invariants live nowhere else |
| Complex logic | A formula, a magic constant, a non-obvious order of operations |
| Utilities | A reader arrives at one when it broke, without context |

**Optional:** everything inside a function body, local variables, a test whose name already
states what it checks.

**A comment covers a run of neighbours** with no blank line between them. Six numeric bounds
under one "floating state" header are one idea, not six; splitting them would produce exactly
the restatement the style rule forbids.

### How this is enforced

`et/require-comment` in `eslint.config.mjs`, on `packages/*/src/**` and `tools/*/src/**`.
It checks presence only — sufficiency is not checkable — and the prose above says what makes
a comment worth reading. Without the check the prose is remembered on the first file of a
session and forgotten by the fifth; with it, an empty surface cannot reach a green gate.

Exempt: a type literal written on a single line. Commenting its fields would force it onto
several lines, which is worse than the shape itself.

## Rejected options

- **Prose only, no rule.** This repository already tried it: `adr/0010` asked for comments
  in one sentence, and the `Performer` interface then went in with ten of twelve fields
  uncommented.
- **`eslint-plugin-jsdoc` with `require-jsdoc`.** It enforces a tag format, not the presence
  of a thought; the code here uses plain `//` and `/** … */` without tags, and `@param name
  the name` is the restatement this ADR is against.
- **Per-field mandatory comments with no grouping.** Would break the one place where the
  current code is right — a block of related bounds under a single header.
- **Requiring comments on everything, including function bodies.** Density is not the goal,
  and forced comments inside implementations are the fastest way to grow prose that lies.
- **Requiring them in tests too.** A test name is the comment; `it("clamps energy at zero")`
  needs nothing above it.

## Consequences

- The public surface of `packages/core` documents its invariants: ranges, units, what is
  hidden from the user, what the generator's draw order depends on.
- A new exported name cannot be added silently — the gate asks for one line about it.
- Cost: the rule cannot tell a thought from noise. `// the name` above `name` passes. The
  defence against it is review, and the style paragraph exists so a reviewer has something
  to point at.
- Cost: about forty comments had to be written to make the existing code pass, and the
  interfaces in `performer.ts` and `generate.ts` grew by roughly a third in lines.
