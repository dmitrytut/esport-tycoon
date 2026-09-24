import { describe, expect, it } from "vitest";

import {
  CONTEST_STREAM_NAME,
  type ContestId,
  type ContestInput,
  type ContestParticipantResult,
  type ContestResult,
  type ContestRules,
  createRng,
  resolveContest,
  restoreRng,
} from "../src/index.ts";

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

function at<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("contest test fixture element is missing");
  return value;
}

const rules: ContestRules = {
  kind: "head-to-head",
  participantCount: 2,
  statWeights: {
    mechanical: 3,
    cognitive: 1,
    collective: 2,
    composure: 3,
    adaptability: 0,
    presence: 0,
  },
  scoreToWin: 2,
  maxUnits: 2,
  energyCost: 20,
  sideChance: {
    strengthBpsPerDeciPoint: 30,
    momentumBpsPerPoint: 10,
    underdogFloorBps: 4000,
  },
  momentumRetentionBps: 7500,
  slots: [
    { id: "setup", scoring: false },
    { id: "resolution", scoring: true },
  ],
  metrics: [
    { id: "contribution", label: "Contribution" },
    { id: "cost", label: "Cost" },
  ],
  momentTypes: [
    {
      id: "opening",
      slot: "setup",
      weight: 1,
      momentumShift: 5,
      participantMetricDeltas: { contribution: 1 },
    },
    {
      id: "conversion",
      slot: "resolution",
      weight: 1,
      momentumShift: 10,
      participantMetricDeltas: { contribution: 2, cost: -1 },
    },
  ],
};

const participant = (performerId: string) => ({
  performerId,
  stats: {
    mechanical: 10,
    cognitive: 10,
    collective: 10,
    composure: 10,
    adaptability: 10,
    presence: 10,
  },
  form: 0,
  energy: 100,
});

const validInput = (): ContestInput => ({
  contestId: "contest-1" as ContestId,
  disciplineId: "discipline-1",
  rules,
  first: {
    collectiveId: "collective-1",
    participants: [participant("performer-1"), participant("performer-2")],
  },
  second: {
    collectiveId: "collective-2",
    participants: [participant("performer-3"), participant("performer-4")],
  },
  rng: { seed: 42, state: [1, 2, 3, 4] },
});

const malformed = (mutate: (input: Mutable<ContestInput>) => void): ContestInput => {
  const input = structuredClone(validInput()) as unknown as Mutable<ContestInput>;
  mutate(input);
  return input as unknown as ContestInput;
};

const setRuleField = (input: Mutable<ContestInput>, field: string, value: unknown): void => {
  (input.rules as unknown as Record<string, unknown>)[field] = value;
};

const setRngField = (input: Mutable<ContestInput>, field: string, value: unknown): void => {
  (input.rng as unknown as Record<string, unknown>)[field] = value;
};

