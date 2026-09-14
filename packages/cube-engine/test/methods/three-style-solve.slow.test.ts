import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { solveM2ThreeStyle, solveThreeStyle } from "../../src/methods/three-style.js";
import { createRng } from "../../src/random/prng.js";
import { randomState3x3 } from "../../src/random/random-state.js";
import { threeStyleDatasets, threeStyleParities } from "../data/committed.js";

/** The larger full-solve runs: 20,000 random states each for 3-style/3-style and M2 + 3-style corners. */
describe("3-style full solves, slow suite", () => {
  it("3-style/3-style (UFR, UF) and M2 + 3-style corners (UFR, DF): 20,000 random states each", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, twists, flips, m2 } = threeStyleDatasets();
    const { parity, m2Parity } = threeStyleParities(puzzle);
    const scheme = speffzScheme(puzzle);
    const rng = createRng("3-style slow");
    const solved = puzzle.kpuzzle.defaultPattern();
    const failures = { threeStyle: 0, m2: 0 };
    for (let run = 0; run < 20_000; run++) {
      const pattern = randomState3x3(puzzle, rng);
      const three = solveThreeStyle(puzzle, { pattern }, { scheme, corners, edges, twists, flips, parity });
      if (!three.ok || !pattern.applyAlg(formatMoves(three.value.moves)).isIdentical(solved)) failures.threeStyle++;
      const withM2 = solveM2ThreeStyle(puzzle, { pattern }, { scheme, corners, twists, edges: m2, parity: m2Parity });
      if (!withM2.ok || !pattern.applyAlg(formatMoves(withM2.value.moves)).isIdentical(solved)) failures.m2++;
    }
    expect(failures).toEqual({ threeStyle: 0, m2: 0 });
  });
});
