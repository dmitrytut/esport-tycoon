# ADR 0009: the spec loop — live behavior kept separate from intent

**Status:** accepted
**Date:** 2026-09-12
**Related:** `adr/0007` (language), `adr/0008` (stack)
**Amended:** `adr/0011` — OpenSpec artifacts are now written in English, so the carve-out
for player-facing strings inside a Russian artifact is gone. Everything else stands.
**Amended:** `adr/0012` — the branch is named `<type>/<issue>-<slug>`, not by the bare
slug; the change folder and the worktree directory still use the slug.

## Context

Development is moving to a mode of several parallel agent sessions: a task is filed in
the tracker, picked up in a separate worktree, brought to a PR, and merged. In this mode,
failure modes surface that simply don't exist with one developer on one branch.

1. **Number collisions.** `specs/NNNN-name.md` requires "find the next free number." Two
   sessions will pick the same one.
2. **A spec drifts from reality, and nothing catches it.** `specs/0001` carries the status
   "done," but all six of its acceptance criteria remain unchecked `- [ ]` — there's no
   way to tell machine-side whether they're met or not. Its "Out of scope" section says
   "Economy, contracts, salaries (spec 0005)," while `specs/0005` is actually the events
   system: the reference points nowhere. Both errors are harmless exactly as long as the
   spec is read by whoever wrote it.
3. **There's no record of current behavior.** `docs/design/*` answers "why, and what this
   should be like." The question "what happens right now when `energy = 0`" is answered
   only by the code. An agent opening a task in a clean worktree has nothing else to go
   on.

The first two are mechanical. The third is structural: there is no "behavior" layer in
the repository.

## Decision

Four layers, each with its own author and its own lifespan.

| Layer | Where | Who writes it | When it changes |
|---|---|---|---|
| Intent | `docs/design/*` | human | rarely, only on explicit request |
| Decisions | `docs/adr/*` | human | a new decision is a new ADR, old ones are never rewritten |
| Behavior | `openspec/specs/*` | `openspec archive` from a delta, never edited by hand | on every `archive` |
| Unit of work | `openspec/changes/<slug>/` | agent | one per task, two PRs |

The behavior layer is managed by OpenSpec (MIT, TypeScript, installed via npm — one
toolchain, `adr/0008`). Configuration lives in `openspec/config.yaml`: artifacts are in
Russian, structural headings and RFC 2119 keywords are in English, and as a separate
carve-out, any string the player will see stays in English even inside a Russian
artifact (`adr/0007`).

Merging a delta into the live spec is done by the `openspec archive` command, not by
hand-editing `openspec/specs/`. The result is checked twice: `openspec validate --all`
inside `pnpm verify`, and by a human diffing the spec in PR-2.

### The loop

Two review points, two PRs per task.

```
task in tracker #N
  → /opsx:propose <slug>       proposal, spec delta, tasks; no code
  → PR-1: openspec/changes/<slug>/ only
  → intent and delta review → merge          ← first review point, the cheapest one
  → admission check: can this run right now
  → claude --worktree <slug>
  → /opsx:apply                code per tasks.md
  → /opsx:archive <slug>       delta is merged into openspec/specs right here
  → PR-2: code + updated spec + folder moved to changes/archive/
  → diff-against-requirements review → merge ← second review point
```

The change identifier is a slug (`week-loop`) for the folder, branch, and worktree; the
task number `#N` is for ordering and references. We don't build our own number
allocator: the tracker already hands out a unique, monotonic identifier under a global
lock, and it's visible to every session instantly, not only after a branch merge. Deltas
are marked `ADDED / MODIFIED / REMOVED`; `archive` merges them into the live spec and
moves the change folder to `openspec/changes/archive/YYYY-MM-DD-<slug>/`.

The proposal is merged before implementation not for ceremony's sake: until
`openspec/changes/<slug>/` is on `master`, neither sibling sessions nor the admission
check can see it — there's nothing to base a decision about running it in parallel on.

### Admission check

The decision "run now or queue" is made against two conditions, both machine-checkable.

1. **The proposal is ready.** `openspec validate <slug>` passes, `openspec status
   --change <slug> --json` shows no unfilled artifacts, and the text has no open
   clarifying questions left.
2. **No overlap with in-flight changes.** `openspec list --json` gives the active
   changes, `openspec show <slug> --json --deltas-only` gives the set of requirements
   each one touches. An overlap in requirements or in declared paths means "queue behind
   the conflicting one," not "merge and hope."

The admission checker is a deterministic script, not an agent: its decisions are either
reproducible or useless. Until `tools/dispatch` exists, both conditions are checked by
hand.

### Rules for parallel work

1. **One change, one author.** Two sessions in the same `changes/<slug>/` folder
   conflict the same way two people editing the same file do. If it can't be split, the
   change is too large and needs to be cut down.
