import type { Activity, OriginProfile, SeasonTemplate } from "@et/core";
import { STAT_KEYS } from "@et/core";
import type { ValidateFunction } from "ajv";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import activitySchema from "../../../content/schema/activity.schema.json";
import disciplineSchema from "../../../content/schema/discipline.schema.json";
import nameSchema from "../../../content/schema/name-pool.schema.json";
import regionSchema from "../../../content/schema/region.schema.json";
import seasonSchema from "../../../content/schema/season.schema.json";
import traitSchema from "../../../content/schema/trait.schema.json";

interface DisciplineEconomy {
  /** Rate inputs copied from the validated discipline, never computed in the shell. */
  readonly baseWeeklyRate: number;
  readonly salaryScale: number;
}

interface RegionModifiers {
  /** The two region factors passed to core construction and rate quotes. */
  readonly talentDensity: number;
  readonly salaryScale: number;
}

interface ShellOrigin extends OriginProfile {
  /** Market input used to quote each generated member's initial engagement. */
  readonly salaryScale: number;
}

interface EntityId {
  /** Must match the name of the file that declares this entity. */
  readonly id: string;
}

/** Content-only values used to quote engagements and size the first group. */
export interface DisciplineContent {
  /** First-run discipline identity and participant count. */
  readonly id: string;
  readonly rosterSize: number;
  readonly economy: DisciplineEconomy;
  readonly strongRegions: readonly string[];
}

interface RegionContent {
  /** First-run origin properties supplied by validated region content. */
  readonly id: string;
  readonly language: string;
  readonly secondLanguages: OriginProfile["secondLanguages"];
  readonly modifiers: RegionModifiers;
  readonly namePools: readonly string[];
}

interface NamePoolContent {
  /** Name pool identity, kind and strings used for generated performers. */
  readonly id: string;
  readonly kind: "given" | "nick";
  readonly values: readonly string[];
}

interface TraitContent {
  /** Validated trait identity; this screen makes no rarity-to-weight rule. */
  readonly id: string;
}

/** Fully checked inputs passed to the new-run adapter, never raw JSON. */
export interface ContentCatalog {
  /** Validated inputs remain available for display and deterministic construction. */
  readonly activities: readonly Activity[];
  readonly discipline: DisciplineContent;
  readonly origin: ShellOrigin;
  readonly traits: readonly string[];
  readonly template: SeasonTemplate;
}

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const validateActivity = ajv.compile<Activity>(activitySchema);
const validateDiscipline = ajv.compile<DisciplineContent>(disciplineSchema);
const validateRegion = ajv.compile<RegionContent>(regionSchema);
const validatePool = ajv.compile<NamePoolContent>(nameSchema);
const validateTrait = ajv.compile<TraitContent>(traitSchema);
const validateSeason = ajv.compile<SeasonTemplate>(seasonSchema);

type Files = Readonly<Record<string, unknown>>;

/** Shared content identity avoids anonymous module-surface shapes in the schema adapter. */
function content<T extends EntityId>(files: Files, path: string, check: ValidateFunction<T>): T {
  const value = files[path];
  if (value === undefined) throw new Error(`${path}: required content is missing`);
  if (!check(value)) throw new Error(`${path}: ${ajv.errorsText(check.errors)}`);
  const fileId = path.slice(path.lastIndexOf("/") + 1, -5);
  if (value.id !== fileId) throw new Error(`${path}: id ${value.id} does not match file name`);
  return value;
}

function paths(files: Files, folder: string): string[] {
  return Object.keys(files)
    .filter((path) => path.startsWith(`../../../content/${folder}/`) && path.endsWith(".json"))
    .sort();
}

/** Validates the browser's imported snapshot and resolves only references needed for a first run. */
export function validateContent(files: Files): ContentCatalog {
  const activityPaths = paths(files, "activities");
  if (activityPaths.length === 0) throw new Error("content/activities/*.json: no activities found");
  const activities = activityPaths.map((path) => content(files, path, validateActivity));
  const disciplinePath = "../../../content/disciplines/tactical-shooter.json";
  const discipline = content(files, disciplinePath, validateDiscipline);
  const regionPath = "../../../content/regions/western-europe.json";
  const region = content(files, regionPath, validateRegion);
  const template = content(files, "../../../content/seasons/standard.json", validateSeason);
  const pools = region.namePools.map((id) => {
    const path = `../../../content/names/${id}.json`;
    if (files[path] === undefined)
      throw new Error(`${regionPath}: missing name pool ${id} (${path})`);
    return content(files, path, validatePool);
  });
  const givenNames = pools.filter((pool) => pool.kind === "given").flatMap((pool) => pool.values);
  const handles = pools.filter((pool) => pool.kind === "nick").flatMap((pool) => pool.values);
  if (givenNames.length === 0 || handles.length === 0) {
    throw new Error(`${regionPath}: both given and nick name pools are required`);
  }
  for (const activity of activities) {
    if (activity.disciplines && !activity.disciplines.includes(discipline.id)) continue;
    for (const effect of activity.effects) {
      if (effect.kind === "stat" && !STAT_KEYS.some((key) => key === effect.stat)) {
        throw new Error(`content/activities/${activity.id}.json: unknown stat ${effect.stat}`);
      }
    }
  }
  if (!discipline.strongRegions.includes(region.id)) {
    throw new Error(`${disciplinePath}: missing first-run region ${region.id}`);
  }
  const traits = paths(files, "traits").map((path) => content(files, path, validateTrait).id);
  return {
    activities: activities.filter(
      (activity) => !activity.disciplines || activity.disciplines.includes(discipline.id),
    ),
    discipline,
    origin: {
      id: region.id,
      language: region.language,
      secondLanguages: region.secondLanguages,
      talentDensity: region.modifiers.talentDensity,
      salaryScale: region.modifiers.salaryScale,
      givenNames,
      handles,
    },
    traits,
    template,
  };
}

/** Imports the shipped tree through Vite rather than a Node file reader. */
export function loadContent(): ContentCatalog {
  return validateContent(
    import.meta.glob(
      "../../../content/{activities,disciplines,regions,names,traits,seasons}/*.json",
      {
        eager: true,
        import: "default",
      },
    ),
  );
}
