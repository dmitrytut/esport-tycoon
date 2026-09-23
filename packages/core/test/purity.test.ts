import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Core must remain pure logic (ADR 0001, ADR 0008). The linter checks the code,
// this test checks packaging: a dependency that leaks into the manifest breaks both the
// headless run and porting core to another shell.
describe("core purity", () => {
  it("@et/core has no runtime dependencies", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const fields = manifest as Record<string, unknown>;
    expect(fields["dependencies"]).toBeUndefined();
    expect(fields["peerDependencies"]).toBeUndefined();
    expect(fields["optionalDependencies"]).toBeUndefined();
  });
});

// ADR 0002: the simulation draws randomness and time from nothing but its injected stream.
// The linter says the same thing, and this says it once more from the outside: a rule can be
// switched off for a line with a comment, a test cannot.
const AMBIENT = [
  { what: "Math.random", pattern: /\bMath\s*\.\s*random\b/ },
  { what: "Date.now", pattern: /\bDate\s*\.\s*now\b/ },
  { what: "new Date", pattern: /\bnew\s+Date\b/ },
  { what: "performance.now", pattern: /\bperformance\s*\.\s*now\b/ },
  { what: "crypto", pattern: /\bcrypto\s*\.\s*\w/ },
] as const;

describe("core determinism", () => {
  const sourceDir = new URL("../src/", import.meta.url);
  const files = readdirSync(sourceDir).filter((name) => name.endsWith(".ts"));

  it("has modules to check", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("season.ts");
    expect(files).toContain("engagement.ts");
  });

  for (const file of files) {
    it(`${file} reads neither a system generator nor a clock`, () => {
      const source = readFileSync(new URL(file, sourceDir), "utf8");
      for (const { what, pattern } of AMBIENT) {
        expect(`${file}: ${pattern.test(source) ? what : "clean"}`).toBe(`${file}: clean`);
      }
    });
  }
});
