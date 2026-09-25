import { advanceSeason, createRng, startSeason } from "@et/core";
import { describe, expect, it } from "vitest";

import { loadContent } from "../src/content.ts";
import { createRun } from "../src/run.ts";
import { WeekSession } from "../src/session.ts";

const catalog = loadContent();

function uninterruptedSession(): WeekSession {
  const seed = "session-check";
  const opening = createRun(seed, catalog);
  const season = startSeason({
    number: 1,
    startWeek: 0,
    template: {
      id: "test-unmarked",
      length: 24,
      markings: { contest: { min: 0, max: 0 }, series: { min: 0, max: 0 } },
    },
    goal: { kind: "minimum-contest-wins", target: 0 },
    seed,
    rngState: createRng(seed).stream("season-calendar").state(),
  });
  return new WeekSession(catalog, { runState: opening.runState, season });
}

describe("week command boundary", () => {
  it("keeps committed values and draft unchanged when the sheet closes and reopens", () => {
    const session = uninterruptedSession();
    const committed = session.view.runState;
    session.add(2, "rest");
    const before = session.view;
    session.toggleSheet();
    session.toggleSheet();
    expect(session.view.runState).toBe(before.runState);
    expect(session.view.draft).toEqual(before.draft);
    expect(session.view.runState).toBe(committed);
    expect(session.view.runState.org.money).toBe(committed.org.money);
    expect(session.view.runState.rng).toEqual(before.runState.rng);
  });

  it("refuses missing participants without advancing or changing the draft", () => {
    const session = uninterruptedSession();
    const before = session.view.runState;
    session.add(0, "training-mechanical");
    const result = session.continue(session.view.revision);
    expect(result).toBe(false);
    expect(session.view.mode.kind).toBe("editing");
    expect(session.view.error).toMatch(/member|participant/i);
    expect(session.view.runState).toBe(before);
    expect(session.view.runState.week).toBe(0);
  });

  it("lets an assigned member be cleared back to a correctable unassigned plan", () => {
    const session = uninterruptedSession();
    const person = session.view.runState.collective.members[0];
    if (!person) throw new Error("fixture has no person");
    session.add(0, "training-mechanical", person.id);
    session.setMember(0, 0, null);
    expect(session.view.draft.weeks[0]?.entries[0]).toEqual({
      activityId: "training-mechanical",
    });
    expect(session.continue(session.view.revision)).toBe(false);
    expect(session.view.error).toMatch(/needs a member/);
  });

  it("commits one core result for double activation and never reuses the old render revision", () => {
    const session = uninterruptedSession();
    session.add(0, "rest");
    const oldRevision = session.view.revision;
    const result = session.continue(oldRevision);
    expect(result).toBe(true);
    const after = session.view;
    expect(session.continue(oldRevision)).toBe(false);
    expect(session.view.runState).toBe(after.runState);
    expect(after.runState.week).toBe(4);
    expect(after.last?.advance.weeks.map((week) => week.week)).toEqual([0, 1, 2, 3]);
    expect(after.runState.org.money).toBe(after.last?.runState.org.money);
    expect(after.sheet).toBe("collapsed");
  });

  it("retains immutable executed weeks and future assignments after an early stop and resumes at the next week", () => {
    const session = uninterruptedSession();
    session.add(1, "bootcamp");
    session.add(1, "bootcamp");
    session.add(2, "rest");
    session.add(3, "rest");
    expect(session.continue(session.view.revision)).toBe(true);
    const stopped = session.view;
    expect(stopped.runState.week).toBe(2);
    expect(stopped.history.map((week) => week.week)).toEqual([0, 1]);
    expect(stopped.draft.startWeek).toBe(2);
    expect(stopped.draft.weeks[0]?.entries[0]?.activityId).toBe("rest");
    expect(stopped.draft.weeks).toHaveLength(4);
    expect(() => session.add(1, "rest")).toThrow(/executed/);
    const evidence = JSON.stringify(stopped.history);
    session.toggleSheet();
    expect(session.continue(session.view.revision)).toBe(true);
    expect(JSON.stringify(session.view.history.slice(0, 2))).toBe(evidence);
    expect(session.view.runState.week).toBe(6);
  });

  it("blocks marked weeks and a pending incident without consuming core state", () => {
    const session = uninterruptedSession();
    const opening = session.view.runState;
    const season = session.view.season;
    const marked = {
      ...season,
      calendar: {
        ...season.calendar,
        entries: season.calendar.entries.map((entry) => ({
          ...entry,
          marking: entry.week === 0 ? ("series" as const) : entry.marking,
        })),
      },
    };
    const blocked = new WeekSession(catalog, { runState: opening, season: marked });
    expect(blocked.view.mode.kind).toBe("blocked");
    expect(blocked.continue(blocked.view.revision)).toBe(false);
    expect(blocked.view.runState).toBe(opening);
    const pending = new WeekSession(catalog, {
      runState: {
        ...opening,
        incidents: {
          ...opening.incidents,
          pending: {
            incidentId: "waiting",
            performerId: opening.collective.members[0]?.id ?? "",
            week: 0,
          },
        },
      },
      season,
    });
    expect(pending.view.mode.kind).toBe("blocked");
    expect(pending.continue(pending.view.revision)).toBe(false);
    expect(pending.view.runState.week).toBe(0);
  });
  it("keeps every simultaneous core stop reason and blocks the unresolved contest", () => {
    const session = new WeekSession(catalog, createRun("week-shell-38-5", catalog));
    expect(session.continue(session.view.revision)).toBe(true);
    expect(session.view.last?.advance.reasons.map((reason) => reason.kind)).toEqual([
      "contest-ahead",
      "block-ran-out",
    ]);
    expect(session.view.mode.kind).toBe("blocked");
    expect(session.continue(session.view.revision)).toBe(false);
  });

  it("rejects a core command without consuming state or losing the correctable draft", () => {
    const session = uninterruptedSession();
    const opening = session.view.runState;
    const season = session.view.season;
    session.add(0, "rest");
    const draft = session.view.draft;
    const inconsistent = new WeekSession(catalog, {
      runState: opening,
      season: { ...season, position: 1 },
    });
    inconsistent.add(0, "rest");
    expect(inconsistent.continue(inconsistent.view.revision)).toBe(false);
    expect(inconsistent.view.error).toMatch(/position expects absolute week 1/);
    expect(inconsistent.view.runState).toBe(opening);
    expect(inconsistent.view.runState.rng).toEqual(opening.rng);
    expect(inconsistent.view.draft).toEqual(draft);
  });

  it("blocks uncovered engagements and a completed season before any command", () => {
    const session = uninterruptedSession();
    const { runState, season } = session.view;
    const expired = new WeekSession(catalog, {
      runState: {
        ...runState,
        engagements: runState.engagements.map((engagement) => ({
          ...engagement,
          endsBeforeWeek: 0,
        })),
      },
      season,
    });
    expect(expired.view.mode.kind).toBe("blocked");
    expect(expired.continue(expired.view.revision)).toBe(false);
    const tinySeason = startSeason({
      number: 1,
      startWeek: 0,
      template: {
        id: "short",
        length: 4,
        markings: { contest: { min: 0, max: 0 }, series: { min: 0, max: 0 } },
      },
      goal: { kind: "minimum-contest-wins", target: 0 },
      seed: runState.seed,
      rngState: createRng(runState.seed).stream("season-calendar").state(),
    });
    const completed = advanceSeason(runState, tinySeason, { weeks: [[], [], [], []] });
    expect(completed.season.kind).toBe("completed");
    const boundary = new WeekSession(catalog, completed);
    expect(boundary.view.mode.kind).toBe("blocked");
    expect(boundary.continue(boundary.view.revision)).toBe(false);
    expect(boundary.view.runState).toBe(completed.runState);
  });
});
