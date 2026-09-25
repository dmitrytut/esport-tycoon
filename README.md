# ESport Tycoon

Esports organization manager: hand-drawn 2D, mobile-first, comedic take on honest mechanics.
Stage — design documents and specs.

The game ships **in English**: interface and dialogue. Multi-language support is planned,
but the mechanism is chosen alongside the engine — `docs/adr/0007`. The repository is
written in English as well; the only Russian left is `docs/design/`, where the intent is
formulated — `docs/adr/0011`.

## Where to look

| I want to | File |
|---|---|
| Understand what the game is | `docs/vision.md` |
| Find the right document | `docs/INDEX.md` |
| Learn why it's done this way | `docs/adr/` |
| Understand what we're building now | `specs/` |
| See how a task travels from issue to merge | `docs/process/feature-dev-process.md` |
| Terminology | `docs/glossary.md` |

## Working with agents

The project is built for development through Claude Code. Rules are in `CLAUDE.md`,
frequent operations are in `.claude/commands/`.