describe("Contest input rejection", () => {
  it.each([
    ["an empty Contest id", malformed((input) => (input.contestId = "" as ContestId)), "contestId"],
    ["an empty discipline id", malformed((input) => (input.disciplineId = "")), "disciplineId"],
    [
      "duplicate Collective ids",
      malformed((input) => (input.second.collectiveId = input.first.collectiveId)),
      "collectiveId",
    ],
    [
      "overlapping Performer ids",
      malformed(
        (input) =>
          (at(input.second.participants[0]).performerId = at(
            input.first.participants[0],
          ).performerId),
      ),
      "performerId",
    ],
    [
      "the wrong participant count",
      malformed((input) => input.second.participants.pop()),
      "participantCount",
    ],
    [
      "an off-grid stat",
      malformed((input) => (at(input.first.participants[0]).stats.mechanical = 10.05)),
      "mechanical",
    ],
    [
      "an out-of-range stat",
      malformed((input) => (at(input.first.participants[0]).stats.mechanical = 21)),
      "mechanical",
    ],
    [
      "out-of-range form",
      malformed((input) => (at(input.first.participants[0]).form = 3.1)),
      "form",
    ],
    [
      "off-grid energy",
      malformed((input) => (at(input.first.participants[0]).energy = 99.95)),
      "energy",
    ],
    [
      "a missing stat weight",
      malformed((input) => {
        delete (input.rules.statWeights as Partial<typeof input.rules.statWeights>).adaptability;
      }),
      "adaptability",
    ],
    [
      "a fractional stat weight",
      malformed((input) => (input.rules.statWeights.mechanical = 1.5)),
      "statWeights.mechanical",
    ],
    [
      "zero total stat weight",
      malformed((input) => {
        for (const key of Object.keys(input.rules.statWeights)) {
          (input.rules.statWeights as unknown as Record<string, number>)[key] = 0;
        }
      }),
      "positive total",
    ],
    [
      "an unsupported series kind",
      malformed((input) => setRuleField(input, "kind", "series")),
      "series",
    ],
    ["an unsupported Bo3 kind", malformed((input) => setRuleField(input, "kind", "bo3")), "bo3"],
    ["an unsupported Bo5 kind", malformed((input) => setRuleField(input, "kind", "bo5")), "bo5"],
    [
      "an unsupported points-table kind",
      malformed((input) => setRuleField(input, "kind", "points-table")),
      "points-table",
    ],
    ["an invalid score target", malformed((input) => (input.rules.scoreToWin = 1)), "scoreToWin"],
    ["a unit cap below target", malformed((input) => (input.rules.maxUnits = 1)), "maxUnits"],
    ["a zero energy cost", malformed((input) => (input.rules.energyCost = 0)), "energyCost"],
    [
      "an excessive strength coefficient",
      malformed((input) => (input.rules.sideChance.strengthBpsPerDeciPoint = 1001)),
      "strengthBpsPerDeciPoint",
    ],
    [
      "an invalid underdog floor",
      malformed((input) => (input.rules.sideChance.underdogFloorBps = 5000)),
      "underdogFloorBps",
    ],
    [
      "an excessive momentum retention",
      malformed((input) => (input.rules.momentumRetentionBps = 10001)),
      "momentumRetentionBps",
    ],
    [
      "duplicate slot ids",
      malformed((input) => (at(input.rules.slots[1]).id = at(input.rules.slots[0]).id)),
      "slot id",
    ],
    [
      "missing scoring slots",
      malformed((input) => (at(input.rules.slots[1]).scoring = false)),
      "exactly one scoring slot",
    ],
    [
      "a non-final scoring slot",
      malformed((input) => {
        at(input.rules.slots[0]).scoring = true;
        at(input.rules.slots[1]).scoring = false;
      }),
      "last",
    ],
    [
      "duplicate metric ids",
      malformed((input) => (at(input.rules.metrics[1]).id = at(input.rules.metrics[0]).id)),
      "metric id",
    ],
    [
      "duplicate Moment type ids",
      malformed((input) => (at(input.rules.momentTypes[1]).id = at(input.rules.momentTypes[0]).id)),
      "Moment type id",
    ],
    [
      "an unknown Moment slot",
      malformed((input) => (at(input.rules.momentTypes[0]).slot = "unknown-slot")),
      "unknown-slot",
    ],
    [
      "an unknown participant metric",
      malformed(
        (input) => (at(input.rules.momentTypes[0]).participantMetricDeltas = { unknown: 1 }),
      ),
      "unknown",
    ],
    [
      "a zero Moment weight",
      malformed((input) => (at(input.rules.momentTypes[0]).weight = 0)),
      "weight",
    ],
    [
      "a zero momentum shift",
      malformed((input) => (at(input.rules.momentTypes[0]).momentumShift = 0)),
      "momentumShift",
    ],
    ["a negative RNG seed", malformed((input) => setRngField(input, "seed", -1)), "rng.seed"],
    [
      "an oversized RNG seed",
      malformed((input) => setRngField(input, "seed", 0x100000000)),
      "rng.seed",
    ],
    [
      "the wrong RNG state length",
      malformed((input) => setRngField(input, "state", [1, 2, 3])),
      "rng.state",
    ],
    [
      "an invalid RNG state word",
      malformed((input) => setRngField(input, "state", [1, 2, -1, 4])),
      "rng.state[2]",
    ],
  ])("rejects %s before changing input or continuation", (_label, input, expected) => {
    const before = structuredClone(input);

    expect(() => resolveContest(input)).toThrow(expected);
    expect(input).toEqual(before);
    expect(input.rng).toEqual(before.rng);
  });
});

