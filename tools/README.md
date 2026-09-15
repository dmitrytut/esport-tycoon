# tools/

Development tools. Independent of the shell and renderer (`docs/adr/0008`), run from the
console on Node.

| Tool | Command | What it does | Status |
|---|---|---|---|
| `validate-content` | `pnpm validate:content` | `content/` schemas plus referential integrity: event → trait and region, trait → core stats and event categories, discipline → region, region → name pool | ready |
| `sync-labels` | `pnpm labels:check` · `pnpm labels:apply` | the issue label taxonomy: `.github/labels.json` is the source, GitHub the copy. Checks the label set and how open issues wear it. Needs the network, so it is not in `pnpm verify` | ready |
| `lint_core` | `pnpm lint` | forbidden domain words and nondeterministic calls in `packages/core`, see `docs/adr/0001` and `0002` | ready, rules in `eslint.config.mjs` |
| `sim_harness` | — | a run of N seasons with no graphics for given seeds, see `specs/0002` | not written |
| `balance_report` | — | comparison of a run's metrics against baseline, highlighting significant shifts | not written |

One gate for everything: `pnpm verify` — types, formatting, linter, tests, content, specs.
The same gate is run by CI and the local pre-commit hook (enabled once: `pnpm run
hooks:install`).
