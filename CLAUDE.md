# CLAUDE.md

Instructions for agents working in this repository. Read automatically.
Keep it under 200 lines: this file itself spends context.

## What this project is

**ESport Tycoon** (repository `esport-tycoon`). An esports organization manager. Mobile first, PC follows. Pixel art.
Comedic delivery on top of honest management mechanics: humor in the text, decisions the player
takes seriously.

The player builds a roster, develops people, takes them through tournaments, and grows from
the basement to an organization with three departments. References: Football Manager (depth),
Game Dev Tycoon (growth and sandbox).

The full design is in `docs/`. **Start with `docs/INDEX.md`**: it has a table «task → which
files to read». Don't read all of `docs/` in full.

## Status

Stage: design and specs plus a code skeleton. Stack chosen — `docs/adr/0008`: TypeScript core,
scene on PixiJS, panels on DOM, mobile packaging via Capacitor, release on iOS and Android.

What already exists in code: `packages/core` — RNG and determinism, performer model per `specs/0001`
(stats 1–20, age curve, information fog, generator by region and level),
`tools/validate-content`, guardrails in `eslint.config.mjs`, the single gate `pnpm verify`.
Next specs: 0003 (week), 0006 (languages and chemistry — language generation is already
done, pair chemistry is not).

## Hard rules

1. **No mechanic without a spec.** Work goes through two PRs: first `/opsx:propose <slug>` —
   a proposal and spec delta with no code, review, merge; only then `/opsx:apply` — the code
   and `openspec archive` on the same branch. Don't "wing" the design. Layer order, admission
   check for work, and rules for parallel work — `docs/adr/0009`.
2. **`packages/core` is domain-neutral.** Not a single esports word: no `Player`,
   `Match`, `Frag`, `Tournament`. Only `Performer`, `Contest`, `Collective`, `Season`.
   Reason — `docs/adr/0001`. Checked by the `et/no-domain-words` rule, not by taste.
3. **All randomness goes through an injected seed.** No calls to a system random number
   generator outside the single RNG module. Reason — `docs/adr/0002`.
   A violation makes the simulation unverifiable.
4. **Content is data.** Events, traits, disciplines, regions, names live in
   `content/` as files following the schema in `content/schema/`. Adding content does not change code.
   Reason — `docs/adr/0003`.
5. **No real esports players, teams, or titles.** Characters are composite/fictional.
   Reason and boundaries — `docs/adr/0005`. This isn't a style choice, it's a legal risk.
6. **Don't rewrite core abstractions to make them "right".** If an abstraction seems
   unnecessary, first find the ADR that explains it. A second domain subject — `docs/adr/0004`.
7. **Everything is English.** Files in this repository — code, comments, tests, ADRs,
   specs, harness, schemas — are written in English, and so is every string the player
   sees. Russian is left in `docs/design/**` (the intent layer), `content/names/ru-*.json`
   and the retired `specs/`. Issues, pull request bodies, commit messages and the
   conversation with the author stay Russian: a file is English, a message to a human is
   not. Enforced by `pnpm check:language`. Reason — `docs/adr/0011`, `docs/adr/0007`.
8. **Style isn't up for debate, it's configured.** Formatting, import order, and typing
   discipline — `prettier` and linter rules, `pnpm format` fixes it. In `packages/*/src`
   type assertions in any form (`as`, `<T>x`, `@ts-expect-error`) and anonymous object
   types on the module surface are forbidden: rewrite so the type is inferred. What remains prose:
   branded identifiers, states as tagged unions, and the rule "the type and the constant
   live next to the code that holds their invariant". Reason — `docs/adr/0010`.
9. **The module surface is commented.** Exported declarations, fields of types and
   interfaces, complex logic and utilities carry a short comment — one or two sentences
   saying what it is for or which invariant it holds, never a restatement of the line.
   Inside a function body it's optional. A comment covers a run of neighbours with no blank
   line between them. `et/require-comment` checks presence, being enough is on the author.
   Reason — `docs/adr/0013`.

## Language and tone of in-game text

