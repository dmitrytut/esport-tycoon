## 1. The audience on the org

- [x] 1.1 Add the audience to `packages/core/src/org.ts`: an `audience` field on `Org`, an
      `audience` field on `OrgChange`, clamped below at zero and never above, trimmed to one
      tenth like the other values. Verify a unit test that an audience effect moves it by
      exactly the declared amount and that an effect past zero settles at zero.
- [x] 1.2 Add `AUDIENCE_HALF_REACH = 50_000` and `reach(org)` to `org.ts`, computed as
      `audience / (audience + AUDIENCE_HALF_REACH)` with no call to `Math.pow`, `Math.log`
      or `Math.exp`. Verify unit tests: reach is 0 at audience 0, exactly 0.5 at the
      half-reach audience, strictly below 1 at a very large audience, and strictly rising
      between two audiences.
- [x] 1.3 Verify the concavity requirement with a unit test: the payout gain from the
      half-reach audience to twice it is strictly larger than the gain from twice it to four
      times it.

## 2. The sixth effect kind and the scaling of money

- [x] 2.1 Add `AudienceEffect` to `packages/core/src/activity.ts` and extend the
      `ActivityEffect` union to six kinds. Verify `pnpm typecheck` and `pnpm lint` pass —
      the switch over effect kinds in `week.ts` must fail to compile until it handles the
      new one, which is what `switch-exhaustiveness-check` is for.
- [x] 2.2 Add the scaling to `MoneyEffect`: a `scale` field over `flat | audience`, optional
      and meaning `flat` when absent. No other effect interface gains it. Verify
      `pnpm typecheck` and `pnpm lint` pass.
- [x] 2.3 Extend `content/schema/activity.schema.json`: `audience` joins the kind enum, and
      `scale` is allowed only on a money effect and only with the values `flat` and
      `audience`. Verify by validating three hand-written files — `scale` on a `stat` effect
      fails, `scale: "viewers"` on money fails listing the allowed scalings, and
      `scale: "audience"` on money passes.
- [x] 2.4 Cover those three cases in
      `tools/validate-content/test/validate-content.test.ts`, each failing one naming the
      offending file. The referential checks in `tools/validate-content/src/index.ts` need
      no change — `scale` refers to no entity — so do not add one. Verify
      `pnpm validate:content` still reports `activities: 11`.

## 3. The week credits what the audience is worth

- [x] 3.1 Resolve a money effect in `packages/core/src/week.ts`: a flat effect contributes
      its amount, an audience-driven effect contributes its base times `reach` of the org as
      it stands at that moment in the week. Verify unit tests for the three scenarios of the
      modified money requirement, including a week that streams first and runs the campaign
      second being paid at the grown audience.
- [x] 3.2 Route an `audience` effect to the org once per execution rather than once per
      participant, next to money and reputation. Verify a unit test that four participants
      and an audience effect of 400 move the audience by 400.
- [x] 3.3 Verify a unit test that a block of weeks with no audience effect leaves the
      audience untouched: nothing drifts, decays or grows on its own.
- [x] 3.4 Export the new surface from `packages/core/src/index.ts`. Verify `pnpm typecheck`
      and `pnpm lint` pass and the export list stays sorted.

## 4. Content and the glossary

- [x] 4.1 Update `content/activities/stream-session.json`: the money effect becomes an
      audience-driven base, the `reputation` effect is replaced by an `audience` effect —
      that stand-in existed only because the fanbase had no kind (`design.md`). Verify
      `pnpm validate:content` passes and the file still matches its `id`.
- [x] 4.2 Update `content/activities/ad-campaign.json`: the money effect becomes an
      audience-driven base of 5000; the morale cost is unchanged. Verify
      `pnpm validate:content` passes.
- [x] 4.3 Add the `Audience` / `Fanbase` row to the core table of `docs/glossary.md`, with
      the domain row naming what the user sees. Verify `pnpm check:language` and
      `pnpm run format:check` stay green.

## 5. Invariants

- [x] 5.1 Extend `packages/core/test/property/arbitraries.ts`: the org arbitrary draws an
      audience across the whole range including zero, and the effect arbitrary produces
      `audience` effects and money effects of both scalings. Verify the existing property
      suites still pass with the pinned seed.
- [x] 5.2 Extend `packages/core/test/property/week.property.test.ts`: the audience never
      goes negative, an audience-driven money effect never credits more than its base, and
      advancing twice from the same state still returns identical results. Verify
      `pnpm test` passes.

## 6. Closing the change

- [x] 6.1 Run `pnpm verify` and fix what it reports. Verify the whole gate is green in one
      run.
- [x] 6.2 Run `openspec archive fanbase-economy -y` on the implementation branch and review
      the diff in `openspec/specs/`. Verify `pnpm validate:spec` passes, the three deltas
      landed, and the change folder has moved under `openspec/changes/archive/`.
- [x] 6.3 Open PR-2 with a filled copy of
      `.github/PULL_REQUEST_TEMPLATE/implementation.md` passed via `-F`. Verify the pull
      request exists and CI is green; the merge itself is the human's action.
