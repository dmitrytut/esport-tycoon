#!/usr/bin/env node
// Stop hook: doesn't let the turn end until `pnpm verify` is green.
//
// AI-native SDLC playbook: a session must have a way to check its own work before
// a human sees it. The gate is the same one for the agent, pre-commit, and CI.
//
// Only runs if the working tree has uncommitted changes that the gate can actually
// check: sources, content, toolchain configs, spec artifacts. A turn where the agent
// changed nothing doesn't pay the four seconds.

import { execFileSync } from "node:child_process";

const RELEVANT =
  /\.(ts|mts)$|^content\/|^openspec\/|^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts|eslint\.config\.mjs|\.prettierrc\.json|\.prettierignore|\.editorconfig)$/;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

// Claude Code is already continuing the turn because of this hook — don't intervene twice.
if (input.stop_hook_active) process.exit(0);

const cwd = input.cwd || process.cwd();
const run = (file, args) =>
  execFileSync(file, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let changed;
try {
  changed = run("git", ["status", "--porcelain"])
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((path) => path && RELEVANT.test(path));
} catch {
  process.exit(0); // Not a git directory — nothing to check.
}

if (changed.length === 0) process.exit(0);

try {
  run("pnpm", ["run", "verify"]);
  process.exit(0);
} catch (error) {
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trimEnd();
  const tail = output.split("\n").slice(-40).join("\n");
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "`pnpm verify` is failing, the work isn't done. Fix the code, not the check: " +
        "don't delete tests, skip them, or weaken them.\n\n" +
        tail,
    }),
  );
}
