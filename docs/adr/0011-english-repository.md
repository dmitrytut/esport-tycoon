# ADR 0011: English repository, Russian intent

**Status:** accepted
**Date:** 2026-09-14
**Related:** `adr/0007` (language of the game), `adr/0009` (spec loop), `adr/0010` (code style)

## Context

`adr/0007` made the game English and kept Russian as the language of development. That
split produced a seam inside every file the agent reads: English identifiers, Russian
comments; English requirement keywords, Russian requirement text; an explicit clause in
`openspec/config.yaml` reminding everyone that a player-facing string stays English even
inside a Russian artifact.

Measured before the switch: 13 223 Russian words across 82 files. The corpus grows with
the work — `adr/0009` and `adr/0010` alone added 280 lines in one week, almost as much as
the first nine decisions together. Every week of delay makes the switch more expensive,
and the seam does not get cheaper to maintain either.

Two more facts decided the shape of this decision rather than its direction.

1. **Nothing in the repository enforces a language.** Both `adr/0007` and the section in
   `CLAUDE.md` are prose. Prose drifts, which is exactly why `adr/0001` and `adr/0002` are
   lint rules and not paragraphs.
2. **Intent is not the same kind of text as behavior.** `docs/design/*` answers "why is the
   game like this": comedy rules, fantasy, tone. It is written by one person, for that same
   person, and precision of formulation matters more there than reach.

## Decision

Every file in the repository is English. Three layers keep Russian, each for a stated
reason, and the list is closed.

| Layer | Language | Reason |
|---|---|---|
| `docs/design/**` | Russian | intent: formulated by the author, precision beats reach |
| `content/names/ru-*.json` | Russian | name pool data for the CIS region (`adr/0003`) |
| `specs/**` | Russian | retired format, replaced change by change (`adr/0009`) |
| `packages/core/test/golden/**` | Russian, temporary | edits there are blocked by the `PreToolUse` hook; the text moves when a human touches the snapshots |
| everything else | English | code, comments, tests, ADRs, specs, harness, docs, schemas |

Correspondence is not a file and keeps its own rule: **issues, pull request bodies, commit
messages and the conversation with the author stay Russian.** The line is not "Russian is
gone", it is "a file is English, a message to a human is Russian". Git history is Russian
and stays that way: rewriting it is blocked by the ruleset on `master` and buys nothing.

`openspec/config.yaml` now tells every OpenSpec workflow to produce English artifacts, so
a proposal written from a Russian conversation still lands in the repository in English.

### How this is enforced

`pnpm check:language`, inside `pnpm verify`: it walks `git ls-files`, rejects any Cyrillic
outside the allowed prefixes above, and prints the offending lines. The allowed list lives
in `tools/check-language/src/index.ts` with a reason per entry — adding a prefix is a code
change visible in review, not a habit that grows quietly.

### What this amends

Accepted decisions are not rewritten, so three of them carry an `Amended:` line pointing
here instead: `adr/0007` loses the sentence making Russian the development language,
`adr/0009` loses the carve-out about player-facing strings inside a Russian artifact, and
rule 6 of `adr/0010` now reads "code, names, comments and docs are English". Their
subjects are untouched.

## Rejected options

- **Keep Russian as the development language (`adr/0007` as it stood).** The seam is real
  work: a tone guide for English comedy written in Russian is itself a translation step,
  and the config needs a clause explaining which strings escape the rule.
- **Translate `docs/design` as well.** Intent is the one layer where the author writes
  faster and more precisely in Russian, and it is read by a human far more often than by an
  agent. Paid cost: `docs/design/tone.md` governs English output from Russian prose. If
  that cost shows up as flat English event text, this decision gets replaced.
- **Translate `specs/0002–0006`.** They are stubs that `/opsx:propose` will rewrite. Work
  spent on them is thrown away by definition.
- **Rewrite git history, issues and pull requests.** Force-push is closed by the ruleset,
  the repository is public, and the value is nostalgic rather than practical.
- **Switch commit messages and issues to English too.** The author writes them for himself,
  and a Russian commit explaining an English diff loses nothing. Reconsider if a second
  person joins.
- **Enforce with a lint rule instead of a separate gate.** ESLint sees `.ts` only; the bulk
  of the prose is markdown, JSON and shell.

## Consequences

- `adr/0007` keeps its subject — the game is English, localization comes with the first
  screen — and loses only the sentence that made Russian the development language.
- A new file in any layer but the three above fails the gate on the first commit rather
  than drifting. The pre-commit hook runs `pnpm verify`, so the feedback is local.
- The glossary in `docs/glossary.md` becomes the single terminology source for both
  languages: an English term there, a Russian design document referring to it.
- Cost: intent and behavior are now in different languages, so the author translates when
  moving a thought from `docs/design` into a proposal. That is the price of keeping the
  intent layer precise, and it is paid by a human, not by a gate.
- Cost: one more entry in `pnpm verify`, about half a second.