describe("Contest serialization", () => {
  it("round-trips complete input, result evidence, and the next continuation", () => {
    const input = validInput();
    const copiedInput = JSON.parse(JSON.stringify(input)) as ContestInput;
    const original = resolveContest(input);
    const replay = resolveContest(copiedInput);

    expect(replay).toEqual(original);
    expect(original.moments.length).toBeGreaterThan(0);
    expect(original.participantResults).toHaveLength(4);
    expect(JSON.parse(JSON.stringify(original))).toEqual(original);

    const next = {
      ...validInput(),
      contestId: "contest-2" as ContestId,
      rng: original.rngContinuation,
    };
    const copiedNext = JSON.parse(JSON.stringify(next)) as ContestInput;
    expect(resolveContest(copiedNext)).toEqual(resolveContest(next));
  });
});

const participantResult = (result: ContestResult, performerId: string): ContestParticipantResult =>
  at(result.participantResults.find((participant) => participant.performerId === performerId));

const setAllStats = (
  input: Mutable<ContestInput>,
  side: "first" | "second",
  value: number,
): void => {
  for (const participant of input[side].participants) {
    for (const stat of Object.keys(participant.stats)) {
      (participant.stats as unknown as Record<string, number>)[stat] = value;
    }
  }
};

const useStreamSeed = (input: Mutable<ContestInput>, seed: number): void => {
  const stream = createRng(seed).stream(CONTEST_STREAM_NAME);
  input.rng.seed = stream.seed;
  input.rng.state = [...stream.state()];
};

describe("Contest weighted strength", () => {
  it.each([
    [100, 100],
    [80, 90],
    [0, 50],
  ])("applies the declared fatigue formula at energy %s", (energy, expected) => {
    const input = malformed((value) => {
      for (const member of value.first.participants) member.energy = energy;
    });

    const result = resolveContest(input);

    expect(result.first.strengthDeciPoints).toBe(expected);
    expect(participantResult(result, "performer-1").strengthDeciPoints).toBe(expected);
  });

  it("converts decimals to deci-points and rounds performer and Collective halves up", () => {
    const input = malformed((value) => {
      value.rules.statWeights = {
        mechanical: 1,
        cognitive: 1,
        collective: 0,
        composure: 0,
        adaptability: 0,
        presence: 0,
      };
      at(value.first.participants[0]).stats.cognitive = 10.1;
    });

    const result = resolveContest(input);

    expect(participantResult(result, "performer-1").strengthDeciPoints).toBe(101);
    expect(participantResult(result, "performer-2").strengthDeciPoints).toBe(100);
    expect(result.first.strengthDeciPoints).toBe(101);
  });

  it.each([
    [1, -3, 0, 10],
    [20, 3, 100, 200],
  ])("clamps effective stats for stat %s, form %s, energy %s", (stat, form, energy, expected) => {
    const input = malformed((value) => {
      setAllStats(value, "first", stat);
      for (const member of value.first.participants) {
        member.form = form;
        member.energy = energy;
      }
    });

    expect(resolveContest(input).first.strengthDeciPoints).toBe(expected);
  });

  it("uses positive weights and ignores explicit zero weights", () => {
    const baseline = resolveContest(validInput());
    const zeroWeightChange = resolveContest(
      malformed((value) => {
        for (const member of value.first.participants) {
          member.stats.adaptability = 20;
          member.stats.presence = 1;
        }
      }),
    );
    const positiveWeightChange = resolveContest(
      malformed((value) => {
        for (const member of value.first.participants) member.stats.mechanical = 11;
      }),
    );

    expect(zeroWeightChange.first.strengthDeciPoints).toBe(baseline.first.strengthDeciPoints);
    expect(positiveWeightChange.first.strengthDeciPoints).toBeGreaterThan(
      baseline.first.strengthDeciPoints,
    );
  });
});

