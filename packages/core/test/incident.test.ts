import { describe, expect, it } from "vitest";

import { createIncidentState } from "../src/incident.ts";
import { createRng } from "../src/rng.ts";

describe("createIncidentState", () => {
  it("starts with no pending incident and no cooldowns", () => {
    const state = createIncidentState(42);

    expect(state.pending).toBeNull();
    expect(state.cooldowns).toEqual([]);
  });

  it("derives its rng from the root seed's own named incidents stream", () => {
    const state = createIncidentState(42);

    expect(state.rng).toEqual(createRng(42).stream("incidents").state());
  });

  it("gives different seeds different incident streams", () => {
    expect(createIncidentState(1).rng).not.toEqual(createIncidentState(2).rng);
  });

  it("accepts a string seed the same way createRng does", () => {
    const state = createIncidentState("act-one");

    expect(state.rng).toEqual(createRng("act-one").stream("incidents").state());
  });
});
