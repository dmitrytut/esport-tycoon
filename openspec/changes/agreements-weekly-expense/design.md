## Context

See `proposal.md` for motivation. `RunState` currently contains one `Org`, one `Collective`,
the absolute next-week index, root RNG continuation and incident lifecycle. `executeWeek`
executes activities in plan order, applies recovery, derives reasons from opening and closing
state, then selects an incident. Money can move through activity and incident effects, and
`applyOrgChange` already permits debt and rounds every value to one tenth.

`Performer` and `PerformerSnapshot` deliberately describe a person rather than that person's
relationship with an organization. `Collective.members` is the current group available to a
week. The content tree already declares `salaryScale` for regions and disciplines, but both
fields are optional and only region talent density currently reaches the harness's typed
origin profile.

The season wrapper delegates one block to `advance`, carries the returned `RunState`, and
preserves organization and people across the season boundary. The week-only harness calls
`executeWeek` directly and reports core-produced values; its accepted contract forbids it from
inventing a missing economy.

## Goals / Non-Goals

**Goals:**

- Keep employment terms separate from performer identity and collective membership while
  making their relationship explicit and validatable.
- Close every advanced week through one deterministic settlement point that owns the recurring
  debit and the completed-week negative streak.
- Make term cost and expiration predictable before a planning block and auditable afterwards.
- Preserve the week loop as the only owner of recurring expense so #32, #45, #52 and #20 can
  consume one sequence rather than reconcile parallel calculations.

**Non-Goals:**

- A terminal bankruptcy threshold, run outcome or post-terminal rejection; #32 consumes the
  streak added here.
- Contest rewards, their exact application API or their ordering against weekly settlement; #45
  owns that choice and must not add another engagement debit or negative-week update.
- Negotiation, offers, bonuses, buyouts, severance, taxes, currencies or transfer history.
- Choosing a viable starting capital, term, income level or survival corridor; #52 measures and
  tunes the declared content and scenario values.
- Save-file I/O or format migration. The state inventory is input to #20, not a persistence
  format.

## Decisions

### `Engagement` is separate authoritative run state

Use one term for one concept: `Engagement`. Do not add an `Agreement` alias. An engagement
contains a stable id, `performerId`, `collectiveId`, positive `weeklyRate`, inclusive
`startsAtWeek` and exclusive `endsBeforeWeek`.

`RunState.engagements` holds the materialized current terms. `Performer` and
`PerformerSnapshot` remain unchanged, so a free performer is an ordinary performer outside a
collective rather than a person with nullable employer fields. A collective member is eligible
for week `W` only when exactly one engagement for that performer and collective satisfies
`startsAtWeek <= W < endsBeforeWeek`.

Validation happens before plan execution or RNG restoration. It rejects a non-finite or
non-positive rate, a rate off the one-tenth money grid, a non-integer or negative boundary, an
empty interval, duplicate ids, a second stored engagement for one performer, an engagement naming
an unknown performer or another collective, and a current member with zero or multiple covering
engagements. Only current terms are stored, so one performer has at most one engagement:
historical terms are not retained in `RunState`, completed `WeekResult` evidence identifies what
was charged, and #20 snapshots only continuation-bearing current state.

Alternative rejected: embed terms in `Performer`. That couples personal identity and its
existing snapshot to one employer and makes free performers nullable. Alternative rejected:
derive expense from `Collective` without terms. That cannot represent duration or preserve an
accepted rate when stats later change.

### Rate quotation is deterministic, explicit and consumes no randomness

The domain loader maps required content values to neutral positive rate inputs: a discipline
base weekly rate plus the region and discipline `salaryScale` multipliers. Region and discipline
schemas require those fields and reject zero, negative and non-finite values; core receives
already loaded numbers and has no fallback.

For a generated performer, the quote is:

```
profile = (mechanical + cognitive + collective + composure + adaptability + presence) / 6
weeklyRate = roundToTenths(baseWeeklyRate * profile * originRateScale * disciplineRateScale)
```

