## Context

`@et/core` exports what a run needs: `generatePerformer` and `createRng` to build a
collective from a seed, `advance` to walk a block of four to six weeks, `executeWeek` to
advance exactly one and hand back both the week's result and the state it left behind,
`validateWeekPlan` to reject a plan, and `UNMASKABLE_REASONS` to reject a mask. Core reads
no files (`adr/0008`), so whoever runs it hands it content.

One shape of the public surface decides this design. `WeekResult` carries the week index,
its kind, the slots it spent, the activities it executed and skipped, and its reasons — and
no snapshot of the run. `AdvanceResult` carries the state once, after the last week it
simulated. A harness built on `advance` alone could therefore report a balance at block
boundaries and nowhere else, which is not a balance tool.

`content/activities/` holds eleven activities, `content/regions/` two regions with the
talent density and name pools a generated performer needs. `tools/validate-content` already
parses both, for its own purpose, and exports nothing.

Motivation — see `proposal.md`. Requirements — see `specs/sim-harness/spec.md`.

## Goals / Non-Goals

**Goals:**

- Twenty-four consecutive weeks observable week by week, in one command, on the real core.
- Three policies whose difference is attributable to the policy, not to the draw.
- A report shaped so that #52 can read it as data and a human can read it as a table.
- A shape #8 extends with a season mode instead of replacing.

**Non-Goals:**

- Any mechanic that does not exist yet, and any placeholder standing in for one.
- A plugin system for policies. Three policies behind one interface is not a framework.
- Tuning a single balance number. Measuring is this change; tuning is #52.
- Changing `packages/core` to expose more. If the walk proves that a per-week snapshot
  belongs in `WeekResult`, that is a core change with its own proposal.

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

### The walk is week by week through `executeWeek`, pinned against `advance`

`advance` returns one state, after its last simulated week. Building the harness on it would
mean a report whose balance, energy and morale exist only at block boundaries — and "the
week the balance first went negative", the figure #52 is waiting for, would be readable only
because the money reason happens to name it. Every other series would be four to six weeks
coarse.

So the harness advances one week at a time with `executeWeek`, which returns the week's
result and the state after it. The planning block does not disappear: the policy still plans
a whole block at a time, because that is the decision cadence `week-loop` accepts and the
shell will use, and because planning week by week would quietly make every plan a function
of the previous week's outcome.

What the harness does *not* inherit from `advance` is stopping. It reads a week's reasons
against the scenario's mask and records "here control would have returned to the user", then
keeps going to the horizon. That judgement — when a person would have been asked to look —
is the metric the tool exists to report; it is not a rule of the week, and the week loop's
arithmetic, recovery, classification and reasons all stay where they are.

The risk in that sentence is real: a harness that walks its own way could drift from what a
player's `advance` would produce. So the equivalence is a requirement with a test behind it —
a block-long plan advanced both ways produces the same weeks, the same reasons, the same
kinds and the same state, save for the `block-ran-out` reason `advance` appends to the last
week of a block. `executeWeek` does not validate; the harness therefore calls
`validateWeekPlan` on each block and checks the mask against `UNMASKABLE_REASONS` at load
time, so a bad plan or a bad mask fails the way `advance` would fail it.

A plan is therefore always a whole block, which is what `validateWeekPlan` accepts, and a
horizon that ends partway through one simply leaves the rest of that block unadvanced. That
is the whole of the tail problem: nothing needs a short plan, nothing overshoots, and the
four-to-six-week rule of `week-loop` is never bent to fit a measurement.

Alternatives considered. Walking with `advance` and accepting block-granular samples was
rejected above. Walking with `advance` and re-deriving per-week figures inside the harness
would put a copy of the week's arithmetic into the measuring tool, which is the one thing a
measuring tool must not contain. Adding a per-week snapshot to `WeekResult` would be the
cleanest of all and is a change to core, which this proposal is not.

### Sensitivity is declared by the scenario, and `act-one.json` masks nothing

The mask decides which weeks count as interrupted, and that is the headline comparison
between policies. Leaving it to an unstated default would make the number a property of a
choice nobody wrote down, and two policies compared under two defaults would not be
comparable at all.

So the mask is a field of the scenario, applied identically to every policy of an
invocation and printed in the report's provenance. `scenarios/act-one.json` declares an
empty mask: every reason counts as a return of control, which is the strictest reading. A
scenario that wants to watch a long crisis without counting every week declares the mask it
wants, and the report says which.

The scenario loader validates what it declares: an activity id must exist in the content
tree, a masked reason must be one the week loop allows masking, and the block length must
sit inside the range `week-loop` accepts. It fails naming the scenario and the value — a
tool that reports a bad input as an internal exception is a tool people stop trusting.

### A policy is a total ordering plus a participant rule

