/**
 * Content for a run: the activities a policy may plan and the origins a collective is
 * generated from. Core reads no files (ADR 0008), so the harness hands it typed values
 * parsed from the same `content/` tree the validator guards (ADR 0003).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  Activity,
  Incident,
  IncidentCategoryMultipliers,
  IncidentTraitMultipliers,
  OriginProfile,
  SeasonTemplate,
  SecondLanguage,
} from "@et/core";

/** Everything a run needs from `content/`, indexed by the id content declared. */
export interface SimContent {
  /** Activities by id; a scenario names the subset it puts in play. */
  readonly activities: ReadonlyMap<string, Activity>;
  /** Origins by region id, ready for `generatePerformer`. */
  readonly origins: ReadonlyMap<string, OriginProfile>;
  /** Incidents by id; a scenario names the subset it enables. */
  readonly incidents: ReadonlyMap<string, Incident>;
  /** Declared trait event-weight boosts by trait id, for the incident engine's weighting. */
  readonly traitMultipliers: IncidentTraitMultipliers;
  /** Validated season templates by stable content id. */
  readonly seasons: ReadonlyMap<string, SeasonTemplate>;
}

/** One trait file's fields the harness reads; only the incident weighting matters here. */
interface TraitFile {
  /** Trait id, matching the file name. */
  readonly id: string;
  /** Declared weight boost per incident category; absent means every category is 1. */
  readonly eventWeightBoost?: IncidentCategoryMultipliers;
}

/** One name pool file: a list of given names or of handles. */
interface NamePool {
  /** Pool id, matching the file name and the region's reference. */
  readonly id: string;
  /** What the values are; the harness needs given names and handles. */
  readonly kind: "given" | "family" | "nick";
  /** The names themselves. */
  readonly values: readonly string[];
}

/** One region file, in the shape an origin is built from. */
interface Region {
  /** Region id, matching the file name. */
  readonly id: string;
  /** The language everyone generated here speaks. */
  readonly language: string;
  /** Additional languages with the chance of speaking them. */
  readonly secondLanguages?: readonly SecondLanguage[];
  /** Region modifiers; only the talent density reaches core. */
  readonly modifiers?: { readonly talentDensity?: number };
  /** Name pool ids this region draws from. */
  readonly namePools?: readonly string[];
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const listJson = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

/**
 * Loads activities, regions and name pools from a content tree. Anything a run would
 * otherwise discover halfway through — a pool that is not there, a region with nothing to
 * name a performer — fails here, naming the file that is wrong.
 */
export function loadContent(contentRoot: string): SimContent {
  const activities = new Map<string, Activity>();
  for (const file of listJson(join(contentRoot, "activities"))) {
    const activity = readJson(join(contentRoot, "activities", file)) as Activity;
    activities.set(activity.id, activity);
  }

  const pools = new Map<string, NamePool>();
  for (const file of listJson(join(contentRoot, "names"))) {
    const pool = readJson(join(contentRoot, "names", file)) as NamePool;
    pools.set(pool.id, pool);
  }

  const origins = new Map<string, OriginProfile>();
  for (const file of listJson(join(contentRoot, "regions"))) {
    const region = readJson(join(contentRoot, "regions", file)) as Region;
    const givenNames: string[] = [];
    const handles: string[] = [];
    for (const poolId of region.namePools ?? []) {
      const pool = pools.get(poolId);
      if (pool === undefined) {
        throw new Error(`region "${region.id}" refers to name pool "${poolId}", which is missing`);
      }
      if (pool.kind === "given") givenNames.push(...pool.values);
      if (pool.kind === "nick") handles.push(...pool.values);
    }
    if (givenNames.length === 0 || handles.length === 0) {
      throw new Error(
        `region "${region.id}" offers ${givenNames.length} given names and ${handles.length} handles; a performer needs both`,
      );
    }
    origins.set(region.id, {
      id: region.id,
      language: region.language,
      secondLanguages: region.secondLanguages ?? [],
      talentDensity: region.modifiers?.talentDensity ?? 1,
      givenNames,
      handles,
    });
  }

  const incidents = new Map<string, Incident>();
  for (const file of listJson(join(contentRoot, "events"))) {
    const incident = readJson(join(contentRoot, "events", file)) as Incident;
    if (incidents.has(incident.id)) {
      throw new Error(`incident "${incident.id}" is declared more than once in content`);
    }
    incidents.set(incident.id, incident);
  }

  const seasons = new Map<string, SeasonTemplate>();
  for (const file of listJson(join(contentRoot, "seasons"))) {
    const template = readJson(join(contentRoot, "seasons", file)) as SeasonTemplate;
    seasons.set(template.id, template);
  }

  const traitMultipliers: Record<string, IncidentCategoryMultipliers> = {};
  for (const file of listJson(join(contentRoot, "traits"))) {
    const trait = readJson(join(contentRoot, "traits", file)) as TraitFile;
    traitMultipliers[trait.id] = trait.eventWeightBoost ?? {};
  }

  return { activities, origins, incidents, seasons, traitMultipliers };
}
