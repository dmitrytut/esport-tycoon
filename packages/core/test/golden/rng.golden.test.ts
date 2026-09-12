import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRng } from "../../src/rng.ts";

interface GoldenRng {
  readonly seed: number;
  readonly root: readonly number[];
  readonly streams: Readonly<Record<string, readonly number[]>>;
  readonly floats: readonly number[];
}

const golden = JSON.parse(
  readFileSync(new URL("./rng-seed42.json", import.meta.url), "utf8"),
) as GoldenRng;

// Этот тест падает при любом изменении алгоритма генератора — это его задача.
// Красный golden значит «вся симуляция поехала», а не «поправь файл».
describe("golden: генератор при сиде 42", () => {
  it("поток корневого сида не сдвинулся", () => {
    const rng = createRng(golden.seed);
    const actual = golden.root.map(() => rng.nextUint32());
    expect(actual).toEqual([...golden.root]);
  });

  it("дробные значения не сдвинулись", () => {
    const rng = createRng(golden.seed);
    const actual = golden.floats.map(() => rng.float());
    expect(actual).toEqual([...golden.floats]);
  });

  it("именованные потоки не сдвинулись", () => {
    const contest = createRng(golden.seed).stream("contest");
    expect(golden.streams["contest"]?.map(() => contest.nextUint32())).toEqual([
      ...(golden.streams["contest"] ?? []),
    ]);

    const incidents = createRng(golden.seed).stream("incidents");
    expect(golden.streams["incidents"]?.map(() => incidents.int(1, 100))).toEqual([
      ...(golden.streams["incidents"] ?? []),
    ]);
  });
});
