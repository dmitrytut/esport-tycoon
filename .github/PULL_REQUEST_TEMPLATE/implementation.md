<!--
PR-2: implementation. Code plus the `/opsx:archive` result on the same branch.
Requirements are already accepted in PR-1 — only conformance to them is discussed here.
-->

Closes #NNN. Implementation of `<slug>`, requirements accepted in PR-#NNN.

## How to verify

<!-- A command or scenario that lets the result be seen with your own eyes. -->

---

### Check on review

- [ ] the diff does exactly the accepted requirements — not a single change they didn't ask for
- [ ] all tasks in `tasks.md` are checked off
- [ ] the delta is merged: `openspec/specs/` updated, the change folder moved to `changes/archive/`
- [ ] golden and baseline are untouched; if numbers shifted — a separate PR with a `golden:`/`baseline:` prefix
- [ ] new invariants are covered by a test, not just an example
- [ ] `pnpm verify` is green
