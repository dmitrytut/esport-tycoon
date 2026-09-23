## 1. Season template content

- [x] 1.1 Add the strict season-template schema, first playable 24-week template and content documentation; extend the validator for positive length, complete `contest`/`series` ranges, integer ordering and maximum-count fit, and verify focused validator tests reject every invalid boundary before `pnpm validate:content` passes.
- [x] 1.2 Add loader coverage proving another valid template needs no code change and that the first playable template declares exactly 2 `series` and 6–8 `contest` weeks; verify the focused content tests pass.

## 2. Deterministic calendar and season state

- [x] 2.1 Write failing core tests for exact marking counts, unique ordered entries and stable identities, same-input replay, different-state reproducibility, returned RNG continuation and invalid template/goal rejection without RNG movement.
- [x] 2.2 Add the fully commented `SeasonTemplate`, `SeasonCalendar`, calendar-entry, goal, contest-fact, result and active/completed season types beside their invariants in `season.ts`; use branded identifiers and tagged unions, export them from `index.ts`, and verify `pnpm typecheck` passes without assertions or anonymous module-surface shapes.
- [x] 2.3 Implement the fixed calendar draw order using only the injected `season-calendar` stream, materialize the whole calendar and retain its continuation; verify the focused calendar tests and purity test pass.
- [x] 2.4 Add pinned property tests for determinism, count ranges, entry uniqueness/order and random-stream isolation across generated templates, and verify the focused property suite passes.

## 3. Week-loop calendar cutover

- [x] 3.1 Write failing week-loop tests for the bounded calendar, `contest-ahead`, marked-week classification, coincident reasons, unmaskable `season-ended`, block truncation and rejection of a parallel raw marking list.
- [x] 3.2 Split one-week and block options so `executeWeek` requires one explicit marking and `advance` requires the bounded `SeasonCalendar`; add the commented `season-ended` reason to the closed unmaskable union, migrate every core caller and fixture in one cutover, and verify focused week tests and `pnpm typecheck` pass.
- [x] 3.3 Extend deterministic property coverage across calendar start/end boundaries and coincident incident selection, proving no week past the season, no duplicate recovery and no unrelated RNG movement; verify the focused property suite passes.

## 4. Season advancement, goal and boundary

- [x] 4.1 Write failing season tests for exactly-one delegation to block advance, relative/absolute clock mismatch, current-or-past fact acceptance, future/unmarked/duplicate fact rejection, win-goal evaluation and every rejection path preserving state and RNG continuations.
- [x] 4.2 Implement season advancement as one call to `advance`, fold returned week kinds and N−1 uninterrupted weeks without reimplementing week rules, and verify focused tests cover ordinary-but-uninterrupted, final-block-week interruption and contest facts accepted on either side of weekly execution.
- [x] 4.3 Implement structured completion and explicit next-season construction; verify tests cover missing facts holding the final boundary, count reconciliation, immutable repeated reads, pending-incident boundary hold, carry-forward of org/collective/performer/incident state, reset of only season-owned fields and no implicit `advanceYear` call.
- [x] 4.4 Add pinned end-to-end property coverage for JSON-compatible state copies, multi-call monotonic progress, deterministic final results and season transitions that preserve age and non-season RNG streams; verify the focused season property suite passes.

## 5. Sim-harness integration

- [x] 5.1 Replace the block-invariant interruption tests with failing in-test scenarios for actual return points: masked reasons remain uninterrupted, a mid-block unmasked return does not move the original block end, a partial reporting horizon does not invent a return, every block-final week is interrupted, and 24 quiet weeks report 18 versus 20 uninterrupted weeks for four- versus six-week blocks.
- [x] 5.2 Update the harness walk and shared report aggregation to consume declared block boundaries without changing `WeekKind`, and report block length beside the metric; verify focused run/report tests, JSON reproducibility and both text and JSON smoke invocations pass without adding season, contest or reward figures to the week-horizon mode.

## 6. Surface, documentation and integration gate
- [x] 6.1 Keep all new module-surface declarations and fields commented, include `season.ts` in ambient RNG/clock purity coverage, export the public season API from `@et/core`, and update the document index for live weekly/season behavior; verify focused unit tests, `pnpm lint`, `pnpm check:language` and `pnpm typecheck` pass.
- [x] 6.2 Add concise invariant comments to every new exported declaration and field, include `season.ts` in ambient-randomness coverage, and update `docs/INDEX.md` to point weekly/season work at the live season capability; verify lint, language and focused purity checks pass.
- [x] 6.3 Run `pnpm format` followed by `pnpm verify`, fix every failure without changing `docs/design/**`, `test/golden/**` or `sim/baseline/**`, and record the green gate in the implementation pull request.
- [x] 6.4 Archive `season-calendar` through `/opsx:archive season-calendar`, verify `openspec validate --all` passes, and inspect that the archived `season-calendar`, `week-loop` and `sim-harness` live specifications contain the accepted requirements before opening PR-2.
