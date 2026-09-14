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

## Language

All player-facing text is written **in English**: event text, choice labels, trait,
discipline, and region names, given names and nicknames (`docs/adr/0007`). Russian is
allowed only in the schemas' service fields (`description`) — the player never sees them.

There's no localization yet. The mechanism (string keys, translation files) is chosen
alongside the first interface screen, see `docs/adr/0008`. Until then, text lives inline in
the entity files.

## Substitutions in text

`{player}` — the player's name, `{team}` — the lineup's name, `{org}` — the organization,
`{rival}` — the rival. Other substitutions are added alongside code support, not as soon as
they appear in text.

A phrase is written whole, with substitutions, rather than glued together from pieces:
gluing is untranslatable, and a second language is planned.

## Before committing

`pnpm validate:content` — schemas plus referential integrity. The same thing is run by
`pnpm verify`, CI, and the local pre-commit hook.
