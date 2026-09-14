## 1. Activity content contract

- [ ] 1.1 Write `content/schema/activity.schema.json`: required `id`, `name`, `slots`
      (integer ≥ 1), `energy` (number ≥ 0), `target` (`collective` | `member`), `effects`
      (non-empty list, each an item of the closed kind set), optional `disciplines`;
      `additionalProperties: false` like the other schemas. Verify by validating a
      hand-written good file and a file with an unknown effect kind — the second must fail.
- [ ] 1.2 Add `content/activities/*.json` for the activities of `docs/design/week.md` §6.2
      that fit the five effect kinds, one file per activity named after its `id`. Verify
      `pnpm validate:content` passes and each file's name matches its `id`.
- [ ] 1.3 Teach `tools/validate-content/src/index.ts` about activities: schema validation,
      file-name-matches-id, stat names against the six stats, discipline ids against
      `content/disciplines/`, and activities counted in the report. Verify the new cases in
      `tools/validate-content/test/validate-content.test.ts` — a missing discipline id and an
      unknown stat each fail with the offending file named.
- [ ] 1.4 Add the `activities/` row to the table in `content/README.md`. Verify
      `pnpm run format:check` and `pnpm check:language` stay green.

## 2. Core types

- [ ] 2.1 Add `packages/core/src/activity.ts`: `Activity`, the `ActivityEffect` closed union
      over `stat | energy | morale | money | reputation`, and the target scope. Verify
      `pnpm typecheck` and `pnpm lint` pass — no domain word, no anonymous module-surface
      shape, every exported declaration commented.
- [ ] 2.2 Add `packages/core/src/collective.ts`: `Collective`, participant selection for an
      activity, and collective morale as `round(0.6 · mean + 0.4 · min)` with the weights as
      exported constants. Verify a unit test covering the two scenarios of the morale
      requirement: four high members with one at 10 lands between the mean and the minimum,
      and a collective-wide effect changes each member.
- [ ] 2.3 Add `packages/core/src/org.ts`: `Org` with the money balance, reputation and the
      weekly slot pool. Verify a unit test that crediting and debiting money moves the
      balance by exactly the declared amount.

## 3. The week loop

- [ ] 3.1 Add `packages/core/src/week.ts` with `WeekPlan` (4–6 weeks, rejected outside that
      range), `StopReason` as a tagged union over the seven reasons of the spec, `Sensitivity`
      with the three unmaskable reasons and the default thresholds as exported constants, and
      `WeekResult`. Verify unit tests: a three-week plan is rejected, a six-week plan is
      accepted, and a mask suppressing the incident reason is rejected.
- [ ] 3.2 Implement executing one week: slot pool never exceeded, an activity that does not
      fit reported as skipped, energy debited from each participant, a participant short on
      energy excluded, an activity with no affordable participant skipped without spending a
      slot, effects applied through `applyStateChange` and `applyStatChange`. Verify unit
      tests for each of the five scenarios of the slot and energy requirements.
- [ ] 3.3 Implement weekly recovery inside the tick: energy recovery applied exactly once per
      performer per advanced week, nothing recovering between calls. Verify a unit test that
      one empty week raises energy by exactly the weekly recovery and repeated reads without a
      tick change nothing.
- [ ] 3.4 Implement stop reasons: threshold reasons produced only on a downward crossing
      measured from the week's start value, money reason on the balance crossing zero
      downward, skipped-activity reason, block-ran-out reason, calendar-marked reason, and the
      incident extension point. Verify unit tests that a crisis lasting three weeks stops
      once, that a recovered-then-fallen value stops again, and that a week producing two
      reasons reports both.
- [ ] 3.5 Implement `advance`: executes week after week, stops at the end of the first week
      with an unmasked reason, returns the new state, every simulated week's result, the stop
      index and the reasons; a masked reason stays in the week result. Verify unit tests for
      the three scenarios of the advance requirement plus the masked-reason scenario.
- [ ] 3.6 Implement week classification into `quiet | ordinary | contest | series` from that
      week's own inputs and results, and the per-run count of each kind. Verify unit tests:
      an empty unmarked week with no reason is `quiet`, and the same week reached through two
      different histories classifies identically.
- [ ] 3.7 Export the new surface from `packages/core/src/index.ts`. Verify `pnpm typecheck`
      and `pnpm lint` pass and the export list stays sorted.

## 4. Invariants and determinism

- [ ] 4.1 Add arbitraries for a collective, an activity and a plan to
      `packages/core/test/property/arbitraries.ts`. Verify the existing property suites still
      pass with the pinned seed.
- [ ] 4.2 Add `packages/core/test/property/week.property.test.ts`: slots spent never exceed
      the pool, energy and morale never leave their scale, collective morale always lies
      between the minimum and the mean of its members, and a week classified by one kind only.
      Verify `pnpm test` passes.
- [ ] 4.3 Add the determinism test: the same state, plan, mask, calendar and seed advanced
      twice produce identical results down to the stop index, the reasons and every
      performer's state; a different seed is reproducible for itself. Verify `pnpm test`
      passes. Do not add a file under `test/golden/**` — the season snapshot is a separate
      `golden:` pull request (`tests/README.md`).
- [ ] 4.4 Extend `packages/core/test/purity.test.ts` coverage to the new modules: no system
      random number generator, no clock. Verify `pnpm test` passes.

## 5. Retiring the old record

- [ ] 5.1 Delete `specs/0003-week-loop.md`. Verify nothing references it:
      `grep -r "0003-week-loop" --exclude-dir=node_modules` returns only this change's files.
- [ ] 5.2 Update the "weekly cycle" row of `docs/INDEX.md` to point at the archived
      capability instead of the retired stub. Verify `pnpm check:language` and
      `pnpm run format:check` stay green.

## 6. Closing the change

- [ ] 6.1 Run `pnpm verify` and fix what it reports. Verify the whole gate is green in one
      run.
- [ ] 6.2 Run `openspec archive week-loop -y` on the implementation branch and review the
      diff in `openspec/specs/`. Verify `pnpm validate:spec` passes and the change folder has
      moved under `openspec/changes/archive/`.
- [ ] 6.3 Open PR-2 with `gh pr create -T implementation.md`. Verify the pull request exists
      and CI is green; the merge itself is the human's action.
