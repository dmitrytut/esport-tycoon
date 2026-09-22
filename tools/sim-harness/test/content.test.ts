import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const contentRoot = join(repoRoot, "content");

let created: string[] = [];
afterEach(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created = [];
});

/** A copy of the real content tree a test may break on purpose. */
function copyOfContent(): string {
  const root = mkdtempSync(join(tmpdir(), "et-sim-content-"));
  created.push(root);
  cpSync(contentRoot, root, { recursive: true });
  return root;
}

describe("content for a run", () => {
  it("keeps every activity as content declared it", () => {
    const content = loadContent(contentRoot);
    const campaign = content.activities.get("ad-campaign");

    expect(campaign?.slots).toBe(2);
    expect(campaign?.energy).toBe(20);
    expect(campaign?.target).toBe("collective");
    expect(campaign?.effects).toEqual([
      { kind: "money", amount: 5000, scale: "audience" },
      { kind: "morale", amount: -6 },
    ]);
  });

  it("builds an origin a performer can be generated from", () => {
    const origin = loadContent(contentRoot).origins.get("western-europe");

    expect(origin?.language).toBe("en");
    expect(origin?.talentDensity).toBe(1.0);
    expect(origin?.givenNames).toContain("Oliver");
    expect(origin?.handles).toContain("crumpet");
    expect(origin?.secondLanguages.map((second) => second.language)).toEqual([
      "de",
      "fr",
      "sv",
      "da",
    ]);
  });

  it("refuses a region whose name pool is missing", () => {
    const root = copyOfContent();
    rmSync(join(root, "names/en-nick.json"));

    expect(() => loadContent(root)).toThrow(/en-nick/);
  });

  it("refuses a region that offers no handle to draw", () => {
    const root = copyOfContent();
    writeFileSync(
      join(root, "regions/western-europe.json"),
      JSON.stringify({
        id: "western-europe",
        name: "Western Europe",
        language: "en",
        modifiers: { talentDensity: 1 },
        namePools: ["en-male"],
      }),
    );

    expect(() => loadContent(root)).toThrow(/western-europe/);
  });

  it("loads incidents by id", () => {
    const content = loadContent(contentRoot);
    const incident = content.incidents.get("gear-malfunction-mid-scrim");

    expect(incident?.category).toBe("tech");
    expect(incident?.weight).toBe(5);
    expect(incident?.choices.map((choice) => choice.id)).toEqual([
      "borrow-a-spare",
      "power-through",
    ]);
  });

  it("builds trait event-weight boosts by trait id", () => {
    const content = loadContent(contentRoot);

    expect(content.traitMultipliers.streamer).toEqual({ fame: 2.0, press: 1.5, health: 1.3 });
  });

  it("refuses a duplicate incident id", () => {
    const root = copyOfContent();
    const duplicate = readFileSync(join(root, "events/gear-malfunction-mid-scrim.json"), "utf8");
    writeFileSync(join(root, "events/gear-malfunction-mid-scrim-copy.json"), duplicate);

    expect(() => loadContent(root)).toThrow(/gear-malfunction-mid-scrim/);
  });
});
