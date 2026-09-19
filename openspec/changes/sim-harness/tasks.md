## 1. The package and its inputs

- [ ] 1.1 Add the workspace package `tools/sim-harness` (`@et/sim-harness`, private, ESM,
      `bin` pointing at `src/index.ts`) with `@et/core` as a workspace dependency, and add
      the `sim` script to the root `package.json`. Verify `pnpm install` leaves the lockfile
      clean and `pnpm run check:lockfile` passes.
- [ ] 1.2 Add `src/content.ts`: load `content/activities/*.json` and `content/regions/*.json`
      into the types `@et/core` expects — `Activity` and `OriginProfile`, the latter built
      from the region plus its name pools. Verify a unit test that the real content tree
      loads, that every activity keeps its declared slots, energy, target and effects, and
      that a region without a name pool fails loudly rather than producing a nameless
      performer.
- [ ] 1.3 Add `src/scenario.ts` and `scenarios/act-one.json`: opening org values, the
      generation parameters of the collective, the activity ids in play, the block length
      and the sensitivity the run advances with, which `act-one.json` declares empty. Verify
      unit tests that the file loads; that a scenario naming an unknown activity id fails
      naming the scenario and the id without advancing a week; that a block length outside
      the range the week loop accepts fails the same way rather than throwing from inside
      the walk; and that a mask naming an unmaskable reason is rejected by the loader.

## 2. Policies

- [ ] 2.1 Add `src/policy.ts` with the three orderings of `design.md`: money, development,
      balanced, each a total order ending in the activity id, plus the participant rule
      (highest energy, then lower id). Verify unit tests that each policy's ordering over a
      fixed candidate set is exactly the declared one, including the two tie-breaks.
- [ ] 2.2 Verify a unit test that a policy plans identically across two runs of the same
      scenario, seed and horizon, and that nothing in a policy reads the random number
      generator or computes a payout.

## 3. The horizon walk

- [ ] 3.1 Add `src/run.ts`: build the collective from the seed via `generatePerformer`,
      then walk the horizon with `advance` for whole blocks and `executeWeek` for a tail
      shorter than the minimum block, carrying the unexecuted remainder of a stopped block
      into the next call. Verify unit tests for the three scenarios of the horizon
      requirement: a stop mid-block resumes and executes each remaining week once, a tail
      shorter than a block still lands on the horizon, and a run with a mid-block stop
      matches the same weeks advanced without one.
- [ ] 3.2 Verify a unit test that a run executes exactly the requested number of weeks for
      a horizon that is a whole number of blocks and for one that is not.
- [ ] 3.3 Verify a unit test for a stop whose unexecuted remainder lands in the tail: those
      weeks are advanced with the activities and members they were planned with, and a week
      that was never planned is the only one the policy decides against the advanced state.

## 4. The report

- [ ] 4.1 Add `src/report.ts`: the result object of `design.md` — provenance including the
      declared mask, per-policy and per-seed figures, week kinds, uninterrupted weeks and
      their share, duration in its own field — and the text rendering of that same object.
      Verify a unit test that the text rendering names the scenario, seeds, horizon, policy,
      mask and content size, and that the quiet and uninterrupted figures are separate fields
      with separate labels.
- [ ] 4.2 Verify unit tests for the uninterrupted metric, all driven through a real run
      rather than a hand-built week result: a week with an executed training session and no
      stop counts as uninterrupted and as `ordinary`; a scenario that masks the
      energy-threshold reason records it and leaves the week uninterrupted; the same horizon
      sliced into four-week and six-week blocks reports the same count.
- [ ] 4.3 Verify a unit test that the report carries no metric for a mechanic that does not
      exist — no salary, prize, contest or bankruptcy field — and that the three policies are
      reported side by side without one being declared best.

## 5. The command line and its guarantees

- [ ] 5.1 Add `src/index.ts`: `--scenario`, `--policy` (repeatable, default all three),
      `--seeds`, `--weeks`, `--format json|text`, exiting non-zero on a bad input. Verify by
      running `pnpm sim` end to end on the declared seed set and reading the table, and by a
      test that the three policies of one invocation advance with the same declared mask.
- [ ] 5.2 Verify a test that two identical invocations produce identical machine-readable
      output once the duration field is excluded, and that the duration is not part of any
      comparison the report makes.
- [ ] 5.3 Verify the cross-check test: a short scenario advanced directly through `advance`
      in the test body, asserting the report's money, audience, stat, energy and morale
      figures equal it.
- [ ] 5.4 Measure the wall-clock cost of the declared run — seed set times horizon times
      three policies — and record the measured number under a "Cost" heading in the PR-2
      description. No CI workflow is added in this change.

## 6. Closing the change

- [ ] 6.1 Update `tools/README.md`: `sim_harness` moves from "not written" to ready, with
      the `pnpm sim` command and one line on what it reports. Verify `pnpm check:language`
      and `pnpm run format:check` stay green.
- [ ] 6.2 Run `pnpm verify` and fix what it reports. Verify the whole gate is green in one
      run.
- [ ] 6.3 Run `openspec archive sim-harness -y` on the implementation branch and review the
      diff in `openspec/specs/`. Verify `pnpm validate:spec` passes, the new capability
      landed, and the change folder has moved under `openspec/changes/archive/`.
- [ ] 6.4 Open PR-2 with a filled copy of
      `.github/PULL_REQUEST_TEMPLATE/implementation.md` passed via `-F`. Verify the pull
      request exists and CI is green; the merge itself is the human's action.