**Language is English**, see `docs/adr/0007` and `docs/adr/0011`. Russian survives only in
`docs/design/*`, where the intent is formulated, and that layer is for developers, not for
the user. There's no localization yet; the mechanism (a library, not
homegrown) is chosen together with the first UI screen, before that we don't invent one.

Tone: lively English, no corporate boilerplate. Absurdity is allowed in events,
but numbers and consequences are always honest. Failure should read funnier than success.
Details — `docs/design/tone.md`.

## Rules for working with documents

- `docs/design/*` — **intent**: why the game is the way it is. Changes only on explicit request.
- `openspec/specs/*` — **behavior**: what the system does right now. Not written by hand,
  but by the `openspec archive` command from a delta, on the implementation branch.
- `openspec/changes/<slug>/` — **unit of work**: one task, two PRs, one author.
  A non-empty directory on `master` is a registry of accepted but not-yet-completed changes.
- `docs/adr/*` — **decisions and reasons**. A new decision = a new ADR, old ones are not rewritten,
  revoked ones are marked `Status: closed, superseded by adr/NNNN`. An ADR answers "why this way
  and not another", and it contains no procedure: workflow steps live in `openspec/config.yaml`,
  commands are in the table below, style is in the configs. Size guideline — 40–60 lines.
  Read the whole ADR only when a rule seems wrong; in ordinary work the number in the
  linter message or the summary in `.claude/rules/*.md` is enough.
- Links between layers go bottom-up: a requirement may carry an ADR number, an ADR does not
  reference requirements — it is frozen, while the spec changes on every archive.
  Work runs into an accepted ADR — stop: the ADR gets replaced by a separate PR first.
- Source precedence when two of them disagree: **the check that runs beats the prose that
  describes it.** `eslint.config.mjs`, `.githooks/`, `.claude/hooks/` and `pnpm verify` are
  authoritative; `.claude/rules/*.md` and this file are digests of them and can go stale.
  Found a divergence — fix the digest, and say so; never weaken the check to match the text.
- `specs/*` — the old format. `0001` is implemented and, until the first archive, remains the
  single record of the performer model's behavior; `0002–0006` are stubs. We don't start new ones
  (`docs/adr/0009`).
- Noticed a discrepancy between design and code — don't stay silent and don't "fix" the design
  to match the code. Say plainly what diverges.
- `.reviews/` — **local review artifacts**: notes from a code review run on this machine,
  checklists, findings, diffs pulled apart for reading. The directory is gitignored and
  nothing from it is ever committed: a review is an observation about a particular diff at
  a particular moment, not a record of what the system does. What must survive a review
  goes where it belongs — a defect into an issue, a decision into an ADR, a behavior into
  a spec delta, a comment into the PR itself.

## Branches, worktrees and pull requests

One task — one branch — one worktree. `master` is never written to directly; the ruleset
rejects it.

Branch name: `<type>/<issue>-<slug>`, where `<type>` is one of `feat`, `bugfix`, `hotfix`,
`refactor`, `chore`, `<issue>` is the GitHub issue number when one exists, and `<slug>` is
the change slug. `feat/8-week-loop`, `bugfix/14-energy-clamp`, `chore/branch-naming` when
there is no issue. Both pull requests of a change use the same name in turn: the proposal
branch is deleted on merge, and implementation starts only after that (`docs/adr/0009`),
so the name is free again. Reason — `docs/adr/0012`.

Pull request title: `<type>: <what> (#<issue>)` — English, lowercase after the colon, no
trailing period, short. Types are the branch ones plus `docs`, `golden`, `baseline`;
`bugfix` shortens to `fix`. `feat: weekly cycle (#7)`, `chore: pr title convention` without
an issue. Nothing checks it: a wrong title is fixed by editing it, not by a red gate.

Create the worktree first, then open it — `claude --worktree <name>` alone would name the
branch `worktree-<name>`, and that name cannot be configured:

```
git worktree add .claude/worktrees/8-week-loop -b feat/8-week-loop origin/master
claude --worktree 8-week-loop     # the directory exists, so this opens it
```

