#!/usr/bin/env node
// PreToolUse hook: forbids the agent from editing golden and baseline.
//
// Rule from tests/README.md: "If an agent updates a golden file to make a test pass —
// that's a process defect, not a fix." Before this hook, the rule only held at
// pre-commit, meaning it fired only after the agent had already seen a green test
// and reported it as done. Now the action is blocked at the moment it's attempted.
//
// A deliberate shift is still possible: golden is regenerated in a separate commit
// with a golden:/baseline: prefix and an explanation of the mechanism (.githooks/commit-msg).
const PROTECTED = /(^|\/)(tests?\/golden|sim\/baseline)\//;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0); // Couldn't parse the input — not our job to block.
}

const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
if (!PROTECTED.test(target.replaceAll("\\", "/"))) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `File ${target} is a committed simulation snapshot; it is not edited by hand. ` +
        'A red golden means "the simulation drifted": fix the code, not the snapshot. ' +
        "If the shift is intentional — regenerate the file and commit it separately with a " +
        "golden: or baseline: prefix and an explanation of what exactly in the rules shifted the numbers (tests/README.md).",
    },
  }),
);
