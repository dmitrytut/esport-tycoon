// Guardrails из ADR как исполняемые правила.
// ADR 0001: в `packages/core` нет киберспортивного словаря.
// ADR 0002: случайность и время — только через инжектированный RNG.
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

/** Доменные слова, запрещённые в ядре. Источник — docs/glossary.md. */
const FORBIDDEN_CORE_WORDS = [
  "player",
  "match",
  "team",
  "tournament",
  "frag",
  "roster",
  "lineup",
  "esport",
  "moba",
  "shooter",
  "coach",
  "sponsor",
];

const FORBIDDEN = new Set(FORBIDDEN_CORE_WORDS);

/** camelCase, snake_case и обычный текст режем на слова: `pickPlayer` → `pick`, `player`. */
const words = (text) =>
  text
    .split(/[^A-Za-z]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** Правило ADR 0001: ловит доменные слова в именах и в строковых литералах ядра. */
const noDomainWords = {
  meta: {
    type: "problem",
    docs: { description: "ядро домен-нейтрально, см. docs/adr/0001" },
    schema: [],
    messages: {
      forbidden:
        "«{{word}}» — киберспортивный термин, в packages/core запрещён (ADR 0001). Домен-нейтральное имя ищи в docs/glossary.md.",
    },
  },
  create(context) {
    const report = (node, text) => {
      for (const word of words(text)) {
        const stem = word.endsWith("s") ? word.slice(0, -1) : word;
        if (FORBIDDEN.has(word) || FORBIDDEN.has(stem)) {
          context.report({ node, messageId: "forbidden", data: { word } });
          return;
        }
      }
    };
    return {
      Identifier: (node) => report(node, node.name),
      PrivateIdentifier: (node) => report(node, node.name),
      Literal: (node) => {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement: (node) => report(node, node.value.raw),
    };
  },
};

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "content/**", "docs/**"] },
  tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mts"],
    plugins: { "simple-import-sort": simpleImportSort },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      // Каст, который ничего не даёт, — это либо мусор, либо непонятый тип.
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // `!` глушит ровно ту проверку, ради которой включён noUncheckedIndexedAccess.
      "@typescript-eslint/no-non-null-assertion": "error",
      // Новый вариант в объединении обязан всплыть ошибкой компиляции, а не тихо
      // провалиться в default. noFallthroughCasesInSwitch этого не делает.
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      eqeqeq: ["error", "always"],
      "no-console": "off",
    },
  },
  {
    // Golden и baseline: каталог защищён целиком, см. .prettierignore и ADR 0010.
    // Правила корректности остаются, стилевые выключены — иначе `--fix` трогал бы
    // файлы, которые форматтеру и агенту трогать запрещено.
    files: ["**/test/golden/**/*.ts", "**/sim/baseline/**/*.ts"],
    rules: { "simple-import-sort/imports": "off", "simple-import-sort/exports": "off" },
  },
  {
    // Ядро: домен-нейтральность и полный детерминизм.
    files: ["packages/core/**/*.ts"],
    plugins: { et: { rules: { "no-domain-words": noDomainWords } } },
    rules: {
      "et/no-domain-words": "error",
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "ядро не знает про время: передавай номер недели (ADR 0002)" },
        { name: "performance", message: "ядро не измеряет время (ADR 0002)" },
        { name: "crypto", message: "случайность только через RNG ядра (ADR 0002)" },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "используй инжектированный Rng (ADR 0002)" },
        {
          object: "Math",
          property: "sin",
          message: "платформо-зависимая точность, ломает бит-в-бит (ADR 0002)",
        },
        {
          object: "Math",
          property: "cos",
          message: "платформо-зависимая точность, ломает бит-в-бит (ADR 0002)",
        },
        {
          object: "Math",
          property: "tan",
          message: "платформо-зависимая точность, ломает бит-в-бит (ADR 0002)",
        },
        {
          object: "Math",
          property: "exp",
          message: "платформо-зависимая точность, ломает бит-в-бит (ADR 0002)",
        },
        {
          object: "Math",
          property: "log",
          message: "платформо-зависимая точность, ломает бит-в-бит (ADR 0002)",
        },
        {
          object: "Math",
          property: "pow",
          message: "платформо-зависимая точность, ломает бит-в-бит (ADR 0002)",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@et/*", "!@et/core"], message: "ядро ни от чего не зависит (ADR 0001)" },
            {
              group: ["node:*", "fs", "path", "pixi.js"],
              message: "ядро без ввода-вывода и без рендера (ADR 0008)",
            },
          ],
        },
      ],
    },
  },
  {
    // Тесты ядра проверяют домен-нейтральность снаружи, им доступ к файловой системе нужен.
    files: ["packages/core/test/**/*.ts"],
    rules: { "no-restricted-imports": "off", "et/no-domain-words": "off" },
  },
);
