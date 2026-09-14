---
paths:
  - "docs/adr/**/*.md"
---

# Decisions

- **An accepted ADR is not rewritten.** It records why a choice was made at a point in
  time; editing it to match today's code destroys the only record of the reasoning. A
  changed mind is a new ADR; a withdrawn one gets `Status: closed, superseded by adr/NNNN`
  and nothing else about it moves.
- **The exception is an ADR that is not merged yet.** While its pull request is open it is
  a draft and is edited freely — that is the moment to get it right.
- **An ADR carries no procedure.** It answers "why this way and not another". Steps live
  in `openspec/config.yaml`, checks live in `eslint.config.mjs`, `.githooks/` and
  `.claude/hooks/`. If an ADR starts listing commands, the list will drift away from what
  actually runs.
- **References point upward only.** An ADR may cite an older ADR or a design document; it
  never cites a spec requirement or a change slug, because those are rewritten on every
  archive and the ADR is not.
- **"This ADR blocks my work" is not a reason to edit it.** Open an issue titled
  `ADR NNNN blocks <slug>` with the `process` label and stop. Replacing a decision is a
  human's call, in its own pull request.
