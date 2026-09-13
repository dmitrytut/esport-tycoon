# ADR 0007: the game's language is English

**Status:** accepted
**Amended:** `adr/0011` — the clause below making Russian the development language no
longer holds; the repository is English except `docs/design/`. The rest of this decision
stands: the game ships in English and localization arrives with the first screen.

## Context

Project documentation is written in Russian, and the first content samples (the "cat on
the keyboard" event, trait and region names) were written in Russian too. This silently
turned into an assumption that "the game is in Russian." That assumption is wrong:

- the market for a mobile manager with a comedic tone is global, and English gives an
  order of magnitude more reach at launch;
- esports vocabulary (roster, scrim, bootcamp, meta, tilt) is English in the original,
  and Russian calques in the UI read worse than the source terms;
- translating from English is cheaper and more predictable than from Russian.

## Decision

**The language of the UI and dialogue is English.** Everything the user sees is written
in English: events and their choices, lines, the names of traits, disciplines, regions,
sponsors, names and nicknames, the interface, error texts, store descriptions.

Russian remains the language of **development**: `docs/`, `specs/`, ADRs, code comments,
`description` fields in schemas, commit messages. `docs/` is for us, `content/` is for
the user.

The build has a single language. There is no localization right now, and there won't be
until the content stabilizes: translating 150 events that are still being rewritten is
money thrown away.

## Multilingual support in the future

A second language (probably Russian) is a planned extension, not a "maybe." Two
requirements follow from this already, right now:

1. Text is written as whole phrases with substitutions (`{player}`, `{team}`, `{org}`,
   `{rival}`), not glued together from pieces. Word order and agreement differ between
   languages, and gluing is untranslatable in principle. This is a writing rule; it
   requires neither code nor an engine.
2. There is no text baked into sprites: text is drawn over the graphics.

**The technical localization mechanism is not chosen in this ADR.** A likely option is
key strings with separate per-language translation files, but that depends on the engine
and its built-in i18n subsystem, and the engine hasn't been chosen (`adr/0000`). The
decision is made in a separate ADR after the engine is chosen. Until the mechanism
exists, text lives inline in `content/` files per `adr/0003`, where it's already
separated from logic.

The "localization support" item has been added to the engine selection criteria
(`adr/0000`).

## Consequences

- The agent writing content writes in English while reading Russian design docs. Tone
  (`docs/design/tone.md`) is about register and humor, not about language.
- The in-game mechanic "shared language within the roster" (`docs/design/world.md`) is a
  simulation, not a UI locale. Any overlap in wording is coincidental and must not be
  confused with the localization mechanism.
- Cost: comedy in a non-native language is harder to write and requires a native-speaker
  proofread before release. Accepted deliberately — a joke missed because of the
  language costs more.
