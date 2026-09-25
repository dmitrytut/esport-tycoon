# ADR 0008: stack — TypeScript core, Pixi scene, web shell in a native wrapper

**Status:** accepted
**Date:** 2026-09-11
**Supersedes:** `adr/0000` (engine not chosen)
**Amended:** `adr/0016` — the scene is hand-drawn 2D with Spine skeletons and smooth scaling;
"sprite atlases, integer scaling" in the scene row no longer holds. Everything else stands.

## Context

`adr/0000` listed criteria and three options but did not make a decision. By the time of
this decision, two new input facts had appeared:

1. Release platform is **phones only, iOS and Android**. Older devices are out of scope.
   PC is later and optional.
2. The interface is **a live scene with panels on top** (`design/ui.md`), not a manager
   sheet. This raises rendering requirements: ~90% DOM turned into ~60% DOM plus a scene.

## Decision

| Layer | Choice |
|---|---|
| Simulation core | TypeScript, pure logic with no I/O, zero runtime dependencies |
| Scene | PixiJS 8 (WebGL), sprite atlases, integer scaling |
| Panels and tables | DOM + CSS |
| Build | Vite |
| Mobile packaging | Capacitor (iOS, Android) |
| Simulation run | Node, headless process without graphics |
| Tests | Vitest: unit, golden, sim |

## Why

- **Headless run.** `specs/0002` requires 10,000 seasons. A TypeScript core runs as a
  plain Node process in minutes. In the GDScript interpreter that's tens of minutes, and
  the harness would stop running it.
- **Guardrails are enforced by machine.** `adr/0001` (no domain words in the core) and
  `adr/0002` (random only through the RNG) are checked by the linter and the type system,
  not by taste. For solo development with agents this is the deciding argument: a rule
  that can't be run as a command isn't followed.
- **Precedent for exactly this genre.** Game Dev Tycoon on PC is HTML, CSS, and
  JavaScript with no game engine, together with an animated scene and popup icons. A
  scene on the web stack is not a hypothesis.
- **Measured, not assumed.** A scene spike (12–48 animated Pixi sprites + a DOM table on
  top, WebGL, dpr 3) gives ≥ 55 fps on the target iOS and Android devices. This removed
  the only real risk of this option.

## Rejected options

- **Godot 4 + C#.** Godot 4's C# export to iOS is still marked experimental (official
  documentation and an article on the state of C#). Unacceptable for the single release
  platform.
- **Godot 4 + GDScript.** Best mobile export, but the headless run is slow, and there's
  almost no static typing for machine-enforced guardrails.
- **Unity.** Lowest on-device risk, but a heavy editor, noisy scene diffs, and worse
  ergonomics for agent-driven development. Overkill for a game with no physics and no 3D.
- **Flutter.** The advantage of native lists lost its value once the scene decision was
  made, and the sprite side is weaker than Pixi.
- **Hybrid TS core + Godot shell.** A bridge between environments is a third project to
  maintain.

## Consequences

- The core knows nothing about Pixi, DOM, or Capacitor: swapping the shell doesn't
  rewrite the game.
- Determinism requires discipline around numbers: `Math.random`, system time, and
  platform-dependent functions (`Math.sin`, `Math.pow`, `Math.exp`, `Math.log`) are
  forbidden in the core. Checked by the linter.
- Localization is not a built-in engine feature but a library. It's chosen together with
  the first UI screen; until then text lives inline in `content/` (`adr/0007`).
- The content validator and tools are written in TypeScript, not Python: one toolchain.
- Checkpoint remains: the act-3 scene (15+ characters) is re-measured on-device before
  art is invested in it.
- Tool versions are kept on the latest majors, with one exception: **TypeScript is
  pinned to the range `~6.0.x`**, even though 7.0 has been released. The reason is that
  `typescript-eslint@8.70` declares `peerDependencies: typescript >=4.8.4 <6.1.0`, meaning
  on TS 7 (and already on 6.1) exactly the linter that enforces `adr/0001` and `adr/0002`
  turns itself off. The gate matters more than the compiler version, so the range is a
  tilde, not a caret: `^6` would silently drift past the supported bound. We move to 7
  once `typescript-eslint` ships support for TS 7.
- Runtime is Node 24 LTS (`engines`, CI, `@types/node` on the same line). A mismatch
  between the type version and the runtime version produces a false-green `typecheck`.
