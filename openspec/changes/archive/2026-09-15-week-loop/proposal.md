## Why

`packages/core` models a performer and nothing else: stats, the age curve, generation, the
information fog. There is no time in the game, so a set of people is not yet a simulation
and the balance track has nothing to run — `sim_harness` (`specs/0002`) cannot measure a
season that cannot be advanced. The weekly tick is the smallest addition that turns the
performer model into a simulation (issue #7).

It is also the first mechanic to go through the spec loop of `docs/adr/0009`, so the three
questions the design leaves open are closed here, in requirements, rather than in code.

## What Changes

- **Week tick.** A slot pool per week (5 in act 1), activities that cost slots and energy,
  energy spent by participants and recovered between weeks, morale moved by results and by
  activities.
- **Activities become content.** `content/activities/*.json` against a new
  `content/schema/activity.schema.json`; an effect is one of a closed set of kinds
  (`stat`, `energy`, `morale`, `money`, `reputation`), never a script (`docs/adr/0003`).
  Anything that needs a procedure — the charisma check of a press conference — is left to
  the incident system and is out of scope here.
- **Block plan and advance.** A plan covers 4–6 weeks; advancing executes it without the
  user until the first stop.
- **Stop is a closed list, and it fires on a transition.** Advancing returns the reasons it
  stopped for. Three of them cannot be masked (the plan ran out, an incident awaits a
  choice, a week the calendar marks as contested); the rest are filtered by a sensitivity
  mask. A threshold reason triggers when a value *crosses* the threshold downward, never
  while it merely sits below it — a level condition would stop the game every week of a
  crisis, which is the failure mode `docs/design/week.md` §6.3 exists to prevent.
- **Week kind is a classification, not an input.** Every advanced week is labelled
  `quiet | ordinary | contest | series` after the fact. The 40/35/20/5 split in
  `docs/design/week.md` §6.3 becomes an observed distribution with a ±10 pp corridor,
  measured by `sim_harness`; no rule steers a season towards it. Manufacturing drama to
  fill a quota contradicts "the game stops only when something happened".
- **Morale is stored on people and derived for the collective.**
  `PerformerState.morale` stays the only stored value (`specs/0001`, already shipped);
  collective morale is a pure function of the members, `0.6·mean + 0.4·min`, so one furious
  person is visible without sinking everyone. Activities that read as "+morale to the team"
  hand a delta to each participant.
- **Retires `specs/0003-week-loop.md`.** The stub moves into this change and is deleted
  here; its behaviour settles in `openspec/specs/` on archive (`docs/adr/0009`).

Out of scope, unchanged by this proposal: the contest itself (`specs/0004`), the incident
system (`specs/0005`) — only the stop reason and an extension point for it are defined
here — economy beyond crediting and debiting money, and every interface.

### Two notes for the reviewer

1. **The design documents disagree about the calendar.** `week.md` §6.3 promises 20%
   contest weeks and 5% tournament weeks; `loops.md` gives 24 weeks with 2 tournaments and
   6–8 matches, which is 8% and 25–33%. This change does not touch `docs/design/*` — intent
   changes only on the author's explicit request. It treats `loops.md` as the source for
   event counts (it is the concrete one) and the §6.3 percentages as a time-budget
   guideline, and records the divergence in `design.md`.
2. **A week-loop golden snapshot cannot be produced by the implementation branch.** The
   `PreToolUse` hook denies every write under `test/golden/**`, creation included, and that
   is deliberate (`tests/README.md`). So PR-2 proves determinism with unit and property
   tests, and the season snapshot arrives in its own pull request with a single `golden:`
   commit.

## Capabilities

### New Capabilities

- `week-loop`: the slot pool, activity execution with its costs, energy and morale
  movement, the block plan, advancing with a closed list of stop reasons and a sensitivity
  mask, and the classification of a week into one of four kinds.
- `activity-catalog`: the data contract for activities — the schema, the closed set of
  effect kinds, and the referential integrity the content validator enforces.

### Modified Capabilities

None. `openspec/specs/` is empty until this change is archived.

## Impact

Behaviour of `packages/core` grows a second subject beside the performer: a week. Nothing
existing changes shape — `PerformerState` already carries energy, morale and form, and
`applyStateChange` stays the only way to move them, so the week loop is a consumer of the
performer model rather than a rewrite of it (`specs/0001`).

Risks: the stop list is the mechanic's main risk (stop on trifles and the Continue button
is useless; swallow the important and the user is blindsided), which is why it is
enumerated in requirements and covered by tests that pin the week index the advance stops
at. Second risk: activity effects expressed as data are only as expressive as the effect
kinds, and the first content that does not fit will be a signal to extend the schema in
its own change rather than to add a script field.

## Affects

- `packages/core/src/week.ts` — new: the week tick, the plan, advancing, stop reasons, the
  week kind
- `packages/core/src/collective.ts` — new: a collective, participant selection, derived
  morale
- `packages/core/src/org.ts` — new: money balance, reputation, the weekly slot pool
- `packages/core/src/activity.ts` — new: the activity type and the effect kinds
- `packages/core/src/index.ts` — the new module surface
- `packages/core/test/week.test.ts`, `packages/core/test/collective.test.ts`,
  `packages/core/test/org.test.ts` — new
- `packages/core/test/purity.test.ts` — the new modules join the no-ambient-randomness check
- `packages/core/test/property/week.property.test.ts`,
  `packages/core/test/property/arbitraries.ts` — invariants for slots, energy and morale
- `content/schema/activity.schema.json` — new
- `content/activities/*.json` — the activities of `docs/design/week.md` §6.2 as data
- `content/README.md` — the new directory in the table
- `tools/validate-content/src/index.ts`, `tools/validate-content/test/validate-content.test.ts`
  — activities validated like every other content kind
- `specs/0003-week-loop.md` — removed, the stub is consumed by this change
- `docs/INDEX.md` — the "weekly cycle" row stops pointing at the retired stub
- `openspec/changes/week-loop/**` — this change
- `openspec/specs/week-loop/**`, `openspec/specs/activity-catalog/**` — written by
  `openspec archive` on the implementation branch, not by hand

Not touched: `test/golden/**` and `sim/baseline/**` (see note 2), `docs/design/**`,
`docs/adr/**`, `packages/core/src/performer.ts`, `packages/core/src/generate.ts`,
`packages/core/src/observe.ts`, `packages/core/src/rng.ts`.
