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
import { Ajv2020 as Ajv, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

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
  seasons: "season.schema.json",
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

/** Resolve one Ajv JSON pointer so validation errors can name the rejected value. */
function valueAtJsonPointer(root: unknown, pointer: string): unknown {
  let value = root;
  for (const rawPart of pointer.split("/").slice(1)) {
    if (typeof value !== "object" || value === null) return undefined;
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** Add the missing, additional or rejected value that Ajv otherwise leaves implicit. */
function schemaIssueContext(record: Record<string, unknown>, issue: ErrorObject): string {
  const missingProperty = issue.params["missingProperty"];
  if (typeof missingProperty === "string") return `; offending property "${missingProperty}"`;

  const additionalProperty = issue.params["additionalProperty"];
  if (typeof additionalProperty === "string") {
    const parent = valueAtJsonPointer(record, issue.instancePath);
    const value =
      typeof parent === "object" && parent !== null
        ? (parent as Record<string, unknown>)[additionalProperty]
        : undefined;
    return `; offending property "${additionalProperty}" value ${JSON.stringify(value)}`;
  }

  const value = valueAtJsonPointer(record, issue.instancePath);
  return value === undefined ? "" : `; offending value ${JSON.stringify(value)}`;
}

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
        // Ajv names the allowed values only in `params`; a closed set is unusable as an
        // error unless the reader is told what the set is.
        const allowed: unknown = issue.params["allowedValues"];
        const listed = Array.isArray(allowed) ? ` [${allowed.join(", ")}]` : "";
        fail(
          relative,
          `schema: ${issue.instancePath || "/"} ${issue.message ?? "fails validation"}${listed}${schemaIssueContext(record, issue)}`,
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
  if (entity.type === "seasons") {
    const markings = data["markings"] as Record<string, Record<string, unknown>> | undefined;
    const contest = markings?.["contest"];
    const series = markings?.["series"];
    const length = data["length"];
    if (
      typeof contest?.["min"] === "number" &&
      typeof contest["max"] === "number" &&
      contest["min"] > contest["max"]
    ) {
      fail(entity.file, "markings.contest.min must not exceed markings.contest.max");
    }
    if (
      typeof series?.["min"] === "number" &&
      typeof series["max"] === "number" &&
      series["min"] > series["max"]
    ) {
      fail(entity.file, "markings.series.min must not exceed markings.series.max");
    }
    if (
      typeof length === "number" &&
      typeof contest?.["max"] === "number" &&
      typeof series?.["max"] === "number" &&
      contest["max"] + series["max"] > length
    ) {
      fail(entity.file, "maximum contest and series markings must fit within season length");
    }
  }

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

    const statWeights = data["statWeights"];
    if (typeof statWeights === "object" && statWeights !== null && !Array.isArray(statWeights)) {
      const weights = Object.values(statWeights);
      if (
        weights.length === CORE_STATS.length &&
        weights.every((weight) => typeof weight === "number") &&
        weights.reduce((total, weight) => total + weight, 0) <= 0
      ) {
        fail(entity.file, "statWeights must have a positive total; got 0");
      }
    }

    const contest = data["contest"];
    if (typeof contest !== "object" || contest === null || Array.isArray(contest)) continue;
    const contestData = contest as Record<string, unknown>;
    const scoreToWin = contestData["scoreToWin"];
    const maxUnits = contestData["maxUnits"];
    if (typeof scoreToWin === "number" && typeof maxUnits === "number") {
      if (maxUnits < scoreToWin) {
        fail(entity.file, `contest.maxUnits ${maxUnits} must be at least scoreToWin ${scoreToWin}`);
      } else if (maxUnits > 2 * (scoreToWin - 1)) {
        fail(
          entity.file,
          `contest.maxUnits ${maxUnits} must not exceed ${2 * (scoreToWin - 1)} for scoreToWin ${scoreToWin}`,
        );
      }
    }

    const slots = Array.isArray(contestData["slots"]) ? contestData["slots"] : [];
    const slotIds = new Set<string>();
    let scoringSlots = 0;
    let scoringSlotIndex = -1;
    slots.forEach((slot, index) => {
      if (typeof slot !== "object" || slot === null || Array.isArray(slot)) return;
      const slotData = slot as Record<string, unknown>;
      const id = slotData["id"];
      if (typeof id === "string") {
        if (slotIds.has(id)) fail(entity.file, `contest slot id "${id}" is duplicated`);
        slotIds.add(id);
      }
      if (slotData["scoring"] === true) {
        scoringSlots += 1;
        scoringSlotIndex = index;
      }
    });
    if (scoringSlots !== 1) {
      fail(entity.file, `contest.slots must contain exactly one scoring slot; got ${scoringSlots}`);
    } else if (scoringSlotIndex !== slots.length - 1) {
      fail(entity.file, `contest.slots[${scoringSlotIndex}] scoring slot must be last`);
    }

    const metrics = Array.isArray(contestData["metrics"]) ? contestData["metrics"] : [];
    const metricIds = new Set<string>();
    metrics.forEach((metric) => {
      if (typeof metric !== "object" || metric === null || Array.isArray(metric)) return;
      const id = (metric as Record<string, unknown>)["id"];
      if (typeof id !== "string") return;
      if (metricIds.has(id)) fail(entity.file, `contest metric id "${id}" is duplicated`);
      metricIds.add(id);
    });

    const momentTypes = Array.isArray(contestData["momentTypes"]) ? contestData["momentTypes"] : [];
    const momentTypeIds = new Set<string>();
    const reachableSlots = new Set<string>();
    momentTypes.forEach((momentType, index) => {
      if (typeof momentType !== "object" || momentType === null || Array.isArray(momentType))
        return;
      const momentTypeData = momentType as Record<string, unknown>;
      const id = momentTypeData["id"];
      if (typeof id === "string") {
        if (momentTypeIds.has(id))
          fail(entity.file, `contest Moment type id "${id}" is duplicated`);
        momentTypeIds.add(id);
      }

      const slot = momentTypeData["slot"];
      if (typeof slot === "string") {
        if (slotIds.has(slot)) reachableSlots.add(slot);
        else fail(entity.file, `contest.momentTypes[${index}] refers to unknown slot "${slot}"`);
      }

      const deltas = momentTypeData["participantMetricDeltas"];
      if (typeof deltas !== "object" || deltas === null || Array.isArray(deltas)) return;
      for (const metric of Object.keys(deltas)) {
        if (!metricIds.has(metric)) {
          fail(entity.file, `contest.momentTypes[${index}] refers to unknown metric "${metric}"`);
        }
      }
    });

    for (const slot of slotIds) {
      if (!reachableSlots.has(slot)) fail(entity.file, `contest slot "${slot}" has no Moment type`);
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
