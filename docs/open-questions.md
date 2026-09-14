# Open questions

**Design**
- The week screen: exact layout, what goes where, what you tap. All the gaps found so far
  live exactly there, and you can't see them at the level of general words
- The contest formula: exactly how stat weights turn into the probability of a moment,
  where the spread comes from
- The full list of traits and how they intersect (pair chemistry/conflict)
- Economy balance: real numbers for salaries, prize money, sponsorships
- How many written events a season needs so there are no repeats
- Region languages: the mechanic is described in `specs/0006` (region language, second
  language by chance, lineup chemistry penalty without a shared language). Still open are
  the balance numbers and whether language affects events and morale — the list is in the
  spec itself

**Production**
- A lawyer on image rights — before likenesses make it into the build
- One discipline in the prototype or all three at once? (Architecturally — a config from
  day one, content-wise — start with one)
- Composer or music licensing
- Volume of pixel art: base, player portraits, contest-moment animations
- Localization: when we start, which languages, and what mechanism. The mechanism hinges
  on the engine (`adr/0000`), the timing on text stabilizing (`adr/0007`)
- How strictly to keep the core subject-neutral in the prototype (section 13) — full
  abstraction slows down the start

**Next design step:** work through one full week down to the last button. Not the concept —
literally the screens and taps.
