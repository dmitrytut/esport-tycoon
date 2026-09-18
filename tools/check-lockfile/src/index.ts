/**
 * Read-only lockfile gate: pnpm itself decides whether workspace manifests and the
 * committed lockfile agree, matching the decision made before CI runs `verify`.
 */
import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  pnpm,
  ["install", "--frozen-lockfile", "--lockfile-only", "--ignore-scripts"],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  if (result.error !== undefined) {
    console.error(`Unable to start pnpm: ${result.error.message}`);
  }
  console.error("Lockfile validation failed. Repair it with: pnpm install --fix-lockfile");
  process.exitCode = result.status ?? 1;
}