2. **A change declares which paths it touches** — via the "Affects" section in
   `proposal.md`, a requirement recorded in `openspec/config.yaml` (`rules.proposal`). An
   overlap of paths between open PRs is a signal to serialize the work, not to merge and
   hope.
3. **A conflict in `openspec/specs/` is a feature.** It means two changes disagreed on
   how the system should behave. It's resolved like an ordinary git conflict, in favor of
   whichever requirement reflects reality.
4. **`archive` happens on the implementation branch**, before PR-2 is merged. If two
   changes touched the same requirement, the conflict in `openspec/specs/` will surface
   at rebase time — and a rebase is unavoidable, since the ruleset requires a fresh
   branch. Catching the divergence before the merge is cheaper than after.
5. **A change with no delta declares that up front.** Infrastructure, tooling, and
   documentation don't change behavior, and `openspec validate --all` inside
   `pnpm verify` fails such a change with "Change must have at least one delta." This is
   fixed not by an archive flag but by the `skip_specs: true` line in the change's
   `.openspec.yaml` — it must be set when the change is filed, otherwise the gate turns
   red on the very first commit. `archive --skip-specs` only skips the merge step; it
   does not waive validation.
6. **Golden and baseline are untouched by the branch.** A snapshot only makes sense
   against the merged result, so regeneration is its own pull request with a single
   commit prefixed `golden:`/`baseline:` (`tests/README.md`). A direct commit on `master`
   is not an option: the ruleset only accepts pull requests. Editing these paths within
   a session is blocked by the `PreToolUse` hook.

### What happens to `specs/`

`specs/0001` is implemented, `0002–0006` are stubs. We are not bulk-migrating them: a
spec is moved into `openspec/changes/<slug>/` at the moment it's picked up for work, and
its behavior settles into `openspec/specs/` on `archive`. For the already-implemented
`0001`, that will happen on the first change that touches the performer model.

`specs/TEMPLATE.md` and the `/spec` command are no longer used — their place has been
taken by `/opsx:propose` and the OpenSpec templates. The `specs/` directory stays around
until the last stub has been processed.

## Rejected options

- **Keep `specs/NNNN` and add a ritual "update the design after merging."** The ritual
  rests on one person's discipline. With N sessions a day it doesn't hold — what's needed
  is a mechanism that either ran or failed, not a ritual.
- **github/spec-kit.** Drags in Python and `uv` — a second toolchain against `adr/0008`.
  Its own "constitution" becomes a third place where rules live, next to `CLAUDE.md` and
  the ADRs. There's a feature branch, but no spec update after merge, which is exactly
  what was needed.
- **Write our own delta-merge tool.** That's a tool we'd have to maintain, for a problem
  already solved by an MIT-licensed package on the same toolchain.
- **`openspec/specs/` instead of `docs/design/`.** These are different things. Intent
  ("failure should read funnier than success") is not expressed as requirements with
  acceptance criteria, and behavior is not expressed as prose about the fantasy. Merging
  them loses both.
- **`archive` on `master` after merge** — OpenSpec's default recommendation. Fine with a
  single session. With several, it delays discovering a divergence until after the merge
  and adds a third PR to the task: a direct push to `master` is blocked by the ruleset.
- **An orchestrator agent that hands out tasks and writes specs.** A spec here is a
  decision about whether something will be interesting; auto-generating them on a
  conveyor belt industrializes exactly the risk that the "no mechanic without a spec"
  rule exists to prevent. The machine keeps admission and dispatch, the human keeps what
  to build.
- **Our own spec-number allocator.** The tracker's task number is already unique,
  monotonic, and visible to every session without a merge.

## Consequences

- The live layer moves together with the code: updating `openspec/specs/` rides in the
  same PR as the implementation. A skipped update shows up as a folder in
  `openspec/changes/` with a fully checked `tasks.md` while the code is already merged.
- `openspec/changes/` on `master` becomes a registry of accepted-but-not-yet-completed
  changes. That's what the admission check reads.
- Review is split across two PRs: the first discusses intent and the spec delta, the
  second only whether the diff matches already-accepted requirements. An objection to the
  approach costs one comment, not three hundred lines of code.
- Process rules that must always hold are pushed into hooks: `PreToolUse` protects golden
  and baseline, `Stop` refuses to end a turn while `pnpm verify` is red. The spec and the
  skill are advisory control; the hook is deterministic.
- Cost: two review points and two PRs per task instead of one. With a single session
  this is pure ceremony; it pays for itself only by making parallel sessions safe.
- Cost: one more directory in the repository and the obligation to keep the boundary
  between intent and behavior. Letting that boundary blur brings back exactly the
  problem this was all built to solve.
