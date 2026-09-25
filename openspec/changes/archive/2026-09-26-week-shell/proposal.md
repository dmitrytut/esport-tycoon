## Why

Issue #38 has no playable browser surface: the real week and season contracts can only be inspected through tests and the headless harness. A mobile-first shell is needed to expose those contracts without moving any simulation rule into rendering, and to give #50 and #51 a place to attach later.

## What Changes

- Add a Vite application at `packages/shell` with a PixiJS 8 visual scene, a collapsible DOM planning sheet over the scene, a browser content/run adapter, and a phone-first responsive viewport. The scene gets room while decisions are being observed; the sheet expands for editing without becoming a separate screen.
- Let a user compose a four-to-six-week block from validated activities and participant identities; advance via the existing public `@et/core` contract, display the returned state and every stop reason, lock executed weeks, and continue only from the next absolute week. Pending core decisions block advancement rather than being resolved by a fabricated UI transition.
- Render the room in the decided fixed 3/4 top-down view (ADR 0016) with one static placeholder figure per roster member, under the same collapsible DOM sheet. Check scene legibility and planning usability in both sheet positions. The placeholders are not art, not animation and not a texture-resolution or memory-budget contract for #37.
- Choose a library-based localization mechanism for a later change while keeping #38 English-only. The Spine skeleton probe and the physical-device performance profile move to #84.
- Include the shell build in the repository gate. No changes to core mechanics, the public core API, content mechanic schemas, golden/baseline files, or live week-loop and activity-catalog requirements.

## Capabilities

### New Capabilities

- `game-shell`: browser presentation, user-command gating, authority and resumption boundaries, accessibility and layout probes for the first interactive week screen. This capability owns what the user can see/do, not week simulation rules.

### Modified Capabilities

- None. `week-loop` and `activity-catalog` already define simulation and content semantics; this change consumes them without copying or amending their requirements.

The alternative `skip_specs: true` applies only when no behavior changes: this screen accepts commands, forbids editing executed weeks, shows reasons and resumes at a specific position, so skipping a delta would make those user-visible guarantees unreviewable. Modifying `week-loop` would incorrectly assign browser behavior to core. A separate `game-shell` capability keeps the boundary stable for #50 and #51.

## Impact

PR-1 changes only `openspec/changes/week-shell/**`. PR-2 adds the shell package, its tests and build integration and archives this new capability. The shell loads existing validated content, constructs one deterministic run and owns the transient plan; `advanceSeason` remains the authority over elapsed time and numeric results. The shell cannot complete a pending incident, renew an engagement or settle a contest by pretending that Continue did it. Those actions require their own public core operations and future surfaces; a `contest-ahead` or `incident-pending` screen remains visibly blocked until the corresponding interaction exists. The shipped `standard` season also contains unsupported `series` entries (see the active `season-contest` change), so #38 alone is not a promise that the whole season can complete.

ADR 0016 settles the camera, the art technique and the scaling: hand-drawn 2D on Spine skeletons, a fixed 3/4 top-down view, smooth rather than whole-number scaling. This amendment therefore replaces the front/isometric comparison of geometric figures with one 3/4 room of static placeholder figures. By the author's decision #38 does not wait for animation: it ships no Spine runtime and needs no Spine licence, and the Spine skeleton probe, its atlas variants and the physical-device profile that feed #37 move to #84, which waits for the licence and the devices. The placeholders are five hand-drawn vector heroes kept under `packages/shell/placeholders/`; they are not art, never ship in a release build and are replaced by production art under ADR 0015. The five-tab bar in `design/ui.md` waits for the screens behind it and is not part of #38.

The default demo seed originally specified for #38 (`week-shell-38`) materializes a contest at week 0 and blocks the only supported action before any ordinary week executes. This amendment selects a reproducible seed that starts with ordinary weeks and declares the demo's opening organization and season-goal inputs explicitly. It does not add a contest resolution or redefine a career start; the unsupported marked entry still blocks when reached. The real-device profile is no longer part of #38; it moved to #84.

## Player Experience (MDA / SDT)

The player sees a live room while planning for several weeks, chooses activities and people, and gets back the actual consequences and precise interruption from core rather than a scripted animation. Planning supports autonomy; returned energy, morale, balance, spent slots and reasons support competence by making the cost of that choice legible; named roster members make the decision about people rather than faceless slots, supporting relatedness. Blocked contest/incident/engagement decisions constrain autonomy until their dedicated interactions arrive; the shell will say why, not offer a misleading Continue. Failure signal: after stopping early, tapping Continue either replays an executed week's cost or silently passes a pending decision, or the panel shows a number different from the returned core state.

The sheet stays collapsed while inspecting the room and returned outcomes, then expands for multiweek editing while leaving a visible scene preview. The single Continue control and returned stop reason remain reachable in either position; closing the sheet never discards a draft or changes core state. If the scene becomes illegible when the sheet is open or the sheet makes a future-week edit hard to complete with touch, the phone-first experience has failed even if its frame rate is high.

## Affects

- `packages/shell/**`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `eslint.config.mjs`
- `openspec/changes/week-shell/**`
- `openspec/specs/game-shell/spec.md` (only through `openspec archive` on PR-2)

No changes to `pnpm-workspace.yaml` (`packages/*` already covers the shell); no `docs/INDEX.md` update (owned by #45); no paths in `packages/core/**`, `content/**`, `tools/validate-content/**`, `openspec/specs/season-contest/**`, or `openspec/specs/season-calendar/**`. `package.json`, lockfile, `tsconfig.json` and lint config are root build-only integration, not changes to existing capabilities. The only shared prerequisite is the public `@et/core` surface: #38 will adapt to #45 after its archive/rebase if #45 changes that surface, never widen #38 to edit it.