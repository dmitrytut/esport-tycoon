# ADR 0017: the room is a diagonal cutaway over a prerendered background

**Status:** accepted
**Date:** 2026-09-26
**Amends:** `adr/0016` — decision 4, "3/4 from above, no isometry"

## Context

`adr/0016` kept the frontal 3/4 view and rejected isometry because isometry multiplies the
cost of hand-drawn art. Two facts moved since then:

1. The room is not hand-drawn. `design/art-pipeline.md` builds it in Blender and renders it;
   the camera angle is a setting, not a redraw.
2. The author chose a reference: a room seen diagonally from above, two walls cut away,
   the floor a diamond. A frontal view shows one wall and a strip of floor; the diagonal
   one shows two walls, a floor with depth and room for the history the room keeps
   (`design/ui.md`, "the room as memory").

What stays expensive is animation, and performers are Spine skeletons in either view.

## Decision

1. **The room is a diagonal cutaway**: fixed camera looking down at the corner, two back
   walls visible, dimetric floor. No free camera, no rotation; the only camera move is the
   push-in of `adr/0016` decision 5.
2. **The background is a prerender**, split into layers: floor and walls, a foreground
   layer for props that stand in front of people, and light masks drawn additively.
3. **Performers stay 3/4 Spine skeletons** facing the camera, turned left or right by
   mirroring. No back views.
4. **No tile grid.** Performers stand on hand-placed floor spots of the room and are drawn
   in order of their feet, behind the foreground layer.
5. **Portrait crops the diamond.** The room fills the screen width and the side corners
   may fall outside; nothing interactive lives in a corner. No panning in act one.

## Rejected options

- **Keep the frontal 3/4 view.** Cheaper by nothing once the room is rendered, and flatter.
- **A tile-based isometric engine.** Placement, pathing and a grid editor serve building
  games; people here stand at stations, not on tiles.
- **Free or rotating camera.** Every angle needs its own prerender and its own sprite facing.

## Consequences

- Hand-drawn performers must match the room's angle; `design/art-pipeline.md` poses the
  Blender mannequin under the same camera.
- A foreground layer and feet-order drawing replace the single backdrop of the shell.
- The frontal room of the week shell is a placeholder until the week screen is redesigned.
