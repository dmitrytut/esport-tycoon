import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const entryPath = join(repoRoot, "tools/validate-content/src/index.ts");

interface RunResult {
  readonly code: number;
  readonly output: string;
}

/**
 * Валидатор запускается процессом: проверяется то же, что видят CI и git-хук,
 * вместе с кодом возврата.
 */
function run(contentRoot: string): RunResult {
  try {
    const output = execFileSync(process.execPath, [entryPath, contentRoot], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (cause) {
    const failure = cause as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? -1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

/** Пустой набор контента с настоящими схемами проекта. */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "et-content-"));
  cpSync(join(repoRoot, "content/schema"), join(root, "schema"), { recursive: true });
  for (const dir of ["disciplines", "traits", "events", "regions", "names"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  return root;
}

const put = (root: string, path: string, value: unknown): void =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2));

const trait = { id: "night-owl", name: "Night Owl", polarity: "mixed", description: "Sleeps at dawn, plays at night." };
const region = { id: "nordics", name: "Nordics", language: "sv", modifiers: { salaryScale: 1 } };

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

describe("валидатор контента (ADR 0003)", () => {
  it("принимает согласованный набор", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", trait);
    put(root, "regions/nordics.json", region);

    const result = run(root);
    expect(result.output).toContain("Контент валиден");
    expect(result.code).toBe(0);
  });

  it("ловит нарушение схемы", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", { ...trait, polarity: "chaotic" });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("схема");
  });

  it("ловит расхождение id и имени файла", () => {
    const root = fresh();
    put(root, "traits/owl.json", trait);

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("не совпадает с именем файла");
  });

  it("ловит висячую ссылку события на несуществующую черту", () => {
    const root = fresh();
    put(root, "events/late-night.json", {
      id: "late-night",
      category: "life",
      weight: 5,
      triggers: { requiresTrait: ["ghost-trait"] },
      text: "Someone streamed until sunrise again and the scrim block starts in four hours.",
      choices: [
        { label: "Let it slide", effects: { morale: 2 } },
        { label: "Bench him", effects: { morale: -5 } },
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("несуществующий traits");
  });

  it("ловит несуществующий стат в последствиях выбора", () => {
    const root = fresh();
    put(root, "events/aim-lab.json", {
      id: "aim-lab",
      category: "life",
      weight: 5,
      text: "The rookie found a new aim trainer and now refuses to touch anything else all week.",
      choices: [
        { label: "Let him grind", effects: { statDelta: { aim: 2 } } },
        { label: "Back to scrims", effects: { morale: -2 } },
      ],
    });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("не из списка");
  });

  it("ловит ссылку региона на отсутствующий пул имён", () => {
    const root = fresh();
    put(root, "regions/nordics.json", { ...region, namePools: ["sv-given"] });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain("несуществующий names");
  });

  it("ловит дубликат id внутри типа", () => {
    const root = fresh();
    put(root, "traits/night-owl.json", trait);
    put(root, "traits/night-owl-copy.json", { ...trait, id: "night-owl" });

    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/дубл|не совпадает/);
  });
});
