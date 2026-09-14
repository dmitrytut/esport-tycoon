import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts", "tools/**/test/**/*.test.ts"],
    // Pins the fast-check seed for every property test, see tests/setup/fast-check.ts.
    setupFiles: ["tests/setup/fast-check.ts"],
    // golden files live in the repo as plain JSON and are compared explicitly
    // (packages/core/test/golden/*), not via vitest's automatic snapshots:
    // updating golden is a deliberate action, see tests/README.md
  },
});
