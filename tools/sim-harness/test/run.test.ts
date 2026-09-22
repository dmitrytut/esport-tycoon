import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { advance, resolveIncident } from "@et/core";
import { describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import { chooseIncidentChoice } from "../src/policy.ts";
import { incidentInputFor, openingState, planBlock, runPolicy, walkBlock } from "../src/run.ts";
import { loadScenario } from "../src/scenario.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const content = loadContent(join(repoRoot, "content"));
const scenario = loadScenario(join(repoRoot, "tools/sim-harness/scenarios/act-one.json"), content);
const smokeScenario = loadScenario(
  join(repoRoot, "tools/sim-harness/scenarios/incidents-smoke.json"),
  content,
);

describe("the horizon walk", () => {
  it("advances exactly the horizon when it is a whole number of blocks", () => {
    const run = runPolicy(scenario, content, "development", 1, 24);

    expect(run.weeks).toHaveLength(24);
    expect(run.weeks.map((week) => week.result.week)).toEqual([...Array(24).keys()]);
    expect(run.state.week).toBe(24);
  });

  it("stops on the horizon when it ends partway through a block", () => {
    const run = runPolicy(scenario, content, "development", 1, 10);

    expect(run.weeks).toHaveLength(10);
    expect(run.state.week).toBe(10);
  });

  it("records a returned control and keeps walking to the horizon", () => {
    const run = runPolicy(scenario, content, "development", 1, 24);

    expect(run.weeks.some((week) => week.returnedControl)).toBe(true);
    expect(run.weeks).toHaveLength(24);
  });

  it("keeps the plan a block made for the weeks after control returned", () => {
    const run = runPolicy(scenario, content, "development", 1, 24);
    const first = run.weeks[0];
    const second = run.weeks[1];
    if (first === undefined || second === undefined) throw new Error("the run is too short");

    // The block was planned before its first week, so the second week carries the plan the
    // block made rather than one derived from the state the first week left behind.
    const blockPlan = planBlock(scenario, "development", run.opening);

    expect(second.planned).toEqual(blockPlan.weeks[1]);
  });

  it("refuses a block that aims an activity at nobody", () => {
    const empty = {
      ...scenario,
      collective: { ...scenario.collective, size: 0 },
      activities: scenario.activities.filter((activity) => activity.target === "member"),
    };

    expect(() => runPolicy(empty, content, "development", 1, 4)).toThrow(/needs a member/);
  });

  it("produces exactly what advancing the block produces", () => {
    const state = openingState(scenario, content, 3);
    const plan = planBlock(scenario, "money", state);

    const walked = walkBlock(state, plan, scenario.masked, plan.weeks.length);
    const advanced = advance(state, plan, { sensitivity: { masked: scenario.masked } });

    const stopIndex = advanced.weeks.length - 1;
    expect(walked.slice(0, advanced.weeks.length).map((week) => week.result)).toEqual(
      advanced.weeks.map((week, index) =>
        index === stopIndex && index === plan.weeks.length - 1
          ? {
              ...week,
              kind: week.kind,
              reasons: week.reasons.filter((reason) => reason.kind !== "block-ran-out"),
            }
          : week,
      ),
    );
    expect(walked[stopIndex]?.state).toEqual(advanced.state);
  });
});

describe("incident resolution inside the walk", () => {
  it("matches block advance before resolution and core's resolution result after", () => {
    const incidentInput = incidentInputFor(smokeScenario, content);
    if (incidentInput === undefined) throw new Error("the smoke scenario must enable incidents");

    const state = openingState(smokeScenario, content, 1);
    const plan = planBlock(smokeScenario, "money", state);

    const walked = walkBlock(state, plan, smokeScenario.masked, plan.weeks.length, incidentInput);
    const advanced = advance(state, plan, {
      sensitivity: { masked: smokeScenario.masked },
      incidentInput,
    });

    // Before the harness resolves anything, the walk equals what block advance itself
    // produces over the same plan, up to and including the week it stopped at.
    expect(walked.slice(0, advanced.weeks.length).map((week) => week.result)).toEqual(
      advanced.weeks,
    );
    const stopped = advanced.weeks[advanced.weeks.length - 1];
    expect(stopped?.reasons.some((reason) => reason.kind === "incident-pending")).toBe(true);

    // After resolution, the harness's recorded post-week state equals core's own public
    // resolution result for the identical pending incident and submitted choice.
    const pending = advanced.state.incidents.pending;
    if (pending === null) throw new Error("the smoke scenario must produce a pending incident");
    const incident = incidentInput.catalog.find((entry) => entry.id === pending.incidentId);
    if (incident === undefined) throw new Error(`unknown incident "${pending.incidentId}"`);

    const resolved = resolveIncident({
      state: advanced.state,
      catalog: incidentInput.catalog,
      choiceId: chooseIncidentChoice(incident.choices),
    });

    const resolvedWeek = walked[advanced.weeks.length - 1];
    expect(resolvedWeek?.state).toEqual(resolved.state);
    expect(resolvedWeek?.resolution).toEqual(resolved.resolution);
  });

  it("preserves the rest of the block's plan after resolving an incident inside it", () => {
    const incidentInput = incidentInputFor(smokeScenario, content);
    if (incidentInput === undefined) throw new Error("the smoke scenario must enable incidents");

    const state = openingState(smokeScenario, content, 1);
    const plan = planBlock(smokeScenario, "money", state);
    const walked = walkBlock(state, plan, smokeScenario.masked, plan.weeks.length, incidentInput);

    expect(walked).toHaveLength(plan.weeks.length);
    expect(walked.map((week) => week.planned)).toEqual(plan.weeks);
  });

  it("produces a resolution within the horizon for every declared smoke seed", () => {
    for (const seed of smokeScenario.seeds) {
      const run = runPolicy(smokeScenario, content, "balanced", seed, smokeScenario.horizon);

      expect(run.weeks).toHaveLength(smokeScenario.horizon);
      expect(run.weeks.some((week) => week.resolution !== undefined)).toBe(true);
    }
  });
});
