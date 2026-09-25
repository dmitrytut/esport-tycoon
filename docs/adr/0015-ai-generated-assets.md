# ADR 0015: AI-generated assets — raw material, recorded provenance, no likeness

**Status:** accepted
**Date:** 2026-09-25
**Related:** `adr/0005` (no real people), `design/art-pipeline.md`

## Context

There is no artist. Art is produced by generation guided by Blender geometry and a style
model, then split into parts and rigged (`design/art-pipeline.md`). Four facts make this a
decision rather than a tool choice:

1. **Protection.** The US Copyright Office (Part 2 report, January 2025) holds that output
   produced from prompts alone is not protected by copyright; only the human contribution
   is. An asset shipped as generated can be reused by anyone.
2. **Disclosure.** Steam requires developers to disclose pre-generated AI content that ships
   to players. PC follows mobile, so the record has to exist long before that release.
3. **Licences.** Models differ in whether their outputs may be used commercially. A licence
   discovered after a hundred assets means redrawing a hundred assets.
4. **Likeness.** A model trained on the internet readily reproduces a recognizable pro
   player, team kit, game map or interface. Under `adr/0005` that is a defect regardless of
   which tool produced it.

## Decision

1. **A generated image is raw material, never a shipped asset.** Every asset in a build
   carries meaningful human work: composition, repainting, splitting into parts, rigging.
2. **Provenance is recorded from the first asset**: which model, under which licence, when,
   and what was done by hand. The record is what a store disclosure and a lawyer read.
3. **A model is used only after its licence is confirmed** to permit commercial use of its
   outputs.
4. **Resemblance to a real person, team, game, map or interface is a defect** and is fixed
   before merge, exactly as `adr/0005` treats written content.
5. **The same rules cover sound**: generated music, voices and effects.

## Rejected options

- **Commissioning all art.** No budget for a full set; a single commissioned style kit stays
  possible and falls under the same record.
- **Asset packs as the base.** A patchwork of styles, and no pack contains an esports
  basement.
- **Shipping raw generations.** Unprotectable, inconsistent between characters, and
  impossible to disclose honestly without a record.

## Consequences

- Only the human share of each asset is protectable; a clone may lift the raw layer.
- The image-rights review in `open-questions.md` also covers generated assets and model
  licences.
- Mobile store rules on generated content are checked before release; this ADR assumes
  nothing about them.
