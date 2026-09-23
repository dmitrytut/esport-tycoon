## Why

Money can rise through activities and choices, but nothing reduces it automatically, so the
weekly choice between development and income is currently free. Issue #31 adds a predictable
recurring expense and an explicit engagement boundary so keeping stronger people changes both
weekly plans and financial risk.

## What Changes

- Add a domain-neutral `Engagement` as separate run state linking one performer to one
  collective for an inclusive start week, exclusive end week and materialized weekly rate.
  `Performer` remains independent of employment and free performers require no nullable terms.
- Quote a generated performer's weekly rate deterministically from a required positive base
  weekly rate declared by the discipline, multiplied by the arithmetic mean of all six current
  stats and by the required positive rate scales of the origin and discipline, rounded to the
  existing one-tenth money grid. The base rate carries the absolute magnitude so the two
  `salaryScale` values stay relative multipliers. Age, hidden potential, traits and floating
  state do not enter the quote, and no random draw is added.
- Add explicit renewal and termination operations. Renewal resolves an expired engagement from
  the current next week and prices it with the same quote operation applied to the performer's
  current stats, so a rate is never chosen by the caller and the recurring expense cannot be
  renewed away; a rate stays fixed inside its term, so training a performer is cheap until the
  boundary. Termination removes both the engagement and that performer from the collective
  without a fee or transfer consequence, and is rejected when it would leave the collective
  empty.
- **BREAKING**: require every current collective member to have exactly one engagement covering
  the week being advanced, and store at most one engagement per performer. Reject duplicate,
  missing, malformed or already-expired terms before any run state or RNG continuation moves.
- Settle each completed week in one fixed order: execute planned activities and their income,
  apply existing recovery, debit the sum of active engagement rates exactly once, then classify
  the final balance and update the consecutive-negative-week count. A player can therefore earn
  during the same week whose recurring expense is due.
- Store `consecutiveNegativeWeeks` in `RunState`, increment it only when the completed week's
  final balance is below zero, and reset it when the balance is zero or positive. This change
  does not introduce the eight-week terminal condition owned by #32.
- Report the charged engagement ids and total recurring expense in each `WeekResult`; expose a
  pure block forecast of scheduled expense, approaching expirations and the first projected
  negative week under zero additional income.
- Add an unmaskable `engagement-expired` reason to the last paid week. Time advances through
  that week, then further advancement and the next season are held until every expired
  engagement is renewed or terminated; expiration never silently renews or removes a person.
- Extend the headless weekly scenario and report to use the same generated engagements and
  core-produced expense evidence. The harness does not calculate rates, debit money or maintain
  another debt counter.
- Define the state #20 later includes in `RunSnapshot`: materialized engagements and the
  consecutive-negative-week count. Restoring a run does not re-quote rates and no new RNG stream
  is introduced.

