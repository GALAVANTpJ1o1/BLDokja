import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { describe, expect, it } from "vitest";
import { mod, permutationParity } from "../../src/core/arrays.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { createRng } from "../../src/random/prng.js";
import { randomMoveSequence, randomState3x3 } from "../../src/random/random-state.js";

describe("randomState3x3", () => {
  it("is reproducible from a seed", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const a = randomState3x3(puzzle, createRng("state"));
    const b = randomState3x3(puzzle, createRng("state"));
    expect(a.isIdentical(b)).toBe(true);
    expect(a.isIdentical(randomState3x3(puzzle, createRng("other")))).toBe(false);
  });

  it("always satisfies the reachability conditions, with centres solved", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const rng = createRng("conditions");
    const solvedCentres = puzzle.kpuzzle.defaultPattern().patternData.CENTERS;
    let oddCount = 0;
    for (let i = 0; i < 2000; i++) {
      const { CORNERS: c, EDGES: e, CENTERS: centres } = randomState3x3(puzzle, rng).patternData;
      if (c === undefined || e === undefined) throw new Error("missing orbit");
      expect(permutationParity(c.pieces)).toBe(permutationParity(e.pieces));
      expect(mod(c.orientation.reduce((x, y) => x + y, 0), 3)).toBe(0);
      expect(mod(e.orientation.reduce((x, y) => x + y, 0), 2)).toBe(0);
      expect(centres).toEqual(solvedCentres);
      oddCount += permutationParity(c.pieces);
    }
    // Half of all states have parity; allow a wide band for a fixed seed.
    expect(oddCount).toBeGreaterThan(900);
    expect(oddCount).toBeLessThan(1100);
  });

  it("produces states that cubing.js's independent solver can actually solve", async () => {
    // The sampler relies on the reachability conditions being sufficient; an unreachable state
    // would have no solution.
    const puzzle = await loadPuzzle("3x3x3");
    const rng = createRng("solvable");
    const solved = puzzle.kpuzzle.defaultPattern();
    for (let i = 0; i < 20; i++) {
      const state = randomState3x3(puzzle, rng);
      const solution = await experimentalSolve3x3x3IgnoringCenters(state);
      expect(state.applyAlg(solution).isIdentical(solved)).toBe(true);
    }
  });
});

describe("randomMoveSequence", () => {
  it("never repeats a move family back to back", () => {
    const moves = ["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2"];
    const sequence = randomMoveSequence(createRng("moves"), moves, 200);
    expect(sequence).toHaveLength(200);
    for (let i = 1; i < sequence.length; i++) {
      expect(sequence[i]?.[0]).not.toBe(sequence[i - 1]?.[0]);
    }
  });
});
