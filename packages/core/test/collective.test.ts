import { describe, expect, it } from "vitest";

import { collectiveMorale, participantsOf } from "../src/collective.ts";
import { executeWeek } from "../src/week.ts";
import { makeActivity, makeCollective, makePerformer, makeState } from "./fixtures.ts";

const four = ["a", "b", "c", "d"].map((id) => makePerformer(id, 80, 80));

describe("collective morale", () => {
  it("follows its worst member: below the mean, above the lowest", () => {
    const collective = makeCollective([...four, makePerformer("e", 80, 10)]);
    // mean 66, lowest 10 — one furious member is visible without sinking everyone.
    const morale = collectiveMorale(collective);

    expect(morale).toBe(44);
    expect(morale).toBeLessThan(66);
    expect(morale).toBeGreaterThan(10);
  });

  it("is a plain mean when every member agrees", () => {
    expect(collectiveMorale(makeCollective(four))).toBe(80);
  });

  it("answers 0 for an empty collective: there is nobody to be happy", () => {
    expect(collectiveMorale(makeCollective([]))).toBe(0);
  });

  it("re-derives from the members a collective-wide effect moved", () => {
    const collective = makeCollective([...four, makePerformer("e", 80, 60)]);
    const before = collectiveMorale(collective);
    const lift = makeActivity({
      id: "bonding",
      target: "collective",
      effects: [{ kind: "morale", amount: 6 }],
    });

    const after = executeWeek(makeState(collective), [{ activity: lift }]).state.collective;

    expect(after.members.map((member) => member.state.morale)).toEqual([86, 86, 86, 86, 66]);
    expect(collectiveMorale(after)).toBe(before + 6);
  });
});

describe("participant selection", () => {
  it("aims a collective activity at everyone", () => {
    const collective = makeCollective(four);
    const activity = makeActivity({ id: "scrim", target: "collective" });

    expect(participantsOf(collective, activity)).toHaveLength(4);
  });

  it("aims a member activity at the one named, and at nobody when the name is unknown", () => {
    const collective = makeCollective(four);
    const activity = makeActivity({ id: "drill", target: "member" });

    expect(participantsOf(collective, activity, "b").map((member) => member.id)).toEqual(["b"]);
    expect(participantsOf(collective, activity, "z")).toHaveLength(0);
  });
});
