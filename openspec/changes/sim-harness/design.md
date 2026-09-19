## Context

`@et/core` exports everything a run needs: `generatePerformer` and `createRng` to build a
collective from a seed, `advance` to walk a block of four to six weeks, `executeWeek` to
walk one, and the result types that carry week kinds, skipped activities and stop reasons.
Core reads no files (`adr/0008`), so whoever runs it hands it content.

`content/activities/` holds eleven activities, `content/regions/` two regions with the
talent density and name pools a generated performer needs. `tools/validate-content` already
parses both, for its own purpose, and exports nothing.

Motivation — see `proposal.md`. Requirements — see `specs/sim-harness/spec.md`.

## Goals / Non-Goals

**Goals:**

- Twenty-four consecutive weeks observable in one command, on the real core.
- Three policies whose difference is attributable to the policy, not to the draw.
- A report shaped so that #52 can read it as data and a human can read it as a table.
- A shape #8 extends with a season mode instead of replacing.

**Non-Goals:**

- Any mechanic that does not exist yet, and any placeholder standing in for one.
- A plugin system for policies. Three policies behind one interface is not a framework.
- Tuning a single balance number. Measuring is this change; tuning is #52.

## Decisions

### The tool lives in `tools/sim-harness`, as a workspace package

`tools/` is the established home for a console instrument with file-system access and a
command line — `validate-content`, `check-lockfile`, `sync-labels` all sit there, and
`pnpm-workspace.yaml` already globs `tools/*`. `packages/` is for what the game ships.
`tools/README.md` even reserves the row: `sim_harness`, "not written".

Layout inside the package: `src/scenario.ts` (load and validate a scenario), `src/content.ts`
(load activities and regions), `src/policy.ts` (the three orderings), `src/run.ts` (the
horizon walk), `src/report.ts` (metrics to object and to text), `src/index.ts` (the command
line). #8 adds a season mode next to `run.ts` rather than a second tool.

### Sensitivity is declared by the scenario, and `act-one.json` masks nothing

`AdvanceOptions.sensitivity` is optional in core, and "absent" means every reason stops the
advance. Leaving the harness to pick a default would make the headline metric — how many
weeks passed without handing control back — a property of an unstated choice, and two
policies compared under two different defaults would not be comparable at all.

So the mask is a field of the scenario, applied identically to every policy of an
invocation and printed in the report's provenance. `scenarios/act-one.json` declares an
empty mask: every maskable reason stops the walk, which is the strictest reading and the one
that exercises the continuation path hardest. A scenario that wants to watch a long crisis
without stopping every week declares the mask it wants, and the report says which.

The scenario loader validates what it declares: an activity id must exist in the content
tree, a masked reason must be one core allows masking, and the block length must sit inside
the range the week loop accepts. The loader fails naming the scenario and the value rather
than letting `validateWeekPlan` throw from the middle of the walk — a tool that reports a
bad input as an internal error is a tool people stop trusting.

### A policy is a total ordering plus a participant rule

A policy ranks the scenario's activities by a key computed from their declared content, and
the planner fills each week greedily: take the highest-ranked activity that still fits the
remaining slot pool, repeat until nothing fits.

| Policy | Primary key | Then |
|---|---|---|
| money | activities whose effects credit money first, by declared amount descending | lower energy cost, then activity id |
| development | activities with a `stat` effect first, by summed stat amount descending | lower energy cost, then activity id |
| balanced | on an even week index the development key, on an odd one the money key | as that key |

The final tie-break is always the activity id, which is unique and stable, so no ordering
depends on the order a directory was read in. Alternation by week index is a rule, not a
heuristic: it gives the balanced policy a stated meaning that a reader can predict without
running it.

For an activity aimed at one member, the participant is the member with the highest energy,
ties broken by the lower id. Highest energy, rather than lowest stat, keeps the policy from
quietly implementing a development strategy inside the money one.

A policy reads declared amounts to rank. It never multiplies a base by reach — what an
audience-driven base actually pays is the week loop's answer, and the report prints that
answer.

### The horizon is walked with `advance` for blocks and `executeWeek` for the tail

`advance` rejects a plan shorter than four weeks, and a stop in the middle of a block leaves
a remainder that may be one, two or three weeks. Padding that remainder with extra weeks
would execute past the horizon; discarding it would lose planned work the spec forbids
losing.