A policy ranks the scenario's activities by a key computed from their declared content, and
the planner fills each week greedily: take the highest-ranked activity that still fits the
remaining slot pool, repeat until nothing fits.

| Policy | Primary key | Then |
|---|---|---|
| money | activities whose effects credit money first, by declared amount descending | lower energy cost, then activity id |
| development | activities with a `stat` effect first, by summed stat amount descending | lower energy cost, then activity id |
| balanced | on an even absolute week index the development key, on an odd one the money key | as that key |

The final tie-break is always the activity id, which is unique and stable, so no ordering
depends on the order a directory was read in. The alternation of the balanced policy is
keyed to the absolute week index of the run, not to the position inside a block, so changing
the block length does not change what the balanced policy does.

For an activity aimed at one member, the participant is the member with the highest energy,
ties broken by the lower id. Highest energy, rather than lowest stat, keeps the policy from
quietly implementing a development strategy inside the money one.

A policy reads declared amounts to rank. It never multiplies a base by reach — what an
audience-driven base actually pays is the week loop's answer. One consequence is worth
stating plainly: a declared base of 5000 outranks a flat 400 even at an audience of zero,
where it credits almost nothing. That is not a bug in the policy but the first thing the
report will show about act one, and it is the measurement #52 needs in order to argue about
availability. A policy that corrected for it would have to compute reach, and then the tool
would be reporting its own arithmetic.

### An uninterrupted week is defined by the week, not by the slicing

A week counts as uninterrupted when its own result carries no unmasked reason. Because the
harness never stops walking, no `block-ran-out` reason is ever produced — that reason exists
to tell a user their plan ran out, and the harness is not a user — so the metric depends on
nothing but the weeks the policy produced.

This is deliberately not "every week except the one the call returned at." That phrasing,
drafted in #29, makes the metric a function of the block length: the same twenty-four weeks
would score differently at four-week and six-week blocks, and #52 would be comparing slicing
choices while believing it compares policies. Recorded here so #29 can adopt the same
definition or reject it knowingly.

`WeekKind.quiet` is untouched and stays what `week-loop` already defines: no slot spent, no
reason produced. The report prints both, in separate rows, with the sentence that says which
is which.

### The scenario draws no traits

`generatePerformer` takes an optional trait pool and content holds one trait. Traits carry no
mechanical effect until #34, so a run that drew them would report a difference that the
simulation does not yet produce. The scenario therefore declares no trait pool, and
`src/content.ts` loads activities and regions only. #34 adds the pool to the scenario when
there is something to measure.

### The report is one object, rendered twice

The run produces a single result object; the text table is a rendering of it, not a second
source. JSON goes to stdout under `--format json`, the table under `--format text`, default
text.

Per policy and seed: the weekly series of balance, audience, collective morale and mean
energy; opening and closing values of each; the minimum balance and the week it happened;
stat growth summed and per stat; counts of executed and skipped activities by id and cause;
reasons by kind with the weeks they fell on; the four week kinds; uninterrupted weeks and
their share. Across seeds: the same figures aggregated as a mean, with the seed set listed
so an outlier can be re-run alone.

What the report does not carry is money attributed to an individual activity. Core reports
the balance, not a ledger of which effect moved it, and two money activities in one week
cannot be split apart without the harness recomputing reach — the one thing it must not do.
The report states the weekly balance delta and which activities ran that week; a real
per-source ledger is a core change and belongs to whoever needs it, most likely #52.

Provenance in the header: scenario id and the file it came from, seed set, horizon, policy,
the declared mask, and the count of activities and regions the content tree offered.
Duration sits in its own field, is printed, and is excluded from the equality the determinism
test asserts.

### Verification is a cross-check, not a snapshot

A golden file over a simulation that is about to gain four mechanics would be regenerated
more often than it would catch anything, and `tests/README.md` makes regeneration its own
pull request. Instead the tool's tests advance a short scenario directly through the core in
the test body — once through `advance` for the equivalence check, once week by week for the
figures — and assert the report equals it. That catches the failure that matters: a harness
that computes its own numbers instead of reading the core's.

## Risks / Trade-offs

- **The harness decides when control would have returned.** That judgement is three lines
  reading reasons against a declared mask, it is the metric the tool exists for, and the
  equivalence test pins everything around it to `advance`.
- **A policy is judgement dressed as a rule.** Stated to the tie-break and pinned by a test,
  so a later change to it is visible rather than silent.
- **A money policy at zero audience chases a base that pays nothing.** Reported, not
  corrected; correcting it inside the policy would require computing reach.
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

None. The walk primitive, the block's role, the policy ordering, the sensitivity, the
uninterrupted definition and the report shape are decided above; the horizon, seed set and
scenario values are declared in the scenario file and are inputs, not open questions.
