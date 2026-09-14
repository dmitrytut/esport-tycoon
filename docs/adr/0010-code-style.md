# ADR 0010: style and type discipline

**Status:** accepted
**Date:** 2026-09-14
**Related:** `adr/0001` (domain-neutral core), `adr/0002` (determinism), `adr/0007` (language)
**Amended:** `adr/0011` — rule 6 below now reads "code, names, comments and docs are
English"; markdown is still unformatted, but because tables are hand-tuned, not because
the prose is Russian.

## Context

Code is written by several agent sessions in parallel. Formatting so far was determined
by whatever the model happened to generate that time: there was no `prettier`, no
`.editorconfig`, and no style rules in the linter. Two sessions editing adjacent lines
with different line breaks produce a conflict where there is no semantic conflict, and
the diff stops being readable — while PR-2 review comes down to the question "does the
diff do exactly these requirements."

External TypeScript style guides were considered and rejected: their content is either
already enforced by `tsconfig` (which is stricter than most of them), or is expressed as
linter rules, or is actively harmful to the core — for example, "async-first for IO"
introduces scheduler non-determinism where the simulation must be synchronous.

## Decision

Style is enforced by the machine. What remains prose is only what the machine can't
check.

### Checked by machine

| What | By what |
|---|---|
| Formatting | `prettier`, width 100, `pnpm format:check` inside `pnpm verify` |
| Import order | `simple-import-sort` |
| Exhaustiveness of `switch` over a union | `switch-exhaustiveness-check` — `noFallthroughCasesInSwitch` doesn't do this |
| Pointless casts | `no-unnecessary-type-assertion` |
| Type assertions in packages' production code | `consistent-type-assertions` with `assertionStyle: "never"` — catches both `x as T` and `<T>x`; `as const` and `satisfies` stay allowed by the rule itself |
| `@ts-expect-error` in packages' production code | `ban-ts-comment` — it silences strictly more than any assertion |
| Anonymous object types on the module surface | `et/no-anonymous-shape` |
| Suppressing checks via `!` | `no-non-null-assertion` |
| Core domain-neutrality | `et/no-domain-words` (`adr/0001`) |
| Core determinism | `no-restricted-globals`, `no-restricted-properties` (`adr/0002`) |
| Stale `eslint-disable` directives | `eslint . --max-warnings 0` — the default severity is a warning, which exits zero |

Every ban above owns a rule id on purpose. `no-restricted-syntax` carries one array per
config object and flat config replaces rule options rather than merging them, so a later
block adding its own selector would erase the whole set silently, with a green gate. The
same applies in reverse to `eslint-disable`: a directive naming a shared id would mute
every ban on that line, including ones added later.

`.editorconfig` is present but is an editor hint, not a gate — nothing in `pnpm verify`
reads it. Line endings and the final newline of code files are covered by `prettier`;
for everything else the file is advice.

Markdown is not formatted: docs are Russian prose with hand-tuned layout, and
`.claude/commands/opsx/*.md` are generated and would be rewritten by the formatter on
every package update.

`test/golden/**` and `sim/baseline/**` are not formatted and are not checked by style
rules. What's there isn't only snapshot artifacts: the test itself lives right next to
them, and an `it.skip` in it defeats the check no less than editing the numbers would.
The whole directory is protected — by a `PreToolUse` hook against the agent, by an ignore
entry against the formatter, and by every autofixable rule being switched off for those
paths; any change there ships as its own pull request with a single commit prefixed
`golden:`/`baseline:` (`tests/README.md`).

### Remains a convention

1. **Identifiers are branded types, not bare primitives.** `Seed`, `PerformerId`,
   `ContestId` are declared as `number & { readonly __brand: "Seed" }`. Without this the
   compiler doesn't stop you from passing a seed where an identifier is expected. This
   can't be expressed as a linter rule: the type is chosen at declaration time.

2. **State is a tagged union, not a bag of optional fields.**
   `{ kind: "resting" } | { kind: "playing"; since: Week }` instead of
   `{ resting?: boolean; playingSince?: number }`. A shape in which an illegal state
   can't even be constructed is cheaper than any check. `switch-exhaustiveness-check`
   only protects it once the union has been declared.

3. **Where types live.** A type is declared in the module it belongs to, next to the
   code that maintains its invariants: `Performer` and `normalizeStats` are one decision
   and can't be changed separately. A type moves to the package's `types.ts` once three
   or more modules use it and it doesn't belong to any single one of them. This "third
   consumer" rule is the same one by which `adr/0009` splits things into packages.

4. **Where constants live.** Next to the code that honors them: `STAT_MAX` sits right
   next to `normalizeStats`, which enforces that bound. Only an ownerless constant goes
   into the shared `consts.ts`. Splitting a number from its guarantee across different
   files turns a scale change into an edit of two places, one of which can be forgotten.
   The retired `specs/` directory carries a live example of that failure, with two
   different stat scales stated in one document.

5. **Arguments as an object**, except in the simulation's hot loop, where allocation
   matters.

6. **Code, names and comments are English** (`adr/0011`). A comment explains the reason,
   not a restatement of the line.

## Rejected options

- **Ban `as` everywhere, including in `tools/`.** At the JSON-parsing boundary,
  `unknown` can't be narrowed any other way, and validity there is already checked by
  ajv: a type error there leads to a clear tool crash, not a corrupted simulation. The
  rule should hit where the cost of a mistake is higher.
- **`satisfies` instead of `as`.** Checked against the compiler on three real spots in
  our code: `{} satisfies Record<StatKey, number>`, `parsed satisfies Record<string,
  unknown>`, and `out[0] satisfies number` — all three give `TS1360`. These are different
  operators: `satisfies` checks a value that's already complete, without widening the
  type, and can't do what `as` was there for. The right fix is to rewrite the spot so the
  type is inferred; that's how `statsFrom` came about.
- **Layout of `name.type.ts` / `name.interface.ts` / `consts.ts`.** Splits apart things
  that change together: a type and the function that maintains its invariant; a constant
  and the check that enforces it. The `.interface.ts` suffix also forces a choice onto
  the file that should be made at declaration time: `PerformerState` is an interface,
  `StatKey` is inferred from `STAT_KEYS as const`, and they have to live next to each
  other. On a five-file core, the convention would add 5–8 files and not one bit of
  information. It pays off on hundreds of modules with external type consumption.
- **Ban anonymous types everywhere.** Would also ban `Partial<Stats>` and the unions from
  point 2 — that is, exactly what this same ADR tells you to write. The rule should hit
  only exported signatures, where an anonymous type can neither be reused nor named in a
  spec.
- **Format markdown.** `prettier` pads tables out to full width; editing one cell
  redraws the whole table.
- **An external TypeScript style skill** (`cursor/plugins`, `lobehub`). Would become a
  second source of truth alongside this ADR and the linter rules, and one updated from
  outside at that.
- **A separate `docs/code-style.md`.** A fifth kind of document alongside the four
  layers of `adr/0009` blurs their roles. Style is a decision with reasons, i.e. an ADR.

## Consequences

- `pnpm verify` gets longer by `format:check`; on the current repo that's a fraction of a
  second.
- A style change is a change to configuration, not an agreement. There's nothing left to
  argue about regarding line breaks.
- Points 1 and 2 apply starting with the very first mechanic that introduces identifiers
  and states — otherwise they'll have to be rewritten later.
