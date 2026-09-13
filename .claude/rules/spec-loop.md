---
paths:
  - "openspec/**"
  - "specs/**"
---

# Specs

- **Two PRs per task.** The first is only `openspec/changes/<slug>/`, no code is written until
  it's merged. The second is the implementation together with the `openspec archive` result.
  Reason and the full loop — `docs/adr/0009`.
- **`openspec/specs/` is not edited by hand.** The live spec changes only via the
  `openspec archive <slug> -y` command, run on the implementation branch.
- **A proposal declares the paths it affects** in an "Affects" section — the admission
  check for parallel work is computed from it.
- **A change with no delta** (tooling, infrastructure, documentation) sets
  `skip_specs: true` in its `.openspec.yaml` when created, otherwise the gate turns red.
- **References to decisions go bottom-up only.** A requirement may carry an ADR number,
  an ADR does not reference requirements: it is not rewritten, while the spec changes on every archive.
- **Ran into an ADR — stop.** A proposal that contradicts an accepted decision is not written:
  the ADR gets replaced by a separate PR first, then work continues.
- `.claude/commands/opsx/*` and `specs/TEMPLATE.md` are not edited by hand: the former are generated
  (`openspec update --force`), the latter is no longer used. A custom workflow step
  is added via `openspec/config.yaml`.
