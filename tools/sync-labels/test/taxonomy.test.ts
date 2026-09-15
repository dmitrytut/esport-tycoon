import { describe, expect, it } from "vitest";

import type { ActualLabel, DeclaredLabel, Taxonomy } from "../src/taxonomy.ts";
import { checkIssues, compareLabels } from "../src/taxonomy.ts";

const gameplay: DeclaredLabel = {
  name: "gameplay",
  axis: "area",
  color: "1d76db",
  description: "Rules and mechanics of the simulation",
  when: "irrelevant to the comparison",
};

const mechanic: DeclaredLabel = {
  name: "mechanic",
  axis: "kind",
  color: "d93f0b",
  description: "Goes through the spec loop",
  when: "irrelevant to the comparison",
};

const taxonomy: Taxonomy = {
  axes: [
    { name: "area", cardinality: "exactly-one", purpose: "where the work lands" },
    { name: "kind", cardinality: "at-most-one", purpose: "what sort of work" },
    { name: "flow", cardinality: "any", purpose: "where it sits in the queue" },
  ],
  labels: [gameplay, mechanic],
};

const onGitHub = (label: DeclaredLabel): ActualLabel => ({
  name: label.name,
  color: label.color,
  description: label.description,
});

describe("compareLabels", () => {
  it("finds nothing when GitHub matches the declaration", () => {
    expect(compareLabels(taxonomy.labels, taxonomy.labels.map(onGitHub))).toEqual([]);
  });

  it("reports a declared label GitHub does not have", () => {
    expect(compareLabels(taxonomy.labels, [onGitHub(gameplay)])).toEqual([
      { kind: "missing", name: "mechanic" },
    ]);
  });

  it("reports a label GitHub has and the file does not — the drift this tool exists for", () => {
    const stray: ActualLabel = { name: "wontfix", color: "ffffff", description: "" };
    expect(compareLabels(taxonomy.labels, [...taxonomy.labels.map(onGitHub), stray])).toEqual([
      { kind: "undeclared", name: "wontfix" },
    ]);
  });

  it("reports colour and description separately so the report says what to fix", () => {
    const edited: ActualLabel = { name: "gameplay", color: "000000", description: "whatever" };
    expect(compareLabels([gameplay], [edited])).toEqual([
      { kind: "drifted", name: "gameplay", field: "color", declared: "1d76db", actual: "000000" },
      {
        kind: "drifted",
        name: "gameplay",
        field: "description",
        declared: "Rules and mechanics of the simulation",
        actual: "whatever",
      },
    ]);
  });

  it("treats colour case as noise, because GitHub answers in lower case", () => {
    const shouted: ActualLabel = { ...onGitHub(gameplay), color: "1D76DB" };
    expect(compareLabels([gameplay], [shouted])).toEqual([]);
  });
});

describe("checkIssues", () => {
  it("accepts one area and one kind", () => {
    const issues = [{ number: 1, title: "week loop", labels: ["gameplay", "mechanic"] }];
    expect(checkIssues(taxonomy, issues)).toEqual([]);
  });

  it("accepts an area with no kind, because kind is at-most-one", () => {
    const issues = [{ number: 1, title: "tracking", labels: ["gameplay"] }];
    expect(checkIssues(taxonomy, issues)).toEqual([]);
  });

  it("rejects an issue with no area", () => {
    const issues = [{ number: 2, title: "unlabelled", labels: ["mechanic"] }];
    expect(checkIssues(taxonomy, issues)).toHaveLength(1);
    expect(checkIssues(taxonomy, issues)[0]?.problem).toContain("no area label");
  });

  it("rejects two labels of an exactly-one axis", () => {
    const wide: Taxonomy = { ...taxonomy, labels: [gameplay, { ...mechanic, axis: "area" }] };
    const issues = [{ number: 3, title: "both", labels: ["gameplay", "mechanic"] }];
    expect(checkIssues(wide, issues)[0]?.problem).toContain("2 area labels");
  });

  it("names an undeclared label worn by an issue", () => {
    const issues = [{ number: 4, title: "stray", labels: ["gameplay", "urgent"] }];
    const problems = checkIssues(taxonomy, issues).map((violation) => violation.problem);
    expect(problems.some((problem) => problem.includes('"urgent"'))).toBe(true);
  });
});