The base rate exists because the two `salaryScale` fields are relative by design:
`docs/design/world.md` makes 0.7 in the CIS and 1.35 in western Europe a statement about how
much dearer one region is than another, not about how much money a week costs. Without a
separate magnitude, #52 could only move the whole economy by multiplying every region, which
destroys that meaning. The base rate lives in discipline content because the absolute salary
market is a property of the discipline, while region stays a multiplier on it. #31 fixes the
structure; #52 picks the number.

All six current stats are used because adaptability and presence carry economic value outside
contests as well as the four contest-facing stats. Age, peak age, potential, traits, energy,
morale and form do not enter the quote. Hidden data therefore does not leak through price, and
temporary state cannot move a long-lived term.

Quotation runs after `generatePerformer`; it neither changes `GenerateParams` draw order nor
consumes an RNG value. Generation level affects the quote only through the generated stats.
The quoted number is copied into the engagement. Later stat growth does not reprice it until a
renewal boundary, where the same quote operation prices the performer again.

### Terms use inclusive start and exclusive end

An engagement with `startsAtWeek = 3` and `endsBeforeWeek = 7` is active and charged in weeks
3, 4, 5 and 6. It is expired when the run's next absolute week becomes 7. The names encode the
boundary and avoid a separate date interpretation.

`renewEngagement` is a boundary operation for an engagement whose `endsBeforeWeek` is at or
before the current next week. The comparison is `<=` rather than `==` so a restored or
hand-assembled state that sits past its boundary can still be renewed instead of being
terminable only. It preserves performer and collective identity, sets `startsAtWeek` to the
current next week and requires a later `endsBeforeWeek`.

The replacement rate is the deterministic quote for the performer's current stats and current
rate inputs; the caller supplies no rate. A caller-chosen rate would make the whole recurring
expense optional — nothing outside negotiation would stop a run from renewing every term at the
one-tenth minimum, which is exactly the failure signal this change writes down. Quoting at the
boundary also gives the intended growth loop its price: a performer trained during a term stays
cheap until it ends, then costs what they are now worth. Negotiation later replaces this rule
with its own outcome rather than introducing pricing from nothing. Early renewal is still not
supported, so a term cannot be locked in ahead of training.

`terminateEngagement` may run between weeks for a current or expired term. It atomically removes
the engagement and performer from the collective, charges no fee and consumes no RNG. It rejects
when it would leave the collective empty: with no recruitment, no people-loss outcome and no
contest obligation yet, a memberless run owes nothing, can do nothing and would advance forever.
That guard is a stopgap for the missing mechanics, not a roster-size rule — `docs/design/acts.md`
wants three undismissable friends, which needs relationships the model does not carry yet. Any
remaining block plan that named a removed performer is invalid and must be replaced before
advancement.

When an incident is pending, both renewal and termination reject without mutation. This fixes
the resolution order for a week that produced both an incident and an expiration: resolve the
incident while its target still exists, then renew or terminate every expired engagement.

### One weekly settlement owns every regular debit

The complete one-week order becomes:

1. reject pending incidents and unresolved expired engagements; validate terms, plan and inputs;
2. capture opening money and performer state;
3. execute planned activities in order, including each activity's organization effects;
4. apply existing weekly performer recovery exactly once;
5. select active engagements for the absolute current week, sort them by stable id, sum their
   already-rounded rates in integer tenths, and call `applyOrgChange` once with the negative
   total;
6. set `consecutiveNegativeWeeks` from the final money: previous value plus one when money is
   below zero, otherwise zero, including a final balance of exactly zero;
7. derive skipped, threshold, `money-negative`, boundary and expiration reasons;
8. classify the base week kind, then perform the existing incident selection and final
   classification.

Activity income therefore can fund the expense due in the same week. Only the final balance
counts for the streak; an intermediate negative or positive value is not a completed negative
week. `money-negative` retains its crossing semantics: it appears only when opening money was
zero or positive and final money is negative. A run already below zero increments the streak
without repeating that crossing reason.

