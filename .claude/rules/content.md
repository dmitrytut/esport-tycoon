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
- Verification — `pnpm validate:content`: schemas and referential integrity.
