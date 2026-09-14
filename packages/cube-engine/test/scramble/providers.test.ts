import { describe, expect, it } from "vitest";
import { centersRotation, normaliseByCenters, wholeCubeRotationAlgs } from "../../src/core/frame.js";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { faceletsOf, loadPuzzle } from "../../src/core/puzzle.js";
import { parseAlg } from "../../src/commutator/parse.js";
import { expandNodes } from "../../src/commutator/expand.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { createRng } from "../../src/random/prng.js";
import { randomState3x3 } from "../../src/random/random-state.js";
import { cubingProvider, nextScramble, orientationSuffixes, seededStateProvider3x3 } from "../../src/scramble/providers.js";
import { trace } from "../../src/trace/trace.js";

describe("orientationSuffixes", () => {
  it("gives one wide-move suffix of at most two moves for each of the 24 orientations, each landing in that orientation", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const suffixes = orientationSuffixes(puzzle);
    const rotations = wholeCubeRotationAlgs(puzzle);
    expect(suffixes).toHaveLength(24);
    expect(new Set(suffixes).size).toBe(24);
    suffixes.forEach((suffix, i) => {
      const moves = suffix === "" ? [] : suffix.split(" ");
      expect(moves.length, suffix).toBeLessThanOrEqual(2);
      expect(moves.every((m) => /^(Uw|Rw|Fw)(2|')?$/.test(m)), suffix).toBe(true);
      expect(centersRotation(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(suffix))?.alg, suffix).toBe(rotations[i]?.alg);
    });
  });
});

describe("seededStateProvider3x3", () => {
  it("each scramble reproduces its candidate's state (kpuzzle, and the geometry model)", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const provider = seededStateProvider3x3(puzzle, { seed: "reproduce" });
    const { geometry } = puzzle;
    for (let i = 0; i < 50; i++) {
      const candidate = await provider.next();
      const scramble = await candidate.scramble();
      expect(await candidate.scramble(), "cached").toBe(scramble);
      const applied = puzzle.kpuzzle.defaultPattern().applyAlg(scramble);
      expect(normaliseByCenters(puzzle, applied)?.isIdentical(candidate.state), scramble).toBe(true);
      // Geometry model: the scramble, then the rotation that solves the centres, sends each sticker to the slot the state shows it in.
      const rotation = centersRotation(puzzle, applied)?.alg ?? "";
      const perm = geometryAlgPermutation(geometry, `${scramble} ${rotation}`);
      const facelets = faceletsOf(puzzle, candidate.state);
      expect(Array.from(facelets).every((home, slot) => perm[home] === slot), scramble).toBe(true);
      // Every move parses as verified notation.
      expect(parseAlg("3x3x3", scramble).ok).toBe(true);
    }
  });

  it("is reproducible from its seed, and different seeds differ", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const draw = async (seed: string) => {
      const provider = seededStateProvider3x3(puzzle, { seed });
      const out: string[] = [];
      for (let i = 0; i < 10; i++) out.push(await (await provider.next()).scramble());
      return out;
    };
    const first = await draw("same seed");
    expect(await draw("same seed")).toEqual(first);
    const other = await draw("other seed");
    expect(other.filter((s, i) => s === first[i])).toEqual([]);
  });

  it("draws each state and then its orientation from one generator: states match randomState3x3, orientations cover all 24 about evenly", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const provider = seededStateProvider3x3(puzzle, { seed: "coverage" });
    const suffixes = orientationSuffixes(puzzle);
    // Replay the provider's draws with the same generator, without solving 2,400 states.
    const replay = createRng("coverage");
    const counts = new Array<number>(24).fill(0);
    for (let i = 0; i < 2400; i++) {
      const candidate = await provider.next();
      const prefix = randomState3x3(puzzle, replay);
      const drawn = replay.int(24);
      counts[drawn] = (counts[drawn] ?? 0) + 1;
      const suffix = suffixes[drawn] ?? "";
      expect(normaliseByCenters(puzzle, suffix === "" ? prefix : prefix.applyAlg(suffix))?.isIdentical(candidate.state), `draw ${i}`).toBe(true);
      // For a sample, the scramble really ends with the drawn suffix.
      if (i < 20 && suffix !== "") expect((await candidate.scramble()).endsWith(` ${suffix}`), `draw ${i}`).toBe(true);
    }
    // 100 expected per orientation.
    for (const count of counts) {
      expect(count).toBeGreaterThan(60);
      expect(count).toBeLessThan(140);
    }
  });

  it("gives parity about half the time, and no suffix with orientation none", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const provider = seededStateProvider3x3(puzzle, { seed: "parity" });
    let parity = 0;
    for (let i = 0; i < 2000; i++) {
      const traced = trace(puzzle, { pattern: (await provider.next()).state }, { pieceType: "corners", buffer: "UFR", scheme });
      if (!traced.ok) throw new Error(JSON.stringify(traced.error));
      if (traced.value.parity) parity++;
    }
    expect(parity).toBeGreaterThan(2000 * 0.45);
    expect(parity).toBeLessThan(2000 * 0.55);

    const plain = seededStateProvider3x3(puzzle, { seed: "plain", orientation: "none" });
    for (let i = 0; i < 10; i++) {
      const candidate = await plain.next();
      const scramble = await candidate.scramble();
      const parsed = parseAlg("3x3x3", scramble);
      if (!parsed.ok) throw new Error(scramble);
      expect(expandNodes(parsed.value.nodes).every((m) => ["U", "D", "R", "L", "F", "B"].includes(m.family)), scramble).toBe(true);
      expect(puzzle.kpuzzle.defaultPattern().applyAlg(scramble).isIdentical(candidate.state), scramble).toBe(true);
    }
  });

  it("refuses a 4x4 puzzle", async () => {
    const four = await loadPuzzle("4x4x4");
    expect(() => seededStateProvider3x3(four, { seed: "x" })).toThrow(RangeError);
    expect(() => cubingProvider(four, "333bf")).toThrow(RangeError);
  });

  it("nextScramble returns the scramble and its state", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { scramble, state } = await nextScramble(seededStateProvider3x3(puzzle, { seed: "next" }));
    expect(normaliseByCenters(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(scramble))?.isIdentical(state)).toBe(true);
  });
});
