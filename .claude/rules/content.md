---
paths:
  - "content/**"
---

# Content

- **Content is data, not code.** A file must conform to the schema in `content/schema/`;
  adding content does not change code. Reason — `docs/adr/0003`.
- **Text is in English.** Everything the player sees is written in English, and so is every
  file around it (`docs/adr/0007`, `docs/adr/0011`). Tone — `docs/design/tone.md`.
- **No real people, teams, or titles.** Characters and organizations are composite/fictional.
  This is a legal risk, not a style choice. Reason — `docs/adr/0005`.
- **A schema is a contract, not content.** Editing `content/schema/**` changes what every
  existing and future file of that type must look like — tightening `required` invalidates
  files already in the repository. That is a behaviour change and goes through the spec loop
  (`docs/adr/0009`), not in with a batch of new events. Adding files under the existing
  schema does not.
- **Files here are formatted** by `prettier` like any other source. A JSON Schema constrains
  shape, never indentation or key order, and this directory is designed for thousands of
  agent-written files.
- Verification — `pnpm validate:content`: schemas and referential integrity.