describe("Contest side chance", () => {
  it("distinguishes an equal 5,000 bps chance from a ten-deci 5,300 bps chance", () => {
    const equal = malformed((input) => {
      input.rng.state = [0, 0, 3_586_297_692, 0];
      input.rules.statWeights = {
        mechanical: 1,
        cognitive: 0,
        collective: 0,
        composure: 0,
        adaptability: 0,
        presence: 0,
      };
    });
    const advantage = malformed((input) => {
      input.rng.state = [0, 0, 3_586_297_692, 0];
      input.rules.statWeights = {
        mechanical: 1,
        cognitive: 0,
        collective: 0,
        composure: 0,
        adaptability: 0,
        presence: 0,
      };
      for (const member of input.first.participants) member.stats.mechanical = 11;
    });

    expect(at(resolveContest(equal).moments[0]).collectiveId).toBe("collective-2");
    expect(at(resolveContest(advantage).moments[0]).collectiveId).toBe("collective-1");
  });

  it("caps the first side at 6,000 bps and floors it at 4,000 bps", () => {
    const favoured = malformed((input) => {
      input.rng.state = [0, 0, 281_558_967, 0];
      setAllStats(input, "first", 20);
      setAllStats(input, "second", 1);
    });
    const underdog = malformed((input) => {
      input.rng.state = [0, 0, 1_150_096_798, 0];
      setAllStats(input, "first", 1);
      setAllStats(input, "second", 20);
    });

    expect(at(resolveContest(favoured).moments[0]).collectiveId).toBe("collective-1");
    expect(at(resolveContest(underdog).moments[0]).collectiveId).toBe("collective-2");
  });
});

describe("Contest Moment generation and continuation", () => {
  it("preserves slot order while canonicalizing same-slot Moment types by id", () => {
    const input = malformed((value) => {
      value.rng.state = [0, 0, 0, 0];
      value.rules.momentTypes = [
        {
          id: "z-setup",
          slot: "setup",
          weight: 1,
          momentumShift: 5,
          participantMetricDeltas: { contribution: 1 },
        },
        {
          id: "a-setup",
          slot: "setup",
          weight: 1,
          momentumShift: 5,
          participantMetricDeltas: { contribution: 1 },
        },
        {
          id: "z-resolution",
          slot: "resolution",
          weight: 1,
          momentumShift: 10,
          participantMetricDeltas: { contribution: 1 },
        },
        {
          id: "a-resolution",
          slot: "resolution",
          weight: 1,
          momentumShift: 10,
          participantMetricDeltas: { contribution: 1 },
        },
      ];
    });
    const reordered = structuredClone(input) as unknown as Mutable<ContestInput>;
    reordered.rules.momentTypes.reverse();

    const result = resolveContest(input);
    const replay = resolveContest(reordered as unknown as ContestInput);

    expect(result).toEqual(replay);
    expect(result.moments.slice(0, 2).map((moment) => moment.slotId)).toEqual([
      "setup",
      "resolution",
    ]);
    expect(result.moments.slice(0, 2).map((moment) => moment.typeId)).toEqual([
      "a-setup",
      "a-resolution",
    ]);
  });

  it("selects the side before a strength-weighted participant from that side", () => {
    const input = malformed((value) => {
      value.rng.state = [0, 0, 114, 0];
      value.rules.statWeights = {
        mechanical: 1,
        cognitive: 0,
        collective: 0,
        composure: 0,
        adaptability: 0,
        presence: 0,
      };
      at(value.first.participants[0]).stats.mechanical = 20;
      at(value.first.participants[1]).stats.mechanical = 10;
    });

    const moment = at(resolveContest(input).moments[0]);

    expect(moment.collectiveId).toBe("collective-1");
    expect(moment.performerId).toBe("performer-1");
  });

  it("is invariant to participant insertion order and reconciles metric totals", () => {
    const input = validInput();
    const reordered = structuredClone(input) as unknown as Mutable<ContestInput>;
    reordered.first.participants.reverse();
    reordered.second.participants.reverse();

    const result = resolveContest(input);
    expect(resolveContest(reordered as unknown as ContestInput)).toEqual(result);

    for (const participant of result.participantResults) {
      const expected: Record<string, number> = {};
      for (const moment of result.moments) {
        if (moment.performerId !== participant.performerId) continue;
        for (const [metric, delta] of Object.entries(moment.participantMetricDeltas)) {
          expected[metric] = (expected[metric] ?? 0) + delta;
        }
      }
      expect(participant.metricTotals).toEqual(expected);
    }
  });

  it("consumes exactly three raw draws per Moment, including singletons and early stop", () => {
    const input = malformed((value) => {
      value.rng.state = [0, 0, 0, 0];
      value.rules.participantCount = 1;
      value.first.participants = [at(value.first.participants[0])];
      value.second.participants = [at(value.second.participants[0])];
    });
    const result = resolveContest(input);
    const stream = restoreRng(input.rng.seed, input.rng.state);
    for (let draw = 0; draw < result.moments.length * 3; draw += 1) stream.nextUint32();

    expect(result.unitsResolved).toBe(2);
    expect(result.moments).toHaveLength(4);
    expect(result.rngContinuation).toEqual({ seed: input.rng.seed, state: stream.state() });
  });
});

