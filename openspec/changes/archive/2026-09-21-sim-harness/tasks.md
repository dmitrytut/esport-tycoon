## 1. The package and its inputs

- [x] 1.1 Add the workspace package `tools/sim-harness` (`@et/sim-harness`, private, ESM,
      `bin` pointing at `src/index.ts`) with `@et/core` as a workspace dependency, and add
      the `sim` script to the root `package.json`. Verify `pnpm install` leaves the lockfile
      clean and `pnpm run check:lockfile` passes.
- [x] 1.2 Add `src/content.ts`: load `content/activities/*.json` and `content/regions/*.json`
      into the types `@et/core` expects — `Activity` and `OriginProfile`, the latter built
      from the region plus its name pools. No traits: nothing measures them until #34.
      Verify a unit test that the real content tree loads, that every activity keeps its
      declared slots, energy, target and effects, and that a region whose name pool is
      missing fails loudly rather than producing a nameless performer.
- [x] 1.3 Add `src/scenario.ts` and `scenarios/act-one.json`: opening org values, the
      generation parameters of the collective, the activity ids in play, the block length
      and the sensitivity, which `act-one.json` declares empty. Verify unit tests that the
      file loads; that an unknown activity id fails naming the scenario and the id without
      advancing a week; that a block length outside the range `week-loop` accepts fails the
      same way rather than throwing from inside the walk; and that a mask naming a reason
      listed in `UNMASKABLE_REASONS` is rejected at load time.

## 2. Policies

- [x] 2.1 Add `src/policy.ts` with the three orderings of `design.md`: money, development,
      balanced, each a total order ending in the activity id, the balanced one alternating
      on the absolute week index, plus the participant rule (highest energy, then lower id).
      Verify unit tests that each policy's ordering over a fixed candidate set is exactly the
      declared one, including both tie-breaks, and that the balanced policy alternates on the
      absolute week index rather than on the position inside a block.
- [x] 2.2 Verify a unit test that a policy plans identically across two runs of the same
      scenario, seed and horizon, and that nothing in a policy reads the random number
      generator or computes a payout.

## 3. The horizon walk

- [x] 3.1 Add `src/run.ts`: build the collective from the seed via `generatePerformer`, plan
      a whole block at a time through the policy, validate each block with
      `validateWeekPlan`, and advance week by week with `executeWeek`, keeping the state the
      core returns after each week. Verify a unit test that a run advances exactly the
      requested number of weeks, both for a horizon that is a whole number of blocks and for
      one that ends partway through a block, leaving the rest of that block's plan
      unexecuted.
- [x] 3.2 Record a return of control on a week whose reasons include one the scenario's mask
      leaves unmasked, and go on advancing. Verify unit tests that a threshold crossing in
      the second week of a block does not end a twenty-four-week run, that the remaining
      weeks of that block are advanced with the activities and members they were planned
      with, and that no week is advanced twice.
- [x] 3.3 Verify a unit test that a plan placing a member-targeted activity without a member
      of the collective fails before that week is advanced, the way `advance` fails it.
- [x] 3.4 Verify the equivalence test: a block-long plan advanced by the walk and by
      `advance` from the same state and seed produce the same weeks, kinds, executed and
      skipped activities, reasons and resulting state, save for the `block-ran-out` reason
      `advance` appends to the last week of a block.

## 4. The report

- [x] 4.1 Add `src/report.ts`: the result object of `design.md` — provenance including the
      declared mask, the weekly series of balance, audience, collective morale and mean
      energy, the per-seed and per-policy figures, week kinds, uninterrupted weeks and their
      share, duration in its own field — and the text rendering of that same object. Verify a
      unit test that the rendering names the scenario, seeds, horizon, policy, mask and
      content size, and that the quiet and uninterrupted figures are separate fields with
      separate labels.
- [x] 4.2 Verify unit tests for the uninterrupted metric, all driven through a real run
      rather than a hand-built week result: a week with an executed training session and no
      reason counts as uninterrupted and as `ordinary`; a scenario that masks the
      energy-threshold reason records it and leaves the week uninterrupted; the same horizon
      run with a four-week block and with a six-week one is not scored differently by the
      block length alone.
- [x] 4.3 Verify a unit test that a week running two money activities reports the week's
      balance delta and the activities that ran, and no per-activity split; and that the
      report carries no salary, prize, contest or bankruptcy field, with the three policies
      reported side by side and none declared best.

## 5. The command line and its guarantees

- [x] 5.1 Add `src/index.ts`: `--scenario`, `--policy` (repeatable, default all three),
      `--seeds`, `--weeks`, `--format json|text`, exiting non-zero on a bad input. Verify by
      running `pnpm sim` end to end on the declared seed set and reading the table, and by a
      test that the three policies of one invocation read the same declared mask.
- [x] 5.2 Verify a test that two identical invocations produce identical machine-readable
      output once the duration field is excluded, and that the duration is not part of any
      comparison the report makes.
- [x] 5.3 Verify the cross-check test: a short scenario advanced directly through the core in
      the test body, asserting the report's balance, audience, stat, energy and morale figures
      equal it.
- [x] 5.4 Measure the wall-clock cost of the declared run — seed set times horizon times
      three policies — and record the measured number under a "Cost" heading in the PR-2
      description. No CI workflow is added in this change.

## 6. Closing the change

- [x] 6.1 Update `tools/README.md`: `sim_harness` moves from "not written" to ready, with
      the `pnpm sim` command and one line on what it reports. Verify `pnpm check:language`
      and `pnpm run format:check` stay green.
- [x] 6.2 Run `pnpm verify` and fix what it reports. Verify the whole gate is green in one
      run.
- [x] 6.3 Run `openspec archive sim-harness -y` on the implementation branch and review the
      diff in `openspec/specs/`. Verify `pnpm validate:spec` passes, the new capability
      landed, and the change folder has moved under `openspec/changes/archive/`.
- [ ] 6.4 Open PR-2 with a filled copy of
      `.github/PULL_REQUEST_TEMPLATE/implementation.md` passed via `-F`. Verify the pull
      request exists and CI is green; the merge itself is the human's action.
