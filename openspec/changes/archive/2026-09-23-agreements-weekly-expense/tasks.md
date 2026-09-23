## 1. Content rate-scale contract

- [x] 1.1 Add a required finite positive base weekly rate to the discipline schema, tighten the region and discipline schemas so their existing `salaryScale` fields are required finite positive numbers, migrate the shipped discipline and regions, update content documentation without changing the current scale values, and add validator cases for a missing, zero and negative base rate and scale; verify the focused validator tests and `pnpm validate:content` pass.
- [x] 1.2 Extend the typed content loader to resolve the selected discipline and map the domain base rate and `salaryScale` fields to required neutral rate inputs with no fallback; verify focused loader tests reject unknown disciplines and expose the base rate and both scales.

## 2. Engagement model and quotation

- [x] 2.1 Write failing core tests for unique ids, positive one-tenth rates, inclusive/exclusive intervals, rejection of a second stored term for one performer, unknown performer or collective references, exact current-member coverage and rejection paths that preserve state and RNG continuations.
- [x] 2.2 Add the fully commented domain-neutral `Engagement`, rate-input, lifecycle-input and forecast types beside their invariants in a focused core module, export the public surface, and migrate `RunState` fixtures to explicit engagements and `consecutiveNegativeWeeks`; verify `pnpm typecheck` passes without assertions or anonymous module-surface shapes.
- [x] 2.3 Write failing quotation tests for the base-rate multiplier, the six-stat arithmetic mean, both required scales, one-tenth rounding, independence from age, hidden fields and floating state, stable performer-generation RNG continuation, materialized rates that do not follow later stat or content changes, and separability of magnitude from relative scales.
- [x] 2.4 Implement pure rate quotation after performer generation without changing generator draw order, then add pinned property coverage for determinism, positive finite outputs and invariance under temporary-state changes; verify the focused unit, property and existing performer golden tests pass without regenerating golden data.

## 3. Lifecycle and forecast operations

- [x] 3.1 Write failing lifecycle tests for renewal at or past the boundary, renewal priced by the current quote with no caller-supplied rate, growth priced only at the boundary, early-renewal rejection, atomic termination, no fee, rejection of terminating the last engagement, invalid remaining plans after departure, incident-first resolution and state/RNG preservation on every rejection.
- [x] 3.2 Implement renewal and termination as pure run-state operations that reuse the same quote operation and reject an emptying termination, keeping `Performer` and `PerformerSnapshot` unchanged; verify focused lifecycle and performer serialization tests pass.
- [x] 3.3 Write failing forecast tests for four- and six-week horizons, exact ordered ids and integer-tenth totals, zero-income projected balances, first negative week, expiry visibility, unavailable post-expiry suffixes and no mutation or RNG movement.
- [x] 3.4 Implement the forecast by reusing the same validated active-engagement selection and integer-tenth aggregation as settlement rather than copying arithmetic; verify focused unit and property tests prove every determinate forecast week matches actual unchanged settlement.

## 4. Weekly settlement and expiration

- [x] 4.1 Write failing week-loop tests for the full order — activities and income, recovery, one aggregated engagement debit, final-balance streak and reasons, then incident selection — including same-week rescue, exact-zero reset, continued negative weeks without repeated crossing, ordered expense evidence and incident money affecting only the next opening balance.
- [x] 4.2 Implement the single recurring settlement in one-week execution as its own requirement-level behavior separate from activity money effects, add ordered `engagementExpense` evidence and run-owned `consecutiveNegativeWeeks`, and migrate every direct caller and fixture in one cutover; verify focused week tests and `pnpm typecheck` pass.
- [x] 4.3 Write failing block-advance tests for one unmaskable `engagement-expired` reason per ending term, the last paid week advancing exactly once, uncovered following-week rejection, coincident block/season/incident reasons and no duplicate debit or recovery after continuation.
- [x] 4.4 Add expiration to the closed stop-reason union and sensitivity guard, validate the engagement coverage invariant before plan execution, and preserve all coincident reasons; verify focused block tests and the extended week determinism coverage for reordered engagement arrays and JSON-compatible state copies pass.

## 5. Season boundary integration

- [x] 5.1 Write failing season-boundary tests for engagement inventory and negative-count carry-through, final-season-week expiration, incident-first resolution, and exact state/calendar-RNG preservation after a rejected next-season attempt.
- [x] 5.2 Update next-season startup to reject invalid current engagement coverage while carrying valid terms and the negative count unchanged; verify focused season unit and property tests pass.

## 6. Sim-harness integration

- [x] 6.1 Extend scenario validation with a required discipline id and explicit initial engagement duration covering the effective horizon after any command-line override; update shipped scenarios with declared inputs without claiming balance viability or opting act one into incidents, and verify focused scenario tests reject unknown disciplines, missing scales, invalid durations and effective horizons longer than their terms.
- [x] 6.2 Build initial engagements through core quotation after the existing deterministic performer generation, with stable ids and week-zero terms identical across policies; verify focused opening-state and reproducibility tests prove no runner-side formula or extra RNG draw.
- [x] 6.3 Add weekly and total recurring expense plus the consecutive-negative-week series to the shared machine-readable report and text renderer from core evidence only; verify focused report tests, byte-identical JSON game metrics and direct-core comparison pass without bankruptcy, prize or contest metrics.
- [x] 6.4 Run both text and JSON harness smoke commands and inspect that opening provenance names region, discipline, base rate and term while every week reports the core-produced expense and streak; record the resulting uncalibrated money series as the pre-tuning measurement #52 consumes, and do not create or regenerate a balance baseline.

## 7. Surface, documentation and integration gate

- [x] 7.1 Add concise invariant comments to every new exported declaration and field, include the engagement module in ambient RNG/clock purity coverage, and update `docs/INDEX.md` for the live engagement capability; verify `pnpm lint`, `pnpm check:language`, `pnpm typecheck` and focused purity checks pass.
- [x] 7.2 Run `pnpm format` followed by `pnpm verify`, fix every failure without changing `docs/design/**`, `docs/adr/**`, `specs/**`, `test/golden/**` or `sim/baseline/**`, and record the green gate in the implementation pull request.
- [x] 7.3 Archive `agreements-weekly-expense` through `/opsx:archive agreements-weekly-expense`, verify `openspec validate --all` passes, and inspect that the archived `engagement-economy`, `week-loop`, `season-calendar` and `sim-harness` live specifications contain the accepted requirements before opening PR-2.