describe("Contest momentum, tally, and outcome", () => {
  it("records signed retention, content shift, and the pre-Moment momentum trace", () => {
    const result = resolveContest(malformed((input) => (input.rng.state = [0, 0, 0, 0])));

    expect(
      result.moments.map((moment) => ({
        before: moment.momentumBefore,
        retained: moment.momentumRetained,
        shift: moment.momentumShift,
        after: moment.momentumAfter,
      })),
    ).toEqual([
      { before: 0, retained: 0, shift: 5, after: 5 },
      { before: 5, retained: 3, shift: 10, after: 13 },
      { before: 13, retained: 9, shift: -5, after: 4 },
      { before: 4, retained: 3, shift: 10, after: 13 },
    ]);
  });

  it("truncates negative retention towards zero and clamps momentum", () => {
    const negative = malformed((input) => {
      input.rng.state = [0, 0, 0xffffffff, 0];
      input.rules.slots = [{ id: "resolution", scoring: true }];
      input.rules.momentTypes = [
        {
          id: "conversion",
          slot: "resolution",
          weight: 1,
          momentumShift: 3,
          participantMetricDeltas: {},
        },
      ];
    });
    const clamped = malformed((input) => {
      input.rng.state = [0, 0, 0, 0];
      input.rules.slots = [{ id: "resolution", scoring: true }];
      input.rules.momentumRetentionBps = 10000;
      input.rules.momentTypes = [
        {
          id: "conversion",
          slot: "resolution",
          weight: 1,
          momentumShift: 100,
          participantMetricDeltas: {},
        },
      ];
    });

    const secondNegative = at(resolveContest(negative).moments[1]);
    expect(secondNegative.momentumBefore).toBe(-3);
    expect(secondNegative.momentumRetained).toBe(-2);
    expect(secondNegative.momentumAfter).toBe(-5);
    expect(resolveContest(clamped).moments.map((moment) => moment.momentumAfter)).toEqual([
      100, 100,
    ]);
  });

  it("uses momentum before the next side threshold", () => {
    const pressured = malformed((input) => {
      input.rng.state = [0, 0, 1, 0];
      input.rules.slots = [{ id: "resolution", scoring: true }];
      input.rules.momentumRetentionBps = 10000;
      input.rules.sideChance.momentumBpsPerPoint = 1000;
      input.rules.momentTypes = [
        {
          id: "conversion",
          slot: "resolution",
          weight: 1,
          momentumShift: 1,
          participantMetricDeltas: {},
        },
      ];
    });
    const neutral = structuredClone(pressured) as unknown as Mutable<ContestInput>;
    neutral.rules.sideChance.momentumBpsPerPoint = 0;

    expect(at(resolveContest(pressured).moments[1]).collectiveId).toBe("collective-1");
    expect(at(resolveContest(neutral as unknown as ContestInput).moments[1]).collectiveId).toBe(
      "collective-2",
    );
  });

  it("keeps setup momentum separate from resolution tally", () => {
    const result = resolveContest(malformed((input) => (input.rng.state = [0, 0, 0, 0])));
    const [setup, resolution] = result.moments;

    expect(at(setup).momentumAfter).not.toBe(0);
    expect(at(setup).scoreDelta).toBe(0);
    expect(at(setup).tallyAfter).toEqual({ first: 0, second: 0 });
    expect(at(resolution).scoreDelta).toBe(1);
    expect(at(resolution).tallyAfter).toEqual({ first: 1, second: 0 });
  });

  it("can report a tally leader with momentum favouring the other side", () => {
    const result = resolveContest(
      malformed((input) => {
        input.rng.state = [0, 0, 0, 0];
        input.rules.momentTypes = [
          {
            id: "opening",
            slot: "setup",
            weight: 1,
            momentumShift: 20,
            participantMetricDeltas: {},
          },
          {
            id: "conversion",
            slot: "resolution",
            weight: 1,
            momentumShift: 1,
            participantMetricDeltas: {},
          },
        ];
      }),
    );
    const opposingPressure = at(result.moments[2]);

    expect(opposingPressure.tallyAfter).toEqual({ first: 1, second: 0 });
    expect(opposingPressure.momentumAfter).toBeLessThan(0);
  });

  it.each([
    [0, [0, 0, 0, 0], "first-win", { first: 2, second: 0 }],
    [13, [0, 0, 13, 0], "second-win", { first: 0, second: 2 }],
    [0xffffffff, [0, 0, 0xffffffff, 0], "draw", { first: 1, second: 1 }],
  ])("produces %s outcome evidence", (_marker, state, kind, tally) => {
    const result = resolveContest(
      malformed((input) => {
        input.rng.state = state;
      }),
    );

    expect(result.outcome.kind).toBe(kind);
    expect(result.tally).toEqual(tally);
  });

  it.each([
    [16_578, 13, { first: 13, second: 0 }, "first-win"],
    [0, 22, { first: 13, second: 9 }, "first-win"],
    [5, 22, { first: 9, second: 13 }, "second-win"],
    [1, 24, { first: 12, second: 12 }, "draw"],
  ])("terminates seed %s at the declared regulation boundary", (seed, units, tally, kind) => {
    const input = malformed((value) => {
      value.rules.scoreToWin = 13;
      value.rules.maxUnits = 24;
      value.rules.sideChance.strengthBpsPerDeciPoint = 0;
      value.rules.sideChance.momentumBpsPerPoint = 0;
      useStreamSeed(value, seed);
    });

    const result = resolveContest(input);

    expect(result.unitsResolved).toBe(units);
    expect(result.tally).toEqual(tally);
    expect(result.outcome.kind).toBe(kind);
    expect(result.moments).toHaveLength(units * 2);
  });
});

