#!/usr/bin/env node
/**
 * Валидатор контента (ADR 0003): схемы плюс ссылочная целостность.
 *
 * Проверяет:
 *  - каждый файл против JSON Schema своего типа;
 *  - имя файла совпадает с `id`;
 *  - ссылки ведут в существующие сущности: событие → черта и регион,
 *    черта → статы ядра и категории событий, дисциплина → регион,
 *    регион → пул имён.
 *
 * Запуск: `pnpm validate:content`, или `node tools/validate-content/src/index.ts <каталог>`
 * для проверки другого набора данных (этим пользуются тесты).
 * Код возврата 1 при любой ошибке: невалидный контент не мержится.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Схемы объявлены в диалекте 2020-12 — берём соответствующую сборку ajv.
import { Ajv2020 as Ajv, type ValidateFunction } from "ajv/dist/2020.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const contentRoot = process.argv[2] ? resolve(process.argv[2]) : join(repoRoot, "content");
const schemaRoot = join(contentRoot, "schema");

/** Статы исполнителя из specs/0001. Ключи домен-нейтральные (ADR 0001). */
const CORE_STATS = [
  "mechanical",
  "cognitive",
  "collective",
  "composure",
  "adaptability",
  "presence",
] as const;

/** Каталог контента → файл схемы. Новый тип добавляется здесь и в content/README.md. */
const TYPES: Record<string, string> = {
  disciplines: "discipline.schema.json",
  traits: "trait.schema.json",
  events: "event.schema.json",
  regions: "region.schema.json",
  names: "name-pool.schema.json",
};

interface Entity {
  readonly type: string;
  readonly file: string;
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

// ---------- схемы ----------
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const validators = new Map<string, ValidateFunction>();
for (const [type, schemaFile] of Object.entries(TYPES)) {
  validators.set(type, ajv.compile(readJson(join(schemaRoot, schemaFile)) as object));
}

/** Категории событий берём из схемы, чтобы список жил в одном месте. */
const eventSchema = readJson(join(schemaRoot, "event.schema.json")) as {
  properties: { category: { enum: string[] } };
};
const eventCategories = eventSchema.properties.category.enum;

// ---------- загрузка ----------
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
      fail(relative, `не разбирается как JSON — ${(cause as Error).message}`);
      continue;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      fail(relative, "ожидался объект сущности");
      continue;
    }

    const record = data as Record<string, unknown>;
    const validate = validators.get(type);
    if (validate && !validate(record)) {
      for (const issue of validate.errors ?? []) {
        fail(relative, `схема: ${issue.instancePath || "/"} ${issue.message ?? "не проходит"}`);
      }
    }

    const id = record["id"];
    if (typeof id === "string") {
      if (id !== basename(fileName, ".json")) {
        fail(relative, `id «${id}» не совпадает с именем файла`);
      }
      if (knownIds.has(id)) fail(relative, `id «${id}» дублируется`);
      knownIds.add(id);
    }

    entities.push({ type, file: relative, data: record });
  }
}

// ---------- ссылочная целостность ----------
const has = (type: string, id: unknown): boolean =>
  typeof id === "string" && (idsByType[type]?.has(id) ?? false);

const checkRef = (entity: Entity, type: string, id: unknown, where: string): void => {
  if (!has(type, id)) fail(entity.file, `${where} ссылается на несуществующий ${type}: «${String(id)}»`);
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
      fail(entity.file, `${where}: ключ «${key}» не из списка [${allowed.join(", ")}]`);
    }
  }
};

for (const entity of entities) {
  const data = entity.data;

  if (entity.type === "events") {
    const triggers = (data["triggers"] ?? {}) as Record<string, unknown>;
    for (const traitId of (triggers["requiresTrait"] as unknown[] | undefined) ?? []) {
      checkRef(entity, "traits", traitId, "triggers.requiresTrait");
    }
    for (const regionId of (triggers["region"] as unknown[] | undefined) ?? []) {
      checkRef(entity, "regions", regionId, "triggers.region");
    }
    const choices = (data["choices"] as unknown[] | undefined) ?? [];
    choices.forEach((choice, index) => {
      const effects = ((choice as Record<string, unknown>)["effects"] ?? {}) as Record<
        string,
        unknown
      >;
      const where = `choices[${index}].effects`;
      if (effects["addTrait"] !== undefined) {
        checkRef(entity, "traits", effects["addTrait"], `${where}.addTrait`);
      }
      if (effects["removeTrait"] !== undefined) {
        checkRef(entity, "traits", effects["removeTrait"], `${where}.removeTrait`);
      }
      checkKeys(entity, effects["statDelta"], CORE_STATS, `${where}.statDelta`);
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
}

// ---------- отчёт ----------
const counts = Object.entries(TYPES)
  .map(([type]) => `${type}: ${idsByType[type]?.size ?? 0}`)
  .join(" · ");

if (errors.length > 0) {
  console.error(`Контент не прошёл проверку. ${counts}\n`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  console.error(`\nОшибок: ${errors.length}. Правила — docs/adr/0003.`);
  process.exit(1);
}

console.log(`Контент валиден. ${counts}`);
