import { describe, expect, it } from "vitest";

import { loadContent, validateContent } from "../src/content.ts";

describe("browser content adapter", () => {
  it("loads shipped activities and standard season through their schemas", () => {
    const catalog = loadContent();
    expect(catalog.activities.some((activity) => activity.id === "rest")).toBe(true);
    expect(catalog.template.id).toBe("standard");
    expect(catalog.discipline.rosterSize).toBe(5);
    expect(catalog.origin.givenNames.length).toBeGreaterThan(0);
  });

  it("names the missing required activity directory before allowing a run", () => {
    expect(() => validateContent({})).toThrow(/content\/activities\/.*\.json/);
  });

  it("names a broken standard season instead of accepting malformed input", () => {
    const files = import.meta.glob("../../../content/**/*.json", {
      eager: true,
      import: "default",
    });
    const broken = { ...files, "../../../content/seasons/standard.json": { id: "standard" } };
    expect(() => validateContent(broken)).toThrow(/content\/seasons\/standard\.json/);
  });

  it("refuses a dangling region name-pool reference", () => {
    const files = import.meta.glob("../../../content/**/*.json", {
      eager: true,
      import: "default",
    });
    const region = files["../../../content/regions/western-europe.json"];
    if (typeof region !== "object" || region === null) throw new Error("fixture missing region");
    const broken = {
      ...files,
      "../../../content/regions/western-europe.json": { ...region, namePools: ["not-a-pool"] },
    };
    expect(() => validateContent(broken)).toThrow(/western-europe\.json.*not-a-pool/);
  });
});
