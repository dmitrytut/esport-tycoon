<!--
PR-1: proposal. Only openspec/changes/<slug>/, no code.
Second review point is PR-2 with the implementation. Loop: docs/adr/0009.
-->

Proposal for #NNN.

## What this changes in behavior

<!-- In one paragraph: what the system will start doing differently. Not how, but what. -->

## Affects

<!-- Paths the implementation will touch. Checked by the admission check. -->

---

### Check on review

- [ ] the task being solved is the same as in the issue, scope hasn't crept
- [ ] `Player Experience (MDA / SDT)` names the intended experience, mechanics, expected dynamics and meaningful decision, how consequences become legible, effect on autonomy / competence / relatedness, and a falsifiable failure signal — or explains `Not applicable` for a non-player change
- [ ] every requirement has a scenario, not just a heading
- [ ] open questions are closed — not a single "we'll clarify during implementation"
- [ ] doesn't contradict `docs/design/*`; if it does, the proposal is fixed, not the design
- [ ] paths in "Affects" don't overlap with open PRs
- [ ] `pnpm verify` is green (for a change with no delta — `skip_specs: true` in `.openspec.yaml`)
