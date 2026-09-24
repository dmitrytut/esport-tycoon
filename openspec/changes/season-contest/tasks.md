## 1. Encounter content contract

- [ ] 1.1 Write failing content-validator cases for a missing id/label/discipline/origin, an unknown discipline or origin reference, a level outside 1–5, a missing `win`/`loss`/`draw` amount, a negative or off-grid amount and an unknown field; run the focused validator test and confirm each case fails before the schema exists.
- [ ] 1.2 Add `content/schema/encounter.schema.json` as a closed contract for id, English label, discipline id, opponent origin id and level, and the three reward amounts; extend referential validation in `tools/validate-content` where JSON Schema cannot express cross-file identity, then run the focused validator test and confirm every rejection names the offending file and value.
- [ ] 1.3 Add at least one shipped encounter definition under `content/encounters/`, document the new kind in `content/README.md`, and verify `pnpm validate:content` passes while adding a second definition requires no code change.

## 2. Encounter state and public surface

- [ ] 2.1 Write compile-time/public-surface consumers for the encounter identity, the `pending`/`settled` tagged union, the frozen opponent, the stored `ContestResult`, the reward amounts and the two stream continuations; add the commented domain-neutral declarations in `packages/core/src/encounter.ts` beside their invariants, export them from `index.ts`, and verify `pnpm typecheck` succeeds.
- [ ] 2.2 Write failing tests that `RunState` carries the `contest` and `encounter` continuations explicitly and that construction rejects a missing one rather than seeding a default; add the fields in `packages/core/src/week.ts`, and verify no week-loop rule reads or moves either continuation.
- [ ] 2.3 Write failing tests that season state carries its encounters keyed by marked entry identity, that `startNextSeason` resets them, and that both continuations carry forward unchanged across the boundary; extend season state in `packages/core/src/season.ts` without letting season code read an opponent, result, reward or metric.

## 3. Opponent materialization

- [ ] 3.1 Write failing tests for a rejected empty pool, a definition naming another discipline, an unknown origin or level, and a `series`-marked, unknown, unmarked or future entry; implement the complete preflight and verify each rejection leaves the run, the season and both continuations byte-for-byte unchanged.
- [ ] 3.2 Write failing determinism tests for id-sorted pool ordering, exactly one selection draw even for a single-definition pool, input array order not changing the selection, and the discipline's participant count being generated in a fixed order; implement materialization through `generatePerformer` on the `encounter` stream and verify the `contest` continuation did not move.
- [ ] 3.3 Write failing tests that reopening a `pending` encounter returns the identical opponent and moves no stream, that opponent identities are namespaced by the encounter identity and cannot equal a career identity, and that a colliding identity is rejected rather than resolved; implement identity derivation and the collision check.

## 4. Settlement and exactly-once consequences

- [ ] 4.1 Write failing tests for the fixed orientation mapping (`first-win → win`, `second-win → loss`, `draw → draw`) with the career Collective always in the `first` position; implement resolution through the public `resolveContest` and verify the stored `ContestResult` is the engine's, not a reconstruction.
- [ ] 4.2 Write failing tests that each participating career Performer's energy equals the Contest's `energyAfter` exactly (including the 73 → 53 and clamp-at-zero cases), that a second subtraction of `nominalEnergyCost` would disagree, that non-participants are untouched, and that morale, form, stats, age, traits and engagements do not move; implement installation by replacement.
- [ ] 4.3 Write failing tests that the declared `win`, `loss` and `draw` amounts are credited through exactly one organization change, that a declared zero moves nothing, that audience and reputation do not move and that no engagement is debited; implement reward application inside the settlement transition.
- [ ] 4.4 Write failing tests that settlement records exactly one `SeasonContestFact` for its entry and supplies no score, opponent, prize or standing to the season; implement fact recording through the existing season contract.
- [ ] 4.5 Write failing idempotency tests that a second settlement returns the stored encounter with identical outcome, energies, balance, facts and both continuations, and that a rejected settlement changes nothing; implement the atomic transition so no state exists in which a Contest is resolved but its consequences are unapplied.

## 5. Week and season boundaries

- [ ] 5.1 Write failing tests that settlement executes no activity, applies no recovery, debits no engagement, selects or resolves no incident, produces no week result or stop reason, and changes neither `week` nor `consecutiveNegativeWeeks`; implement the boundary and verify a reward that lifts the balance between weeks does not reset the negative series.
- [ ] 5.2 Write failing tests for the canonical ordering — settle the current marked entry, then advance its week — proving the marked week executes exactly once, applies recovery once, settles recurring engagements once and is classified `contest`, with no second application of energy or reward; verify against the existing `contest-ahead` return of control on the preceding week.
- [ ] 5.3 Write failing tests for a late settlement after the marked week already advanced, proving every consequence is still applied exactly once and the completed week's activities, recovery and recurring expense are not re-executed.
- [ ] 5.4 Write failing tests that settling the final marked entry before its week lets that week's `season-ended` complete the season with the last outcome counted once, and that settlement itself never advances a week, completes a season or starts the next one.

## 6. Headless end-to-end and properties

- [ ] 6.1 Add non-shipped fixtures under `packages/core/test/fixtures/`: a season template declaring 24 weeks, 6–8 `contest` and `series` `min: 0, max: 0`, and an encounter pool; validate the template against the production season schema and the pool against the production encounter schema without loading either as shipped content.
- [ ] 6.2 Write the failing end-to-end core test that walks a whole season headlessly — calendar entry, materialized opponent, real `resolveContest`, installed energy, credited reward, recorded fact, continued advancement, completed season with an evaluated goal — and verify it produces byte-identical results, opponents, rewards, facts and continuations for the same seed, with no I/O, clock or interface.
- [ ] 6.3 Add fast-check properties for JSON round-trip equality of encounter state and both continuations, settlement idempotency, rejection purity, stream isolation (opening moves only `encounter`, settling only `contest`) and pool-order invariance, using the repository's globally pinned configuration in `tests/setup/fast-check.ts` without a per-test seed.
- [ ] 6.4 Verify `pnpm lint` keeps `et/no-domain-words` green with only `Encounter`, `Contest`, `Collective`, `Performer` and `Season` vocabulary in core, and review every new public declaration against ADR 0013 so `et/require-comment` reports no omission.

## 7. Integration gate and archive

- [ ] 7.1 Run the focused core, season, content-validator and property suites, then `pnpm format`, `pnpm lint`, `pnpm check:language`, `pnpm typecheck` and full `pnpm verify`; fix every failure without touching `test/golden/**` or `sim/baseline/**`.
- [ ] 7.2 Update `docs/INDEX.md` so contest and season work points at the live `season-contest` capability beside `season-calendar` and `contest-engine`.
- [ ] 7.3 Archive with `/opsx:archive season-contest`, verify `openspec validate --all` passes, and inspect the archived `season-contest` and `season-calendar` live specs before opening PR-2; do not hand-edit `openspec/specs/**`.

Not part of PR-2: any `series` settlement path, any `sim-harness` scenario, report or policy
change, any reward magnitude tuning, any edit to `content/seasons/standard.json`, and any golden
or balance baseline. The series-format dependency and the harness extension needed by #52 are
named in `design.md` and must each become their own change.
