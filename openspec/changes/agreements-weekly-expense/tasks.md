## 1. Content rate-scale contract

- [ ] 1.1 Tighten the region and discipline schemas so their existing `salaryScale` fields are required finite positive numbers, update content documentation without changing the current scale values, and add validator cases for missing, zero and negative scales; verify the focused validator tests and `pnpm validate:content` pass.
- [ ] 1.2 Extend the typed content loader to resolve the selected discipline and map domain `salaryScale` fields to required neutral origin and discipline rate scales with no fallback; verify focused loader tests reject unknown disciplines and expose both scales.

## 2. Engagement model and quotation

- [ ] 2.1 Write failing core tests for unique ids, positive one-tenth rates, inclusive/exclusive intervals, duplicate and overlap rejection, unknown performer or collective references, exact current-member coverage and rejection paths that preserve state and RNG continuations.
- [ ] 2.2 Add the fully commented domain-neutral `Engagement`, rate-input, lifecycle-input and forecast types beside their invariants in a focused core module, export the public surface, and migrate `RunState` fixtures to explicit engagements and `consecutiveNegativeWeeks`; verify `pnpm typecheck` passes without assertions or anonymous module-surface shapes.
- [ ] 2.3 Write failing quotation tests for the six-stat arithmetic mean, both required scales, one-tenth rounding, independence from age, hidden fields and floating state, stable performer-generation RNG continuation and materialized rates that do not follow later stat or content changes.
- [ ] 2.4 Implement pure rate quotation after performer generation without changing generator draw order, then add pinned property coverage for determinism, positive finite outputs and invariance under temporary-state changes; verify the focused unit, property and existing performer golden tests pass without regenerating golden data.

## 3. Lifecycle and forecast operations

- [ ] 3.1 Write failing lifecycle tests for boundary-only renewal, explicit replacement rates and dates, early-renewal rejection, atomic termination, no fee, invalid remaining plans after departure, incident-first resolution and state/RNG preservation on every rejection.
- [ ] 3.2 Implement renewal and termination as pure run-state operations, keeping `Performer` and `PerformerSnapshot` unchanged; verify focused lifecycle and performer serialization tests pass.
- [ ] 3.3 Write failing forecast tests for four- and six-week horizons, exact ordered ids and integer-tenth totals, zero-income projected balances, first negative week, expiry visibility, unavailable post-expiry suffixes and no mutation or RNG movement.
- [ ] 3.4 Implement the forecast by reusing the same validated active-engagement selection and integer-tenth aggregation as settlement rather than copying arithmetic; verify focused unit and property tests prove every determinate forecast week matches actual unchanged settlement.

## 4. Weekly settlement and expiration

- [ ] 4.1 Write failing week-loop tests for the full order — activities and income, recovery, one aggregated engagement debit, final-balance streak and reasons, then incident selection — including same-week rescue, exact-zero reset, continued negative weeks without repeated crossing, zero-member expense evidence and incident money affecting only the next opening balance.
- [ ] 4.2 Implement the single recurring settlement in one-week execution, add ordered `engagementExpense` evidence and run-owned `consecutiveNegativeWeeks`, and migrate every direct caller and fixture in one cutover; verify focused week tests and `pnpm typecheck` pass.
- [ ] 4.3 Write failing block-advance tests for one unmaskable `engagement-expired` reason per ending term, the last paid week advancing exactly once, uncovered following-week rejection, coincident block/season/incident reasons and no duplicate debit or recovery after continuation.
- [ ] 4.4 Add expiration to the closed stop-reason union and sensitivity guard, validate unresolved expired members before plan execution, and preserve all coincident reasons; verify focused block tests and property coverage for reordered engagement arrays, JSON-compatible state copies and deterministic results pass.

## 5. Season boundary integration

- [ ] 5.1 Write failing season tests for carrying engagements and the negative-week count unchanged, rejecting the next season while an engagement is expired, resolving coincident final-week incident before engagement lifecycle operations, and preserving season and non-season RNG states on every hold.
- [ ] 5.2 Update the explicit next-season boundary to validate engagement resolution without charging, re-quoting or resetting run-owned state; verify focused season unit and property tests pass.

## 6. Sim-harness integration

- [ ] 6.1 Extend scenario validation with a required discipline id and explicit initial engagement duration covering the effective horizon after any command-line override; update shipped scenarios with declared inputs without claiming balance viability or opting act one into incidents, and verify focused scenario tests reject unknown disciplines, missing scales, invalid durations and effective horizons longer than their terms.
- [ ] 6.2 Build initial engagements through core quotation after the existing deterministic performer generation, with stable ids and week-zero terms identical across policies; verify focused opening-state and reproducibility tests prove no runner-side formula or extra RNG draw.
- [ ] 6.3 Add weekly and total recurring expense plus the consecutive-negative-week series to the shared machine-readable report and text renderer from core evidence only; verify focused report tests, byte-identical JSON game metrics and direct-core comparison pass without bankruptcy, prize or contest metrics.
- [ ] 6.4 Run both text and JSON harness smoke commands and inspect that opening provenance names region, discipline and term while every week reports the core-produced expense and streak; do not create or regenerate a balance baseline.

## 7. Surface, documentation and integration gate

- [ ] 7.1 Add concise invariant comments to every new exported declaration and field, include the engagement module in ambient RNG/clock purity coverage, and update `docs/INDEX.md` for the live engagement capability; verify `pnpm lint`, `pnpm check:language`, `pnpm typecheck` and focused purity checks pass.
- [ ] 7.2 Run `pnpm format` followed by `pnpm verify`, fix every failure without changing `docs/design/**`, `docs/adr/**`, `specs/**`, `test/golden/**` or `sim/baseline/**`, and record the green gate in the implementation pull request.
- [ ] 7.3 Archive `agreements-weekly-expense` through `/opsx:archive agreements-weekly-expense`, verify `openspec validate --all` passes, and inspect that the archived `engagement-economy`, `week-loop`, `season-calendar` and `sim-harness` live specifications contain the accepted requirements before opening PR-2.