describe("Contest participant consequences", () => {
  it.each([
    [73, 53, -20],
    [20, 0, -20],
    [8, 0, -8],
  ])("reports authoritative energy %s → %s", (energyBefore, energyAfter, energyDelta) => {
    const input = malformed((value) => {
      for (const member of [...value.first.participants, ...value.second.participants]) {
        member.energy = energyBefore;
      }
    });
    const before = structuredClone(input);

    const result = resolveContest(input);

    expect(input).toEqual(before);
    expect(result.participantResults).toHaveLength(4);
    for (const participant of result.participantResults) {
      expect(participant.energyBefore).toBe(energyBefore);
      expect(participant.nominalEnergyCost).toBe(20);
      expect(participant.energyDelta).toBe(energyDelta);
      expect(participant.energyAfter).toBe(energyAfter);
    }
  });

  it("installs energyAfter once without subtracting the nominal cost again", () => {
    const result = resolveContest(
      malformed((value) => {
        for (const member of [...value.first.participants, ...value.second.participants]) {
          member.energy = 73;
        }
      }),
    );
    const consequence = participantResult(result, "performer-1");
    const installedEnergy = consequence.energyAfter;

    expect(installedEnergy).toBe(53);
    expect(installedEnergy - consequence.nominalEnergyCost).not.toBe(consequence.energyAfter);
  });
});
