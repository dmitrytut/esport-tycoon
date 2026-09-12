import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Ядро обязано оставаться чистой логикой (ADR 0001, ADR 0008). Линтер проверяет код,
// этот тест — упаковку: зависимость, попавшая в манифест, ломает и headless-прогон,
// и перенос ядра на другую оболочку.
describe("чистота ядра", () => {
  it("у @et/core нет рантайм-зависимостей", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const fields = manifest as Record<string, unknown>;
    expect(fields["dependencies"]).toBeUndefined();
    expect(fields["peerDependencies"]).toBeUndefined();
    expect(fields["optionalDependencies"]).toBeUndefined();
  });
});
