import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Collective, Performer } from "@et/core";
import { createRng, generatePerformer } from "@et/core";
import { describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import { chooseIncidentChoice, planWeek } from "../src/policy.ts";
import { loadScenario } from "../src/scenario.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const content = loadContent(join(repoRoot, "content"));
const scenario = loadScenario(join(repoRoot, "tools/sim-harness/scenarios/act-one.json"), content);

function requireOrigin() {
  const found = content.origins.get("western-europe");
  if (found === undefined) throw new Error("the test needs the western-europe region");
  return found;
}

const origin = requireOrigin();

/** Five generated members whose energy is set by the test, ids `m0`..`m4`. */
function collectiveOf(energies: readonly number[]): Collective {
  const rng = createRng(7);
  const members: Performer[] = energies.map((energy, index) => {
    const performer = generatePerformer(rng, { origin, level: 1 });
    return { ...performer, id: `m${index}`, state: { ...performer.state, energy } };
  });
  return { id: "first", name: "First", members };
}

const plannedIds = (planned: readonly { readonly activity: { readonly id: string } }[]): string[] =>
  planned.map((entry) => entry.activity.id);

describe("policies", () => {
  it("puts the largest declared payout first when chasing money", () => {
    const planned = planWeek(
      "money",
      0,
      scenario.activities,
      collectiveOf([80, 80, 80, 80, 80]),
      5,
    );

    expect(plannedIds(planned)).toEqual([
      "ad-campaign",
      "stream-session",
      "rest",
      "training-adaptability",
    ]);
  });

  it("puts the largest declared stat gain first when chasing development", () => {
    const planned = planWeek(
      "development",
      0,
      scenario.activities,
      collectiveOf([80, 80, 80, 80, 80]),
      5,
    );

    expect(plannedIds(planned)).toEqual(["bootcamp", "training-cognitive", "training-composure"]);
  });

  it("alternates on the absolute week, not on the position inside a block", () => {
    const members = collectiveOf([80, 80, 80, 80, 80]);
    const even = planWeek("balanced", 4, scenario.activities, members, 5);
    const odd = planWeek("balanced", 5, scenario.activities, members, 5);

    expect(plannedIds(even)).toEqual(
      plannedIds(planWeek("development", 4, scenario.activities, members, 5)),
    );
    expect(plannedIds(odd)).toEqual(
      plannedIds(planWeek("money", 5, scenario.activities, members, 5)),
    );
  });

  it("assigns every member activity to the freshest person", () => {
    const members = collectiveOf([40, 90, 60, 70, 50]);

    const planned = planWeek("development", 0, scenario.activities, members, 5);
    const aimed = planned.filter((entry) => entry.activity.target === "member");

    expect(aimed.map((entry) => entry.memberId)).toEqual(["m1", "m1"]);
  });

  it("gives every member-aimed activity a member when there are more of them than people", () => {
    const members = collectiveOf([80, 70]);

    const planned = planWeek("development", 0, scenario.activities, members, 6);
    const aimed = planned.filter((entry) => entry.activity.target === "member");

    expect(aimed.length).toBeGreaterThan(members.members.length);
    expect(aimed.every((entry) => entry.memberId !== undefined)).toBe(true);
  });

  it("plans the same week whatever order the activities arrive in", () => {
    const members = collectiveOf([80, 75, 70, 65, 60]);
    const reversed = [...scenario.activities].reverse();

    for (const policy of ["money", "development", "balanced"] as const) {
      expect(planWeek(policy, 3, reversed, members, 5)).toEqual(
        planWeek(policy, 3, scenario.activities, members, 5),
      );
    }
  });
});

describe("a policy's incident choice", () => {
  const directOutcome = { kind: "direct", effects: [] } as const;

  it("submits the first choice id in ascending code-point order", () => {
    const choices = [
      { id: "zulu", label: "Z", detail: "z", outcome: directOutcome },
      { id: "alpha", label: "A", detail: "a", outcome: directOutcome },
      { id: "mango", label: "M", detail: "m", outcome: directOutcome },
    ];

    expect(chooseIncidentChoice(choices)).toBe("alpha");
  });

  it("does not depend on the order choices arrive in", () => {
    const choices = [
      { id: "borrow-a-spare", label: "", detail: "", outcome: directOutcome },
      { id: "power-through", label: "", detail: "", outcome: directOutcome },
    ];

    expect(chooseIncidentChoice(choices)).toBe(chooseIncidentChoice([...choices].reverse()));
  });

  it("refuses an incident with no choices", () => {
    expect(() => chooseIncidentChoice([])).toThrow(/no choices/);
  });
});
