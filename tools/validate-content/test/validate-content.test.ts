import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const entryPath = join(repoRoot, "tools/validate-content/src/index.ts");

interface RunResult {
  readonly code: number;
  readonly output: string;
}

/**
 * The validator is run as a process: this checks the same thing CI and the git hook
 * see, together with the exit code.
 */
function run(contentRoot: string): RunResult {
  try {
    const output = execFileSync(process.execPath, [entryPath, contentRoot], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (cause) {
    const failure = cause as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? -1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

/** An empty content set with the project's real schemas. */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "et-content-"));
  cpSync(join(repoRoot, "content/schema"), join(root, "schema"), { recursive: true });
  for (const dir of ["disciplines", "traits", "events", "regions", "names", "activities"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  return root;
}

const put = (root: string, path: string, value: unknown): void =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2));

const trait = {
  id: "night-owl",
  name: "Night Owl",
  polarity: "mixed",
  description: "Sleeps at dawn, plays at night.",
};
const region = { id: "nordics", name: "Nordics", language: "sv", modifiers: { salaryScale: 1 } };
const activity = {
  id: "bootcamp",
  name: "Bootcamp",
  slots: 3,
  energy: 60,
  target: "collective",
  effects: [
    { kind: "stat", stat: "collective", amount: 0.8 },
    { kind: "morale", amount: 10 },
  ],
};

let created: string[] = [];
afterEach(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created = [];
});

const fresh = (): string => {
  const root = sandbox();
  created.push(root);
  return root;
};

describe("content validator (ADR 0003)", () => {
  it("accepts a consistent set", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", trait);
    put(root, "regions/nordics.json", region);

    const result = run(root);
    expect(result.output).toContain("Content is valid");
    expect(result.code).toBe(0);
  });

  it("catches a schema violation", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", { ...trait, polarity: "chaotic" });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("catches an id/file-name mismatch", () => {
    const root = fresh();
    put(root, "traits/owl.json", trait);

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("does not match the file name");
  });

  it("catches a dangling event reference to a nonexistent trait", () => {
    const root = fresh();
    put(root, "events/late-night.json", {
      id: "late-night",
      category: "life",
      weight: 5,
      triggers: { requiresTrait: ["ghost-trait"] },
      text: "Someone streamed until sunrise again and the scrim block starts in four hours.",
      choices: [
        { label: "Let it slide", effects: { morale: 2 } },
        { label: "Bench him", effects: { morale: -5 } },
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("nonexistent traits");
  });

  it("catches a nonexistent stat in choice effects", () => {
    const root = fresh();
    put(root, "events/aim-lab.json", {
      id: "aim-lab",
      category: "life",
      weight: 5,
      text: "The rookie found a new aim trainer and now refuses to touch anything else all week.",
      choices: [
        { label: "Let him grind", effects: { statDelta: { aim: 2 } } },
        { label: "Back to scrims", effects: { morale: -2 } },
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("is not in the list");
  });

  it("catches a region reference to a missing name pool", () => {
    const root = fresh();
    put(root, "regions/nordics.json", { ...region, namePools: ["sv-given"] });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("nonexistent names");
  });

  it("catches a duplicate id within a type", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", trait);
    put(root, "traits/night-owl-copy.json", { ...trait, id: "night-owl" });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/duplicated|does not match the file name/);
  });

  it("accepts an activity and counts it in the report", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", activity);

    const result = run(root);
    expect(result.code).toBe(0);
    expect(result.output).toContain("activities: 1");
  });

  it("catches an activity reference to a missing discipline", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", { ...activity, disciplines: ["ghost-discipline"] });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/activities/bootcamp.json");
    expect(result.output).toContain("nonexistent disciplines");
  });

  it("catches an unknown stat in an activity effect", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", {
      ...activity,
      effects: [{ kind: "stat", stat: "aim", amount: 0.8 }],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/activities/bootcamp.json");
    expect(result.output).toContain('"aim" is not in the list');
  });

  it("rejects an unknown effect kind and lists the allowed ones", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", {
      ...activity,
      effects: [{ kind: "chemistry", amount: 2 }],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("[stat, energy, morale, money, reputation]");
  });
});
