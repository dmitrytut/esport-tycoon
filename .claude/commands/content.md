---
description: Generate a batch of content per the schema and validate it
---

Task: generate content — $ARGUMENTS.

Order:
1. Read the schema for the relevant type in `content/schema/`.
2. Read `docs/design/tone.md` and, for events, `docs/design/events-catalog.md`.
3. Look at 2–3 existing files of this type as a sample.
4. Generate. Each entity is a separate file, file name = `id`. All user-facing
   text is in English (`docs/adr/0007`), while the docs you read are in Russian.
5. Check yourself against the rules: no choice should be obviously correct;
   failure is funnier than success; no real people or titles (`docs/adr/0005`).
6. Run `pnpm validate:content` — it checks both schemas and referential integrity.
7. Coverage across categories: don't dump everything into one. Say which categories you covered.
