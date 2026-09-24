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
  for (const dir of [
    "disciplines",
    "traits",
    "events",
    "regions",
    "names",
    "activities",
    "seasons",
    "encounters",
  ]) {
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
const encounter = {
  id: "rimefall-academy",
  label: "Rimefall Academy",
  disciplineId: "tactical-shooter",
  opponent: { originId: "nordics", level: 2 },
  reward: { win: 800, loss: 200, draw: 400 },
};
const discipline = {
  id: "tactical-shooter",
  name: "Tactical Shooter",
  rosterSize: 5,
  statWeights: {
    mechanical: 3,
    cognitive: 1,
    collective: 2,
    composure: 3,
    adaptability: 0,
    presence: 0,
  },
  contest: {
    kind: "head-to-head",
    scoreToWin: 13,
    maxUnits: 24,
    energyCost: 20,
    momentumMeans: "tempo control",
    sideChance: {
      strengthBpsPerDeciPoint: 30,
      momentumBpsPerPoint: 10,
      underdogFloorBps: 4000,
    },
    momentumRetentionBps: 7500,
    slots: [
      { id: "setup", scoring: false },
      { id: "resolution", scoring: true },
    ],
    metrics: [
      { id: "eliminations", label: "Eliminations" },
      { id: "deaths", label: "Deaths" },
    ],
    momentTypes: [
      {
        id: "early-advantage",
        slot: "setup",
        weight: 4,
        momentumShift: 12,
        participantMetricDeltas: { eliminations: 1 },
      },
      {
        id: "clean-conversion",
        slot: "resolution",
        weight: 4,
        momentumShift: 18,
        participantMetricDeltas: { eliminations: 2 },
      },
    ],
  },
  economy: {
    baseWeeklyRate: 1,
    salaryScale: 1,
  },
};
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
const season = {
  id: "standard",
  length: 24,
  markings: {
    contest: { min: 6, max: 8 },
    series: { min: 2, max: 2 },
  },
};
const incidentChoices = [
  {
    id: "call-plumber",
    label: "Call a plumber now",
    detail: "Money now, dry socks by evening.",
    outcome: {
      kind: "direct",
      effects: [
        { kind: "energy", amount: -5 },
        { kind: "money", amount: -400 },
      ],
    },
  },
  {
    id: "wing-it",
    label: "Improvise with towels",
    detail: "The scrim block does not wait for the water works.",
    outcome: {
      kind: "check",
      stat: "presence",
      difficulty: 12,
      successEffects: [{ kind: "morale", amount: 4 }],
      failureEffects: [{ kind: "morale", amount: -6 }],
    },
  },
] as const;

const noConditions = {
  id: "team-house-flood",
  category: "life",
  weight: 4,
  cooldownWeeks: 12,
  text: "{player} wakes up to the sound of the team house's pipe finally giving out.",
  choices: incidentChoices,
} as const;

const baseIncident = {
  ...noConditions,
  conditions: {
    energyBelow: 70,
    moraleBelow: 60,
    requiresTrait: ["night-owl"],
    region: ["nordics"],
    baseWeekKind: ["ordinary", "quiet"],
  },
} as const;

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

  it("accepts the closed head-to-head discipline contract", () => {
    const root = fresh();
    put(root, "disciplines/tactical-shooter.json", discipline);

    const result = run(root);
    expect(result.output).toContain("Content is valid");
    expect(result.code).toBe(0);
  });

  it.each([
    [
      "a missing sixth stat weight",
      {
        ...discipline,
        statWeights: { mechanical: 3, cognitive: 1, collective: 2, composure: 3, presence: 0 },
      },
      "adaptability",
    ],
    [
      "zero total stat weight",
      {
        ...discipline,
        statWeights: {
          mechanical: 0,
          cognitive: 0,
          collective: 0,
          composure: 0,
          adaptability: 0,
          presence: 0,
        },
      },
      "positive total",
    ],
    [
      "a slot id with a leading hyphen",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          slots: [{ id: "-setup", scoring: false }, discipline.contest.slots[1]],
          momentTypes: [
            { ...discipline.contest.momentTypes[0], slot: "-setup" },
            discipline.contest.momentTypes[1],
          ],
        },
      },
      "-setup",
    ],
    [
      "an unsupported contest kind",
      { ...discipline, contest: { ...discipline.contest, kind: "series" } },
      "series",
    ],
    [
      "an invalid score target",
      { ...discipline, contest: { ...discipline.contest, scoreToWin: 1 } },
      "scoreToWin",
    ],
    [
      "a unit cap below the score target",
      { ...discipline, contest: { ...discipline.contest, maxUnits: 12 } },
      "maxUnits",
    ],
    [
      "a unit cap above regulation",
      { ...discipline, contest: { ...discipline.contest, maxUnits: 25 } },
      "maxUnits",
    ],
    [
      "an invalid side-chance bound",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          sideChance: { ...discipline.contest.sideChance, underdogFloorBps: 5000 },
        },
      },
      "underdogFloorBps",
    ],
    [
      "missing scoring slots",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          slots: [
            { id: "setup", scoring: false },
            { id: "resolution", scoring: false },
          ],
        },
      },
      "exactly one scoring slot",
    ],
    [
      "duplicate scoring slots",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          slots: [
            { id: "setup", scoring: true },
            { id: "resolution", scoring: true },
          ],
        },
      },
      "exactly one scoring slot",
    ],
    [
      "a non-final scoring slot",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          slots: [
            { id: "setup", scoring: true },
            { id: "resolution", scoring: false },
          ],
        },
      },
      "last",
    ],
    [
      "a duplicate slot id",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          slots: [
            { id: "setup", scoring: false },
            { id: "setup", scoring: true },
          ],
        },
      },
      'slot id "setup" is duplicated',
    ],
    [
      "an unreachable slot",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          momentTypes: [discipline.contest.momentTypes[0]],
        },
      },
      'slot "resolution" has no Moment type',
    ],
    [
      "a duplicate Moment type id",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          momentTypes: [
            discipline.contest.momentTypes[0],
            { ...discipline.contest.momentTypes[1], id: "early-advantage" },
          ],
        },
      },
      'Moment type id "early-advantage" is duplicated',
    ],
    [
      "an unknown Moment slot",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          momentTypes: [
            discipline.contest.momentTypes[0],
            { ...discipline.contest.momentTypes[1], slot: "overtime" },
          ],
        },
      },
      'slot "overtime"',
    ],
    [
      "a duplicate metric id",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          metrics: [
            discipline.contest.metrics[0],
            { ...discipline.contest.metrics[1], id: "eliminations" },
          ],
        },
      },
      'metric id "eliminations" is duplicated',
    ],
    [
      "an unknown participant metric",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          momentTypes: [
            {
              ...discipline.contest.momentTypes[0],
              participantMetricDeltas: { pressure: 1 },
            },
            discipline.contest.momentTypes[1],
          ],
        },
      },
      'metric "pressure"',
    ],
    [
      "a non-positive Moment weight",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          momentTypes: [
            { ...discipline.contest.momentTypes[0], weight: 0 },
            discipline.contest.momentTypes[1],
          ],
        },
      },
      "weight",
    ],
    [
      "an invalid momentum shift",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          momentTypes: [
            { ...discipline.contest.momentTypes[0], momentumShift: 0 },
            discipline.contest.momentTypes[1],
          ],
        },
      },
      "momentumShift",
    ],
    [
      "an executable field",
      {
        ...discipline,
        contest: {
          ...discipline.contest,
          momentTypes: [
            { ...discipline.contest.momentTypes[0], script: "return momentum + 1" },
            discipline.contest.momentTypes[1],
          ],
        },
      },
      "script",
    ],
    [
      "a legacy series format",
      {
        ...discipline,
        contest: {
          format: "bo3",
          momentumMeans: "tempo control",
          tally: "rounds",
          columns: ["Kills", "Deaths"],
        },
      },
      "format",
    ],
  ])("rejects %s with the offending value", (_label, invalid, expected) => {
    const root = fresh();
    put(root, "disciplines/tactical-shooter.json", invalid);

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/disciplines/tactical-shooter.json");
    expect(result.output).toContain(expected);
  });

  it.each([
    ["a missing base weekly rate", { salaryScale: 1 }],
    ["a zero base weekly rate", { baseWeeklyRate: 0, salaryScale: 1 }],
    ["a negative base weekly rate", { baseWeeklyRate: -1, salaryScale: 1 }],
    ["a missing discipline salary scale", { baseWeeklyRate: 1 }],
    ["a zero discipline salary scale", { baseWeeklyRate: 1, salaryScale: 0 }],
    ["a negative discipline salary scale", { baseWeeklyRate: 1, salaryScale: -1 }],
  ])("rejects %s", (_label, economy) => {
    const root = fresh();
    put(root, "disciplines/tactical-shooter.json", { ...discipline, economy });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it.each([
    ["a missing region salary scale", {}],
    ["a zero region salary scale", { salaryScale: 0 }],
    ["a negative region salary scale", { salaryScale: -1 }],
  ])("rejects %s", (_label, modifiers) => {
    const root = fresh();
    put(root, "regions/nordics.json", { ...region, modifiers });

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

  it("accepts a fully specified incident with conditions, direct and check outcomes", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", trait);
    put(root, "regions/nordics.json", region);
    put(root, "events/team-house-flood.json", baseIncident);

    const result = run(root);
    expect(result.code).toBe(0);
    expect(result.output).toContain("Content is valid");
  });

  it("accepts an incident with an omitted conditions object", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", noConditions);

    const result = run(root);
    expect(result.code).toBe(0);
  });

  it("accepts an incident with an empty conditions object", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", { ...noConditions, conditions: {} });

    const result = run(root);
    expect(result.code).toBe(0);
  });

  it("rejects an empty allow-list inside conditions", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      conditions: { requiresTrait: [] },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects the retired act condition field", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      conditions: { act: [1] },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects the retired weekType condition values", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      conditions: { baseWeekKind: ["match"] },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects an incident missing cooldownWeeks", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      id: noConditions.id,
      category: noConditions.category,
      weight: noConditions.weight,
      text: noConditions.text,
      choices: noConditions.choices,
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("cooldownWeeks");
  });

  it("rejects a negative weight", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", { ...noConditions, weight: -1 });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects duplicate choice ids within one incident", () => {
    const root = fresh();
    const [firstChoice, secondChoice] = noConditions.choices;
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [firstChoice, { ...secondChoice, id: firstChoice.id }],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("duplicat");
  });

  it("rejects incident text missing the {player} token", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      text: "The team house pipe finally gives out and everyone panics about the water damage.",
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("catches a dangling condition reference to a nonexistent trait", () => {
    const root = fresh();
    put(root, "events/late-night.json", {
      ...noConditions,
      id: "late-night",
      conditions: { requiresTrait: ["ghost-trait"] },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("nonexistent traits");
  });

  it("catches a dangling condition reference to a nonexistent region", () => {
    const root = fresh();
    put(root, "events/late-night.json", {
      ...noConditions,
      id: "late-night",
      conditions: { region: ["ghost-region"] },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("nonexistent regions");
  });

  it("rejects a contest/risk-loss effect", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [
        {
          id: "risk-it",
          label: "Risk it",
          detail: "No safety net.",
          outcome: { kind: "direct", effects: [{ kind: "riskLoss", amount: 0.3 }] },
        },
        noConditions.choices[1],
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects a respect effect", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [
        {
          id: "earn-respect",
          label: "Earn it the hard way",
          detail: "Old-school.",
          outcome: { kind: "direct", effects: [{ kind: "respect", amount: 5 }] },
        },
        noConditions.choices[1],
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects trait-mutation fields on a choice outcome", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [
        {
          id: "grow-a-habit",
          label: "Pick up a new habit",
          detail: "Somehow, permanently.",
          outcome: {
            kind: "direct",
            effects: [{ kind: "energy", amount: 1 }],
            addTrait: "night-owl",
          },
        },
        noConditions.choices[1],
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects scaled money on an incident effect", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [
        {
          id: "take-a-cut",
          label: "Take a cut",
          detail: "Percentage-based deal.",
          outcome: {
            kind: "direct",
            effects: [{ kind: "money", amount: 100, scale: "audience" }],
          },
        },
        noConditions.choices[1],
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects a delayed-consequence field on an effect", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [
        {
          id: "wait-for-it",
          label: "Wait for it",
          detail: "Next week's problem.",
          outcome: {
            kind: "direct",
            effects: [{ kind: "morale", amount: -2, delayWeeks: 3 }],
          },
        },
        noConditions.choices[1],
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects an unknown stat key in a direct-outcome stat effect", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [
        {
          id: "aim-boost",
          label: "Grind aim",
          detail: "New trainer, new excuse.",
          outcome: { kind: "direct", effects: [{ kind: "stat", stat: "aim", amount: 2 }] },
        },
        noConditions.choices[1],
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("is not in the list");
  });

  it("rejects an unknown stat key in a check outcome", () => {
    const root = fresh();
    put(root, "events/team-house-flood.json", {
      ...noConditions,
      choices: [
        noConditions.choices[0],
        {
          id: "aim-check",
          label: "Test the new aim trainer",
          detail: "See if it actually helps.",
          outcome: {
            kind: "check",
            stat: "aim",
            difficulty: 10,
            successEffects: [{ kind: "form", amount: 2 }],
            failureEffects: [{ kind: "form", amount: -2 }],
          },
        },
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("is not in the list");
  });

  it("rejects a negative eventWeightBoost multiplier", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", { ...trait, eventWeightBoost: { press: -1 } });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("schema");
  });

  it("rejects an eventWeightBoost category outside the incident category enum", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", { ...trait, eventWeightBoost: { aim: 1.2 } });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("is not in the list");
  });

  it("accepts a valid eventWeightBoost category and value", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", { ...trait, eventWeightBoost: { press: 1.5 } });

    const result = run(root);
    expect(result.code).toBe(0);
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

  it("rejects scale on a non-money effect", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", {
      ...activity,
      effects: [{ kind: "stat", stat: "collective", amount: 0.8, scale: "audience" }],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/activities/bootcamp.json");
  });

  it("rejects an unknown money scale and lists the allowed ones", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", {
      ...activity,
      effects: [{ kind: "money", amount: 5000, scale: "viewers" }],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/activities/bootcamp.json");
    expect(result.output).toContain("[flat, audience]");
  });

  it("accepts audience-scaled money and audience effects", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", {
      ...activity,
      effects: [
        { kind: "money", amount: 5000, scale: "audience" },
        { kind: "audience", amount: 400 },
      ],
    });

    const result = run(root);
    expect(result.code).toBe(0);
  });

  it("rejects an unknown effect kind and lists the allowed ones", () => {
    const root = fresh();
    put(root, "activities/bootcamp.json", {
      ...activity,
      effects: [{ kind: "chemistry", amount: 2 }],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("[stat, energy, morale, money, audience, reputation]");
  });

  it("accepts and counts a complete season template", () => {
    const root = fresh();
    put(root, "seasons/standard.json", season);

    const result = run(root);
    expect(result.code).toBe(0);
    expect(result.output).toContain("seasons: 1");
  });

  it.each([
    ["a non-positive length", { ...season, length: 0 }],
    [
      "a missing marking range",
      { id: season.id, length: season.length, markings: { contest: season.markings.contest } },
    ],
    [
      "a non-integer range value",
      {
        ...season,
        markings: { ...season.markings, contest: { ...season.markings.contest, min: 6.5 } },
      },
    ],
    [
      "a reversed range",
      {
        ...season,
        markings: { ...season.markings, contest: { min: 9, max: 8 } },
      },
    ],
    [
      "maximum markings beyond the season",
      {
        ...season,
        length: 10,
        markings: { contest: { min: 0, max: 8 }, series: { min: 0, max: 3 } },
      },
    ],
  ])("rejects %s", (_label, invalid) => {
    const root = fresh();
    put(root, "seasons/standard.json", invalid);

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/seasons/standard.json");
  });

  it.each([
    ["a missing id", { ...encounter, id: undefined }, 'offending property "id"'],
    ["a missing label", { ...encounter, label: undefined }, 'offending property "label"'],
    [
      "a missing discipline id",
      { ...encounter, disciplineId: undefined },
      'offending property "disciplineId"',
    ],
    ["a missing opponent", { ...encounter, opponent: undefined }, 'offending property "opponent"'],
    [
      "a missing opponent origin",
      { ...encounter, opponent: { level: 2 } },
      'offending property "originId"',
    ],
    [
      "a missing opponent level",
      { ...encounter, opponent: { originId: "nordics" } },
      'offending property "level"',
    ],
    ["a missing reward", { ...encounter, reward: undefined }, 'offending property "reward"'],
    [
      "a missing win amount",
      { ...encounter, reward: { loss: 200, draw: 400 } },
      'offending property "win"',
    ],
    [
      "a missing loss amount",
      { ...encounter, reward: { win: 800, draw: 400 } },
      'offending property "loss"',
    ],
    [
      "a missing draw amount",
      { ...encounter, reward: { win: 800, loss: 200 } },
      'offending property "draw"',
    ],
  ])("rejects %s with the offending property", (_label, invalid, expected) => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", invalid);

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain(expected);
  });

  it.each([
    ["a level below the minimum", { ...encounter.opponent, level: 0 }, "must be >= 1", "value 0"],
    ["a level above the maximum", { ...encounter.opponent, level: 6 }, "must be <= 5", "value 6"],
    ["a non-integer level", { ...encounter.opponent, level: 2.5 }, "must be integer", "value 2.5"],
  ])("rejects %s with the offending value", (_label, opponent, rule, value) => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", { ...encounter, opponent });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain(rule);
    expect(result.output).toContain(value);
  });

  it.each([
    ["win", 0.3],
    ["loss", 100.1],
    ["draw", 400.3],
  ])("accepts an on-grid %s reward of %s", (outcome, amount) => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", {
      ...encounter,
      reward: { ...encounter.reward, [outcome]: amount },
    });

    const result = run(root);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("encounters: 1");
  });

  it.each([
    [
      "a negative win amount",
      { win: -100, loss: 200, draw: 400 },
      "/reward/win must be >= 0",
      "value -100",
    ],
    [
      "a negative loss amount",
      { win: 800, loss: -1, draw: 400 },
      "/reward/loss must be >= 0",
      "value -1",
    ],
    [
      "a negative draw amount",
      { win: 800, loss: 200, draw: -0.1 },
      "/reward/draw must be >= 0",
      "value -0.1",
    ],
    [
      "an off-grid win amount",
      { win: 800.05, loss: 200, draw: 400 },
      "reward.win must be on the one-tenth money grid",
      "value 800.05",
    ],
    [
      "an off-grid loss amount",
      { win: 800, loss: 200.33, draw: 400 },
      "reward.loss must be on the one-tenth money grid",
      "value 200.33",
    ],
    [
      "an off-grid draw amount",
      { win: 800, loss: 200, draw: 400.007 },
      "reward.draw must be on the one-tenth money grid",
      "value 400.007",
    ],
  ])("rejects %s with the offending value", (_label, reward, rule, value) => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", { ...encounter, reward });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain(rule);
    expect(result.output).toContain(value);
  });

  it("rejects an unknown top-level field", () => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", { ...encounter, prizeTier: "elite" });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain('"prizeTier"');
  });

  it("rejects an unknown opponent field", () => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", {
      ...encounter,
      opponent: { ...encounter.opponent, seed: 7 },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain('"seed"');
  });

  it("rejects an unknown reward field", () => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", {
      ...encounter,
      reward: { ...encounter.reward, entryFee: 50 },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain('"entryFee"');
  });

  it("catches a dangling encounter reference to a nonexistent discipline", () => {
    const root = fresh();
    put(root, "regions/nordics.json", region);
    put(root, "encounters/rimefall-academy.json", {
      ...encounter,
      disciplineId: "ghost-discipline",
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain("nonexistent disciplines");
  });

  it("catches a dangling encounter reference to a nonexistent origin", () => {
    const root = fresh();
    put(root, "disciplines/tactical-shooter.json", discipline);
    put(root, "encounters/rimefall-academy.json", {
      ...encounter,
      opponent: { ...encounter.opponent, originId: "ghost-region" },
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("content/encounters/rimefall-academy.json");
    expect(result.output).toContain("nonexistent regions");
  });
});
