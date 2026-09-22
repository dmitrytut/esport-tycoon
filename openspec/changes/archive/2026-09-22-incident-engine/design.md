## Context

See `proposal.md` for motivation. The constraints that shape the implementation are already
present in the repository:

- `RunState` owns the serializable week and root RNG continuation. `executeWeek` advances one
  week; `advance` stops after the first unmasked reason.
- `AdvanceOptions.incidents` is currently a list of incidents selected by a caller and keyed
to an absolute week. It proves the stop reason but owns no selection or lifecycle.
- The existing event schema is aspirational. It admits fields (`riskLoss`, `respect`, trait
mutation and act/contest conditions) that no current engine can execute.
- `Performer` already carries trait ids, and trait content already declares category-specific
`eventWeightBoost`; no core type consumes those declarations yet.
- Core must remain domain-neutral, pure and deterministic. It reads no files, time or ambient
randomness (ADR 0001, 0002 and 0008). Content remains data interpreted by closed unions
(ADR 0003).
- `sim-harness` walks through `executeWeek` so it can capture every post-week state. It plans
a whole block before executing any of its weeks and must retain that plan across returns of
control.

## Goals / Non-Goals

**Goals:**

- Make occurrence, pending choice, resolution and cooldown one serializable core lifecycle.
- Keep event frequency an explicit caller input rather than a hidden balance constant.
- Give content a small closed language that expresses current state, a named target, direct
consequences and one Presence-style stat check.
- Make an unresolved choice impossible to bypass through either advancement API.
- Let the existing harness prove and report the same public path a future shell will use.

**Non-Goals:**

