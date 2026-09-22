#!/usr/bin/env node
/**
 * Content validator (ADR 0003): schemas plus referential integrity.
 *
 * Checks:
 *  - each file against the JSON Schema of its type;
 *  - the file name matches `id`;
 *  - references point to existing entities: event → trait and region,
 *    trait → core stats and event categories, discipline → region,
 *    region → name pool, activity → core stats and discipline.
 *
 * Run: `pnpm validate:content`, or `node tools/validate-content/src/index.ts <dir>`
 * to validate a different data set (used by the tests).
 * Exit code 1 on any error: invalid content does not merge.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Schemas are declared in the 2020-12 dialect — pick the matching ajv build.
import { Ajv2020 as Ajv, type ValidateFunction } from "ajv/dist/2020.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const contentRoot = process.argv[2] ? resolve(process.argv[2]) : join(repoRoot, "content");
const schemaRoot = join(contentRoot, "schema");

/** Performer stats from specs/0001. Keys are domain-neutral (ADR 0001). */
const CORE_STATS = [
  "mechanical",
  "cognitive",
  "collective",
  "composure",
  "adaptability",
  "presence",
] as const;

/** Content directory → schema file. A new type is added here and in content/README.md. */
const TYPES: Record<string, string> = {
  disciplines: "discipline.schema.json",
  traits: "trait.schema.json",
  events: "event.schema.json",
  regions: "region.schema.json",
  names: "name-pool.schema.json",
  activities: "activity.schema.json",
};

/** One content file already parsed: enough to validate it and to report where the error is. */
interface Entity {
  /** Directory it came from — the key in `TYPES`. */
  readonly type: string;
  /** File name, used in messages so the reader can open it straight away. */
  readonly file: string;
  /** Parsed body; validity against the schema is checked separately. */
  readonly data: Record<string, unknown>;
}

const errors: string[] = [];
const fail = (file: string, message: string): void => void errors.push(`${file}: ${message}`);

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const listJson = (dir: string): string[] => {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
};

// ---------- schemas ----------
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const validators = new Map<string, ValidateFunction>();
for (const [type, schemaFile] of Object.entries(TYPES)) {
  validators.set(type, ajv.compile(readJson(join(schemaRoot, schemaFile)) as object));
}

/** Event categories are pulled from the schema so the list lives in one place. */
const eventSchema = readJson(join(schemaRoot, "event.schema.json")) as {
  // Only the part that is read here; the rest of the schema is ajv's business.
  properties: { category: { enum: string[] } };
};
const eventCategories = eventSchema.properties.category.enum;

// ---------- loading ----------
const entities: Entity[] = [];
const idsByType: Record<string, Set<string>> = {};

for (const type of Object.keys(TYPES)) {
  const dir = join(contentRoot, type);
  const files = listJson(dir);
  const knownIds = new Set<string>();
  idsByType[type] = knownIds;

  for (const fileName of files) {
    const relative = `content/${type}/${fileName}`;
    let data: unknown;
    try {
      data = readJson(join(dir, fileName));
    } catch (cause) {
      fail(relative, `does not parse as JSON — ${(cause as Error).message}`);
      continue;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      fail(relative, "expected an entity object");
      continue;
    }

    const record = data as Record<string, unknown>;
    const validate = validators.get(type);
    if (validate && !validate(record)) {
      for (const issue of validate.errors ?? []) {
        // ajv names the allowed values only in `params`; a closed set is unusable as an
        // error unless the reader is told what the set is.
        const allowed: unknown = issue.params["allowedValues"];
        const listed = Array.isArray(allowed) ? ` [${allowed.join(", ")}]` : "";
        fail(
          relative,
          `schema: ${issue.instancePath || "/"} ${issue.message ?? "fails validation"}${listed}`,
        );
      }
    }

    const id = record["id"];
    if (typeof id === "string") {
      if (id !== basename(fileName, ".json")) {
        fail(relative, `id "${id}" does not match the file name`);
      }
      if (knownIds.has(id)) fail(relative, `id "${id}" is duplicated`);
      knownIds.add(id);
    }

    entities.push({ type, file: relative, data: record });
  }
}

// ---------- referential integrity ----------
const has = (type: string, id: unknown): boolean =>
  typeof id === "string" && (idsByType[type]?.has(id) ?? false);

const checkRef = (entity: Entity, type: string, id: unknown, where: string): void => {
  if (!has(type, id))
    fail(entity.file, `${where} refers to a nonexistent ${type}: "${String(id)}"`);
};

