// Language gate (ADR 0011): every tracked file is English except the allowed layers below.
// Prose rules drift; this one does not. Run from `pnpm verify`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CYRILLIC = /[\u0400-\u04FF]/;
const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp3|ogg|wav|zip|pdf)$/i;

// Russian stays where it earns its place. Every entry needs a reason, not a habit.
const ALLOWED: ReadonlyArray<{ readonly prefix: string; readonly reason: string }> = [
  { prefix: "docs/design/", reason: "intent layer: written and read by the author (ADR 0011)" },
  { prefix: "content/names/ru-", reason: "name pool data for the CIS region (ADR 0003)" },
  { prefix: "specs/", reason: "retired format, replaced change by change (ADR 0009)" },
  {
    prefix: "packages/core/test/golden/",
    reason: "snapshots are protected from edits by the PreToolUse hook (ADR 0009)",
  },
];

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((path) => path.length > 0);

const offenders: Array<{ path: string; line: number; text: string }> = [];

for (const path of tracked) {
  if (ALLOWED.some((entry) => path.startsWith(entry.prefix)) || BINARY.test(path)) continue;
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (!CYRILLIC.test(content)) continue;
  content.split("\n").forEach((text, index) => {
    if (CYRILLIC.test(text)) offenders.push({ path, line: index + 1, text: text.trim() });
  });
}

if (offenders.length > 0) {
  console.error("Cyrillic outside the allowed layers (ADR 0011):\n");
  for (const { path, line, text } of offenders.slice(0, 40)) {
    console.error(`  ${path}:${line}  ${text.slice(0, 90)}`);
  }
  if (offenders.length > 40) console.error(`  … and ${offenders.length - 40} more lines`);
  console.error("\nRussian is allowed only in:");
  for (const { prefix, reason } of ALLOWED) console.error(`  ${prefix} — ${reason}`);
  process.exit(1);
}

console.log(`Language gate passed. Russian confined to ${ALLOWED.length} declared layers.`);
