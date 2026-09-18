## Context

See `proposal.md` for the failure and timing. The relevant boundary is small: CI runs `pnpm install --frozen-lockfile` before `pnpm verify`, while the local pre-commit hook runs only `pnpm verify`. The repository already uses executable TypeScript tools under `tools/`, invokes them through root package scripts, and tests CLIs against temporary directories.

The checker must use pnpm 12.4.1's own workspace and lockfile semantics. Reimplementing the `importers` comparison would catch the reported symptom but miss other manifest/lockfile drift that the CI install rejects.

## Goals / Non-Goals

**Goals:**

- Make `pnpm verify` reject a lockfile that the CI frozen install rejects.
- Keep the check read-only, script-free, and fast on a synchronized workspace.
- Report the repair command that fixed the reproduced repository failure.
- Preserve pnpm's original error so future failure classes remain diagnosable.

**Non-Goals:**

- Repair or rewrite `pnpm-lock.yaml` automatically.
- Parse workspace globs or lockfile YAML in repository code.
- Install dependencies or validate the package store.
- Change CI installation, dependency versions, or package-manager policy.

## Decisions

### Delegate validation to pnpm

`tools/check-lockfile/src/index.ts` runs:

```text
pnpm install --frozen-lockfile --lockfile-only --ignore-scripts
```

`--frozen-lockfile` applies the same stale-manifest decision as CI. `--lockfile-only` prevents writes to `node_modules`, and `--ignore-scripts` makes the no-execution invariant explicit. The checker does not pass `--offline`: a missing package-store entry is not repository drift and must not create a local-only failure.

The child inherits standard streams so pnpm remains the source of the detailed diagnostic. On a non-zero status or launch error, the wrapper prints a final repository-specific line naming `pnpm install --fix-lockfile`, then exits non-zero. It never retries with a mutating command.

### Keep the wrapper as a workspace tool

The checker follows the existing `tools/<name>/src/index.ts` structure and has a private package manifest without runtime dependencies. This makes the tool itself exercise the invariant: its workspace importer must be committed to `pnpm-lock.yaml`.

The root `check:lockfile` script invokes the TypeScript entry with Node, matching `validate:content`, `check:language`, and `labels:check`. `verify` runs it before typechecking so a stale repository fails quickly.

### Test the observable CLI contract

`tools/check-lockfile/test/check-lockfile.test.ts` creates a minimal valid pnpm workspace in a temporary directory and executes the real checker process.

Two scenarios are permanent:

1. a synchronized workspace exits successfully;
2. adding an empty workspace package without a corresponding importer exits non-zero, preserves pnpm's missing-importer error, and names `pnpm install --fix-lockfile`.

The test does not mock `child_process`, inspect the checker's source, or duplicate the importers algorithm.

## Risks / Trade-offs

- `verify` starts one nested pnpm process. The measured synchronized check completes in roughly 30 ms on the development machine, which is negligible beside the existing gate.
- The command duplicates part of CI's install validation, deliberately. Delegating both decisions to pnpm is safer than maintaining a faster approximation.
- pnpm may change diagnostic wording. The test anchors only the observable missing-importer category and the repository repair line; it does not pin the whole upstream message.
- The checker package adds one more empty workspace importer. That lockfile change is intentional and proves the implementation obeys the rule it enforces.
