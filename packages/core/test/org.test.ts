import { describe, expect, it } from "vitest";

import {
  applyOrgChange,
  AUDIENCE_HALF_REACH,
  reach,
  REPUTATION_MAX,
  REPUTATION_MIN,
} from "../src/org.ts";
import { makeOrg } from "./fixtures.ts";

describe("org", () => {
  it("moves the balance by exactly the declared amount, in both directions", () => {
    const org = makeOrg(1_000);

    expect(applyOrgChange(org, { money: 250 }).money).toBe(1_250);
    expect(applyOrgChange(org, { money: -250 }).money).toBe(750);
  });

  it("lets the balance go negative: debt is a state of the run, not an error", () => {
    expect(applyOrgChange(makeOrg(1_000), { money: -1_500 }).money).toBe(-500);
  });

  it("keeps reputation on its scale", () => {
    const org = makeOrg();

    expect(applyOrgChange(org, { reputation: 1_000 }).reputation).toBe(REPUTATION_MAX);
    expect(applyOrgChange(org, { reputation: -1_000 }).reputation).toBe(REPUTATION_MIN);
  });

  it("moves the audience once and clamps it at zero", () => {
    const org = { ...makeOrg(), audience: 100 };

    expect(applyOrgChange(org, { audience: 400 }).audience).toBe(500);
    expect(applyOrgChange(org, { audience: -1_000 }).audience).toBe(0);
  });

  it("trims audience changes to one tenth", () => {
    expect(applyOrgChange({ ...makeOrg(), audience: 10 }, { audience: 0.26 }).audience).toBe(10.3);
  });

  it("turns audience into a rising reach below one", () => {
    expect(reach({ ...makeOrg(), audience: 0 })).toBe(0);
    expect(reach({ ...makeOrg(), audience: AUDIENCE_HALF_REACH })).toBe(0.5);
    expect(reach({ ...makeOrg(), audience: AUDIENCE_HALF_REACH * 2 })).toBeGreaterThan(0.5);
    expect(reach({ ...makeOrg(), audience: 1_000_000_000 })).toBeLessThan(1);
  });

  it("gives less payout gain to the second audience doubling", () => {
    const at = (audience: number): number => reach({ ...makeOrg(), audience });
    const half = at(AUDIENCE_HALF_REACH);
    const twice = at(AUDIENCE_HALF_REACH * 2);
    const fourTimes = at(AUDIENCE_HALF_REACH * 4);

    expect(twice - half).toBeGreaterThan(fourTimes - twice);
  });

  it("leaves the org it was given untouched", () => {
    const org = makeOrg(1_000);
    applyOrgChange(org, { money: -400, reputation: 10 });

    expect(org.money).toBe(1_000);
    expect(org.reputation).toBe(50);
  });
});