Out of scope: bankruptcy or any terminal outcome (#32); contest rewards or contest integration
(#45); joint tuning of opening money, initial terms, activity income and rewards (#52);
negotiations, transfer offers, bonuses, taxes, currencies, prize money, severance, UI and file
persistence. Contest integration must use this single recurring-expense settlement and must not
apply an engagement debit or negative-week count of its own.

Consequence to state plainly: with current content the act-one recurring fund is roughly 43–46
per week against zero opening money and under 70 of total 24-week income, so after PR-2 every
harness policy ends its horizon far in debt. That is the uncalibrated pre-tuning measurement #52
asks for. Until #52 lands, harness money figures are a baseline for tuning, not evidence that a
season is playable, and this change deliberately does not invent opening capital to hide it.

## Capabilities

### New Capabilities

- `engagement-economy`: engagement identity and invariants, deterministic rate quotation,
  inclusive/exclusive term semantics, renewal and termination, expense forecasting, and the
  state inventory later consumed by `RunSnapshot`.

### Modified Capabilities

- `week-loop`: validate current engagements, perform the single recurring settlement after
  activities and recovery, update the final-balance streak, expose expense evidence, and stop
  unmaskably after the last paid week.
- `season-calendar`: carry engagements and the negative-week streak across seasons unchanged and
  hold the next-season boundary while an expired engagement needs resolution.
- `sim-harness`: declare the inputs needed to create initial engagements and report the recurring
  expense and negative-week series produced by core rather than inventing them.

## Impact

The core public surface gains a separate `Engagement` model, rate quotation and lifecycle
operations. `RunState` gains engagements and `consecutiveNegativeWeeks`; `WeekResult` gains the
actual recurring settlement evidence. `Performer`, `PerformerSnapshot`, activity money effects
and `OrgChange` retain their responsibilities. Discipline content gains a required positive base
weekly rate, and the region and discipline schemas make their existing `salaryScale` values
required and positive; loaders map those domain fields to neutral rate inputs without a fallback.

The exact #31 weekly ordering is activity effects, recovery, one aggregated engagement debit,
final-balance streak and reasons, then the existing incident selection. An incident choice is
resolved after the week and affects the next week's opening balance; it does not rewrite the
closed week's streak. #45 remains responsible for choosing whether a contest reward lands before
settlement in its calendar week or after settlement as later money. Either ordering must use this
single settlement and must not apply a second engagement debit or negative-week update.

No starting capital, survival corridor, income amount or reward amount is chosen, and the base
weekly rate is introduced as a required structural input rather than a balanced number. The
formula structure and the existing relative scales belong to #31; #52 owns calibration of the
base rate, those scales and the complete act-one economy after measurement. No accepted ADR is
contradicted: core remains domain-neutral (ADR 0001), rate quotation consumes no randomness and
all continuation state stays explicit (ADR 0002), and rate inputs remain validated content
(ADR 0003).

## Player Experience (MDA / SDT)

The intended experience is rising but predictable financial pressure: retaining stronger people
creates a visible weekly obligation rather than a surprise loss. Engagement rates, fixed terms,
one end-of-week debit and the consecutive-negative-week series should produce a conflict between
using scarce slots for development and using them for income. The meaningful decision is the
composition of the next four-to-six-week plan: develop now, earn now, or mix both while seeing
the scheduled expense, zero-income runway and approaching expirations before committing. The
forecast supplies the obligation side of that comparison, not a prediction of what a plan would
earn.

The loop this change is really building is "grow your own": a rate is materialized for the whole
term, so a performer trained inside it keeps an old price while their value rises, and the debt
only arrives at the renewal boundary, where the same quote reprices them. That is the economic
shape of `docs/design/player.md` §5.5, where raising a talent is the most rewarding path.

This supports autonomy because several activity sequences can respond to the same obligation, and
competence because the forecast must exactly match settlement when membership and terms do not
change. Relatedness is neutral: negotiation, personal demands and relationship consequences are
outside this change. The design has failed if one activity is never worse than every alternative
in both money and development, if adding engagements changes no viable plan, if a trained
performer on an old rate is never economically better than an equivalent performer hired at
today's quote, if the forecast and actual recurring debit diverge without a term change, or if a
week begins without coverage even though the prior week did not return `engagement-expired`.

## Affects

- `packages/core/src/engagement.ts`
- `packages/core/src/generate.ts`
- `packages/core/src/week.ts`
- `packages/core/src/season.ts`
- `packages/core/src/index.ts`
- `packages/core/test/engagement.test.ts`
- `packages/core/test/week.test.ts`
- `packages/core/test/season.test.ts`
- `packages/core/test/property/**`
- `packages/core/test/purity.test.ts`
- `content/schema/region.schema.json`
- `content/schema/discipline.schema.json`
- `content/regions/*.json`
- `content/disciplines/*.json`
- `content/README.md`
- `tools/validate-content/src/index.ts`
- `tools/validate-content/test/validate-content.test.ts`
- `tools/sim-harness/scenarios/*.json`
- `tools/sim-harness/src/content.ts`
- `tools/sim-harness/src/scenario.ts`
- `tools/sim-harness/src/run.ts`
- `tools/sim-harness/src/report.ts`
- `tools/sim-harness/test/**`
- `docs/INDEX.md`
- `openspec/changes/agreements-weekly-expense/**`
- `openspec/specs/engagement-economy/spec.md`
- `openspec/specs/week-loop/spec.md`
- `openspec/specs/season-calendar/spec.md`
- `openspec/specs/sim-harness/spec.md`

Not touched: `docs/design/**`, `docs/adr/**`, `specs/**`, `test/golden/**`,
`sim/baseline/**`, bankruptcy, contest calculation, contest rewards, transfers, negotiations,
bonuses, taxes, currencies, prize money, UI or persistence.
