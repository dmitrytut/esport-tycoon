## Why

`pnpm verify` can pass locally while CI fails one step earlier at `pnpm install --frozen-lockfile`. This happened when `tools/sync-labels` was added without its workspace importer: the local gate reported success, CI rejected the same commit, and the useful repair was `pnpm install --fix-lockfile` rather than the ordinary install commands already tried.

The next planned work adds more workspace packages. The local gate must reject the same stale-lockfile state before a commit is reported ready.

## What Changes

- Add a `check:lockfile` command that asks the pinned pnpm to validate the whole workspace with a frozen lockfile, without writing `node_modules` or running dependency scripts.
- Run the lockfile check first in `pnpm verify`, so the pre-commit hook and CI use the same repository gate.
- Preserve pnpm's diagnostic output and add the repository-specific repair command, `pnpm install --fix-lockfile`, when validation fails.
- Add a regression test that creates a temporary workspace, adds an empty package without a lockfile importer, and observes the same failure locally.
- Keep the check read-only. It reports drift but never repairs or rewrites the lockfile behind the author.
- Do not add a custom YAML parser or duplicate pnpm's workspace resolution rules.

## Capabilities

### New Capabilities

None. This change affects development tooling only and declares `skip_specs: true`.

### Modified Capabilities

None. No simulation or player-visible requirement changes.

## Impact

The implementation adds a small Node/TypeScript tool that delegates validation to `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts`. A synchronized workspace completes the check without dependency resolution or `node_modules` writes; a stale workspace exits non-zero before the rest of the gate runs.

`pnpm-lock.yaml` gains the importer for the checker package itself. `tools/README.md` documents the command and updates the statement that local and CI gates are equivalent.

No runtime dependency, core API, content schema, OpenSpec capability, golden file, or baseline changes.

## Affects

- `package.json` — add `check:lockfile` and run it first in `verify`
- `pnpm-lock.yaml` — register the new workspace tool
- `tools/check-lockfile/**` — pnpm wrapper and regression test
- `tools/README.md` — document the local lockfile gate
- `openspec/changes/lockfile-gate/**` — tooling proposal and implementation tasks

Not touched: `packages/core/**`, `content/**`, `openspec/specs/**`, `docs/design/**`, `docs/adr/**`, `test/golden/**`, and `sim/baseline/**`.
