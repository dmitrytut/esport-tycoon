## Context

After `week-loop`, `packages/core` holds `Org` with money, reputation and the weekly slot
pool, and `week.ts` credits a money effect by the amount content declared. `applyOrgChange`
is the only way to move the org, and it already clamps reputation while leaving money free
to go negative — the two behaviours a third value has to choose between.

Motivation — see `proposal.md`. Requirements — see `specs/audience/spec.md`,
`specs/activity-catalog/spec.md` and `specs/week-loop/spec.md`.

## Goals / Non-Goals

**Goals:**

- A payout that depends on how many people are watching, with the curve readable in one
  line and retunable by one constant.
- A distinction between a sum and a base that content states, so a cost never accidentally
  scales.
- Room for the discipline and region multipliers of `specs/0004` to arrive later as factors
  rather than as a rewrite.

**Non-Goals:**

- Deciding which activities are offered in which act. That is availability, the next
  change.
- Modelling an offer from a named brand: its term, its demands, its withdrawal after a
  scandal. `roadmap.md` holds recurring NPCs until after the core.
- Anything the contest pays. Prize money and viewers belong to `specs/0004`.

## Decisions

### Naming: `Audience` in core, `Fanbase` in the domain

`docs/design/*` and the interface call it the fanbase, and that word stays what the user
sees. Core takes `Audience`: every other value of the org already has a neutral twin in the
glossary's core table (`Org` for organization, `Collective` for the lineup), and a fanbase
is a base of fans of something — it names the domain the core is not allowed to know
(`adr/0001`, `adr/0004`; a studio or a band has an audience too).

`fanbase` is not in `FORBIDDEN_CORE_WORDS`, so the linter would accept it. That is exactly
why the glossary row is part of this change: the rule that catches a synonym here is "one
concept, one word per layer," and only the glossary enforces it.

Worth recording for the next change: `sponsor` **is** in `FORBIDDEN_CORE_WORDS`. Whatever
models an offer will need a neutral name or will live outside core.

### The audience is an unbounded count, not a 0–100 scale

Reputation is a standing and fits 0–100. An audience is a number of people, and the three
acts of `acts.md` run from a basement to an organization — a cap would make act 3 pay the
same as late act 2, and "the more popular you are, the more they want from you" would stop
being true exactly where the game is supposed to feel largest.

Alternative considered: 0–100 like reputation, with the act supplying a multiplier.
Rejected — it puts the act model inside the payout, and the act model is a later change.

### Reach is `audience / (audience + AUDIENCE_HALF_REACH)`

Zero at zero, strictly rising, asymptotic to one, concave — every property the requirements
ask for, from one division. `AUDIENCE_HALF_REACH` is the audience at which a base pays half
of itself, and it is the single number the balance track moves.

Starting value: 50 000. At a basement audience of a thousand a 5000 base pays about 98; at
50 000 it pays 2500; at half a million, 4545. That spread lines up with the three acts
without any rule knowing what an act is.

Alternatives considered. A logarithm or a power curve is the textbook answer and is banned:
`adr/0002` forbids `Math.log`, `Math.pow` and `Math.exp` in core because their last digits
are platform-dependent, and a golden snapshot that differs between two machines is worse
than a crude curve. A linear `base × (1 + audience / K)` pays the full base at zero
audience, which is the bug this change exists to fix. A tiered table in content was
rejected twice over: a curve is not data, and a table freezes act boundaries into
`content/`.

### The base is an unreachable ceiling

Because reach never reaches one, the number in content is not a payout anyone will see —
it is the limit. That is deliberate: a content author tuning "how much is this campaign
worth at most" is tuning one number with one meaning, and there is no audience at which the
game hands over exactly the declared sum.

### Scaling is declared on the money effect, and only there

```json
{ "kind": "money", "amount": 5000, "scale": "audience" }
```

`scale` is optional and defaults to `flat`, so every activity file written before this
change keeps its meaning without being edited. Only `money` may carry it: a training
session is worth the same to a famous org as to an unknown one, and a fine is a fine.

Alternative considered: scale every money effect by reach. Rejected — rent, a fine and a
salary are costs, and scaling a cost by fame is a different mechanic that nobody asked for.
Alternative considered: a flag on the activity rather than on the effect. Rejected — an
activity may plausibly both pay a scaled fee and charge a flat production cost, and a flag
on the activity cannot say which is which.

### Reach is read when the activity executes, not when the week opens

A week that first streams and then runs a campaign pays the campaign at the audience the
stream just built. The alternative — freezing reach at the start of the week — is one line
cheaper and silently punishes the obvious plan, and the week already applies effects in
planned order, so ordering is a lever the user has.

### Nothing decays

No design document says the audience falls on its own, so nothing here makes it fall.
Inventing a decay rate would be a guessed mechanic spreading through the balance, which is
the failure mode `CLAUDE.md` names as the worst outcome in this project. When a source for
it exists — a scandal, a season without results — it arrives as its own change.

### The curve lives in `org.ts`

`reach` and `AUDIENCE_HALF_REACH` sit next to the audience they read, by the rule that a
type and its constant live next to the code holding their invariant (`adr/0010`). `week.ts`
gains one branch: when a money effect declares `audience`, multiply its base by
`reach(org)`. The tick does not learn a new subject.

## Risks / Trade-offs

- **The half-reach constant is invented**, like the morale weights before it → it is
  exported next to the curve, named for what it means, and owned by the balance track from
  the moment `sim_harness` (#8) exists.
- **Until availability is gated, a zero-audience campaign burns slots for nothing** →
  stated in the proposal as the known consequence, and the next change removes the activity
  from the act instead of papering over the payout.
- **A concave curve makes late runs feel flat** — every extra follower is worth less → that
  is the intended shape, and the lever against it is the base in content plus the
  discipline and region multipliers of `specs/0004`, not a steeper curve.
- **Extending a closed set that was accepted as closed** → the set was closed against
  scripts in data, not against arithmetic kinds; the schema still fails loudly on an
  unknown kind, and `activity-catalog` records the sixth explicitly rather than leaving the
  code and the spec to disagree.

## Migration Plan

No runtime migration: nothing consumes core yet, and there is no save format beyond
`PerformerSnapshot`. Two things move with the implementation. `stream-session` stops
carrying the `reputation` effect it was given as a stand-in for the fanbase and carries an
`audience` effect instead, which is what `week.md` §6.2 asked for in the first place.
`docs/glossary.md` gains the `Audience` / `Fanbase` row, so the next session that opens the
core table finds the concept already named.
