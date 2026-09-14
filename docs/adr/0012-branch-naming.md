# ADR 0012: branch names carry type, issue and slug

**Status:** accepted
**Date:** 2026-09-14
**Related:** `adr/0009` (spec loop)

## Context

`adr/0009` made the change slug the identifier of the folder, the branch and the worktree,
and the issue number the identifier of order and links. That was enough while one branch
existed at a time. With several sessions in flight, the branch name is the only label a
human sees in three places that matter — the pull request list, `git branch`, and the
notification about a finished CI run — and a bare slug says nothing about what kind of
work it is or which task it answers.

The default of the tooling makes this worse rather than better. `claude --worktree <name>`
creates a branch named `worktree-<name>`, and that name cannot be configured: `worktree
.baseRef` accepts only `"fresh"` or `"head"`, never a branch name. Left alone, every branch
in the repository would be called `worktree-something`.

## Decision

A branch is named `<type>/<issue>-<slug>`:

| Part | Values | Notes |
|---|---|---|
| `<type>` | `feat`, `bugfix`, `hotfix`, `refactor`, `chore` | what kind of work, not which subsystem |
| `<issue>` | GitHub issue number | omitted when no issue exists: `chore/branch-naming` |
| `<slug>` | the change slug | the same slug as `openspec/changes/<slug>/` |

One task — one branch — one worktree, and `master` is never written to directly.

Both pull requests of a change use the same branch name, one after the other. The proposal
branch is deleted when it merges, and implementation may not start before that merge
(`adr/0009`), so the name is always free by the time the second branch is created. Two
branches for the same change never exist at once, which is why no suffix is needed to tell
them apart.

The worktree is created explicitly, then opened:

```
git worktree add .claude/worktrees/8-week-loop -b feat/8-week-loop origin/master
claude --worktree 8-week-loop
```

Passing `--worktree` a name whose directory already exists opens that worktree instead of
creating one, so the session gets Claude Code's isolation — edits to the main checkout and
git redirects out of the worktree are blocked — while the branch keeps our name.

Cleanup after a merge is manual on the local side: GitHub deletes the remote branch
(`delete_branch_on_merge`), and `git worktree remove` plus `git branch -d` remove the local
pair. A worktree created by hand is never swept by the automatic cleanup.

## Rejected options

- **Keep the bare slug from `adr/0009`.** It loses the kind of work and the link to the
  issue exactly where a human reads the name, and it collides with nothing only because
  there is one branch today.
- **Let `claude --worktree` name the branch.** Every branch becomes `worktree-<name>`; the
  flag offers no way to set the name, so the convention would be dictated by a default.
- **A suffix per pull request (`feat/8-week-loop-proposal`).** Two branches for one change
  never exist simultaneously, so the suffix would carry no information and would be wrong
  half the time.
- **Add the subsystem to the type (`feat/core/...`).** The affected paths are already
  declared in the proposal's "Affects" section, and the admission check reads them from
  there rather than from a branch name.

## Consequences

- `adr/0009` keeps the slug as the identifier of the change folder and the worktree
  directory; only the branch gains the prefix and the issue number. Its `Amended:` line
  points here.
- The pull request list becomes readable at a glance: type, task, subject.
- Nothing enforces the name yet. A ruleset rule with a branch-name pattern would, and it is
  worth adding when the first mistyped branch appears rather than before.