- A production event cadence or balance pass. The dedicated harness scenario is a contract
probe, not a season baseline.
- A UI modal, text substitution or localization layer. Core returns ids; a shell renders
content later.
- Contest-dependent consequences, relationship scores, event chains, persistent NPCs or a
queue of simultaneous incidents.
- The sixty-event content pass (#47) or trait behavior outside incident eligibility and
weighting (#34).
- A smart incident-choice AI. The first policy contract is deliberately neutral.

## Decisions

### Incident lifecycle is mandatory run state

`RunState` gains one `IncidentState` beside its existing RNG continuation:

```text
IncidentState
  rng: RngState
  pending: PendingIncident | null
  cooldowns: readonly IncidentCooldown[]

PendingIncident
  incidentId: string
  performerId: string
  week: number
```

The incident RNG starts from the root seed's named `incidents` stream and is saved after every
selection or check draw. A named independent stream satisfies ADR 0002: adding an incident
draw cannot shift generation or a later contest stream. A helper constructs the initial
incident state; every `RunState` fixture and caller migrates in one cutover. Making the field
optional was rejected because it creates two save shapes and lets an old-looking state bypass
pending and cooldown invariants.

A pending entry stores identity, not copied content. Resolution receives the catalog again
and fails before mutation if the incident, performer or choice no longer exists. Content is
versioned with the game rather than duplicated into every save.

### Selection happens after activities, recovery and non-incident reasons

`executeWeek` first performs its existing work unchanged. It then computes the week's
`baseWeekKind` from the calendar marking, spent slots and all reasons produced so far. The
incident engine receives the resulting organization, collective, week index, base kind,
catalog, trait category multipliers, cadence and incident state.

This ordering makes conditions respond to the decision the player just made: an activity can
push a performer below the incident threshold in that week. Recovery is included because it
is already part of the completed week's state. Selection adds `incident-pending`; the week
loop then performs final classification with that reason included. This deliberate two-step
classification avoids a circular trigger where selecting an incident changes the condition
that selected it.

Selection is attempted even when another non-incident stop reason exists. A week may therefore
report several reasons, preserving the week loop's existing rule that no result is discarded.
At most one incident is selected. A state that opened with pending never reaches this point:
both advancement APIs reject it before plan validation or an RNG draw.

### Conditions are one closed AND object

The JSON shape remains an object rather than becoming an expression language:

- `energyBelow` and `moraleBelow` are strict numeric thresholds;
- `requiresTrait` means the target possesses every listed id;
- `region` and `baseWeekKind` are non-empty allow-lists.

All present fields combine with AND. Omitting `conditions` or declaring `{}` makes the
incident eligible for every performer before weighting and cooldown. This covers the
state-driven examples the design names without introducing nesting, OR, negation or scripts.
The selected performer is always the `{player}` subject, including incidents whose
consequence belongs to the organization. Unknown keys and empty allow-lists fail schema
validation. `act` is removed: no current runtime state says which act is active, and
accepting the field would make the engine guess.

`baseWeekKind` uses the core names `quiet`, `ordinary`, `contest`, `series`; the aspirational
schema names `normal`, `match`, `tournament` are removed. Contest kinds are supported as input
because the week loop already classifies them, but #33 ships no consequence that needs a
contest result.

The breaking JSON contract uses these exact field names:

```json
{
  "id": "press-conference-own-goal",
  "category": "press",
  "weight": 4,
  "cooldownWeeks": 12,
  "conditions": {
    "energyBelow": 70,
    "requiresTrait": ["streamer"],
    "region": ["eu"],
    "baseWeekKind": ["ordinary"]
  },
  "text": "{player} reaches the microphone before the media trainer reaches {player}.",
  "choices": [
    {
      "id": "answer-live",
      "label": "Answer live",
      "detail": "The first sentence will decide whether this becomes a slogan or evidence.",
      "outcome": {
        "kind": "check",
        "stat": "presence",
        "difficulty": 24,
        "successEffects": [{ "kind": "reputation", "amount": 3 }],
        "failureEffects": [{ "kind": "reputation", "amount": -3 }]
      }
    }
  ]
}
```

`cooldownWeeks` is required and non-negative; the old schema default is removed. Core never
receives an omitted cooldown and the validator never mutates content by applying a default.

The real file has two or three choices; the single entry above documents shape only. A
direct outcome uses `{ \"kind\": \"direct\", \"effects\": [...] }`. Effect entries reuse the
activity-style `kind`/`amount` shape, add `form`, and omit activity-only money scaling.
`stat` is required only for a stat effect. Incident `text` must contain `{player}`; choice
`label` and `detail` are non-empty English player-facing strings. Stable choice ids, not
array positions or translated labels, cross the core boundary.

The existing trait schema is tightened with the same category enum and a non-negative bound
for every `eventWeightBoost` value. Trait files remain otherwise unchanged; the validator
rejects a misspelled category or negative multiplier before core sees it.

### Cadence gates occurrence; weights choose identity

Frequency and identity are two different questions. The caller supplies a cadence in `[0,1]`.
When there is at least one positive-weight eligible incident, the engine makes one chance draw.
Failure produces no incident. Success selects an incident, then a target.

For each eligible target, its category multiplier is the product of all declared multipliers
for its traits, with a missing multiplier equal to one. Multipliers are finite and
non-negative. An incident's effective weight is:

```text
base weight × mean(eligible target multipliers)
```

The incident is selected by those effective weights. Its target is then selected from its own
eligible performers by their multipliers. This preserves the content author's meaning that
`weight` belongs to an event: merely having five eligible people instead of one does not make
that story five times as common. Traits can still make both the matching story and the
matching person more likely.

Before the weighted draws, the engine sorts incident candidates and each target list by
ascending code-point order of stable id. Filesystem enumeration, array order and collective
iteration therefore cannot become an accidental tie-breaker.

The engine computes candidates before drawing. A catalog with no candidate consumes no RNG,
so adding impossible content does not drift an otherwise identical run. A cadence of zero
never occurs; cadence one guarantees an occurrence only when positive effective weight
exists. No default enables incidents accidentally.

The rejected alternative was weighting every `(incident, performer)` pair. It is simpler,
but turns roster size and broad conditions into an undocumented multiplier on event
frequency. Independent Bernoulli draws per incident were also rejected: growing the catalog
would increase the number of incidents per season and consume a catalog-order-dependent
number of draws.

### Choices are direct outcomes or one d20 stat check

Every choice has a stable id. Its outcome is a tagged union:

```text
direct: effects
check: stat, difficulty, success effects, failure effects
```

A direct outcome consumes no resolution draw. A check draws one uniform integer in `1..20`
and succeeds when `target.stats[stat] + roll >= difficulty`; equality succeeds. The returned
resolution carries the roll and total so the shell and report can explain the outcome rather
than asking the player to trust an invisible branch.

This is intentionally one check form. Advantage, opposed checks, critical outcomes and
scripted branches are not smuggled into the data model. The difficulty is content and can be
balanced without changing code; the algorithm is behavior and stays in core.

### Effects are discriminated, aggregated and applied once

Effect data follows the activity catalog's successful pattern: an array of closed tagged
values rather than a bag of optional properties. Performer kinds are `energy`, `morale`,
`form`, and `stat` with a stat key. Organization kinds are `money`, `audience`, and
`reputation`. All carry a signed amount.

Resolution sums effects by destination before calling the existing performer and organization
mutation helpers once. This preserves bounds and one-decimal rounding and prevents two lines
for the same field from being rounded twice. Performer effects land only on the pending
target; organization effects land once, independent of roster size.

Resolution is one pure transition returning `{ state, resolution }`. It validates pending,
catalog, target and choice first. A direct branch applies effects; a checked branch consumes
one draw and applies exactly one side. Only then does it write the incident cooldown and clear
pending. Calling it again sees no pending and changes nothing. Partial application is not an
observable state.

Choice effects happen after control has already returned for `incident-pending`. If they
cross an energy, morale or money threshold, the applied effects and returned state expose the
crossing, but core does not rewrite `WeekResult` or queue a synthetic threshold reason for the
next week. That week opens from the post-resolution state. This avoids a second immediate stop
for a consequence the player just chose while keeping the resulting values explicit.

Trait add/remove, `respect`, delayed effects and `riskLoss` are excluded. Keeping fields as
accepted no-ops was rejected because valid-looking content that does nothing is worse than a
validation error.

### Cooldown belongs to the incident id, not the target

An occurrence at week `W` with cooldown `N` is eligible again at `W + N + 1`. The intervening
`N` weeks are excluded for every performer. Global cooldown matches the content goal: the
reader notices the same story repeating even when the name substituted into it changes.

The cooldown is committed with resolution. Pending blocks time, so committing at selection or
resolution gives the same eligible week; committing with resolution keeps the whole choice
transition atomic. Cooldowns are stored as sorted incident-id/eligible-week entries, not a
map, so their serialization has a canonical order.

### Occurrence and resolution remain two results

`WeekResult` remains the immutable result of advancing the week. It contains the
`incident-pending` reason with incident and performer identity. Resolving later returns a
separate `IncidentResolution` with choice, outcome, optional roll/total and applied effects.
Core does not retroactively rewrite a prior result.

The harness combines both records under the same absolute week for presentation. It resolves
immediately after recording the return of control, then stores the post-resolution state as
that walked week's state. The next original planned week uses that state. This mirrors a
future shell's stop → choice → continue sequence without pretending the choice occurred
before the stop.

### Harness policy is neutral and total

Each of the money, development and balanced policies receives the public pending identity and
the incident's choices and submits the first choice id in ascending code-point order. It does
not inspect hidden rolls, score possible effects or reproduce the check formula. All three
deliberately use the same rule: #33 needs a deterministic stand-in for a person, not a second
AI strategy. A later policy change can propose strategic choice ranking with its own
measurable question.

The incident report adds occurrence count by id, choice count by id, success/failure/direct
counts, and a per-week record linking incident, target, choice, outcome and optional check
figures. It does not attribute an effect core did not return.

### A dedicated scenario proves the path without balancing it

`act-one.json` remains unchanged and incident-free, preserving #46's baseline inputs. A new
incident smoke scenario declares the three executable ids and cadence one. Its content,
seeds and horizon guarantee at least one occurrence and resolution for every declared seed;
tests assert that contract from machine-readable output. Its report labels the scenario and
cadence, and no document calls that cadence a game default.

The active catalog ships three conversational English incidents:

- one direct performer-state consequence;
- one organization consequence;
- one press-conference choice checked against Presence with distinct success and failure.

The existing `cat-on-keyboard.json` is removed from executable content. Its authored story
remains in `docs/design/tone.md`, but its `riskLoss` and `respect` fields have no current
owner. Reinterpreting them as form or morale would silently change intent; supporting them as
no-ops would violate the executable-content invariant. A contest-aware change can restore it
when those consequences exist.

### Validation and tests cross the public boundary

Unit tests pin trigger boundaries, event-first weighting, target weighting, cadence 0/1,
pending rejection, direct resolution, both check branches, exactly-once behavior and cooldown
edges. Property tests cover bounded state after arbitrary supported effects and deterministic
replay over generated catalogs with pinned fast-check seed.

The week-loop tests pin stop index, base/final kind and isolation of RNG streams. The harness
uses real event files and compares the pre-resolution walk against block advance, then the
post-resolution state against core's public resolution result. Content validator tests cover
every removed aspirational field and all references. A manual smoke run exercises text and
JSON output; `pnpm verify` is the final gate. No golden or baseline changes ride in the
implementation branch (ADR 0009).

## Risks / Trade-offs

- **The stat check is a new balance rule.** The d20 algorithm is fixed and inspectable, while
  difficulty stays in content. It will need measurement once a larger catalog exists; #33
  proves behavior rather than claiming tuned odds.
- **Average target multiplier is a judgement.** Sum would make roster size change event
  identity; maximum would let one extreme trait represent the whole roster. Mean preserves
  base event weight and still responds to composition, at the cost of diluting one person's
  multiplier among five.
- **Removing executable Cat on the Keyboard looks like lost content.** It was never
  executable: two effects have no mechanics. The story remains in intent and can return
  honestly with contests rather than surviving as a valid no-op.
- **RunState migration touches every fixture.** That is the cost of making pending and
  cooldowns saveable. An optional compatibility path would move the risk into every future
  caller and is rejected.
- **A catalog change shifts weighted identity.** That is expected: content is an input. The
  determinism guarantee is same content plus same state and decisions, not immunity to a
  changed catalog.
- **A pending id is a save-compatibility contract.** Renaming or removing its incident,
  performer or choice makes resolution fail while advancement remains blocked. There is no
  save migration or discard transition in #33 because persistence is not implemented; #47
  must treat shipped ids as stable until a separate save-versioning change defines migration.
- **The executable contract is narrower than `docs/design/events-catalog.md`.** The intent
  document still describes `trigger` and flat `effects` fields, a season-phase trigger and
  relationship consequences. #33 uses `conditions` and per-choice `outcome`, and omits act or
  season phase and relationships until runtime owners exist. The schema and archived spec are
  authoritative for executable content; #47 must not author against those aspirational rows.
- **The smoke cadence is intentionally unrealistic.** Its name and provenance must keep it
  out of balance conclusions; act-one remains the measurement scenario.
