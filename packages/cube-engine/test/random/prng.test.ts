import { describe, expect, it } from "vitest";
import { createRng, fnv1a32, rngFromState, shuffled, utf8Bytes } from "../../src/random/prng.js";

describe("fnv1a32", () => {
  // Test vectors from the FNV reference implementation: github.com/lcn2/fnv, test_fnv.c
  // (fnv_test_str paired with fnv1a_32_vector, inputs without trailing NUL).
  it.each([
    ["", 0x811c9dc5],
    ["a", 0xe40c292c],
    ["b", 0xe70c2de5],
    ["c", 0xe60c2c52],
    ["d", 0xe10c2473],
    ["e", 0xe00c22e0],
    ["f", 0xe30c2799],
    ["fo", 0x6222e842],
    ["foo", 0xa9f37ed7],
    ["foob", 0x3f5076ef],
    ["fooba", 0x39aaa18a],
    ["foobar", 0xbf9cf968],
  ])("hashes %j to the reference value", (input, expected) => {
    expect(fnv1a32(input)).toBe(expected);
  });
});

describe("utf8Bytes", () => {
  it.each(["plain", "é", "漢字", "🧊 cube", "Ω≈ç√"])("matches Node's encoder for %j", (text) => {
    expect(utf8Bytes(text)).toEqual(Array.from(Buffer.from(text, "utf8")));
  });
});

describe("seeded generator", () => {
  it("is reproducible from a seed string", () => {
    const a = createRng("drill-session-42");
    const b = createRng("drill-session-42");
    const draw = (rng: typeof a) => Array.from({ length: 50 }, () => rng.int(1000));
    expect(draw(a)).toEqual(draw(b));
  });

  it("gives different sequences for different seeds", () => {
    const first = createRng("seed-one");
    const second = createRng("seed-two");
    expect(Array.from({ length: 20 }, () => first.int(1_000_000))).not.toEqual(Array.from({ length: 20 }, () => second.int(1_000_000)));
  });

  it("resumes exactly from a saved state", () => {
    const rng = createRng(7);
    for (let i = 0; i < 13; i++) rng.float();
    const resumed = rngFromState(rng.state());
    const clone = rng.clone();
    const next = Array.from({ length: 10 }, () => rng.int(97));
    expect(Array.from({ length: 10 }, () => resumed.int(97))).toEqual(next);
    expect(Array.from({ length: 10 }, () => clone.int(97))).toEqual(next);
  });

  it("stays within bounds and covers the range", () => {
    const rng = createRng("bounds");
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(24);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(24);
      seen.add(v);
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(seen.size).toBe(24);
  });

  it("is roughly uniform (chi-square, fixed seed, generous threshold)", () => {
    const rng = createRng("uniformity");
    const buckets = new Array<number>(24).fill(0);
    const draws = 48_000;
    for (let i = 0; i < draws; i++) {
      const v = rng.int(24);
      buckets[v] = (buckets[v] ?? 0) + 1;
    }
    const expected = draws / 24;
    const chiSquare = buckets.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
    // 23 degrees of freedom: the 99.9th percentile is about 49.7.
    expect(chiSquare).toBeLessThan(49.7);
  });

  it("rejects invalid bounds", () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
    expect(() => rng.intBetween(5, 4)).toThrow(RangeError);
  });

  it("shuffles into a permutation without touching the input", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const output = shuffled(createRng("shuffle"), input);
    expect([...output].sort((x, y) => x - y)).toEqual(input);
    expect(output).not.toEqual(input);
    expect(input[0]).toBe(0);
  });
});
