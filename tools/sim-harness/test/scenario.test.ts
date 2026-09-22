import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import { loadScenario } from "../src/scenario.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const content = loadContent(join(repoRoot, "content"));
const actOne = join(repoRoot, "tools/sim-harness/scenarios/act-one.json");

let created: string[] = [];
afterEach(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created = [];
});

/** Writes a scenario built from the shipped one with a field replaced. */
function scenarioWith(changes: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "et-sim-scenario-"));
  created.push(root);
  const path = join(root, "broken.json");
  writeFileSync(
    path,
    JSON.stringify({
      id: "broken",
      org: { money: 0, audience: 0, reputation: 10, slots: 5 },
      collective: { originId: "western-europe", size: 5, level: 1, minAge: 16, maxAge: 22 },
      activities: ["rest"],
      blockWeeks: 4,
      masked: [],
      seeds: [1, 2, 3, 4, 5],
      horizon: 24,
      ...changes,
    }),
  );
  return path;
}

describe("a run's scenario", () => {
  it("resolves the activities it names into content", () => {
    const scenario = loadScenario(actOne, content);

    expect(scenario.id).toBe("act-one");
    expect(scenario.activities.length).toBeGreaterThan(0);
    expect(scenario.activities.map((activity) => activity.id)).toContain("stream-session");
    expect(scenario.org.slots).toBe(5);
    expect(scenario.masked).toEqual([]);
    expect(scenario.seeds).toEqual([1, 2, 3, 4, 5]);
    expect(scenario.horizon).toBe(24);
  });

  it("refuses an activity the content tree does not define", () => {
    const path = scenarioWith({ activities: ["rest", "ghost-activity"] });

    expect(() => loadScenario(path, content)).toThrow(
      /broken.*ghost-activity|ghost-activity.*broken/s,
    );
  });

  it("refuses a duplicate activity before planning", () => {
    const path = scenarioWith({ activities: ["rest", "rest"] });

    expect(() => loadScenario(path, content)).toThrow(/broken.*rest.*more than once/s);
  });

  it("refuses a block the week loop would reject", () => {
    const path = scenarioWith({ blockWeeks: 3 });

    expect(() => loadScenario(path, content)).toThrow(/broken.*3|3.*broken/s);
  });

  it("refuses a mask over a reason the user may not miss", () => {
    const path = scenarioWith({ masked: ["incident-pending"] });

    expect(() => loadScenario(path, content)).toThrow(/incident-pending/);
  });

  it("refuses an origin no region defines", () => {
    const path = scenarioWith({
      collective: { originId: "atlantis", size: 5, level: 1, minAge: 16, maxAge: 22 },
    });

    expect(() => loadScenario(path, content)).toThrow(/atlantis/);
  });

  it("omits incident configuration by default, so a run advances without incidents", () => {
    const scenario = loadScenario(actOne, content);

    expect(scenario.incidents).toBeUndefined();
  });

  it("resolves a declared incident configuration to a catalog and cadence", () => {
    const path = scenarioWith({
      incidents: { ids: ["gear-malfunction-mid-scrim", "sponsor-audit-surprise"], cadence: 1 },
    });
    const scenario = loadScenario(path, content);

    expect(scenario.incidents?.cadence).toBe(1);
    expect(scenario.incidents?.catalog.map((incident) => incident.id)).toEqual([
      "gear-malfunction-mid-scrim",
      "sponsor-audit-surprise",
    ]);
  });

  it("refuses an incident id content does not define", () => {
    const path = scenarioWith({ incidents: { ids: ["ghost-incident"], cadence: 1 } });

    expect(() => loadScenario(path, content)).toThrow(
      /broken.*ghost-incident|ghost-incident.*broken/s,
    );
  });

  it("refuses a repeated incident id", () => {
    const path = scenarioWith({
      incidents: {
        ids: ["gear-malfunction-mid-scrim", "gear-malfunction-mid-scrim"],
        cadence: 1,
      },
    });

    expect(() => loadScenario(path, content)).toThrow(
      /broken.*gear-malfunction-mid-scrim.*more than once/s,
    );
  });

  it("refuses an incident cadence above one", () => {
    const path = scenarioWith({
      incidents: { ids: ["gear-malfunction-mid-scrim"], cadence: 1.5 },
    });

    expect(() => loadScenario(path, content)).toThrow(/broken.*1\.5|1\.5.*broken/s);
  });

  it("refuses a negative incident cadence", () => {
    const path = scenarioWith({
      incidents: { ids: ["gear-malfunction-mid-scrim"], cadence: -0.1 },
    });

    expect(() => loadScenario(path, content)).toThrow(/broken.*-0\.1|-0\.1.*broken/s);
  });
});
