# tests/

| Directory | What it checks |
|---|---|
| `unit/` | individual functions and value boundaries |
| `golden/` | fixed outcomes: this lineup against that one with seed 42 gives this result. Catches unintended balance shifts that unit tests miss |
| `sim/` | statistical properties over large runs: the bankruptcy rate stays in range, the placement distribution hasn't degenerated |

## About golden tests

Updating a golden file is always a deliberate action with an explanation in the commit
message.
If an agent updates a golden file just to make a test pass, that's a process defect, not a
fix.
