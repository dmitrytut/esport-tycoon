# Document map

A table "task → what to read." The point of this file is to avoid having to load all of
`docs/`.

This map is for humans and for tasks that aren't tied to a path. Rules tied to a path live
in `.claude/rules/*.md` with a `paths` field and load themselves when an agent opens a
matching file: they give a short digest and an ADR number, not a retelling of the decision.

## By task type

| Task | Read | Not needed |
|---|---|---|
| Add an event or a batch of events | `design/tone.md`, `design/events-catalog.md`, `content/schema/event.schema.json` | the rest |
| Touch the performer model (stats, traits, state) | `design/player.md`, then `openspec/specs/`; still empty — `specs/0001-player-model.md` (implemented) | contest, world |
| Work on the contest | `design/match.md`, `design/disciplines.md`, `specs/0004-match-engine.md` (stub) | world, economy |
| Work on the weekly or season cycle | `design/week.md`, `design/loops.md`, `openspec/specs/week-loop/`, `openspec/specs/season-calendar/`, `openspec/specs/activity-catalog/` | contest |
| Balance the economy | `design/week.md` (activities section), `design/failure.md`, `specs/0002-sim-harness.md` (stub) | tone, onboarding |
| Add a discipline | `design/disciplines.md`, `content/schema/discipline.schema.json`, `adr/0001` | — |
| Add a region | `design/world.md`, `content/schema/region.schema.json` | — |
| Write any text the player will see | `design/tone.md`, `adr/0007` | code, engine |
| Touch core code (`packages/core/src/`) | `adr/0001`, `adr/0002`, `adr/0004`, `adr/0010` | design docs |
| Onboarding and the first session | `design/onboarding.md`, `design/tone.md` | — |
| Touch the interface: the scene, panels, contest screen | `design/ui.md`, `design/match.md` (layers), `design/week.md` | core, content |
| Understand what's not there yet | `design/roadmap.md`, `open-questions.md` | — |
| Start any work on a mechanic | `adr/0009` (spec loop), then `openspec/specs/` on the topic; the layer fills in from the first archive | — |

## All documents

**Top level**
- `vision.md` — why the game, the fantasy, how it differs from FM
- `glossary.md` — terms: one word = one concept
- `open-questions.md` — what's still undecided

**Process** (`process/`)
- `feature-dev-process.md` — the route from a filed issue to merged code, step by step,
  with a sequence diagram

**Specs** (outside `docs/`)
- `openspec/specs/*` — the system's live behavior: what it does now. Updated
  by the `openspec archive` command in the implementation branch, not edited by hand
- `openspec/changes/<slug>/` — work in progress: proposal, spec delta, tasks.
  On `master` — the registry of accepted but not yet completed changes
- `specs/NNNN-*.md` — the old format. `0001` is implemented and remains the sole
  record of the performer model's behavior until the first archive; `0002–0006` are
  stubs. We don't start new ones (`adr/0009`)

**Design** (`design/`)
- `loops.md` — the week, season, and organization loops
- `acts.md` — three acts: basement → office → organization
- `disciplines.md` — three disciplines, stat weights, how to add a fourth
- `player.md` — six parameters, traits, state, age, stars
- `week.md` — slots, activities, energy, morale, fighting the routine
- `match.md` — the contest engine, three layers of coverage, intervention windows
- `ui.md` — scene and panels: what the scene draws, what the interface draws
- `world.md` — regions, visas, languages, meta and patches
- `failure.md` — three ways to lose, season goals
- `onboarding.md` — the first five minutes
- `tone.md` — humor, two rules of comedy
- `roadmap.md` — deferred: academy, home base, transfers, music, online
- `events-catalog.md` — how events are structured and how to write them

**Decisions** (`adr/`) — read before changing architecture. Worth calling out separately:
`0007`: interface and dialogue in English, localization comes after the engine is chosen.
`0010`: style is set by configuration, the only prose left is branded identifiers and
tagged unions for state. `0011`: every file is English; Russian survives in `design/`,
`content/names/ru-*.json` and the retired `specs/`, and in messages written to a human.
