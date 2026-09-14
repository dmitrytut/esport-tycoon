# ADR 0003: content is data

**Status:** accepted

## Context

The bulk of the project is not code but content: events, traits, disciplines, regions,
names, sponsor names. This content is convenient to generate with agents, but only if
the result is machine-verifiable.

## Decision

1. All content lives in `content/` as separate data files, grouped by type.
2. Each type has a JSON Schema in `content/schema/`.
3. The validator checks the schema **and referential integrity**: an event references
   an existing trait, a discipline references existing stats, a region references an
   existing name pool and language.
4. The validator runs in CI and locally. Invalid content is not merged.
5. Adding content does not require code changes. If it does, that is a signal that the
   schema is incomplete, and the schema should be changed, not the content hardcoded.

## Consequences

- An agent can generate 40 events and verify them itself.
- Text is separated from logic, so translation and tone edits do not touch the code.
  The language of the texts is English, `adr/0007`.
- Cost: schemas must be maintained, and they must be strict. A weak schema is worse
  than none.