`WeekResult` records one `engagementExpense` value containing the total and the charged ids in
code-point order. It is evidence in its own right, so no consumer infers salary from adjacent
balances. The week loop is the only code that applies this debit. Lifecycle operations, season
code, harness code and future contest code do not debit it.

An incident is selected after settlement but resolved later through the existing explicit
operation. A resolution can change money, but the completed week's streak and expense evidence
remain immutable; that new balance becomes the next week's opening value.

Alternative rejected: charge before activities. That removes the intended same-week rescue and
makes a visible income activity fail to help the week it occupies. Alternative rejected:
charge through a synthetic activity or contest. Either path makes regular expense depend on a
plan or duplicates it when #45 integrates a contest.

### Expiration advances the last paid week, then creates a required boundary

After settlement of week `endsBeforeWeek - 1`, each engagement whose term just ended contributes
one `engagement-expired` reason carrying engagement and performer ids. The reason is unmaskable:
the next week cannot satisfy the member-to-engagement invariant until the player renews or
terminates.

The last paid week is complete, `RunState.week` has advanced, recovery and expense occurred once,
and all coincident reasons remain in the result. A later call with an expired current member
rejects before plan validation, mutation or RNG movement. Expiration never silently renews,
removes a member or charges the uncovered week.

At a season boundary, `Season` carries engagements and the streak unchanged. Starting the next
season rejects while an expired engagement still needs resolution, just as it already rejects
a pending incident. If expiration and `season-ended` coincide, both reasons are returned; after
all pending incident and engagement decisions are resolved, the next season may start.

### The negative streak belongs to `RunState`

`consecutiveNegativeWeeks` sits beside the absolute week because its invariant is defined at a
completed-week boundary. It does not belong to `OrgChange`: activity and incident effects may
move money without completing a week and must not alter the streak. It does not belong to
`Season`: debt carries across season boundaries.

#31 supplies no threshold and no terminal tag. #32 will read this count, define the eighth
negative week as terminal, record the outcome and reject future advancement. Zero is explicitly
non-negative and resets the count.

### Forecasts stop making assumptions at a required decision

A pure forecast accepts the current run and a four-to-six-week planning horizon. For each week
that remains covered by the current engagements it returns charged ids, scheduled expense and
the projected closing balance under zero additional income. It also lists engagements expiring
at each boundary and the first determinate projected negative week, if any.

When an expiration makes the following week dependent on renewal or termination, later balances
are marked unavailable rather than assuming a silent renewal, departure or zero rate. Thus the
forecast is exact over its determinate prefix and visibly identifies the decision that ends that
prefix. It reads no RNG and mutates nothing. Under unchanged membership and terms, every
settlement in that prefix must match the corresponding forecast expense exactly.

### Harness consumes core evidence and declares every engagement input

The scenario shape gains a discipline content id and an explicit initial engagement duration.
The loader resolves the selected discipline and both required rate scales, generates performers
as before, quotes each initial rate through core, and creates one engagement per generated
member starting at week zero. There is no runner-side formula or default duration.

The existing act-one measurement must declare its duration explicitly. That declaration is an
input required to make the scenario executable, not a claim that the act-one economy is viable;
#52 owns changing it after measurement. The runner continues to walk `executeWeek` and reads
`WeekResult.engagementExpense`, final money and `RunState.consecutiveNegativeWeeks` after each
week. JSON and text reports expose weekly and total recurring expense and the streak without
subtracting adjacent balances or assigning incident effects to salary.

Measured against current content, act one opens at zero money and the recurring fund alone is
about 43–46 per week for the declared seeds, while the money policy's whole 24-week income is
under 70. Every policy therefore ends the horizon deep in debt, and after #32 every policy would
die in the same week. That is the uncalibrated starting measurement #52 asks for, not a target
this change should quietly fix by inventing opening capital: #52 explicitly requires the
pre-tuning report first. Until #52 lands, the harness's money series is a baseline, not a
playable economy, and no conclusion about policy viability may be drawn from it.

