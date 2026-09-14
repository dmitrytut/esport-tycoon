# ADR 0000: engine undecided

**Status:** closed, superseded by `adr/0008`
**Closed:** 2026-09-11

Decision made in `adr/0008`: TypeScript core, scene on PixiJS, panels on DOM, mobile
packaging via Capacitor. Below is the original context and selection criteria; they
remain useful as an explanation of why the decision came out this way.

## Context

The project is at the documents stage. The engine choice affects the structure of
`src/`, tooling, and conventions, but does not affect design, content, or specs.
Therefore the decision is deliberately deferred: specs and content can be written
without knowing the engine.

## Selection criteria

| Criterion | Why it matters here |
|---|---|
| Headless simulation run | `specs/0002-sim-harness.md` requires running tens of thousands of seasons without graphics. If this is inconvenient, the core will have to be separated from the engine entirely |
| Determinism | full control over the random number generator is required, see `adr/0002` |
| Mobile export | priority platform |
| Text-UI-heavy interface | the game is lists, tables, and cards, not physics and 3D |
| Fitness for agent-driven development | text scene formats, readable diffs, tests from the console |
| Pixel art | integer scaling without blur |
| Built-in localization | the game ships in English, a second language is planned (`adr/0007`). The translation mechanism is taken from the engine, not hand-rolled |

## Options

- **Godot 4 + GDScript.** Mobile export out of the box, pixel art works well, scenes are
  text-based. Headless is available. Downside: logic and presentation easily merge
  together, keeping the core separate will require discipline.
- **TypeScript core + web renderer.** The core is trivially testable and runs headless,
  ideal for agents and for the second domain (`adr/0004`). Downside: mobile packaging
  and list performance are separate work.
- **Hybrid: TypeScript core + Godot as a shell.** Best for architecture, worst in the
  amount of work for the bridge.

## Decision

Made in `adr/0008`.
