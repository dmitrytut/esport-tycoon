## Why

An activity pays the same sum on the first week of a run and in an organization a million
people follow: `ad-campaign` credits 5000 either way. The number is not mistuned — it
depends on nothing, and `acts.md` is explicit that an act must change which levers the user
has rather than the size of the numbers.

The reason there is nothing to scale by is a gap left open by the previous change. The
design carries three values for the organization — money, fanbase, reputation
(`docs/design/events-catalog.md`, `docs/design/ui.md`, and `week.md` §6.2 where a stream
pays "+money, +fanbase"). The closed set of effect kinds accepted in `activity-catalog`
holds five of them and not the fanbase, so a stream was implemented as `money` plus
`reputation`. That divergence was recorded, not resolved (issue #23).

## What Changes

- **The audience becomes a value of the org.** A count of people following the
  organization, at least zero and unbounded above — reputation is a standing on a 0–100
  scale, an audience is a number of people, and an organization that grows across three
  acts needs room above. It moves only when an effect says so; nothing makes it drift,
  decay or grow on its own (the same rule `specs/0001` item 4 holds for a performer).
- **A sixth effect kind, `audience`.** **BREAKING** for `activity-catalog`: the set of
  kinds was accepted as closed at five, and this is the honest way to extend it — the
  alternative that was rejected there is smuggling a script into data, not adding a kind.
- **A money effect declares whether it scales.** `flat` for a sum that does not care who
  is watching — a fine, a salary, rent; `audience` for a base that the reach of the
  organization multiplies. Absent means `flat`, so no existing effect changes meaning by
  accident.
- **The payout curve saturates and is built from arithmetic only.** Reach is
  `audience / (audience + half)`: zero at zero audience, rising, never reaching one. It is
  not a logarithm or a power because `adr/0002` bans `Math.log`, `Math.pow` and `Math.exp`
  in core for platform-dependent precision, and a snapshot that differs between two
  machines is worse than a crude curve.
- **Content moves from payouts to bases.** `stream-session` and `ad-campaign` declare
  audience-driven money, and `stream-session` gains the `audience` effect `week.md` §6.2
  promised it.
- **The glossary gains the concept.** `Audience` in core, `Fanbase` in the domain and in
  the interface, one row in `docs/glossary.md`. Every other value of the org already has
  that pair, and a concept with no entry is how a synonym gets in.

Out of scope, and each for its own reason:

- **Which activities exist at all.** `acts.md` puts advertising, press and streams in act 2
  — in the basement there is nobody to advertise to. Gating availability is the next
  change, and the consequence of not doing it here is stated below.
- **Offers from named sponsors** (a cola brand, a hardware maker), their price, term and
  demands. `roadmap.md` holds recurring NPCs, "the energy-drink sponsor with permanently
  strange requirements" among them, until after the core. Note also that `sponsor` is in
  `FORBIDDEN_CORE_WORDS`: whatever models an offer will live outside core or under a
  neutral name, and that is a design decision worth its own proposal.
- **Multipliers for discipline and region.** `disciplines.md` already carries
  `economy.viewerScale`, and `world.md` says sponsors are richer in North America. Both
  belong to the contest and region economy (`specs/0004`). Reach is deliberately a function
  of the audience alone so those can multiply it later without being rewritten.

### Two notes for the reviewer

1. **Until availability is gated, an audience-driven activity at zero audience is a slot
   sink.** It costs its slots, drains its energy and credits nothing. That is visible and
   honest rather than silent, but it is not the end state `acts.md` describes — in act 1
   the activity should not be offered at all. Splitting it off keeps this change to one
   subject; merging the two would put an act model into the same review as a curve.
2. **`CLAUDE.md` § Status is stale.** It still reads "Next specs: 0003 (week), 0006" after
   `week-loop` archived. It is not in the "Affects" list below, because a status digest is
   not this change's subject; a human fixes it in a line.

## Capabilities

### New Capabilities

- `audience`: the audience of the org — what it is, what moves it, what does not, and the
  reach curve an audience-driven payout is scaled by.

### Modified Capabilities

- `activity-catalog`: the closed set of effect kinds grows to six, and a money effect
  declares its scaling.
- `week-loop`: crediting money applies the reach curve to an audience-driven effect; the
  balance crossing zero downward is unchanged.

## Impact

`Org` grows a third value and `applyOrgChange` a third field; `week.ts` gains one curve and
one branch where it routes a money effect. Nothing about the week's shape moves: slots,
energy, morale, the plan, the stop reasons and the classification are untouched, and the
week loop stays a pure function of its inputs.

Risks. First, the half-reach constant is an invented number, like the morale weights before
it — it is exported next to the curve and belongs to the balance track the moment
`sim_harness` (#8) exists. Second, an unbounded audience means the payout of a late run is
bounded by the base while the audience is not, so the base carries the whole scale of an
act; if that reads wrong in play, the fix is the base in content, not the curve in code.
Third, this change makes the divergence with `week.md` §6.2 smaller but not zero: the press
conference still needs a charisma check, and that still waits on the incident system.

## Affects

- `packages/core/src/org.ts` — the audience field and `applyOrgChange`
- `packages/core/src/activity.ts` — `AudienceEffect`, the scaling of a money effect
- `packages/core/src/week.ts` — the reach curve and where a money effect is credited
- `packages/core/src/index.ts` — the new module surface
- `packages/core/test/org.test.ts`, `packages/core/test/week.test.ts`,
  `packages/core/test/fixtures.ts`
- `packages/core/test/property/arbitraries.ts`,
  `packages/core/test/property/week.property.test.ts`
- `content/schema/activity.schema.json` — the sixth kind and the scaling field
- `content/activities/stream-session.json`, `content/activities/ad-campaign.json`
- `tools/validate-content/src/index.ts`,
  `tools/validate-content/test/validate-content.test.ts`
- `docs/glossary.md` — the `Audience` / `Fanbase` row
- `openspec/changes/fanbase-economy/**` — this change
- `openspec/specs/audience/**`, `openspec/specs/activity-catalog/**`,
  `openspec/specs/week-loop/**` — written by `openspec archive` on the implementation
  branch, not by hand

Not touched: `test/golden/**` and `sim/baseline/**`, `docs/design/**`, `docs/adr/**`,
`packages/core/src/performer.ts`, `packages/core/src/collective.ts`,
`packages/core/src/generate.ts`, `packages/core/src/observe.ts`,
`packages/core/src/rng.ts`.
