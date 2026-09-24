## 1. Discipline content and schema contract

- [x] 1.1 Write failing content-validator cases for missing six-stat weights, invalid head-to-head bounds, missing/duplicate/non-final scoring slots, unreachable slots, duplicate or unknown Moment ids/slots/metrics, non-positive weights, invalid momentum shifts, executable/unknown fields and legacy series formats; run the focused validator test and confirm those cases fail before changing the schema.
- [x] 1.2 Replace the discipline Contest schema with the closed six-weight, head-to-head, side-chance, momentum, slot, metric and Moment-type contract; extend referential validation where JSON Schema cannot express cross-field identity and slot/metric references, then run the focused validator test and confirm every rejection names the offending file/value.
- [x] 1.3 Migrate `tactical-shooter.json` to the accepted `3/1/2/3/0/0` weights, target 13, maximum 24 units, setup/resolution slots, energy cost 20, 40–60 side bounds, 75-percent retention, four stable metrics and the six accepted weighted Moment types; remove `format`, `unit`, `tally` and `participants`, move `columns` labels onto metric declarations, preserve `momentumMeans`, update `content/README.md`, and verify `pnpm validate:content` succeeds without a series field or tactical rule in code.

## 2. Core input, output and rejection boundary

- [x] 2.1 Write compile-time/public-surface tests or focused type consumers for the branded Contest id, closed rules, Collective/participant input, Moment, tally/outcome, participant consequence and RNG continuation shapes; add the commented domain-neutral declarations beside their invariants in `contest.ts`, export them from `index.ts`, and verify `pnpm typecheck` succeeds.
- [x] 2.2 Write failing purity tests for duplicate/overlapping ids, roster mismatch, off-grid/out-of-range participant state, missing/invalid weights, malformed rule bounds/references, invalid RNG state and unsupported series/Bo3/Bo5/points-table kinds; implement complete preflight validation and verify each rejection leaves the deep input and supplied continuation unchanged and consumes no draw.
- [x] 2.3 Add JSON round-trip tests for complete input, every Moment field, participant results and the seed/state continuation; implement only JSON-compatible public values and verify the focused serialization tests reproduce the same result and next continuation.

## 3. Weighted strength and side chance

- [x] 3.1 Write failing table tests for deci conversion, one-decimal rejection, fatigue at energy 100/80/0, positive/zero discipline weights, form/clamp boundaries and half-up performer/Collective means; implement the exact integer weighted-strength calculation and verify reported strengths stay in 10–200.
- [x] 3.2 Write failing observable tests for equal 5,000-basis-point chance, ten-deci 5,300 chance, both 4,000/6,000 caps and a single raw side draw; implement the bounded linear threshold with integer arithmetic and verify no logistic, exponential, logarithmic, system RNG or clock call enters core.

## 4. Moment generation and RNG continuation

- [x] 4.1 Write failing deterministic tests for slot order, Moment-type id canonicalization, positive content weights and exactly one type `weightedIndex` call even for a singleton; implement per-slot type selection and verify array insertion order cannot change the selected type or continuation.
- [x] 4.2 Write failing tests that side selection precedes participant selection, participants are id-sorted and weighted by strength, and every selected Performer belongs to the selected Collective; implement attribution and metric-delta recording, then verify participant totals reconcile exactly with their selected Moments.
- [x] 4.3 Pin a known seed/state continuation and write a failing test for exactly three raw draws per Moment and six per tactical unit, including singleton candidates and early termination; implement the canonical type → side → participant order and verify the returned continuation is immediately after the final participant draw.

## 5. Momentum, scoring and outcome

- [x] 5.1 Write failing tests for signed -100…100 momentum, 75-percent truncation towards zero for positive and negative values, content-declared shifts, clamping and use of pre-Moment momentum in the next side threshold; implement momentum transition and record before/retained/shift/after evidence on every Moment.
- [x] 5.2 Write failing tactical-unit tests proving setup changes momentum but not tally, resolution adds exactly one point, tally never changes momentum, and a tally leader can have negative momentum; implement ordered slot execution while keeping the two state machines independent.
- [x] 5.3 Write failing outcome tests for first/second reaching 13, early stop with no later draws, all 13–24 unit bounds and a 12–12 draw after unit 24; implement termination and the tagged first-win/second-win/draw result without overtime, series or multi-Collective fallback.