The flag matters: a session bound to a worktree is blocked from editing files in the main
checkout and from redirecting git back into it. A worktree is a fresh checkout without
`node_modules`, so it starts with `pnpm install`.

**Merging is the human's action, never the agent's.** The agent opens the pull request,
reports that the gate is green, and stops there. The `master` ruleset requires no approving
review, so nothing on GitHub stops the author from merging — the session does:
`.claude/settings.json` denies `gh pr merge`, `gh pr review` and the `gh api` routes that
reach a merge, allowing `gh api` only on this repository's tracker routes; anything else
under it stops and asks. The human merges, from their own terminal, after the review
checkpoints of `docs/adr/0009` have happened — and only the human knows whether they did.

After the merge: the remote branch is deleted by GitHub, the local one is not. Clean up
with `git worktree remove .claude/worktrees/<name>` and `git branch -d <branch>` — a
worktree you created by hand is never swept automatically.

## What to do when it's unclear

Ask. The worst outcome in this project is a guessed mechanic that spreads through the code.
The second worst is silently expanding the scope of a spec.

## Commands

| Command | What it does |
|---|---|
| `pnpm verify` | the single gate: types, formatting, linter, tests, content, specs, language. Run before any "done" |
| `pnpm format` | `prettier --write .`: fixes formatting |
| `pnpm test` | vitest: unit, golden |
| `pnpm lint` | guardrails for ADR 0001 and 0002 plus typing discipline from ADR 0010 |
| `pnpm typecheck` | `tsc --noEmit`, strict |
| `pnpm validate:content` | schemas and referential integrity of `content/` |
| `pnpm validate:spec` | OpenSpec artifacts (`openspec validate --all`) |
| `pnpm check:language` | English everywhere except `docs/design/`, `content/names/ru-*`, `specs/` (ADR 0011) |
| `pnpm run hooks:install` | enable local git hooks (once per machine) |
| `/opsx:propose <slug>` | start a change: proposal, spec delta, tasks |
| `/opsx:apply` | implement the change's tasks |
| `/opsx:archive <slug>` | on the implementation branch: merge the delta into `openspec/specs` |
| `openspec list --json` | active changes: what's currently in flight |
| `openspec show <slug> --json --deltas-only` | which requirements a change touches |
| `claude --worktree <slug>` | parallel session in a separate checkout |
| `gh pr create -t "…" -F <filled copy>` | open a PR from a session. Fill a copy of `.github/PULL_REQUEST_TEMPLATE/proposal.md` (PR-1) or `implementation.md` (PR-2) and pass it as the body |
| `gh pr create -T proposal.md` | the same from a terminal: `-T` only seeds the editor, so it needs an interactive run. GitHub applies no template on its own either way |

`openspec` is pinned in `devDependencies`, so `pnpm install` is the only thing needed
for the gate and CI. A global install isn't required and is only useful for calling
the bare command conveniently; inside the repo the lockfile version always wins anyway —
the `SessionStart` hook puts `node_modules/.bin` at the front of `PATH`.

`.claude/commands/opsx/*.md` — generated files, not edited by hand: `openspec
update --force` will overwrite them. A custom workflow step is added via `openspec/config.yaml`
(`rules`, `operations.guidance`) — it's also what sets "don't start implementation before
PR-1 is merged" and "archive via the command, don't move the folder by hand." Update:
`pnpm up @fission-ai/openspec`, then `openspec update --force`, then check
`git diff .claude/commands/opsx`.

Six workflows are installed: `propose`, `apply`, `archive`, `explore`, `sync`, `update`.
The `/opsx:continue` and `/opsx:new` mentioned inside them are not installed — use
`openspec status --change <slug> --json` and `openspec new change <slug>` instead.

Rules about golden: regenerating golden or baseline is its own pull request holding a single
commit prefixed `golden:`/`baseline:` that explains which rule change shifted the numbers.
There is no shorter route — `master` only takes pull requests. A mixed "code + golden" commit
is rejected by the hook, and editing those paths inside a session is blocked by `PreToolUse`.
A red golden means "the simulation drifted," not "fix the file."
