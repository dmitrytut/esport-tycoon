import { describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import { createRun, DEFAULT_RUN_SEED } from "../src/run.ts";
import { WeekSession } from "../src/session.ts";

const catalog = loadContent();

describe("opening browser run", () => {
  it("restarts the same roster, rates and calendar from the same explicit seed", () => {
    const first = createRun("browser-reload", catalog);
    expect(createRun("browser-reload", catalog)).toEqual(first);
    expect(first.runState.collective.members).toHaveLength(catalog.discipline.rosterSize);
    expect(first.runState.engagements).toHaveLength(catalog.discipline.rosterSize);
    expect(first.season.calendar.entries).toHaveLength(catalog.template.length);
  });

  it("changes generated people and the season when the seed changes", () => {
    const first = createRun("browser-reload", catalog);
    const other = createRun("different-seed", catalog);
    expect(other.runState.collective.members).not.toEqual(first.runState.collective.members);
    expect(other.season.calendar.entries).not.toEqual(first.season.calendar.entries);
  });

  it("opens the default demo on ordinary weeks that the real core can advance", () => {
    const opening = createRun(DEFAULT_RUN_SEED, catalog);
    const session = new WeekSession(catalog, opening);
    expect(session.view.mode.kind).toBe("editing");
    expect(session.continue(session.view.revision)).toBe(true);
    expect(session.view.last?.advance.weeks.map((week) => week.week)).toEqual([0, 1, 2, 3]);
    expect(session.view.runState.week).toBe(4);
    expect(session.view.last?.advance.reasons.map((reason) => reason.kind)).toContain(
      "contest-ahead",
    );
  });

  it("does not bypass a marked opening week from an explicit seed", () => {
    const session = new WeekSession(catalog, createRun("week-shell-38", catalog));
    expect(session.view.mode.kind).toBe("blocked");
    expect(session.continue(session.view.revision)).toBe(false);
    expect(session.view.runState.week).toBe(0);
  });
});