## 6. Participant consequences

- [x] 6.1 Write failing tests for tactical energy 73→53, 20→0 and 8→0, unchanged input energy, unchanged morale/form/stats and one participant result per roster member; implement post-resolution nominal cost, actual delta and authoritative energy-after evidence without mutating a Collective or `RunState`.
- [x] 6.2 Add a consumer-level test that installs `energyAfter` once and proves a second subtraction would disagree with the declared result; document the ownership on the exported consequence fields and verify no recovery, reward, week or season operation is called by resolution.

## 7. Content-only portability and properties

- [ ] 7.1 Add a non-shipped second-discipline JSON fixture under `packages/core/test/fixtures/` with different six-stat weights, slots, Moment types, metrics and valid numbers, including a unit cap that can end in a non-draw below target; validate it with the production schema and referential checks without loading it as shipped content, then resolve it through the public engine and prove no discipline-id or tactical-shooter branch is added.
- [ ] 7.2 Add fast-check properties for identical replay, success/failure input purity, momentum/tally/unit/energy bounds, scoring-slot conservation, participant membership, metric reconciliation, participant/type reorder invariance and JSON continuation; run the focused property suite under the repository's globally pinned fast-check configuration from `tests/setup/fast-check.ts` without adding a per-test seed.
- [ ] 7.3 Add focused source/gate coverage for domain-neutral public vocabulary and verify `pnpm lint` keeps `et/no-domain-words` green with only Contest, Moment, Collective and Performer concepts in core.

## 8. Deterministic statistical harness

- [ ] 8.1 Write failing scenario/loader tests for a contest-only `contest-strength.json` using the exact 0…4095 seed population, two orientations and declared mechanical-edge/maximum-gap profiles; implement the isolated scenario path without changing existing week scenarios or advancing week/season/career state.
- [ ] 8.2 Write failing report tests for scenario/rules/profile/seed metadata, orientation-specific win/draw counts, integer basis-point rates and byte-identical repeated metrics; implement JSON and text reporting from public Contest results without reproducing strength, probability, energy or outcome arithmetic.
- [ ] 8.3 Run the actual harness for both orientations and verify the pre-implementation thresholds with every rate divided by all 4,096 Contests, including draws: Mechanical 14 versus 10 wins at least 55 percent, leads the weaker profile by at least 10 percentage points and the weaker profile wins at least 20 percent; the maximum-gap weak profile wins at least 5 percent; orientation rates differ by at most three points. Fix contract-compliant implementation defects rather than selecting seeds, regenerating a golden or writing a balance baseline.

## 9. Legacy migration and documentation

- [ ] 9.1 After focused core/content/harness behavior is green, delete `specs/0004-match-engine.md` and repoint the one live reference at `docs/INDEX.md:16` to the live `contest-engine` capability; keep historical references under `openspec/changes/archive/**` unchanged, and verify the migrated behavior covers separate momentum/tally, structured Moments and data-driven disciplines while series and intervention windows remain explicitly deferred.
- [ ] 9.2 Review all public declarations, numeric fields, formulas and utilities against ADR 0013; add short invariant/ownership comments where required and verify `et/require-comment` reports no omission.

## 10. Integration gate and archive

- [ ] 10.1 Run focused unit, property, validator and sim-harness smoke commands, then `pnpm format`, `pnpm lint`, `pnpm check:language`, `pnpm typecheck` and full `pnpm verify`; fix every failure without changing `test/golden/**` or `sim/baseline/**`.
- [ ] 10.2 Archive with `/opsx:archive contest-engine`, verify `openspec validate --all` passes, and inspect the archived `contest-engine` and `sim-harness` live specs before opening PR-2; do not hand-edit `openspec/specs/**`.

Golden snapshot regeneration is not part of PR-2. If later evidence justifies one, it must be a
separate pull request containing exactly one `golden:` commit, as required by ADR 0009 and
`tests/README.md`.