So the walk is: while at least a block's worth of weeks remain, plan a block of the
scenario's length — the unexecuted remainder of the previous block first, then freshly
planned weeks — and hand it to `advance`. When fewer than four weeks remain, advance them one
at a time with `executeWeek`, which is the same function `advance` itself calls per week.

A carried-forward week keeps the activities and members it was planned with, on both paths.
A stop can leave its remainder inside the tail region, and re-deriving those weeks from the
advanced state would silently swap them: participant choice reads energy, and energy moved
during the weeks that already ran. Only a week that was never planned is decided by the
policy, against the state as it then stands.

Alternatives considered. Requiring the horizon to be a whole number of blocks does not
survive a mid-block stop, which shifts the remainder by an arbitrary amount. Masking every
maskable reason so that a block never stops early would make the continuation path
unreachable — and the continuation path is precisely what a later season runner will depend
on. Reimplementing `advance`'s masking and stop handling on top of `executeWeek` alone would
put a copy of the week loop's control flow in a measuring tool.

### An uninterrupted week is defined by the week, not by the slicing

A week counts as uninterrupted when its own result carries no unmasked stop reason, with
`block-ran-out` disregarded. That reason says the runner's plan window ended — it is a
property of how the horizon was sliced, and with this definition a run sliced into four-week
blocks and the same run sliced into six-week blocks report the same number.

This is deliberately not "every week except the one the call returned at." That phrasing,
drafted in #29, makes the metric a function of the block length: the same twenty-four weeks
would score 18 uninterrupted at four-week blocks and 20 at six-week ones, and #52 would be
comparing slicing choices while believing it compares policies. Recorded here so #29 can
adopt the same definition or reject it knowingly.

`WeekKind.quiet` is untouched and stays what `week-loop` already defines: no slot spent, no
reason produced. The report prints both, in separate rows, with the sentence that says which
is which.

### The report is one object, rendered twice

The run produces a single result object; the text table is a rendering of it, not a second
source. JSON goes to stdout under `--format json`, the table under `--format text`, default
text.

Per policy and seed: opening and closing balance, minimum balance and the week it happened,
money credited by activity id, closing audience, stat growth summed and per stat, mean and
minimum energy and morale, skipped activities by cause, stop reasons by kind, the four week
kinds, uninterrupted weeks and their share. Across seeds: the same figures aggregated as a
mean, with the seed set listed so an outlier can be re-run alone.

Provenance in the header: scenario id and the file it came from, seed set, horizon, policy,
the declared mask, and the count of activities and regions the content tree offered.
Duration sits in its own
field, is printed, and is excluded from the equality the determinism test asserts.

### Verification is a cross-check, not a snapshot

A golden file over a simulation that is about to gain four mechanics would be regenerated
more often than it would catch anything, and `tests/README.md` makes regeneration its own
pull request. Instead the tool's test advances a short scenario — one seed, one policy, a
handful of weeks — directly through `advance` in the test body and asserts the report's
figures equal it. That catches the failure that matters: a harness that computes its own
numbers instead of reading the core's.

## Risks / Trade-offs

- **A policy is judgement dressed as a rule.** Stated to the tie-break and pinned by a test,
  so a later change to it is visible rather than silent.
- **The tail path runs weeks outside `advance`.** It uses the same public `executeWeek` and
  produces the same week results, but it does not produce `block-ran-out` — correctly, since
  no block ran out, and the uninterrupted metric disregards that reason anyway.
- **A second content loader exists until a third caller appears.** Extracting a shared one
  with two callers would be a guess about what the shell (#38) needs; the validator's loader
  is shaped for validation, not for handing typed activities to core.
- **Measured cost may say a full run does not belong in CI.** The number is reported and the
  decision follows it; no workflow is added in this change either way.

## Migration Plan

Nothing to migrate: the tool is new, reads existing content, and changes no value the game
runs on. `tools/README.md` moves `sim_harness` from "not written" to ready and points the
row at `pnpm sim`. `specs/0002-sim-harness.md` stays where it is — it describes the season
run and baseline, which remain #8.

## Open Questions

None. The block-length, policy ordering, tail handling, uninterrupted definition and report
shape are decided above; the horizon, seed set and scenario values are declared in the
scenario file and are inputs, not open questions.
