import { describe, expect, it } from "vitest";

import { applyOrgChange, REPUTATION_MAX, REPUTATION_MIN } from "../src/org.ts";
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

  it("leaves the org it was given untouched", () => {
    const org = makeOrg(1_000);
    applyOrgChange(org, { money: -400, reputation: 10 });

    expect(org.money).toBe(1_000);
    expect(org.reputation).toBe(50);
  });
});
