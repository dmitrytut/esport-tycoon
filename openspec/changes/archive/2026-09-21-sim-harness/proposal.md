## Why

The week loop executes activities, moves energy, morale and stats, and — since
`fanbase-economy` — pays an audience-driven amount for a stream or a campaign. Every one of
those numbers is currently observed only by a unit test that asserts one value at a time.
Nobody has ever watched twenty-four consecutive weeks of this simulation and seen where the
money goes, how fast people grow, or how often the advance hands control back.

That gap is not a missing season. `design/week.md` §6.2 states the conflict the game is
built on — money against skill, "we grow or we survive" — and the repository has no way to
tell whether that conflict exists in the numbers. A policy that only trains and a policy
that only streams may already be indistinguishable, or one may already be strictly
dominant; both are invisible.

Waiting for the season (#29), the contest (#30) and the agreements (#31) before measuring
anything means the first balance feedback arrives after four more mechanics have been built
on top of unmeasured ones. The week is finished and deterministic today (`adr/0002`), so it
can be measured today.

`specs/0002` describes the end state — 10 000 seasons, baseline, drift report — and stays
with #8. This change builds the first half of that same tool: weeks, not seasons.

## What Changes

- **A console runner advances real weeks through the real core.** One command, no graphics,
  no input: declared seeds, a week horizon, a policy. The policy plans a block at a time,
  the runner advances one week at a time with `executeWeek` and keeps the state the core
  hands back, and a week that would have returned control to a user is recorded rather than
  obeyed — the run walks on to its horizon. It reimplements no rule the week owns, and an
  equivalence test pins the walk to what `advance` produces over the same plan.
- **The per-week walk is forced by the core's shape, not chosen for taste.** `WeekResult`
  carries no snapshot of the run and `advance` returns the state once, after its last
  simulated week. A harness built on `advance` alone could report a balance at block
  boundaries and nowhere else — which is not a balance tool. Adding a snapshot to
  `WeekResult` would be cleaner still, and it is a change to core rather than to its
  consumer.
- **Three policies, each a declared preference over content.** Money, development,
  balanced. A policy chooses which activity to plan and who takes part; it never computes a
  payout, applies an effect or reads a value the week has not yet produced. Ties are broken
  by a stated rule, never by the iteration order of a collection.
- **A scenario is a versioned file, not a constant in the runner.** The starting balance,
  the audience, the slot pool, the region and level the collective is generated from, the
  activity ids in play, the block length and the sensitivity live in
  `tools/sim-harness/scenarios/*.json`. The command line overrides only seeds, horizon,
  policy and output format. This is how #52 later tunes numbers without editing the tool,
  and how #8 adds a season scenario beside this one.
- **The run reports two different quiet things separately.** `WeekKind.quiet` — a week that
  spent no slot and produced no reason — and an uninterrupted week — a week whose result
  carries no reason the declared mask leaves unmasked. A week with a training session and
  no reason is uninterrupted and `ordinary` at the same time, and the report never adds
  those two columns together.
- **The report states what produced it, and attributes nothing the core does not.** Seeds,
  horizon, policy, scenario id, mask, the size of the content set; a weekly series of
  balance, audience, morale and energy; no money split per activity, because core reports a
  balance rather than a ledger and splitting one would mean recomputing reach inside the
  measuring tool. One machine-readable object and one table rendered from it.
- **Wall-clock duration is measured and kept out of comparisons.** The same inputs produce
  identical game metrics; the milliseconds they took are reported next to them and are not
  part of that identity.

Out of scope, and each for its own reason:

- **Seasons, calendars and contests.** `WeekMarking` has no producer until #29; a runner
  that invents one would be measuring its own invention.
- **Salaries, agreements, bankruptcy.** #31 and #32 own them. Absent spending is reported
  as absent, never as a zero-valued metric that reads like a measurement.
- **Baseline, drift thresholds, `/balance`, a nightly workflow.** #8. A baseline over a
  simulation that will gain four mechanics in the next month regenerates more often than it
  catches anything.
- **Incidents.** #33 extends the policies with choice resolution through the engine's
  public contract once that contract exists.
- **Tuning any number.** This change measures; it changes no balance value in `content/` and
  no constant in core. A report that motivates a change is the input to #52, not to this
  pull request.

### Three notes for the reviewer

1. **The harness needs a content loader, and there is none outside the validator.** Core
   cannot read files (`adr/0008`), and `tools/validate-content` parses content for its own
   purpose and exports nothing. The runner therefore gets a small loader of its own, over
   `content/activities/*` and `content/regions/*`, reading the same files the validator
   already guards. Extracting a shared loader is a refactor worth doing when the shell (#38)
   becomes the third caller, not with two.
2. **The tool sits in `tools/`, not in `packages/`.** It is a development instrument with
   file-system access and a command line, the same class as `validate-content`. `#8` grows
   the same directory with a season mode rather than opening a second tool.
3. **The uninterrupted metric is defined against the week, not against the call.** A week
   counts as uninterrupted when its own result carries no unmasked reason. #29's draft
   phrases it as "every week except the one
   the call returned at", which makes the number a function of the block length: the same
   twenty-four weeks score differently at four-week and six-week blocks, and #52 would be
   comparing slicing choices while believing it compares policies. The divergence is
   deliberate and is recorded in `design.md` so #29 adopts or rejects it knowingly.

## Capabilities

### New Capabilities

- `sim-harness`: what a headless run is, how a scenario and a policy define it, what the
  runner guarantees about the horizon, about the plan a returned control leaves unexecuted
  and about equalling the core's own block advance, and what the report must state.

## Impact

Nothing in `packages/core` changes: the runner is a consumer of the public surface
`@et/core` already exports, and if it turns out that surface is insufficient, that is a
finding to report rather than a licence to widen it inside this change. The repository gains
one workspace package under `tools/`, one script in `package.json` and one row in
`tools/README.md`.

Risks. First, a policy is judgement pretending to be a rule: "prefer money" has to be
spelled out to the tie-break or the comparison is noise. The spec states the ordering and a
test pins it. Second, the harness decides for itself when control would have returned to a
user rather than letting `advance` decide — that is the metric it exists to report, and
everything around it is pinned by an equivalence test against `advance` over the same plan.
Third, a runner that mirrored the week's arithmetic to produce its metrics would report its
own copy of the rules; the counter is a cross-check test asserting the reported figures
equal a direct core run. Fourth, the measured cost of a run decides whether this ever
belongs in CI; the number is reported and no workflow is added on a guess.

## Affects

- `tools/sim-harness/**` — the runner, policies, report, scenarios and tests
- `package.json` — the `sim` script
- `pnpm-lock.yaml` — the new workspace package
- `tools/README.md` — the `sim_harness` row moves from "not written" to ready
- `openspec/changes/sim-harness/**` — this change
- `openspec/specs/sim-harness/**` — written by `openspec archive` on the implementation
  branch, not by hand

Not touched: `packages/core/**`, `content/**`, `docs/design/**`, `docs/adr/**`,
`test/golden/**`, `sim/baseline/**`, `tools/validate-content/**`, `tools/check-language/**`,
`tools/check-lockfile/**`, `tools/sync-labels/**`.

No other change is active (`openspec list`), so no declared path overlaps an open pull
request.
