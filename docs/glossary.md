# Glossary

The project name is **ESport Tycoon**, `esport-tycoon` in paths and identifiers.
In the game's text the name is not translated or changed.

One concept — one word. If a synonym shows up in code or a document, that's a bug.

The interface and content language is English (`adr/0007`). So every domain concept has
two names: one for docs and conversation, and the one the player actually sees. The
player-facing forms are mandatory in the UI and content: a synonym in the UI is as much a
bug as a synonym in code.

## Game domain (used in design, UI, and the game code)

| Term | In UI (en) | Meaning | Not to confuse with |
|---|---|---|---|
| **Player** | `player` | a person in the lineup, a character | "user" — the person who plays our game |
| **User** | — (not shown) | the person holding the phone | "player" |
| **Lineup** | `lineup` | the five (or four) who take the stage for a contest | "roster" — that's everyone under contract, including substitutes |
| **Roster** | `roster` | all players of a division under contract | "lineup" |
| **Division** | `division` | one discipline within the organization, its own roster and coach | "team" |
| **Discipline** | `discipline` | a type of esport (shooter, MOBA, battle royale) | "game" |
| **Slot** | `slot` | a unit of attention within the week | "activity" |
| **Activity** | `activity` | what a slot is spent on: practice, stream, bootcamp | "event" |
| **Event** | `event` | a story that happened, with a choice | "activity" |
| **Momentum** | `momentum` | the bar showing "who's riding the wave" during a contest | "score" |
| **Score** | `score` | a discrete result: rounds, maps, placements | "momentum" |
| **Call** | `call` | a 3–5 second decision window inside a contest | "pause" |
| **Act** | `act` | a stage of the user's growth: basement / office / organization | "era" (deferred) |
| **Meta** | `meta` | the current stat weights within a discipline | "patch" |
| **Patch** | `patch` | the event that shifts the meta | "meta" |

## Core (`packages/core/src/`) — domain-neutral names

The core knows nothing about esports. Correspondences:

| In core | In domain |
|---|---|
| `Performer` | Player |
| `Collective` | Lineup / roster |
| `Discipline` | Discipline (genre, format) |
| `Contest` | Match (performance, release) |
| `Momentum` | Momentum |
| `Tally` | Score |
| `Slot` | Week slot |
| `Activity` | Activity |
| `Incident` | Event |
| `Org` | Organization |

Reason — `adr/0001`. The second subject domain — `adr/0004`.
