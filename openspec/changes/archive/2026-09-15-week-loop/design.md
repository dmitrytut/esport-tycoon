## Context

`packages/core` today holds four modules: `rng.ts`, `performer.ts`, `generate.ts`,
`observe.ts`. Two of their properties shape everything below. First, core reads no files —
`generate.ts` takes an `OriginProfile` already built from `content/regions/*` by the caller
(`adr/0001`, `adr/0003`). Second, `PerformerState` already carries `energy`, `morale` and
`form`, and `applyStateChange` is the only way to move them: there is no natural
regeneration outside an explicit call (`specs/0001`, item 4).

Motivation — see `proposal.md`. Requirements — see `specs/week-loop/spec.md` and
`specs/activity-catalog/spec.md`.

## Goals / Non-Goals

**Goals:**

- A week that advances as a pure function of its inputs, with a stop list a reviewer can
  read in one screen.
- Vocabulary that survives `et/no-domain-words` without contortion.
- Activity balance numbers reachable by the balance track without touching code.

**Non-Goals:**

- Owning the season calendar. The calendar arrives as an input; who generates it — and the
  contest it marks — is `specs/0004`.
- Loading content. Core keeps taking ready-made values; reading `content/activities/*` is
  the domain layer's job, exactly as with regions.
- Persistence of a run. Serialization of the week state is left until a save format exists
  beyond `PerformerSnapshot`.

## Decisions

### Naming: `series` for a tournament week

`WeekKind` is `quiet | ordinary | contest | series`. `tournament`, `match`, `team` and
`player` are rejected by the linter (`eslint.config.mjs`, `FORBIDDEN_CORE_WORDS`), and the
glossary offers a neutral name for every concept here except a tournament. `week.md` §6.3
describes that week as "a series of contests", so `series` is the neutral word with the
right meaning. Alternative considered: `major` — shorter, but it is jargon from the domain
we are trying not to name, and it says nothing about what the week contains.

The rest maps straight onto the glossary: `Slot`, `Activity`, `Collective`, `Org`,
`Incident`.

### Modules

| File | Holds |
|---|---|
| `activity.ts` | `Activity`, the closed `ActivityEffect` union, the target scope |
| `collective.ts` | `Collective`, derived morale, participant selection |
| `org.ts` | `Org`: money balance, reputation, the weekly slot pool |
| `week.ts` | `WeekPlan`, `StopReason`, `Sensitivity`, `WeekResult`, `advance` |

Four small modules rather than one `week.ts`: `advance` is the only place that needs all
four subjects, and everything else stays readable on its own (`adr/0010`, the type lives
next to the code holding its invariant).

### Crossing detection without extra state

A threshold reason compares the value at the start of the week against the value at its
end. Nothing is stored: a week that begins below the threshold cannot cross it, which is
precisely the wanted behaviour, and a value that rose back above becomes able to cross
again for free. Alternative considered: a `belowSince` marker per performer per threshold —
more state to serialize, and it can disagree with the value it describes.

Consequence worth stating: a run that *starts* below a threshold produces no reason until
the value recovers and falls again. That is correct for a resumed save (the user has
already seen that crisis) and it is what makes the reason mean "this just happened".

### Morale aggregation: `round(0.6 · mean + 0.4 · min)`

Stored on people, derived for the collective (`proposal.md`). The weights are the design
decision here: 0.4 on the worst member is enough that one furious star moves the collective
number by roughly eight points on a hundred-point scale, and not so much that the
collective reads as "the unhappiest person". Alternatives: plain mean — one person's
collapse is invisible, and `failure.md`'s "morale at the bottom → everyone leaves at once"
never triggers from an individual crisis; `min` alone — the collective becomes a single
person and the other four stop mattering.

The constants are balance numbers, so they are exported next to the function and are fair
game for the balance track to retune in a `baseline:` pull request.

### `advance` is a pure function with the RNG as a value

```
advance(state, plan, options) -> { state, weeks, stoppedAt, reasons }
```

`state` carries the org, the collective and the `RngState` (`restoreRng`/`createRng`
already exist for exactly this). No mutation, no ambient randomness, no clock — the
determinism requirement then holds by construction rather than by discipline, and a stop
result can be handed to the interface without copying (`adr/0002`).

`options` carries the sensitivity mask, the thresholds and the calendar markings. Thresholds
default to constants exported from `week.ts`; a caller may override them, which is how a
difficulty setting will work later without a second mechanism.

### Effects are a closed union, interpreted by code

Content chooses a kind and an amount; the meaning of `stat`, `energy`, `morale`, `money`,
`reputation` lives in `week.ts`. Alternative considered: an expression field in the content
file — that turns `content/` into code, which `adr/0003` exists to prevent, and it makes the
content validator unable to say whether a file is correct. The consequence is accepted
openly: the first activity that does not fit the five kinds is a signal to extend the union
in its own change, not to smuggle a script into data. The press conference of `week.md`
§6.2 is exactly such a case — its charisma check waits for the incident system.

### The design documents disagree about the calendar

`week.md` §6.3: 20% contest weeks, 5% tournament weeks. `loops.md`: 24 weeks, 2 tournaments,
6–8 matches — that is 8% and 25–33%. This change touches neither file: intent changes only
on the author's explicit request (`CLAUDE.md`). The week loop consumes markings and
classifies, so it is indifferent to which number wins; the resolution matters to `specs/0004`
when the calendar generator is written, and this paragraph is the record that it is open.

## Risks / Trade-offs

- **The stop list is wrong in a way tests cannot see** → every reason is covered by a
  scenario that pins the week index the advance stops at, and the maskable/unmaskable split
  keeps a mistuned mask from ever hiding an incident.
- **Five effect kinds are too few** → accepted; extending the union is a small, honest
  change, and the schema fails loudly on an unknown kind instead of ignoring it.
- **Morale weights are invented numbers** → they are exported constants with a stated
  purpose; the balance track owns them the moment `sim_harness` exists.
- **A week-loop golden snapshot cannot be written on this branch** — the `PreToolUse` hook
  denies every write under `test/golden/**`, creation included (`tests/README.md`) → PR-2
  proves determinism with unit and property tests; the season snapshot follows in its own
  `golden:` pull request.

## Migration Plan

No runtime migration: nothing consumes core yet. Two repository moves happen with the
implementation. `specs/0003-week-loop.md` is deleted, because its behaviour is this
change's delta and two records of the same behaviour is the failure mode `adr/0009` was
written against. `docs/INDEX.md`'s "weekly cycle" row stops pointing at the retired stub
and points at the archived capability instead.
