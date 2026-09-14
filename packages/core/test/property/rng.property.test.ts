import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createRng, restoreRng } from "../../src/rng.ts";
import { seedArb } from "./arbitraries.ts";

describe("rng: determinism", () => {
  it("the same seed replays the same sequence", () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 1, max: 64 }), (seed, count) => {
        const left = createRng(seed);
        const right = createRng(seed);
        expect(Array.from({ length: count }, () => left.nextUint32())).toEqual(
          Array.from({ length: count }, () => right.nextUint32()),
        );
      }),
    );
  });

  it("state restores: an interrupted run continues as an uninterrupted one", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        (seed, head, tail) => {
          const continuous = createRng(seed);
          const expected = Array.from({ length: head + tail }, () => continuous.nextUint32());

          const interrupted = createRng(seed);
          const before = Array.from({ length: head }, () => interrupted.nextUint32());
          const resumed = restoreRng(seed, interrupted.state());
          const after = Array.from({ length: tail }, () => resumed.nextUint32());

          expect([...before, ...after]).toEqual(expected);
        },
      ),
    );
  });

  it("named streams are independent of how much was drawn elsewhere", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.integer({ min: 0, max: 50 }),
        (seed, left, right, noise) => {
          fc.pre(left !== right);

          const quiet = createRng(seed).stream(left);
          const expected = Array.from({ length: 10 }, () => quiet.nextUint32());

          const root = createRng(seed);
          const other = root.stream(right);
          for (let i = 0; i < noise; i++) other.nextUint32();
          const loud = root.stream(left);

          expect(Array.from({ length: 10 }, () => loud.nextUint32())).toEqual(expected);
        },
      ),
    );
  });
});

describe("rng: bounds", () => {
  it("int stays inside the requested range", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 2000 }),
        (seed, min, span) => {
          const rng = createRng(seed);
          for (let i = 0; i < 20; i++) {
            const value = rng.int(min, min + span);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(min);
            expect(value).toBeLessThanOrEqual(min + span);
          }
        },
      ),
    );
  });

  it("float stays in [0, 1)", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const rng = createRng(seed);
        for (let i = 0; i < 50; i++) {
          const value = rng.float();
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
    );
  });

  it("chance is never true at 0 and never false at 1", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const rng = createRng(seed);
        for (let i = 0; i < 20; i++) {
          expect(rng.chance(0)).toBe(false);
          expect(rng.chance(1)).toBe(true);
        }
      }),
    );
  });
});

describe("rng: collections", () => {
  it("shuffle permutes without touching the input", () => {
    fc.assert(
      fc.property(seedArb, fc.array(fc.integer(), { maxLength: 30 }), (seed, items) => {
        const original = [...items];
        const shuffled = createRng(seed).shuffle(items);

        expect(items).toEqual(original);
        expect(shuffled).toHaveLength(items.length);
        expect([...shuffled].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
      }),
    );
  });

  it("pick returns an element of the list", () => {
    fc.assert(
      fc.property(seedArb, fc.array(fc.integer(), { minLength: 1, maxLength: 20 }), (seed, xs) => {
        const rng = createRng(seed);
        for (let i = 0; i < 10; i++) expect(xs).toContain(rng.pick(xs));
      }),
    );
  });

  it("weightedIndex never lands on a zero weight", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.array(fc.double({ min: 0, max: 100, noNaN: true }), { minLength: 1, maxLength: 12 }),
        (seed, weights) => {
          fc.pre(weights.some((weight) => weight > 0));

          const rng = createRng(seed);
          for (let i = 0; i < 20; i++) {
            const index = rng.weightedIndex(weights);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(weights.length);
            expect(weights[index]).toBeGreaterThan(0);
          }
        },
      ),
    );
  });
});
