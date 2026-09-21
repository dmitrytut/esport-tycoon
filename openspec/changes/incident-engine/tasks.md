## 1. Executable incident content

- [x] 1.1 Replace the aspirational event schema with the closed condition, outcome and effect unions, require explicit cooldown, and constrain trait event-weight categories and values; add validator coverage for ids, ranges, optional empty conditions, empty allow-lists, references and every rejected field, and verify the focused content-validator tests pass.
- [x] 1.2 Add the three executable incident files, remove `cat-on-keyboard.json` from active content, and verify `pnpm validate:content` accepts the catalog and each required resolution family is present.

## 2. Incident state and selection

- [x] 2.1 Add the commented public incident types and mandatory serialized incident lifecycle to `RunState`, migrate every state constructor and fixture in one cutover, and verify `pnpm typecheck` passes.
- [x] 2.2 Implement target eligibility against post-week performer state and `baseWeekKind`; verify focused tests cover unconditional incidents, strict thresholds, AND semantics, trait/region/kind filters and no-candidate behavior.
- [ ] 2.3 Implement the explicit cadence gate, event-first mean weighting and weighted target selection on the independent incident RNG stream; verify cadence 0/1, zero weights, roster-size neutrality, input-order invariance and pinned deterministic selection tests pass.
- [ ] 2.4 Add property coverage for deterministic selection and ineligible-content RNG stability with a pinned fast-check seed, and verify the focused property suite passes.

## 3. Choice resolution and cooldown

- [ ] 3.1 Implement direct and d20 stat-check resolution through one public pure transition; verify tests cover equality success, failure, the reported roll/total and no draw for a direct choice.
- [ ] 3.2 Aggregate performer and organization effects by destination and apply them through existing mutation helpers; verify focused tests cover one-time organization effects, target isolation, clamping, one-decimal rounding and explicit choice-caused threshold crossings without delayed stop reasons.
- [ ] 3.3 Install global cooldowns and clear pending atomically; verify tests cover zero and positive cooldown boundaries, another target during cooldown, invalid choices and exactly-once resolution without state or RNG movement on rejection.

## 4. Week-loop integration

- [ ] 4.1 Select at most one incident after activities and recovery, report its unmaskable reason, and preserve separate base and final week kinds; verify focused `executeWeek` tests cover quiet-to-ordinary classification and coexisting reasons.
- [ ] 4.2 Reject one-week and block advancement from unresolved state before plan validation or execution; verify tests compare the complete state and RNGs before and after the rejected calls.
- [ ] 4.3 Prove integrated replay and random-stream isolation over week execution with pinned property tests, and verify the focused week-loop suites pass.

## 5. Harness integration

- [ ] 5.1 Load validated incident and trait-weight content plus optional scenario cadence, keep `act-one.json` incident-free, and add `incidents-smoke.json`; verify loader tests reject unknown or duplicate ids and invalid cadence before a week advances, and every smoke seed produces a resolution within its horizon.
- [ ] 5.2 Make every policy submit the first stable choice id in ascending code-point order through core resolution while retaining the remainder of the current plan; verify walk tests match block advance before resolution and core's public resolution result afterward for a pending incident inside a block.
- [ ] 5.3 Add incident configuration, occurrence and resolution data to the shared report model and both renderers; verify JSON reproducibility, declared inputs, direct/check field presence and post-resolution state with focused report tests.
- [ ] 5.4 Run the actual harness against every seed of the incident smoke scenario in JSON and text modes, and verify the outputs show an occurrence, core resolution and continued advancement to the requested horizon without presenting the cadence as a balance default.

## 6. Integration gate and archive

- [ ] 6.1 Run `pnpm format` followed by `pnpm verify`, fix every failure without regenerating golden or baseline artifacts, and record the green gate in the implementation pull request.
- [ ] 6.2 Archive `incident-engine` through `/opsx:archive incident-engine`, verify `openspec validate --all` passes and the archived `incident-engine`, `week-loop` and `sim-harness` specifications contain the accepted behavior before opening PR-2.
