# tests/

| Directory | What it checks |
|---|---|
| `unit/` | individual functions and value boundaries |
| `property/` | invariants over generated inputs: a stat never leaves the scale, the shown range always contains the truth (`docs/adr/0014`) |
| `golden/` | fixed outcomes: this lineup against that one with seed 42 gives this result. Catches unintended balance shifts that unit tests miss |
| `sim/` | statistical properties over large runs: the bankruptcy rate stays in range, the placement distribution hasn't degenerated |

The property layer lives in `packages/*/test/property/`, with the shared fast-check
configuration in `tests/setup/fast-check.ts`. Its seed is pinned for the same reason golden
files are: a test that fails once in twenty runs stops meaning anything. Changing the seed or
`numRuns` is a deliberate commit of its own.

## About golden tests

Updating a golden file is always a deliberate action with an explanation. If an agent
updates a golden file just to make a test pass, that's a process defect, not a fix.

The procedure has exactly one shape, and the same wording holds in `CLAUDE.md`,
`docs/adr/0009` and the implementation pull request template:

1. A work branch never touches `test/golden/**` or `sim/baseline/**`. The `PreToolUse`
   hook blocks the edit, and neither the formatter nor `eslint --fix` reaches there.
2. Regeneration is its own pull request holding a single commit prefixed
   `golden:`/`baseline:`, whose message says which rule change moved the numbers.
3. There is no direct commit on `master`: the ruleset only accepts pull requests.

A red golden means the simulation drifted. `it.skip` on a golden test is muting the
check, not fixing it.
