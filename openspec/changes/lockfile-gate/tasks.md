## 1. Lockfile checker

- [ ] 1.1 Add the private `tools/check-lockfile` package and a CLI regression test that creates a synchronized temporary workspace plus the reported failure case: an empty workspace package with no lockfile importer. Run `pnpm test tools/check-lockfile/test/check-lockfile.test.ts` and verify it fails because the checker entry does not exist yet.
- [ ] 1.2 Implement `tools/check-lockfile/src/index.ts` as a thin wrapper around `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts`. Preserve pnpm output, print `pnpm install --fix-lockfile` after any failure, and propagate a non-zero exit without modifying the workspace. Run the targeted test and verify both the clean and missing-importer scenarios pass.

## 2. Repository gate

- [ ] 2.1 Add `check:lockfile` to the root scripts and run it first in `verify`. Update `pnpm-lock.yaml` with the new tool importer using `pnpm install --fix-lockfile`, then run `pnpm check:lockfile` and verify a synchronized checkout succeeds.
- [ ] 2.2 Reproduce the acceptance failure in a temporary checkout by adding a new empty workspace package without updating its importer. Run `pnpm check:lockfile` there and verify it exits non-zero with pnpm's missing-importer diagnostic plus `pnpm install --fix-lockfile`.

## 3. Documentation and closure

- [ ] 3.1 Document `check:lockfile` in `tools/README.md`, including that `verify` runs the read-only frozen check and never repairs files. Run `pnpm check:language` and `pnpm run format:check`.
- [ ] 3.2 Run `pnpm verify` once and verify the complete gate is green with the lockfile check first.
- [ ] 3.3 Run `openspec archive lockfile-gate -y` on the implementation branch. Verify the change moves under `openspec/changes/archive/` without modifying `openspec/specs/`, then run `pnpm validate:spec`.
- [ ] 3.4 Open PR-2 with a filled copy of `.github/PULL_REQUEST_TEMPLATE/implementation.md` passed via `-F`; verify CI is green and leave merging to the human.
