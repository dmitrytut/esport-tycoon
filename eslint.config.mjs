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

/**
 * Rule ADR 0010: a module-level signature must not carry an anonymous object shape.
 *
 * Selector-based attempts fail here: `no-restricted-syntax` uses a descendant combinator,
 * so it fires inside function bodies, and it only sees the two export forms spelled out in
 * the selector — `export default function`, `export class` methods, `export interface`
 * members and `export { f }` after a plain declaration all slip through. The public surface
 * of this repository is declared with interfaces, so those were exactly the misses.
 *
 * Reported: any object type literal in a type position at module level. Allowed: the body of
 * a named type alias (`type Observation = { … }`) — that is how you name a shape.
 */
const noAnonymousShape = {
  meta: {
    type: "problem",
    docs: { description: "named types on the module surface, see docs/adr/0010" },
    schema: [],
    messages: {
      anonymous:
        "anonymous object type on the module surface: it cannot be reused and cannot be " +
        "named in a spec. Declare a named type or interface next to it (ADR 0010).",
    },
  },
  create(context) {
    return {
      TSTypeLiteral(node) {
        // The body of a named alias is the sanctioned way to declare a shape.
        if (node.parent?.type === "TSTypeAliasDeclaration") return;
        // Inside an implementation a local shape is fine — ADR 0010 refuses to ban it.
        for (const ancestor of context.sourceCode.getAncestors(node)) {
          if (ancestor.type === "BlockStatement") return;
        }
        context.report({ node, messageId: "anonymous" });
      },
    };
  },
};

/**
 * Rule ADR 0013: the module surface carries a comment.
 *
 * Presence is checkable, sufficiency is not — so the rule only asks that something was
 * written above an exported declaration or a field of a type, and the prose in
 * `docs/adr/0013` says what makes it worth reading. Without the check, the prose is
 * remembered on the first file of a session and forgotten by the fifth.
 *
 * A comment covers a run of neighbours with no blank line between them: six bounds under
 * one "floating state" header is one idea, not six, and splitting it would produce exactly
 * the restatement noise this rule is supposed to avoid.
 */
const requireComment = {
  meta: {
    type: "problem",
    docs: { description: "commented module surface, see docs/adr/0013" },
    schema: [],
    messages: {
      missing:
        "{{what}} has no comment: say briefly what it is for or which invariant it holds. " +
        "A neighbour on the line above shares its comment (ADR 0013).",
    },
  },
  create(context) {
    const source = context.sourceCode;

    const check = (nodes, what) => {
      const documented = new Map();
      nodes.forEach((node, index) => {
        const before = source.getCommentsBefore(node);
        const trailing = source.getCommentsAfter(node);
        const previous = index > 0 ? nodes[index - 1] : undefined;
        const own =
          (before.length > 0 &&
            before[before.length - 1].loc.end.line >= node.loc.start.line - 1) ||
          (trailing.length > 0 && trailing[0].loc.start.line === node.loc.end.line);
        const shared =
          previous !== undefined &&
          previous.loc.end.line + 1 === node.loc.start.line &&
          previous.type === node.type &&
          documented.get(previous) === true;
        documented.set(node, own || shared);
        if (!own && !shared) context.report({ node, messageId: "missing", data: { what } });
      });
    };

    const EXPORTED = new Set([
      "ClassDeclaration",
      "FunctionDeclaration",
      "TSInterfaceDeclaration",
      "TSTypeAliasDeclaration",
      "TSEnumDeclaration",
      "VariableDeclaration",
    ]);

    return {
      Program(node) {
        const exported = node.body.filter(
          (statement) =>
            (statement.type === "ExportNamedDeclaration" ||
              statement.type === "ExportDefaultDeclaration") &&
            statement.declaration !== null &&
            statement.declaration !== undefined &&
            EXPORTED.has(statement.declaration.type),
        );
        check(exported, "an exported declaration");
      },
      TSInterfaceBody(node) {
        check(node.body, "a field of the type");
      },
      TSTypeLiteral(node) {
        // A shape written on one line is read at a glance; per-field comments there would
        // have to be spread over new lines, which is worse than the shape itself.
        if (node.loc.start.line === node.loc.end.line) return;
        check(node.members, "a field of the type");
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "content/**",
      "docs/**",
      // Worktrees of parallel sessions are a different branch's checkout. Without this
      // `pnpm verify` reddens on someone else's code — in the very workflow CLAUDE.md
      // advertises. `.gitignore` covers prettier, flat config does not read it.
      ".claude/worktrees/**",
    ],
  },
  tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mts"],
    // Plugins are declared once for the whole repository: flat config refuses to
    // redefine a namespace, and per-path blocks only switch rules on.
    plugins: {
      "simple-import-sort": simpleImportSort,
      et: {
        rules: {
          "no-domain-words": noDomainWords,
          "no-anonymous-shape": noAnonymousShape,
          "require-comment": requireComment,
        },
      },
    },
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
    // Every rule with an autofix has to be off here, not just the observed one: `--fix`
    // rewrites whatever it can reach, and this directory is off limits for both the
    // formatter and the agent.
    rules: {
      "simple-import-sort/imports": "off",
      "simple-import-sort/exports": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unused-vars": "off",
      eqeqeq: "off",
      "prefer-const": "off",
      "no-var": "off",
    },
  },
  {
    // Package production code (ADR 0010). Tests and `tools/` live by softer rules:
    // in tests a type assertion is part of the setup, and in `tools/` it sits at the
    // boundary of JSON parsing, where `unknown` can't otherwise be narrowed and validity
    // is checked by ajv.
    //
    // Each ban owns a rule id. `no-restricted-syntax` holds a single array per config
    // object, and flat config replaces rule options instead of merging them: one later
    // block adding its own selector would silently erase every ban listed here, with a
    // green gate and no warning. A dedicated id also keeps `eslint-disable` surgical.
    files: ["packages/*/src/**/*.ts"],
    rules: {
      // Catches both `x as T` and the angle form `<T>x`; `as const` and `satisfies`
      // stay allowed by the rule itself.
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      // `@ts-expect-error` silences strictly more than any assertion does.
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": true }],
      "et/no-anonymous-shape": "error",
    },
  },
  {
    // The commented module surface (ADR 0013) covers every source file, tools included:
    // a tool is read by whoever it broke for, and that reader has no other documentation.
    // Tests are out — a test name already states what it checks.
    files: ["packages/*/src/**/*.ts", "tools/*/src/**/*.ts"],
    rules: { "et/require-comment": "error" },
  },
  {
    // Core: domain-neutrality and full determinism.
    files: ["packages/core/**/*.ts"],
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
