import { readFileSync } from "node:fs";

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
