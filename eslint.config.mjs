// Guardrails from ADRs as enforced rules.
// ADR 0001: `packages/core` has no esports vocabulary.
// ADR 0002: randomness and time — only through the injected RNG.
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

/** Domain words forbidden in core. Source — docs/glossary.md. */
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

/** camelCase, snake_case, and plain text are split into words: `pickPlayer` → `pick`, `player`. */
const words = (text) =>
  text
    .split(/[^A-Za-z]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** Rule ADR 0001: catches domain words in names and in core string literals. */
const noDomainWords = {
  meta: {
    type: "problem",
    docs: { description: "core is domain-neutral, see docs/adr/0001" },
    schema: [],
    messages: {
      forbidden:
        '"{{word}}" is an esports term, forbidden in packages/core (ADR 0001). Look up a domain-neutral name in docs/glossary.md.',
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
      // A cast that adds nothing is either garbage or a misunderstood type.
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // `!` silences exactly the check noUncheckedIndexedAccess was enabled for.
      "@typescript-eslint/no-non-null-assertion": "error",
      // A new variant in a union must surface as a compile error, not silently
      // fall through to default. noFallthroughCasesInSwitch does not do that.
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      eqeqeq: ["error", "always"],
      "no-console": "off",
    },
  },
  {
    // Golden and baseline: the directory is fully protected, see .prettierignore and ADR 0010.
    // Correctness rules stay on, style rules are off — otherwise `--fix` would touch
    // files that neither the formatter nor an agent is allowed to touch.
    files: ["**/test/golden/**/*.ts", "**/sim/baseline/**/*.ts"],
    rules: { "simple-import-sort/imports": "off", "simple-import-sort/exports": "off" },
  },
  {
    // Package production code (ADR 0010). Tests and `tools/` live by softer rules:
    // in tests a type assertion is part of the setup, and in `tools/` it sits at the
    // boundary of JSON parsing, where `unknown` can't otherwise be narrowed and validity
    // is checked by ajv.
    files: ["packages/*/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'TSAsExpression:not([typeAnnotation.typeName.name="const"])',
          message:
            "type assertion: the compiler stops checking this spot. Rewrite it so " +
            "the type is inferred (example — statsFrom in performer.ts). `as const` is allowed. " +
            "If the case is provably safe — eslint-disable with an explanation (ADR 0010).",
        },
        {
          selector: "ExportNamedDeclaration > FunctionDeclaration TSTypeLiteral",
          message:
            "anonymous object type in an exported signature: it cannot be reused " +
            "and cannot be named in a spec. Add a named type nearby (ADR 0010).",
        },
        {
          selector: "ExportNamedDeclaration > VariableDeclaration TSTypeLiteral",
          message:
            "anonymous object type in an exported signature: it cannot be reused " +
            "and cannot be named in a spec. Add a named type nearby (ADR 0010).",
        },
      ],
    },
  },
  {
    // Core: domain-neutrality and full determinism.
    files: ["packages/core/**/*.ts"],
    plugins: { et: { rules: { "no-domain-words": noDomainWords } } },
    rules: {
      "et/no-domain-words": "error",
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "core does not know about time: pass the week number (ADR 0002)" },
        { name: "performance", message: "core does not measure time (ADR 0002)" },
        { name: "crypto", message: "randomness only through core's RNG (ADR 0002)" },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "use the injected Rng (ADR 0002)",
        },
        {
          object: "Math",
          property: "sin",
          message: "platform-dependent precision, breaks bit-for-bit reproducibility (ADR 0002)",
        },
        {
          object: "Math",
          property: "cos",
          message: "platform-dependent precision, breaks bit-for-bit reproducibility (ADR 0002)",
        },
        {
          object: "Math",
          property: "tan",
          message: "platform-dependent precision, breaks bit-for-bit reproducibility (ADR 0002)",
        },
        {
          object: "Math",
          property: "exp",
          message: "platform-dependent precision, breaks bit-for-bit reproducibility (ADR 0002)",
        },
        {
          object: "Math",
          property: "log",
          message: "platform-dependent precision, breaks bit-for-bit reproducibility (ADR 0002)",
        },
        {
          object: "Math",
          property: "pow",
          message: "platform-dependent precision, breaks bit-for-bit reproducibility (ADR 0002)",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@et/*", "!@et/core"],
              message: "core does not depend on anything (ADR 0001)",
            },
            {
              group: ["node:*", "fs", "path", "pixi.js"],
              message: "core has no I/O and no rendering (ADR 0008)",
            },
          ],
        },
      ],
    },
  },
  {
    // Core tests check domain-neutrality from the outside, they need file system access.
    files: ["packages/core/test/**/*.ts"],
    rules: { "no-restricted-imports": "off", "et/no-domain-words": "off" },
  },
);