A harness horizon that reaches an expiration cannot choose a renewal or termination policy in
this change. The initial duration must therefore cover the effective invocation horizon after any
command-line override, and an invocation that outlives its terms rejects before generation. Expiry
behavior is exercised by core scenarios rather than a fabricated harness decision. The single
shared duration is a property of this measurement scenario, not of the model: production starting
terms may be staggered per performer by whoever owns the starting configuration.

### Boundary contracts for dependent issues

#45 owns whether a reward attributed to calendar week `W` lands before `W` reaches recurring
settlement or after settlement as later money, consistent with the accepted season-calendar
contract that contest facts may arrive on either side of weekly execution. In either ordering the
week loop remains the sole owner of engagement debits and negative-week updates; contest code must
not rerun settlement or subtract rates itself.

#52 may tune the discipline base weekly rate, origin and discipline scales, the starting term,
opening money, activity income and contest rewards. It does not replace the quote formula, add a
second debit or move the settlement boundary.

#20 later snapshots engagement ids and terms plus `consecutiveNegativeWeeks` with the rest of
`RunState`. Rates are materialized continuation state and are not recomputed from current content
on restore. Forecasts and past week results are derived or historical output and need not enter
the snapshot. No new RNG stream exists.

## Risks / Trade-offs

- The mean-stat quote values adaptability and presence equally with contest-facing stats. This is
  intentionally simple and legible; discipline-specific stat valuation would turn the rate into
  a second contest-strength formula and add balance policy before measurement.
- Required content values tighten existing schemas and add one field: every discipline must now
  declare a base weekly rate, and both `salaryScale` fields become required. The single shipped
  discipline and two regions are migrated with the change, so the strictness exposes future
  incomplete content rather than inventing defaults.
- Termination without severance can be economically optimal, and only the empty-collective guard
  stops a run from dismissing its way out of the expense entirely. Fees and personal consequences
  are negotiation/transfer mechanics; adding a hidden penalty here would widen scope. #52 measures
  whether the remaining choice is viable.
- Price is linear in the mean stat while the value of strength is very likely convex once
  contests exist, so "buy the strongest affordable" may dominate. Scale tuning cannot fix a shape
  mismatch, so if #45's measurements show it, the formula is reopened by its own change rather
  than absorbed by #52. The falsifiable signal is a run where spending the same weekly fund on
  fewer stronger performers is never worse.
- Boundary-only quoting means a renewal can raise a trained performer's rate sharply. That is the
  intended cost of the growth loop, but it also makes expiry weeks the moment a plan can break;
  the forecast exposes the boundary in advance rather than hiding it.
- A coincident incident and expiration requires incident-first resolution. This preserves the
  pending target and is deterministic, at the cost of disallowing an otherwise harmless renewal
  until the incident is closed.
- The forecast becomes unavailable past an expiry. That is more limited than a speculative
  runway, but it preserves the central rule that expiration requires a decision and prevents a
  UI from presenting guessed terms as guaranteed money.

## Migration Plan

PR-2 first tightens and loads the existing content scales, then adds the engagement model,
quotation, validation, lifecycle and forecast operations. It migrates every `RunState` fixture
and caller in one cutover, adds settlement and expiration to the one-week path, then updates
season carry/hold behavior and the harness scenario/report.

Focused unit and property scenarios prove exact interval boundaries, deterministic quotations,
integer-tenth aggregation, one debit per active engagement, same-week earnings, zero reset,
coincident reasons, incident-first resolution, forecasts and JSON-compatible copies. Harness
smoke output then proves the core evidence reaches both report formats. Finally `pnpm format` and
`pnpm verify` run before `openspec archive agreements-weekly-expense -y` merges all four deltas.
No live spec is edited by hand, and no design, golden or baseline file is changed.
