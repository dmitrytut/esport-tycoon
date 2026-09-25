# ADR 0016: the scene is hand-drawn 2D with Spine skeletal animation

**Status:** accepted
**Date:** 2026-09-25
**Amends:** `adr/0008` — the scene row's "sprite atlases, integer scaling"

## Context

The scene decisions were meant to wait for a device measurement of the shell. By this
date the author decided the parts that are about intent, not numbers
(`design/ui.md`, `design/art-pipeline.md`):

1. There is no artist, and weak pixel art reads worse than honest 2D. Pixel art is dropped.
2. The scene must show state by pose and face, which rules out a straight top-down view.
3. The art volume risk in `design/ui.md` only stays bounded if one kit becomes many people.

Integer scaling in `adr/0008` exists for pixel art alone.

## Decision

1. **Hand-drawn 2D with skeletal animation.** Not pixel art.
2. **Spine as the animation runtime**, through its official PixiJS 8 runtime. The Essential
   licence covers cutout rigging without meshes.
3. **One skeleton for every performer**, differences are skins. Two tracks play at once:
   the body shows the activity, the head shows the mood. Contest-moment clips use one small
   separate skeleton for in-game avatars.
4. **View: 3/4 from above**, fixed camera, no isometry, no free camera. Portrait first.
5. **Contest screen**: an online contest stays in the room with a camera push-in; a LAN
   contest is a separate arena scene.
6. **Scaling is smooth, not integer.** That clause of `adr/0008` no longer holds; Pixi, DOM
   panels and Capacitor stand.

**Deferred to the device measurement:** texture resolution and scale, the texture memory
budget, and the act-3 on-screen maximum. The measurement has to run Spine skeletons in the
3/4 view: geometric stand-ins in other views no longer describe the game.

## Rejected options

- **Pixel art.** No artist; a detailed pixel style is the most skill-bound of the options.
- **3D prerendered into sprite sheets.** Every character owns its frames, skins are lost,
  and thousands of frames do not fit a phone's texture memory.
- **3D at runtime.** Leaves the 2D stack of `adr/0008` for a game with no 3D mechanics.
- **Frame-by-frame 2D.** Cost grows per character per clip instead of per clip.

## Consequences

- A Spine licence is bought before integration: shipping the runtime to players requires
  one, and Essential or Professional apply only below $500,000 of yearly revenue.
- The shell's scene probe changes from front/isometric stand-ins to Spine in 3/4.
- Animation is the main manual cost; generation does not produce motion.
