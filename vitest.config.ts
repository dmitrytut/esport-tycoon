import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts", "tools/**/test/**/*.test.ts"],
    // golden-файлы лежат в репозитории как обычный JSON и сравниваются явно
    // (packages/core/test/golden/*), а не через автоснапшоты vitest:
    // обновление golden — осознанное действие, см. tests/README.md
  },
});
