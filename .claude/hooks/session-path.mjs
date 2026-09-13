#!/usr/bin/env node
// SessionStart hook: puts workspace binaries on the session PATH.
//
// The /opsx:* skills call `openspec` as a bare command, but in a pnpm workspace
// node_modules/.bin is only available inside `pnpm run` and `pnpm exec`. Installing
// the package globally is not allowed: a second copy would appear next to the
// version pinned in devDependencies, and they'd drift apart. Instead we extend
// PATH for exactly the duration of the session.
//
// The path is taken from the input JSON's cwd, not from CLAUDE_PROJECT_DIR: in a
// worktree, CLAUDE_PROJECT_DIR stays in the main checkout, while dependencies are
// installed in the worktree itself.

import { existsSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.env["CLAUDE_ENV_FILE"];
if (!envFile) process.exit(0);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let cwd = process.cwd();
try {
  cwd = JSON.parse(raw || "{}").cwd || cwd;
} catch {
  /* input didn't parse — work from the current directory */
}

const bin = resolve(cwd, "node_modules/.bin");
if (!existsSync(bin)) process.exit(0); // Dependencies not installed yet.

// The path goes into a file the shell later executes, so single quotes with
// escaping: a directory containing a quote or backtick must not turn into a command.
const quoted = `'${bin.replaceAll("'", "'\\''")}'`;
appendFileSync(envFile, `export PATH=${quoted}:"$PATH"\n`);
