/**
 * Label gate: `.github/labels.json` is the source, GitHub is the copy.
 *
 * Without it the taxonomy is prose, and prose drifts — a label invented in a hurry looks
 * exactly like a declared one a month later. This compares both the label set and the way
 * issues wear it, and `--apply` pushes the file's version to GitHub.
 *
 * Not part of `pnpm verify`: the gate is offline and deterministic, this needs the network
 * and an authenticated `gh`. Run it by hand or on a schedule.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ActualLabel, DeclaredLabel, IssueLabels, Taxonomy } from "./taxonomy.ts";
import { checkIssues, compareLabels } from "./taxonomy.ts";

const DECLARATION = fileURLToPath(new URL("../../../.github/labels.json", import.meta.url));

const apply = process.argv.includes("--apply");

/** Runs `gh` and returns stdout. A failure here is fatal: a half-read state is worse than none. */
function gh(args: readonly string[]): string {
  return execFileSync("gh", [...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

const taxonomy = JSON.parse(readFileSync(DECLARATION, "utf8")) as Taxonomy;
const actual = JSON.parse(
  gh(["label", "list", "--limit", "200", "--json", "name,color,description"]),
) as ActualLabel[];
/** The slice of an issue `gh issue list --json` returns: enough to name it and label it. */
interface IssueOnGitHub {
  /** The issue number. */
  readonly number: number;
  /** Its title, so a violation reads without opening the tracker. */
  readonly title: string;
  /** Labels arrive as objects; only the name matters here. */
  readonly labels: ReadonlyArray<{ readonly name: string }>;
}

const issues = JSON.parse(
  gh(["issue", "list", "--state", "open", "--limit", "200", "--json", "number,title,labels"]),
) as readonly IssueOnGitHub[];

const worn: readonly IssueLabels[] = issues.map((issue) => ({
  number: issue.number,
  title: issue.title,
  labels: issue.labels.map((label) => label.name),
}));

const differences = compareLabels(taxonomy.labels, actual);
const violations = checkIssues(taxonomy, worn);

if (apply) {
  const byName = new Map<string, DeclaredLabel>(
    taxonomy.labels.map((label) => [label.name, label]),
  );
  const pushed = new Set<string>();
  for (const difference of differences) {
    if (difference.kind === "undeclared") continue;
    if (pushed.has(difference.name)) continue;
    const label = byName.get(difference.name);
    if (label === undefined) continue;
    const verb = difference.kind === "missing" ? "create" : "edit";
    gh([
      "label",
      verb,
      label.name,
      "--color",
      label.color,
      "--description",
      label.description,
      ...(verb === "edit" ? [] : ["--force"]),
    ]);
    pushed.add(label.name);
    console.log(`${verb === "create" ? "created" : "updated"} ${label.name}`);
  }
  const undeclared = differences.filter((difference) => difference.kind === "undeclared");
  if (undeclared.length > 0) {
    console.log("\nLeft alone — deleting a label strips it from every issue wearing it:");
    for (const difference of undeclared) {
      console.log(`  ${difference.name} — declare it in .github/labels.json or delete it by hand`);
    }
  }
  process.exit(0);
}

for (const difference of differences) {
  if (difference.kind === "missing") {
    console.error(`  missing on GitHub: ${difference.name} — run pnpm labels:apply`);
  } else if (difference.kind === "undeclared") {
    console.error(
      `  not declared: ${difference.name} — add it to .github/labels.json or delete it`,
    );
  } else {
    console.error(
      `  drifted: ${difference.name}.${difference.field} is "${difference.actual}", declared "${difference.declared}"`,
    );
  }
}

for (const violation of violations) {
  console.error(`  #${violation.number} ${violation.title}: ${violation.problem}`);
}

if (differences.length > 0 || violations.length > 0) {
  console.error(
    `\n${differences.length} label difference(s), ${violations.length} issue violation(s). ` +
      "The file is the source: fix GitHub with pnpm labels:apply, or change the declaration.",
  );
  process.exit(1);
}

console.log(
  `Labels match the declaration: ${taxonomy.labels.length} labels on ${taxonomy.axes.length} axes, ` +
    `${worn.length} open issue(s) labelled correctly.`,
);