const checkKeys = (
  entity: Entity,
  value: unknown,
  allowed: readonly string[],
  where: string,
): void => {
  if (typeof value !== "object" || value === null) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(entity.file, `${where}: key "${key}" is not in the list [${allowed.join(", ")}]`);
    }
  }
};

for (const entity of entities) {
  const data = entity.data;

  if (entity.type === "events") {
    const conditions = (data["conditions"] ?? {}) as Record<string, unknown>;
    for (const traitId of (conditions["requiresTrait"] as unknown[] | undefined) ?? []) {
      checkRef(entity, "traits", traitId, "conditions.requiresTrait");
    }
    for (const regionId of (conditions["region"] as unknown[] | undefined) ?? []) {
      checkRef(entity, "regions", regionId, "conditions.region");
    }

    const checkEffectStats = (effects: unknown, where: string): void => {
      for (const effect of (effects as unknown[] | undefined) ?? []) {
        const fields = (effect ?? {}) as Record<string, unknown>;
        if (fields["kind"] !== "stat") continue;
        const stat = fields["stat"];
        if (typeof stat !== "string" || !(CORE_STATS as readonly string[]).includes(stat)) {
          fail(
            entity.file,
            `${where}.stat "${String(stat)}" is not in the list [${CORE_STATS.join(", ")}]`,
          );
        }
      }
    };

    const seenChoiceIds = new Set<string>();
    const choices = (data["choices"] as unknown[] | undefined) ?? [];
    choices.forEach((choice, index) => {
      const choiceData = (choice ?? {}) as Record<string, unknown>;
      const id = choiceData["id"];
      if (typeof id === "string") {
        if (seenChoiceIds.has(id)) fail(entity.file, `choices[${index}].id "${id}" is duplicated`);
        seenChoiceIds.add(id);
      }

      const outcome = (choiceData["outcome"] ?? {}) as Record<string, unknown>;
      const where = `choices[${index}].outcome`;
      if (outcome["kind"] === "direct") {
        checkEffectStats(outcome["effects"], `${where}.effects`);
      } else if (outcome["kind"] === "check") {
        const stat = outcome["stat"];
        if (typeof stat !== "string" || !(CORE_STATS as readonly string[]).includes(stat)) {
          fail(
            entity.file,
            `${where}.stat "${String(stat)}" is not in the list [${CORE_STATS.join(", ")}]`,
          );
        }
        checkEffectStats(outcome["successEffects"], `${where}.successEffects`);
        checkEffectStats(outcome["failureEffects"], `${where}.failureEffects`);
      }
    });
  }

  if (entity.type === "traits") {
    const modifiers = (data["modifiers"] ?? {}) as Record<string, unknown>;
    checkKeys(entity, modifiers["statMultiplier"], CORE_STATS, "modifiers.statMultiplier");
    checkKeys(entity, data["eventWeightBoost"], eventCategories, "eventWeightBoost");
  }

  if (entity.type === "disciplines") {
    for (const regionId of (data["strongRegions"] as unknown[] | undefined) ?? []) {
      checkRef(entity, "regions", regionId, "strongRegions");
    }
  }

  if (entity.type === "regions") {
    for (const poolId of (data["namePools"] as unknown[] | undefined) ?? []) {
      checkRef(entity, "names", poolId, "namePools");
    }
  }

  if (entity.type === "activities") {
    const effects = (data["effects"] as unknown[] | undefined) ?? [];
    effects.forEach((effect, index) => {
      if (typeof effect !== "object" || effect === null) return;
      const fields = effect as Record<string, unknown>;
      if (fields["kind"] !== "stat") return;
      const stat = fields["stat"];
      if (typeof stat !== "string" || !(CORE_STATS as readonly string[]).includes(stat)) {
        fail(
          entity.file,
          `effects[${index}].stat "${String(stat)}" is not in the list [${CORE_STATS.join(", ")}]`,
        );
      }
    });
    for (const disciplineId of (data["disciplines"] as unknown[] | undefined) ?? []) {
      checkRef(entity, "disciplines", disciplineId, "disciplines");
    }
  }
}

// ---------- report ----------
const counts = Object.entries(TYPES)
  .map(([type]) => `${type}: ${idsByType[type]?.size ?? 0}`)
  .join(" · ");

if (errors.length > 0) {
  console.error(`Content failed validation. ${counts}\n`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  console.error(`\nErrors: ${errors.length}. Rules — docs/adr/0003.`);
  process.exit(1);
}

console.log(`Content is valid. ${counts}`);
