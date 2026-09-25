# Open questions

**Design**
- The week screen: the layout is decided in `design/ui.md`; still open is the plan editor
  down to the last tap
- The contest formula: exactly how stat weights turn into the probability of a moment,
  where the spread comes from
- The full list of traits and how they intersect (pair chemistry/conflict)
- Economy balance: real numbers for salaries, prize money, sponsorships
- How many written events a season needs so there are no repeats
- Region languages: the mechanic is described in `specs/0006` (region language, second
  language by chance, lineup chemistry penalty without a shared language). Still open are
  the balance numbers and whether language affects events and morale — the list is in the
  spec itself
- Ladder numbers: invite thresholds, relegation spots beyond the MVP league, the price of a
  broken monitor (`design/ladder.md`, `design/match.md`)

**Production**
- A lawyer on image rights — before likenesses make it into the build; the same review
  covers AI-generated assets and model licences (`adr/0015`)
- Composer or music licensing
- Art volume in numbers: texture resolution, texture memory budget, the act-3 on-screen
  maximum — the ADR for #37, after the #38 device measurement
- Localization: when we start, which languages, and what mechanism. The mechanism hinges
  on the engine (`adr/0000`), the timing on text stabilizing (`adr/0007`)
- How strictly to keep the core subject-neutral in the prototype (section 13) — full
  abstraction slows down the start

**Next design step:** take the week screen from `design/ui.md` down to the last button. Not
the concept — literally the screens and taps.
