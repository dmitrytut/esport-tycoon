# content/

Data only. Not a line of logic.

Each subdirectory is one entity type, each file is one entity, the file name matches
the `id`. Schemas live in `schema/`. Rules — `docs/adr/0003`.

| Directory | What's in it | Schema |
|---|---|---|
| `disciplines/` | disciplines and their contest configs | `discipline.schema.json` |
| `traits/` | character traits | `trait.schema.json` |
| `events/` | events with choices | `event.schema.json` |
| `regions/` | regions and modifiers | `region.schema.json` |
| `names/` | name and nickname pools by region | `name-pool.schema.json` |
| `activities/` | what a slot of the week is spent on | `activity.schema.json` |
| `seasons/` | season length and complete marked-week count ranges | `season.schema.json` |
| `encounters/` | season-contest opponent definitions and their rewards | `encounter.schema.json` |

## Language

All player-facing text is written **in English**: event text, choice labels, trait,
discipline, and region names, given names and nicknames (`docs/adr/0007`). Russian is
allowed only in the schemas' service fields (`description`) — the player never sees them.

Encounter `label` values are additionally fictional identities: `content/encounters/` names
an opponent Collective, and no real esports organization, team or player may appear there
(`docs/adr/0005`).

There's no localization yet. The mechanism (string keys, translation files) is chosen
alongside the first interface screen, see `docs/adr/0008`. Until then, text lives inline in
the entity files.

## Substitutions in text

`{player}` — the player's name, `{team}` — the lineup's name, `{org}` — the organization,
`{rival}` — the rival. Other substitutions are added alongside code support, not as soon as
they appear in text.

A phrase is written whole, with substitutions, rather than glued together from pieces:
gluing is untranslatable, and a second language is planned.

## Contest inputs

Every discipline declares all six stat weights and one closed `head-to-head` Contest
configuration. The configuration owns score and unit bounds, participant energy cost,
side-chance coefficients, momentum retention, ordered slots, stable metrics and weighted
Moment types. The last and only scoring slot completes each unit. Metric labels are
player-facing content; core receives ids and numeric deltas only.

Series formats, executable expressions and hidden defaults are not content options. A new
discipline changes these validated data values rather than adding a discipline-specific branch
to core.

## Encounter inputs

Every encounter declares one opponent `originId` and `level`, passed as-is to the core
generator (`specs/0001`), and one money amount for each Contest outcome — `win`, `loss` and
`draw` — on the one-tenth money grid used everywhere else money is expressed. `draw` is a
declared amount, not a fallback derived from `win` and `loss`: the accepted contest engine
makes a regulation draw a permanent outcome, not an edge case. Adding another encounter is a
content-only change: a new file under `content/encounters/` needs no code change as long as
its `disciplineId` and `opponent.originId` already exist.

## Economy inputs

Every discipline declares a positive `economy.baseWeeklyRate`, the absolute weekly money
magnitude for generated performer engagements. Discipline `economy.salaryScale` and region
`modifiers.salaryScale` are required positive relative multipliers. Core receives all three
values explicitly and never supplies a fallback.

## Before committing

`pnpm validate:content` — schemas plus referential integrity. The same thing is run by
`pnpm verify`, CI, and the local pre-commit hook.
