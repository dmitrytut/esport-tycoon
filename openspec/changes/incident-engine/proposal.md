## Why

Events are meant to be half of the game's authored content, but the current week loop can
only stop for an incident that a caller selected in advance. Nothing chooses an event from
state, preserves a pending choice, applies its consequence once, or prevents it from
repeating, so neither the future shell nor the headless harness can execute an event without
inventing a second engine outside core.

## What Changes

- Add a domain-neutral incident engine to core: closed trigger and effect types, weighted
  selection through an injected RNG stream, one explicit pending choice, global per-incident
  cooldowns, deterministic stat checks, and exactly-once resolution.
- Select at most one incident after a week has applied activities and recovery. An unresolved
  incident blocks another call to either one-week or block advancement before state or RNG
  can move.
- Define the pre-incident `baseWeekKind` used by incident conditions separately from the
  final week kind, which may become `ordinary` because the incident produced a stop reason.
- **BREAKING**: replace the caller-scheduled `PendingIncident[]` option with incident catalog
  and cadence input, and make incident lifecycle state part of every serializable `RunState`.
- **BREAKING**: replace the event schema's unimplemented bag of effects with a closed,
  discriminated set that core can execute. Stable choice ids and direct or stat-check
  outcomes replace array position and implicit procedures.
- Keep production cadence undecided. The existing act-one measurement remains incident-free;
  a dedicated harness scenario with a guaranteed incident gate proves the end-to-end path
  without pretending to tune event frequency.
- Extend the three harness policies with the same deterministic fallback: submit the first
  choice id in ascending code-point order. The harness calls core's resolution API, preserves
  the remainder of the current plan, and reports occurrence and resolution under the week
  that produced them.
- Add three executable events covering a direct performer change, an organization change,
  and a Presence check. Remove `cat-on-keyboard` from executable content: its `riskLoss` and
  `respect` consequences belong to mechanics that do not exist, while the authored example
  remains in the intent layer for a future contest-aware event.

## Capabilities

### New Capabilities

- `incident-engine`: candidate eligibility, weighted selection, pending lifecycle, choice
  resolution, closed effects, stat checks, cooldowns, and deterministic replay.

### Modified Capabilities

- `week-loop`: advancement owns incident selection, refuses to advance unresolved state, and
  reports the selected incident and target through the existing unmaskable stop path.
- `sim-harness`: scenarios may opt into an incident catalog and cadence, policies resolve
  pending choices through core, and reports distinguish occurrence from resolution.

## Impact

The core public surface gains incident definitions, lifecycle state and resolution results;
constructors of `RunState` migrate in one cutover. Event content and its validator migrate to
the executable contract. The headless harness loads events, runs a dedicated incident
scenario, and adds occurrence, choice and outcome to both report forms. No UI, modal,
season, contest consequence, production cadence, event chains, persistent NPC, localization,
or broad trait mechanic is added; the full event catalog remains #47 and non-event trait
behavior remains #34.

## Affects

- `packages/core/src/incident.ts`
- `packages/core/src/week.ts`
- `packages/core/src/index.ts`
- `packages/core/test/**`
- `content/schema/event.schema.json`
- `content/schema/trait.schema.json`
- `content/events/*.json`
- `tools/validate-content/src/index.ts`
- `tools/validate-content/test/**`
- `tools/sim-harness/scenarios/*.json`
- `tools/sim-harness/src/**`
- `tools/sim-harness/test/**`
- `openspec/specs/incident-engine/spec.md`
- `openspec/specs/week-loop/spec.md`
- `openspec/specs/sim-harness/spec.md`
