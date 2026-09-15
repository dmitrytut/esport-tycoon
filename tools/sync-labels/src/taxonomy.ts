/**
 * The label taxonomy as data: what `.github/labels.json` holds, and the pure comparisons
 * that turn it into a verdict.
 *
 * Kept apart from `index.ts` on purpose — everything here is a function of its arguments,
 * so the rules are tested without a network call, and the CLI half stays the only part
 * that knows GitHub exists.
 */

/** Which axis a label belongs to. The axis, not the label, decides how many may be worn. */
export type Axis = "area" | "kind" | "flow";

/** How many labels of one axis an issue may carry. */
export type Cardinality = "exactly-one" | "at-most-one" | "any";

/** One axis of the taxonomy: a group of labels answering the same question. */
export interface DeclaredAxis {
  /** The axis name, referenced by every label that belongs to it. */
  readonly name: Axis;
  /** The rule an issue is held to for this axis. */
  readonly cardinality: Cardinality;
  /** Why the axis exists, in one sentence. Read by a human choosing a label. */
  readonly purpose: string;
}

/** One declared label: what GitHub should show, and when a human should reach for it. */
export interface DeclaredLabel {
  /** The label name as it appears on GitHub. */
  readonly name: string;
  /** The axis it belongs to. */
  readonly axis: Axis;
  /** Six hex digits without a leading `#` — the form `gh label` expects. */
  readonly color: string;
  /** The one-line description GitHub stores. GitHub truncates past 100 characters. */
  readonly description: string;
  /** Longer local guidance. Never sent to GitHub; this file is where it is read. */
  readonly when: string;
}

/** The whole declaration file. The source of truth for what labels exist and why. */
export interface Taxonomy {
  /** The axes, in the order a human should think about them. */
  readonly axes: readonly DeclaredAxis[];
  /** Every label that is allowed to exist on this repository. */
  readonly labels: readonly DeclaredLabel[];
}

/** A label as GitHub currently has it, as reported by `gh label list --json`. */
export interface ActualLabel {
  /** The label name. */
  readonly name: string;
  /** Six hex digits without a leading `#`. */
  readonly color: string;
  /** The description GitHub stores; absent ones arrive as an empty string. */
  readonly description: string;
}

/** Declared in the file but absent on GitHub. Fixed by `--apply`. */
export interface MissingLabel {
  /** Discriminator of the difference union. */
  readonly kind: "missing";
  /** The declared label that has to be created. */
  readonly name: string;
}

/**
 * Present on GitHub but not declared. This is the drift the taxonomy exists to catch, and
 * `--apply` deliberately does not delete it: removing a label strips it from every issue
 * that wears it, and that is a human's call.
 */
export interface UndeclaredLabel {
  /** Discriminator of the difference union. */
  readonly kind: "undeclared";
  /** The label GitHub has and the file does not. */
  readonly name: string;
}

/** Declared and present, but GitHub's copy says something else. Fixed by `--apply`. */
export interface DriftedLabel {
  /** Discriminator of the difference union. */
  readonly kind: "drifted";
  /** Which label drifted. */
  readonly name: string;
  /** Which of the two synchronised fields disagrees. */
  readonly field: "color" | "description";
  /** What the file says. */
  readonly declared: string;
  /** What GitHub says. */
  readonly actual: string;
}

/** One way the repository's label set differs from the declaration. */
export type LabelDifference = MissingLabel | UndeclaredLabel | DriftedLabel;

/** An issue as reported by `gh issue list --json number,title,labels`. */
export interface IssueLabels {
  /** The issue number, used to name the offender in the report. */
  readonly number: number;
  /** Its title, so the report reads without opening the tracker. */
  readonly title: string;
  /** The names of the labels it currently wears. */
  readonly labels: readonly string[];
}

/** An issue breaking one axis rule, or wearing a label nobody declared. */
export interface IssueViolation {
  /** Which issue. */
  readonly number: number;
  /** Its title. */
  readonly title: string;
  /** What is wrong, phrased for the console. */
  readonly problem: string;
}

/** Colour comparison is case-insensitive: GitHub answers in lower case, humans type either. */
function sameColor(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Compares the declared label set against the one GitHub has. Order is stable — missing,
 * then drifted, then undeclared — so the report reads the same on every run and a diff of
 * two runs means something.
 */
export function compareLabels(
  declared: readonly DeclaredLabel[],
  actual: readonly ActualLabel[],
): readonly LabelDifference[] {
  const byName = new Map(actual.map((label) => [label.name, label]));
  const differences: LabelDifference[] = [];

  for (const label of declared) {
    const found = byName.get(label.name);
    if (found === undefined) {
      differences.push({ kind: "missing", name: label.name });
      continue;
    }
    if (!sameColor(found.color, label.color)) {
      differences.push({
        kind: "drifted",
        name: label.name,
        field: "color",
        declared: label.color,
        actual: found.color,
      });
    }
    if (found.description !== label.description) {
      differences.push({
        kind: "drifted",
        name: label.name,
        field: "description",
        declared: label.description,
        actual: found.description,
      });
    }
  }

  const declaredNames = new Set(declared.map((label) => label.name));
  for (const label of actual) {
    if (!declaredNames.has(label.name)) differences.push({ kind: "undeclared", name: label.name });
  }

  return differences;
}

/**
 * Checks how the labels are worn, not just that they exist. An undeclared label on an issue
 * and a broken axis rule are the two ways a taxonomy rots in practice: the set stays tidy
 * while the issues stop meaning anything.
 */
export function checkIssues(
  taxonomy: Taxonomy,
  issues: readonly IssueLabels[],
): readonly IssueViolation[] {
  const axisOf = new Map(taxonomy.labels.map((label) => [label.name, label.axis]));
  const violations: IssueViolation[] = [];

  for (const issue of issues) {
    const unknown = issue.labels.filter((name) => !axisOf.has(name));
    for (const name of unknown) {
      violations.push({
        number: issue.number,
        title: issue.title,
        problem: `wears "${name}", which .github/labels.json does not declare`,
      });
    }

    for (const axis of taxonomy.axes) {
      const worn = issue.labels.filter((name) => axisOf.get(name) === axis.name);
      if (axis.cardinality === "exactly-one" && worn.length !== 1) {
        violations.push({
          number: issue.number,
          title: issue.title,
          problem:
            worn.length === 0
              ? `carries no ${axis.name} label; exactly one is required`
              : `carries ${worn.length} ${axis.name} labels (${worn.join(", ")}); exactly one is required`,
        });
      }
      if (axis.cardinality === "at-most-one" && worn.length > 1) {
        violations.push({
          number: issue.number,
          title: issue.title,
          problem: `carries ${worn.length} ${axis.name} labels (${worn.join(", ")}); at most one is allowed`,
        });
      }
    }
  }

  return violations;
}
