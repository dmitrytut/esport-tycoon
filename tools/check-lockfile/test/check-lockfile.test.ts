import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const entryPath = join(repoRoot, "tools/check-lockfile/src/index.ts");

interface RunResult {
  readonly code: number;
  readonly output: string;
}

/** Runs the real CLI so the test observes pnpm output and the process exit code. */
function run(root: string): RunResult {
  try {
    const output = execFileSync(process.execPath, [entryPath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (cause) {
    const failure = cause as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? -1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

/** Creates the smallest workspace whose lockfile includes every current importer. */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "et-lockfile-"));
  writeFileSync(join(root, "package.json"), '{"private":true,"type":"module"}\n');
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  mkdirSync(join(root, "packages/existing"), { recursive: true });
  writeFileSync(
    join(root, "packages/existing/package.json"),
    '{"name":"@et/existing","version":"0.0.0","private":true}\n',
  );
  writeFileSync(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .: {}\n\n  packages/existing: {}\n",
  );
  return root;
}

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

describe("lockfile checker", () => {
  it("accepts a workspace whose manifests and importers agree", () => {
    const result = run(fresh());

    expect(result).toEqual({ code: 0, output: expect.any(String) });
  });

  it("rejects a new empty workspace package without an importer", () => {
    const root = fresh();
    mkdirSync(join(root, "packages/missing"));
    writeFileSync(
      join(root, "packages/missing/package.json"),
      '{"name":"@et/missing","version":"0.0.0","private":true}\n',
    );

    const result = run(root);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('importers["packages/missing"]');
    expect(result.output).toContain("pnpm install --fix-lockfile");
  });
});
