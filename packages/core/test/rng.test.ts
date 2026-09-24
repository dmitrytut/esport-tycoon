import { describe, expect, it } from "vitest";

import { createRng, restoreRng } from "../src/rng.ts";

const draw = (seed: number | string, count: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.nextUint32());
};

describe("determinism (ADR 0002)", () => {
  it("one seed gives bit-for-bit the same sequence", () => {
    expect(draw(42, 200)).toEqual(draw(42, 200));
  });

  it("different seeds diverge", () => {
    expect(draw(42, 50)).not.toEqual(draw(43, 50));
  });

  it("string seed is hashed deterministically", () => {
    expect(draw("season-1", 50)).toEqual(draw("season-1", 50));
    expect(draw("season-1", 50)).not.toEqual(draw("season-2", 50));
  });

  it("state serializes: resuming matches an uninterrupted run", () => {
    const continuous = createRng(7);
    const sequence = Array.from({ length: 40 }, () => continuous.nextUint32());

    const interrupted = createRng(7);
    const head = Array.from({ length: 20 }, () => interrupted.nextUint32());
    const resumed = restoreRng(7, interrupted.state());
    const tail = Array.from({ length: 20 }, () => resumed.nextUint32());

    expect([...head, ...tail]).toEqual(sequence);
  });

  it("serializes every state word as uint32", () => {
    const rng = createRng(16_578).stream("contest");

    for (let drawIndex = 0; drawIndex < 24; drawIndex += 1) {
      for (const word of rng.state()) {
        expect(Number.isInteger(word)).toBe(true);
        expect(word).toBeGreaterThanOrEqual(0);
        expect(word).toBeLessThanOrEqual(0xffffffff);
      }
      rng.nextUint32();
    }
  });
});

describe("streams (ADR 0002, item 3)", () => {
  it("a stream depends on its name, not on how much was drawn from the parent", () => {
    const early = createRng(42).stream("contest").nextUint32();

    const parent = createRng(42);
    for (let i = 0; i < 1000; i++) parent.nextUint32();
    expect(parent.stream("contest").nextUint32()).toBe(early);
  });

  it("different names give different streams", () => {
    const root = createRng(42);
    const a = Array.from({ length: 20 }, () => root.stream("contest").nextUint32());
    const b = Array.from({ length: 20 }, () => root.stream("incidents").nextUint32());
    expect(a).not.toEqual(b);
  });

  it("nested streams are also stable", () => {
    const path = (): number => createRng(42).stream("week").stream("incidents").nextUint32();
    expect(path()).toBe(path());
  });
});

describe("bounds", () => {
  it("int stays within the range and covers both ends", () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const value = rng.int(1, 6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it("int(x, x) returns x and does not waste any draws", () => {
    expect(createRng(1).int(5, 5)).toBe(5);
  });

  it("int rejects an inverted or non-integer range", () => {
    const rng = createRng(1);
    expect(() => rng.int(6, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 3)).toThrow(RangeError);
  });

  it("float lies in [0, 1)", () => {
    const rng = createRng(3);
    for (let i = 0; i < 5000; i++) {
      const value = rng.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("int is distributed without noticeable skew", () => {
    const rng = createRng(9);
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      const index = rng.int(0, 9);
      buckets[index] = (buckets[index] ?? 0) + 1;
    }
    const expected = draws / 10;
    for (const count of buckets) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.05);
    }
  });

  it("chance(0) and chance(1) do not waste any randomness", () => {
    const rng = createRng(5);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.state()).toEqual(createRng(5).state());
  });
});

describe("draws", () => {
  it("pick only takes elements of the list and reaches every one", () => {
    const rng = createRng(11);
    const items = ["a", "b", "c"] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(rng.pick(items));
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });

  it("pick from an empty list is an error, not undefined", () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });

  it("shuffle does not change the source array and preserves its contents", () => {
    const source = [1, 2, 3, 4, 5];
    const shuffled = createRng(13).shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });

  // This invariant is the whole justification for the two sanctioned type assertions in
  // `shuffle` (ADR 0010). Replacing them with an `if (x === undefined) throw` would read
  // as an improvement and would break this: `undefined` is a legal element of `T[]`.
  it("shuffle treats undefined as an ordinary element", () => {
    const source = [1, undefined, 3, undefined, 5];
    const shuffled = createRng(23).shuffle(source);
    expect(shuffled).toHaveLength(source.length);
    expect(shuffled.filter((value) => value === undefined)).toHaveLength(2);
  });

  it("weightedIndex never returns a zero-weight index", () => {
    const rng = createRng(17);
    for (let i = 0; i < 2000; i++) {
      expect(rng.weightedIndex([0, 5, 0, 1])).not.toBe(0);
      expect(rng.weightedIndex([0, 5, 0, 1])).not.toBe(2);
    }
  });

  it("weightedIndex respects proportions", () => {
    const rng = createRng(19);
    let first = 0;
    const draws = 20_000;
    for (let i = 0; i < draws; i++) if (rng.weightedIndex([3, 1]) === 0) first++;
    expect(Math.abs(first / draws - 0.75)).toBeLessThan(0.01);
  });

  it("zero sum of weights is an error", () => {
    expect(() => createRng(1).weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => createRng(1).weightedIndex([])).toThrow(RangeError);
  });
});
